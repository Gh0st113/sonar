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

// disponible : une release plus récente, avec ses deux fichiers, pas encore téléchargée. La chercher ne demande
// qu'une petite requête : au lancement de Claude, on n'attend que ça (quelques secondes), et on ne télécharge
// l'installeur qu'après l'accord de l'utilisateur.
type disponible struct {
	Version string
	Notes   string
	urlExe  string
	urlSig  string
}

// miseAJour : l'installeur téléchargé, signature vérifiée.
type miseAJour struct {
	Version string
	Exe     []byte
}

// chercherDisponible : nil, nil s'il n'y a rien de plus récent. Une release plus récente sans signature est une
// erreur (codeMiseAJour) : elle ne doit jamais passer en silence.
func chercherDisponible(ctx context.Context, actuelle string) (*disponible, error) {
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
	d := &disponible{Version: strings.TrimPrefix(rel.Tag, "v"), Notes: rel.Corps}
	for _, a := range rel.Assets {
		switch a.Nom {
		case nomExe:
			d.urlExe = a.URL
		case nomSig:
			d.urlSig = a.URL
		}
	}
	if d.urlExe == "" || d.urlSig == "" {
		return nil, echec(codeMiseAJour, "la release %s n'a pas %s et %s : pas encore signée ?", rel.Tag, nomExe, nomSig)
	}
	return d, nil
}

// recuperer : télécharge l'installeur et sa signature, et ne le rend que si la signature est bonne et vaut pour
// cette version.
func (d *disponible) recuperer(ctx context.Context) (*miseAJour, error) {
	pub, err := clePublique()
	if err != nil || pub == nil {
		return nil, echec(codeMiseAJour, "aucune clé publique embarquée")
	}
	exe, err := telecharger(ctx, d.urlExe)
	if err != nil {
		return nil, err
	}
	sig, err := telecharger(ctx, d.urlSig)
	if err != nil {
		return nil, err
	}
	v, err := verifier(pub, string(sig), exe)
	if err != nil {
		return nil, echec(codeMiseAJour, "release v%s refusée : %v", d.Version, err)
	}
	if d.Version != v {
		return nil, echec(codeMiseAJour, "release v%s refusée : la signature vaut pour la version %s", d.Version, v)
	}
	return &miseAJour{Version: v, Exe: exe}, nil
}

// chercherMiseAJour : chercher puis récupérer d'un coup (tests).
func chercherMiseAJour(ctx context.Context, actuelle string) (*miseAJour, error) {
	d, err := chercherDisponible(ctx, actuelle)
	if err != nil || d == nil {
		return nil, err
	}
	return d.recuperer(ctx)
}

func contexteCourt(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}
