package main

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

var instant = time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)

func profil(t *testing.T, noms ...string) string {
	base := t.TempDir()
	for _, n := range noms {
		if err := os.MkdirAll(filepath.Join(base, "Claude-Data", n), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return base
}

func code(err error) int {
	var e *erreurCode
	if errors.As(err, &e) {
		return e.code
	}
	return -1
}

func TestTrouverProfil(t *testing.T) {
	base := profil(t, "claude_a", "autre")
	p, err := trouverProfil(base, "")
	if err != nil || filepath.Base(p) != "claude_a" {
		t.Fatalf("un seul profil : %v %v", p, err)
	}
	if _, err := trouverProfil(profil(t), ""); code(err) != codeProfil {
		t.Fatalf("aucun profil : %v", err)
	}
	deux := profil(t, "claude_a", "claude_b")
	if _, err := trouverProfil(deux, ""); code(err) != codeProfil || !strings.Contains(err.Error(), "--profil") {
		t.Fatalf("deux profils : %v", err)
	}
	if p, err := trouverProfil(deux, "claude_b"); err != nil || filepath.Base(p) != "claude_b" {
		t.Fatalf("--profil : %v %v", p, err)
	}
	if _, err := trouverProfil(deux, "claude_z"); code(err) != codeProfil {
		t.Fatalf("--profil inconnu : %v", err)
	}
}

func TestInstallerVerifierRetirer(t *testing.T) {
	dossier := dossierExtension(filepath.Join(t.TempDir(), "claude_a"))
	if oc := occupant(dossier); oc != "absent" {
		t.Fatal(oc)
	}
	if err := installer(dossier, instant); err != nil {
		t.Fatal(err)
	}
	if oc := occupant(dossier); oc != "nôtre" {
		t.Fatal(oc)
	}
	if e := ecarts(dossier); len(e) != 0 {
		t.Fatalf("installation fraîche : %v", e)
	}
	// Le manifeste installé porte l'estampille, sans compter comme un écart.
	b, _ := os.ReadFile(filepath.Join(dossier, "manifest.json"))
	if !strings.Contains(string(b), `"version_name": "`+version()+` 20261030200000"`) {
		t.Fatalf("estampille : %s", b)
	}
	if e := lireEtat(dossier); e == nil || e.Version != version() {
		t.Fatalf("état : %+v", e)
	}

	// Fichier modifié, fichier en trop, fichier absent, manifeste qui charge un autre script : tout se voit.
	os.WriteFile(filepath.Join(dossier, "widget.js"), []byte("fetch('https://ailleurs')"), 0o644)
	os.WriteFile(filepath.Join(dossier, "espion.js"), []byte("x"), 0o644)
	os.Remove(filepath.Join(dossier, "widget.css"))
	var m map[string]any
	json.Unmarshal(b, &m)
	m["content_scripts"] = []any{map[string]any{"matches": []any{"<all_urls>"}, "js": []any{"espion.js"}}}
	mb, _ := json.Marshal(m)
	os.WriteFile(filepath.Join(dossier, "manifest.json"), mb, 0o644)
	got := ecarts(dossier)
	want := []string{"absent : widget.css", "différent : manifest.json", "différent : widget.js", "en trop : espion.js"}
	if !slices.Equal(got, want) {
		t.Fatalf("écarts : %v", got)
	}

	// Réinstaller remet tout en ordre (et retire le fichier en trop).
	if err := installer(dossier, instant); err != nil || len(ecarts(dossier)) != 0 {
		t.Fatalf("réinstallation : %v %v", err, ecarts(dossier))
	}
	if ok, err := retirer(dossier); !ok || err != nil || occupant(dossier) != "absent" {
		t.Fatalf("retrait : %v %v", ok, err)
	}
	if ok, err := retirer(dossier); ok || err != nil {
		t.Fatalf("retrait d'un absent : %v %v", ok, err)
	}
}

func TestDossierEtranger(t *testing.T) {
	dossier := filepath.Join(t.TempDir(), idExtension)
	os.MkdirAll(dossier, 0o755)
	os.WriteFile(filepath.Join(dossier, "manifest.json"), []byte(`{"name":"React Developer Tools"}`), 0o644)
	if oc := occupant(dossier); oc != "autre" {
		t.Fatal(oc)
	}
	if err := installer(dossier, instant); code(err) != codeEtranger {
		t.Fatalf("installer : %v", err)
	}
	if _, err := retirer(dossier); code(err) != codeEtranger {
		t.Fatalf("retirer : %v", err)
	}
	if _, err := os.Stat(filepath.Join(dossier, "manifest.json")); err != nil {
		t.Fatal("le dossier étranger a été touché")
	}
	// La sonde de relevé, elle, peut être remplacée ; notre dossier sans état est reconnu.
	os.WriteFile(filepath.Join(dossier, "manifest.json"), []byte(`{"name":"Sonde cercle 0.0.4"}`), 0o644)
	if oc := occupant(dossier); oc != "sonde" {
		t.Fatal(oc)
	}
	os.WriteFile(filepath.Join(dossier, "manifest.json"), []byte(`{"name":"`+nomManifeste+`"}`), 0o644)
	if oc := occupant(dossier); oc != "nôtre sans état" {
		t.Fatal(oc)
	}
}

func TestCleEtSignature(t *testing.T) {
	fichier, pubTexte, err := nouvelleCle("une phrase assez longue")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := nouvelleCle("courte"); err == nil {
		t.Fatal("phrase courte acceptée")
	}
	if _, err := ouvrirCle(fichier, "mauvaise phrase !!"); err == nil {
		t.Fatal("mauvaise phrase acceptée")
	}
	prive, err := ouvrirCle(fichier, "une phrase assez longue")
	if err != nil {
		t.Fatal(err)
	}
	pubB, _ := base64.StdEncoding.DecodeString(pubTexte)
	pub := ed25519.PublicKey(pubB)
	if !strings.Contains(string(fichier), pubTexte) || strings.Contains(string(fichier), base64.StdEncoding.EncodeToString(prive.Seed())) {
		t.Fatal("la clé privée apparaît en clair")
	}

	exe := []byte("MZ… un exe")
	sig := signer(prive, "0.6.0", exe)
	if v, err := verifier(pub, sig, exe); err != nil || v != "0.6.0" {
		t.Fatalf("signature valide : %v %v", v, err)
	}
	if _, err := verifier(pub, sig, append(exe, '!')); err == nil {
		t.Fatal("contenu modifié accepté")
	}
	// Changer la version annoncée casse la signature (elle est dans le message signé).
	if _, err := verifier(pub, strings.Replace(sig, "0.6.0", "9.9.9", 1), exe); err == nil {
		t.Fatal("version modifiée acceptée")
	}
	autre, _, _ := ed25519.GenerateKey(nil)
	if _, err := verifier(autre, sig, exe); err == nil {
		t.Fatal("autre clé acceptée")
	}
	for _, s := range []string{"", "0.6.0", "0.6.0\npas-du-base64", "0.6.0\nAAAA"} {
		if _, err := verifier(pub, s, exe); err == nil {
			t.Fatalf("signature mal formée acceptée : %q", s)
		}
	}
}

func TestPlusRecente(t *testing.T) {
	for _, c := range []struct {
		a, b string
		r    bool
	}{{"v0.6.0", "0.5.0", true}, {"0.5.0", "0.5.0", false}, {"0.4.10", "0.4.9", true}, {"0.4", "0.4.1", false}, {"v1.0.0", "0.9.9", true}, {"x", "0.1.0", false}} {
		if plusRecente(c.a, c.b) != c.r {
			t.Errorf("plusRecente(%s, %s) != %v", c.a, c.b, c.r)
		}
	}
}

// Faux GitHub : une release avec les fichiers donnés.
func fauxGitHub(t *testing.T, tag string, assets map[string][]byte) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/"+depot+"/releases/latest" {
			rel := map[string]any{"tag_name": tag, "body": "Notes de version", "assets": []any{}}
			for nom := range assets {
				rel["assets"] = append(rel["assets"].([]any), map[string]any{"name": nom, "browser_download_url": "http://" + r.Host + "/dl/" + nom})
			}
			json.NewEncoder(w).Encode(rel)
			return
		}
		if b, ok := assets[strings.TrimPrefix(r.URL.Path, "/dl/")]; ok {
			w.Write(b)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	ancien := apiGitHub
	apiGitHub = srv.URL
	t.Cleanup(func() { apiGitHub = ancien })
}

func TestChercherMiseAJour(t *testing.T) {
	fichier, pubTexte, _ := nouvelleCle("une phrase assez longue")
	prive, _ := ouvrirCle(fichier, "une phrase assez longue")
	ancienne := clePubliqueTexte
	t.Cleanup(func() { clePubliqueTexte = ancienne })
	ctx := context.Background()
	exe := []byte("MZ nouvelle version")

	clePubliqueTexte = ""
	if _, err := chercherMiseAJour(ctx, "0.5.0"); err == nil || !strings.Contains(err.Error(), "désactivées") {
		t.Fatalf("sans clé : %v", err)
	}
	clePubliqueTexte = pubTexte + "\n"

	fauxGitHub(t, "v0.6.0", map[string][]byte{nomExe: exe, nomSig: []byte(signer(prive, "0.6.0", exe))})
	m, err := chercherMiseAJour(ctx, "0.5.0")
	if err != nil || m == nil || m.Version != "0.6.0" || string(m.Exe) != string(exe) || m.Notes != "Notes de version" {
		t.Fatalf("release signée : %+v %v", m, err)
	}
	if m, err := chercherMiseAJour(ctx, "0.6.0"); m != nil || err != nil {
		t.Fatalf("déjà à jour : %+v %v", m, err)
	}

	// Exe remplacé sur GitHub, signature d'une autre clé, version de la signature ≠ tag, release non signée.
	autreFichier, _, _ := nouvelleCle("une autre phrase longue")
	autre, _ := ouvrirCle(autreFichier, "une autre phrase longue")
	for nom, assets := range map[string]map[string][]byte{
		"exe remplacé":   {nomExe: []byte("MZ piégé"), nomSig: []byte(signer(prive, "0.6.0", exe))},
		"autre clé":      {nomExe: exe, nomSig: []byte(signer(autre, "0.6.0", exe))},
		"vieille signée": {nomExe: exe, nomSig: []byte(signer(prive, "0.4.0", exe))},
		"non signée":     {nomExe: exe},
	} {
		fauxGitHub(t, "v0.6.0", assets)
		if m, err := chercherMiseAJour(ctx, "0.5.0"); m != nil || code(err) != codeMiseAJour {
			t.Errorf("%s : %+v %v", nom, m, err)
		}
	}
}
