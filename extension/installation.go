// cercle.exe : installe, vérifie et lance l'extension « cercle » dans Claude Desktop pour Windows.
//
// Ce fichier : la partie portable (testée sous Linux par cercle_test.go) — fichiers embarqués, dossiers de profil,
// occupant du dossier, comparaison octet par octet du dossier installé avec les fichiers embarqués. La partie propre à
// Windows (variable d'environnement, processus, verrous, lancement, raccourci) est dans windows.go.
package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Les fichiers de l'extension, embarqués dans l'exe : c'est la référence de confiance, comparée au dossier installé
// avant chaque lancement.
//
//go:embed manifest.json sonar-lecture.js widget.js widget.css LICENSE-UI-PLUS
var embarques embed.FS

// Clé publique (ed25519, base64) des mises à jour : voir signature.go et README. Vide = mises à jour désactivées.
//
//go:embed cle-publique.txt
var clePubliqueTexte string

var fichiers = []string{"manifest.json", "sonar-lecture.js", "widget.js", "widget.css", "LICENSE-UI-PLUS"}

const (
	idExtension  = "fmkadmapgofadopljbjfkapdkoienihi"
	marque       = "sonar-cercle"
	nomManifeste = "UI+ for Claude (sonar, Windows)"
	fichierEtat  = ".sonar-etat.json"
)

// Codes de retour.
const (
	okCode        = 0
	codeAction    = 1 // action inconnue
	codeProfil    = 2 // dossier Claude-Data introuvable ou ambigu
	codeEtranger  = 3 // dossier d'extension occupé par autre chose (React DevTools ?)
	codeEcriture  = 4 // copie, suppression, écriture, erreur imprévue
	codeOuvert    = 5 // Claude est encore ouvert
	codeVerif     = 6 // fichiers installés différents, lancement refusé
	codeIntrouv   = 7 // Claude introuvable ou pas démarré
	codeMiseAJour = 8 // mise à jour impossible ou refusée (signature, version)
)

// erreurCode porte le code de retour avec le message.
type erreurCode struct {
	code int
	msg  string
}

func (e *erreurCode) Error() string { return e.msg }

func echec(code int, format string, a ...any) error {
	return &erreurCode{code, fmt.Sprintf(format, a...)}
}

// version : celle du manifeste embarqué, seule source de vérité (le tag de release doit valoir « v » + version).
func version() string {
	b, _ := embarques.ReadFile("manifest.json")
	return versionManifeste(b)
}

func versionManifeste(b []byte) string {
	var m struct {
		Version string `json:"version"`
	}
	_ = json.Unmarshal(b, &m)
	return m.Version
}

// tousLesProfils : les dossiers claude_* sous <base>\Claude-Data.
func tousLesProfils(base string) []string {
	racine := filepath.Join(base, "Claude-Data")
	entrees, _ := os.ReadDir(racine)
	var profils []string
	for _, e := range entrees {
		if e.IsDir() && strings.HasPrefix(e.Name(), "claude_") {
			profils = append(profils, filepath.Join(racine, e.Name()))
		}
	}
	return profils
}

// trouverProfil : exactement un dossier claude_* sous <base>\Claude-Data, ou celui que désigne `choix`.
func trouverProfil(base, choix string) (string, error) {
	racine := filepath.Join(base, "Claude-Data")
	var profils []string
	for _, p := range tousLesProfils(base) {
		if choix == "" || choix == filepath.Base(p) || choix == p {
			profils = append(profils, p)
		}
	}
	switch {
	case choix != "" && len(profils) == 0:
		return "", echec(codeProfil, "--profil « %s » ne désigne aucun dossier claude_* de %s.", choix, racine)
	case len(profils) == 0:
		return "", echec(codeProfil, "aucun dossier claude_* dans %s. Claude Desktop a-t-il déjà été lancé ?", racine)
	case len(profils) > 1:
		noms := make([]string, len(profils))
		for i, p := range profils {
			noms[i] = filepath.Base(p)
		}
		return "", echec(codeProfil, "plusieurs dossiers claude_* dans %s (%s) : précisez lequel avec --profil <nom>.", racine, strings.Join(noms, ", "))
	}
	return profils[0], nil
}

