// Refait cercle.ico et rsrc_windows_amd64.syso dans le dossier courant (lancé par « go generate » depuis extension/).
package main

import (
	"fmt"
	"os"

	"github.com/Gh0st113/sonar/extension/icone"
)

func main() {
	for nom, contenu := range map[string][]byte{"cercle.ico": icone.Ico(), "rsrc_windows_amd64.syso": icone.Syso()} {
		if err := os.WriteFile(nom, contenu, 0o644); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
}
