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

func dossierLocal() string                                { return os.Getenv("LOCALAPPDATA") }
func lireReactProfile() (valeurVariable, error)           { return valeurVariable{}, seulementWindows }
func poserReactProfile(valeurVariable) error              { return seulementWindows }
func claudeOuvert() bool                                  { return false }
func trouverClaude(string) (string, error)                { return "", echec(codeIntrouv, "seulement sous Windows") }
func demarrerClaude(string) error                         { return seulementWindows }
func verrouiller([]string) (func(), error)                { return func() {}, nil }
func cheminRaccourci() string                             { return "" }
func creerRaccourci(string, string, string, string) error { return seulementWindows }

func lirePhrase(invite string) (string, error) {
	fmt.Print(invite)
	l, err := entree.ReadString('\n')
	return strings.TrimRight(l, "\r\n"), err
}
