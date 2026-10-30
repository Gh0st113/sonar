//go:build !windows

// Hors Windows : de quoi compiler et tester la partie portable ; rien ne touche au système.
package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
)

var seulementWindows = errors.New("seulement sous Windows")

func dossierLocal() string                                { return os.Getenv("LOCALAPPDATA") }
func lireReactProfile() (string, bool, error)             { return "", false, seulementWindows }
func poserReactProfile(string, bool) error                { return seulementWindows }
func claudeOuvert() bool                                  { return false }
func trouverClaude(string) (string, error)                { return "", echec(codeIntrouv, "seulement sous Windows") }
func demarrerClaude(string) error                         { return seulementWindows }
func cheminRaccourci() string                             { return "" }
func creerRaccourci(string, string, string, string) error { return seulementWindows }

func lirePhrase(invite string) (string, error) {
	fmt.Print(invite)
	l, err := bufio.NewReader(os.Stdin).ReadString('\n')
	return strings.TrimRight(l, "\r\n"), err
}
