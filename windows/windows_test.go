//go:build windows

// Tests qui ne tournent que sous Windows (job « windows » de la CI) : ce que les tests Linux ne peuvent pas prouver.
package main

import (
	"os"
	"path/filepath"
	"testing"
)

// REACT_PROFILE dans HKCU\Environment : posée, relue avec son type, retirée, puis remise comme avant le test.
func TestVariableAllerRetour(t *testing.T) {
	avant, err := lireReactProfile()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = poserReactProfile(avant) })

	for _, v := range []valeurVariable{
		{Existe: true, Valeur: "1", Type: 1},
		{Existe: true, Valeur: `%TEMP%\x`, Type: regExpandSz},
		{Existe: true, Valeur: "", Type: 1},
	} {
		if err := poserReactProfile(v); err != nil {
			t.Fatalf("poser %+v : %v", v, err)
		}
		lu, err := lireReactProfile()
		if err != nil || lu != v {
			t.Fatalf("relu %+v, attendu %+v (%v)", lu, v, err)
		}
	}
	if err := poserReactProfile(valeurVariable{}); err != nil {
		t.Fatal(err)
	}
	if lu, _ := lireReactProfile(); lu.Existe {
		t.Fatalf("toujours là : %+v", lu)
	}
	// Retirer une variable absente n'est pas une erreur.
	if err := poserReactProfile(valeurVariable{}); err != nil {
		t.Fatal(err)
	}
}

// Les verrous empêchent d'écrire, de supprimer et de renommer, mais laissent lire (Claude doit pouvoir charger).
func TestVerrouiller(t *testing.T) {
	d := filepath.Join(t.TempDir(), "ext")
	os.MkdirAll(d, 0o755)
	f := filepath.Join(d, "widget.js")
	os.WriteFile(f, []byte("original"), 0o644)
	liberer, err := verrouiller([]string{d, f})
	if err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(f); err != nil || string(b) != "original" {
		t.Fatalf("lecture pendant le verrou : %q %v", b, err)
	}
	if err := os.WriteFile(f, []byte("piégé"), 0o644); err == nil {
		t.Fatal("écriture permise pendant le verrou")
	}
	if err := os.Remove(f); err == nil {
		t.Fatal("suppression permise pendant le verrou")
	}
	if err := os.Rename(d, d+".autre"); err == nil {
		t.Fatal("renommage du dossier permis pendant le verrou")
	}
	liberer()
	if err := os.WriteFile(f, []byte("après"), 0o644); err != nil {
		t.Fatalf("écriture après le verrou : %v", err)
	}
	// Un lien (ou une jonction) n'est pas suivi : verrouiller un chemin absent échoue.
	if _, err := verrouiller([]string{filepath.Join(d, "absent.js")}); err == nil {
		t.Fatal("verrou sur un fichier absent")
	}
}

func TestClaudeOuvertSurLaCI(t *testing.T) {
	// Pas de Claude Desktop sur le runner ; le test lui-même ne s'appelle pas claude.exe.
	if claudeOuvert() {
		t.Fatal("claudeOuvert() vrai sans Claude")
	}
}

func TestFermerClaudeSansClaude(t *testing.T) {
	// Rien à fermer : réussit tout de suite, sans toucher à aucun processus.
	if err := fermerClaude(); err != nil {
		t.Fatal(err)
	}
}
