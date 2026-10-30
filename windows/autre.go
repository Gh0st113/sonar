//go:build !windows

// Hors Windows : de quoi compiler et tester la partie portable ; rien ne touche au système.
package main

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

var seulementWindows = errors.New("seulement sous Windows")

func dossierLocal() string                      { return os.Getenv("LOCALAPPDATA") }
func lireReactProfile() (valeurVariable, error) { return valeurVariable{}, seulementWindows }
func poserReactProfile(valeurVariable) error    { return seulementWindows }
func claudeOuvert() bool                        { return false }
func fermerClaude() error                       { return seulementWindows }
func trouverClaude(string) (string, error)      { return "", echec(codeIntrouv, "seulement sous Windows") }
func demarrerClaude(string) error               { return seulementWindows }
func verrouiller([]string) (func(), error)      { return func() {}, nil }
func boite(texte string, _ uint32) int          { fmt.Println(texte); return 0 }

func lirePhrase(invite string) (string, error) {
	fmt.Print(invite)
	l, err := lecteur().ReadString('\n')
	return strings.TrimRight(l, "\r\n"), err
}
