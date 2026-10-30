// Petites fonctions portables (testées sous Linux) utilisées par windows.go et main.go.
package main

import (
	"strings"
	"unicode"
)

// valeurVariable : REACT_PROFILE telle qu'elle était, pour la remettre à l'identique (type compris : texte simple ou
// à développer). Existe = false : la variable n'existait pas.
type valeurVariable struct {
	Existe bool   `json:"existe"`
	Valeur string `json:"valeur"`
	Type   uint32 `json:"type"`
}

// estClaudeDesktop : le chemin d'un claude.exe est-il celui de Claude Desktop (paquet du Microsoft Store dans
// WindowsApps, ou installation classique AnthropicClaude) et pas Claude Code ? Chemin inconnu (droits) : oui, par
// prudence (mieux vaut refuser un lancement que lancer à côté d'un Claude déjà ouvert).
func estClaudeDesktop(chemin string) bool {
	if chemin == "" {
		return true
	}
	c := strings.ToLower(strings.ReplaceAll(chemin, "/", `\`))
	return strings.Contains(c, `\anthropicclaude\`) ||
		(strings.Contains(c, `\windowsapps\`) && (strings.Contains(c, `\claude_`) || strings.Contains(c, `\anthropic`)))
}

// parExplorateur : la cible est une appli du menu Démarrer (shell:AppsFolder\…), lancée par l'Explorateur.
func parExplorateur(cible string) bool {
	return strings.HasPrefix(strings.ToLower(cible), "shell:")
}

// nettoyer : un texte venu du réseau, sans caractère de contrôle (séquences d'échappement du terminal comprises),
// lignes gardées, longueur bornée.
func nettoyer(s string, max int) string {
	var b strings.Builder
	for _, r := range s {
		if r == '\n' || (r != '\t' && !unicode.IsControl(r) && r != '\u202E' && r != '\u202D') {
			b.WriteRune(r)
		}
		if b.Len() >= max {
			b.WriteString("…")
			break
		}
	}
	return strings.TrimSpace(b.String())
}