func dossierExtension(profil string) string {
	return filepath.Join(profil, "extensions", idExtension)
}

type etatInstallation struct {
	Marque     string `json:"marque"`
	Version    string `json:"version"`
	Installe   string `json:"installe"`
	Estampille string `json:"estampille"` // version_name écrit dans le manifeste installé
}

func lireEtat(dossier string) *etatInstallation {
	b, err := os.ReadFile(filepath.Join(dossier, fichierEtat))
	if err != nil {
		return nil
	}
	var e etatInstallation
	if json.Unmarshal(b, &e) != nil || e.Marque != marque {
		return nil
	}
	return &e
}

// occupant du dossier de l'extension : absent | nôtre | nôtre sans état | sonde | autre.
// « nôtre sans état » : notre manifeste, mais le fichier d'état perdu (suppression interrompue, par exemple).
func occupant(dossier string) string {
	if _, err := os.Lstat(dossier); errors.Is(err, fs.ErrNotExist) {
		return "absent"
	}
	if lireEtat(dossier) != nil {
		return "nôtre"
	}
	var m struct {
		Name string `json:"name"`
	}
	if b, err := os.ReadFile(filepath.Join(dossier, "manifest.json")); err == nil && json.Unmarshal(b, &m) == nil {
		if strings.HasPrefix(m.Name, "Sonde cercle") {
			return "sonde"
		}
		if m.Name == nomManifeste {
			return "nôtre sans état"
		}
	}
	return "autre"
}

// manifesteAvec : le manifeste embarqué, avec ce version_name. Chaque installation estampille le sien : « Désinstaller… »
// dans le popover masque l'extension jusqu'à la prochaine installation (comme UI+). Sortie déterministe : le manifeste
// installé se recompare octet par octet.
func manifesteAvec(estampille string) ([]byte, error) {
	b, err := embarques.ReadFile("manifest.json")
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	m["version_name"] = estampille
	return json.MarshalIndent(m, "", "  ")
}

// attendu : le contenu que doit avoir chaque fichier installé, pour cette estampille.
func attendu(f, estampille string) ([]byte, error) {
	if f == "manifest.json" {
		return manifesteAvec(estampille)
	}
	return embarques.ReadFile(f)
}

// installer : copie les fichiers embarqués dans un dossier voisin, puis l'échange avec l'ancien (jamais d'extension
// à moitié copiée). Refuse un dossier étranger.
func installer(dossier string, maintenant time.Time) error {
	if occupant(dossier) == "autre" {
		return echec(codeEtranger, "%s existe et n'est ni cette extension ni la sonde (React DevTools ?). Rien n'a été touché.", dossier)
	}
	estampille := version() + " " + maintenant.Format("20060102150405")
	temp := dossier + ".nouveau"
	_ = os.RemoveAll(temp)
	if err := os.MkdirAll(temp, 0o755); err != nil {
		return echec(codeEcriture, "copie impossible : %v", err)
	}
	for _, f := range fichiers {
		b, err := attendu(f, estampille)
		if err == nil {
			err = os.WriteFile(filepath.Join(temp, f), b, 0o644)
		}
		if err != nil {
			return echec(codeEcriture, "copie impossible (%s) : %v", f, err)
		}
	}
	etat, _ := json.MarshalIndent(etatInstallation{marque, version(), maintenant.Format(time.RFC3339), estampille}, "", "  ")
	if err := os.WriteFile(filepath.Join(temp, fichierEtat), etat, 0o644); err != nil {
		return echec(codeEcriture, "écriture impossible : %v", err)
	}
	// Échange par renommages : un fichier ouvert (Claude) fait échouer le premier renommage d'un bloc, sans rien
	// effacer ; une suppression directe aurait laissé l'extension à moitié vidée.
	ancien := dossier + ".ancien"
	_ = os.RemoveAll(ancien)
	if _, err := os.Lstat(dossier); err == nil {
		if err := os.Rename(dossier, ancien); err != nil {
			_ = os.RemoveAll(temp)
			return echec(codeEcriture, "remplacement impossible (Claude est-il ouvert ?) : %v", err)
		}
	}
	if err := os.Rename(temp, dossier); err != nil {
		_ = os.Rename(ancien, dossier)
		return echec(codeEcriture, "remplacement impossible : %v", err)
	}
	_ = os.RemoveAll(ancien)
	return nil
}

