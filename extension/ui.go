// Ce que cercle.exe dit et demande. Lancé depuis un terminal (une commande), il écrit dans la console ; lancé par le menu
// Démarrer ou l'installeur (pas de console : exe « windowsgui »), il ouvre des fenêtres de dialogue Windows. En mode
// fenêtres, les messages s'accumulent et ne s'affichent que s'il y a quelque chose d'important (avertissement, erreur,
// question) : un lancement normal de Claude ne montre rien.
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

const titreFenetre = "Claude (cercle)"

// Styles de boîte de dialogue (valeurs de MessageBoxW).
const (
	boiteInfo     = 0x40 // MB_ICONINFORMATION
	boiteAlerte   = 0x30 // MB_ICONWARNING
	boiteErreur   = 0x10 // MB_ICONERROR
	boiteQuestion = 0x24 // MB_YESNO | MB_ICONQUESTION
	reponseOui    = 6    // IDYES
)

var (
	enConsole  = true // fixé au démarrage par la plateforme (windows.go)
	silencieux bool   // --silencieux : rien d'affiché sauf les erreurs (installeur, désinstallation)
	journal    strings.Builder
	important  bool
	lecteurIn  *bufio.Reader
)

func lecteur() *bufio.Reader {
	if lecteurIn == nil {
		lecteurIn = bufio.NewReader(os.Stdin)
	}
	return lecteurIn
}

// dire : une ligne d'information.
func dire(format string, a ...any) {
	l := fmt.Sprintf(format, a...)
	if enConsole {
		fmt.Println(l)
		return
	}
	journal.WriteString(l + "\n")
}

// alerter : une ligne qui mérite d'être vue, même en mode fenêtres.
func alerter(format string, a ...any) {
	important = true
	dire(format, a...)
}

// vider : en mode fenêtres, affiche ce qui s'est accumulé si c'est important (ou si `toujours`).
func vider(style uint32, toujours bool) {
	if enConsole || journal.Len() == 0 {
		return
	}
	// CERCLE_SANS_FENETRE : aucune boîte, jamais (CI : une boîte attendrait un clic pour toujours).
	if (important || toujours) && (!silencieux || style == boiteErreur) && os.Getenv("CERCLE_SANS_FENETRE") == "" {
		boite(strings.TrimSpace(journal.String()), style)
	}
	journal.Reset()
	important = false
}

// oui : une question, en console ou dans une boîte Oui/Non (avec ce qui précède pour contexte).
func oui(question string) bool {
	if enConsole {
		fmt.Print(question + " (o/N) ")
		l, _ := lecteur().ReadString('\n')
		r := strings.ToLower(strings.TrimSpace(l))
		return r == "o" || r == "oui" || r == "y" || r == "yes"
	}
	if silencieux || os.Getenv("CERCLE_SANS_FENETRE") != "" {
		return false
	}
	texte := strings.TrimSpace(journal.String() + "\n" + question)
	journal.Reset()
	important = false
	return boite(texte, boiteQuestion) == reponseOui
}
