// Mises à jour depuis les releases GitHub du dépôt public : on regarde la dernière release, et on ne propose son exe
// que s'il est signé par la clé de l'utilisateur, pour une version plus récente. Jamais sans accord : voir main.go.
// Aucun jeton GitHub : la sécurité tient à la signature, pas à l'accès au dépôt.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	depot = "Gh0st113/sonar"
	// L'installeur signé de la release : c'est lui que cercle télécharge, vérifie, puis lance.
	nomExe    = "cercle-setup.exe"
	nomSig    = "cercle-setup.exe.sig"
	tailleMax = 64 << 20 // un installeur de plus de 64 Mio n'est pas le nôtre
)

var apiGitHub = "https://api.github.com"

type release struct {
	Tag    string `json:"tag_name"`
	Corps  string `json:"body"`
	Assets []struct {
		Nom string `json:"name"`
		URL string `json:"browser_download_url"`
	} `json:"assets"`
}

// plusRecente : a > b, en comparant les nombres de « 1.2.10 » un à un (un préfixe « v » est ignoré).
func plusRecente(a, b string) bool {
	pa, pb := parts(a), parts(b)
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x = pa[i]
		}
		if i < len(pb) {
			y = pb[i]
		}
		if x != y {
			return x > y
		}
	}
	return false
}

func parts(v string) []int {
	var r []int
	for _, p := range strings.Split(strings.TrimPrefix(strings.TrimSpace(v), "v"), ".") {
		n, err := strconv.Atoi(p)
		if err != nil {
			return nil
		}
		r = append(r, n)
	}
	return r
}

func requete(ctx context.Context, url, accept string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "sonar-cercle")
	return http.DefaultClient.Do(req)
}

func derniereRelease(ctx context.Context) (*release, error) {
	r, err := requete(ctx, apiGitHub+"/repos/"+depot+"/releases/latest", "application/vnd.github+json")
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	if r.StatusCode == http.StatusNotFound {
		return nil, errors.New("aucune release publiée (ou dépôt privé)")
	}
	if r.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub a répondu %s", r.Status)
	}
	var rel release
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&rel); err != nil {
		return nil, err
	}
	return &rel, nil
}

func telecharger(ctx context.Context, url string) ([]byte, error) {
	r, err := requete(ctx, url, "application/octet-stream")
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("téléchargement : %s", r.Status)
	}
	b, err := io.ReadAll(io.LimitReader(r.Body, tailleMax+1))
	if err == nil && len(b) > tailleMax {
		err = errors.New("fichier trop gros")
	}
	return b, err
}

// miseAJour proposée : la nouvelle version, ses notes, et l'exe déjà vérifié.
type miseAJour struct {
	Version string
	Notes   string
	Exe     []byte
}

// chercherMiseAJour : nil, nil s'il n'y a rien de plus récent. Une release plus récente mais mal signée est une
// erreur (codeMiseAJour) : elle ne doit jamais passer en silence.
func chercherMiseAJour(ctx context.Context, actuelle string) (*miseAJour, error) {
	pub, err := clePublique()
	if err != nil {
		return nil, err
	}
	if pub == nil {
		return nil, errors.New("aucune clé publique embarquée : mises à jour désactivées (voir README, « cercle cle »)")
	}
	rel, err := derniereRelease(ctx)
	if err != nil {
		return nil, err
	}
	if !plusRecente(rel.Tag, actuelle) {
		return nil, nil
	}
	var urlExe, urlSig string
	for _, a := range rel.Assets {
		switch a.Nom {
		case nomExe:
			urlExe = a.URL
		case nomSig:
			urlSig = a.URL
		}
	}
	if urlExe == "" || urlSig == "" {
		return nil, echec(codeMiseAJour, "la release %s n'a pas %s et %s : pas encore signée ?", rel.Tag, nomExe, nomSig)
	}
	exe, err := telecharger(ctx, urlExe)
	if err != nil {
		return nil, err
	}
	sig, err := telecharger(ctx, urlSig)
	if err != nil {
		return nil, err
	}
	v, err := verifier(pub, string(sig), exe)
	if err != nil {
		return nil, echec(codeMiseAJour, "release %s refusée : %v", rel.Tag, err)
	}
	if strings.TrimPrefix(rel.Tag, "v") != v {
		return nil, echec(codeMiseAJour, "release %s refusée : la signature vaut pour la version %s", rel.Tag, v)
	}
	return &miseAJour{Version: v, Notes: rel.Corps, Exe: exe}, nil
}

func contexteCourt(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}