// retirer : supprime le dossier seulement s'il est le nôtre.
func retirer(dossier string) (bool, error) {
	// Restes d'une installation interrompue (noms à nous, à côté du dossier de l'extension).
	_ = os.RemoveAll(dossier + ".nouveau")
	_ = os.RemoveAll(dossier + ".ancien")
	switch occupant(dossier) {
	case "absent":
		return false, nil
	case "nôtre", "nôtre sans état":
		if err := os.RemoveAll(dossier); err != nil {
			return false, echec(codeEcriture, "suppression impossible (Claude est-il encore ouvert ?) : %v", err)
		}
		return true, nil
	default:
		return false, echec(codeEtranger, "%s n'est pas cette extension : rien n'a été supprimé.", dossier)
	}
}

// ecarts : le dossier installé comparé aux fichiers embarqués — un vrai dossier (pas un lien), des fichiers ordinaires
// (pas des liens), mêmes octets, rien en trop ; le manifeste aussi, avec l'estampille notée à l'installation.
// Vide = identique.
func ecarts(dossier string) []string {
	info, err := os.Lstat(dossier)
	if err != nil {
		return []string{"dossier absent ou illisible : " + err.Error()}
	}
	if !info.IsDir() || info.Mode()&fs.ModeSymlink != 0 {
		return []string{"le dossier de l'extension n'est pas un vrai dossier (lien ou jonction ?)"}
	}
	var r []string
	attendus := map[string]bool{fichierEtat: true}
	for _, f := range fichiers {
		attendus[f] = true
	}
	_ = filepath.WalkDir(dossier, func(p string, d fs.DirEntry, err error) error {
		rel, _ := filepath.Rel(dossier, p)
		rel = filepath.ToSlash(rel)
		if err != nil {
			r = append(r, "illisible : "+rel)
			return nil
		}
		if p == dossier {
			return nil
		}
		if !attendus[rel] {
			r = append(r, "en trop : "+rel)
			if d.IsDir() {
				return filepath.SkipDir
			}
		}
		return nil
	})
	estampille := ""
	if e := lireEtat(dossier); e != nil {
		estampille = e.Estampille
	}
	for _, f := range fichiers {
		chemin := filepath.Join(dossier, f)
		fi, err := os.Lstat(chemin)
		if err != nil {
			r = append(r, "absent : "+f)
			continue
		}
		if !fi.Mode().IsRegular() {
			r = append(r, "pas un fichier ordinaire (lien ?) : "+f)
			continue
		}
		installe, err := os.ReadFile(chemin)
		reference, err2 := attendu(f, estampille)
		if err != nil || err2 != nil || !bytes.Equal(installe, reference) {
			r = append(r, "différent : "+f)
		}
	}
	sort.Strings(r)
	return r
}

// versionDansExe : la version du manifeste embarqué dans un cercle.exe (sans l'exécuter), pour que « signer » signe
// la version réelle de l'exe et non une version tapée à la main.
func versionDansExe(exe []byte) string {
	i := bytes.Index(exe, []byte(`"name": "`+nomManifeste+`"`))
	if i < 0 {
		return ""
	}
	debut := bytes.LastIndexByte(exe[:i], '{')
	fin := bytes.IndexByte(exe[i:], '}')
	if debut < 0 || fin < 0 {
		return ""
	}
	// Le manifeste a un objet imbriqué (content_scripts) : on prend jusqu'à l'accolade fermante de premier niveau.
	profondeur := 0
	for j := debut; j < len(exe); j++ {
		switch exe[j] {
		case '{':
			profondeur++
		case '}':
			profondeur--
			if profondeur == 0 {
				return versionManifeste(exe[debut : j+1])
			}
		}
	}
	return ""
}
