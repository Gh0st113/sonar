// Commandes de cercle.exe. Double-clic (sans argument) : un petit menu.
//
//	cercle installer [--profil <nom>]   copie l'extension, installe cercle.exe dans %LOCALAPPDATA%\sonar-cercle,
//	                                     crée le raccourci « Claude (cercle) » du menu Démarrer
//	cercle lancer [--lanceur <cible>]    propose une mise à jour signée, vérifie les fichiers installés, puis lance
//	                                     Claude avec REACT_PROFILE=1 le temps du démarrage seulement
//	cercle retirer                       supprime l'extension et le raccourci
//	cercle etat                          ce qui est installé, fichiers intacts ou non
//	cercle maj                           cherche et propose une mise à jour signée
//	cercle cle <fichier>                 crée la clé de signature (à garder hors de GitHub)
//	cercle signer <exe> <clé> <version>  écrit <exe>.sig pour une release
//	cercle version
//
// Sécurité : Claude charge le dossier de l'extension quand REACT_PROFILE=1 à son démarrage, et ce dossier est
// modifiable par tout programme lancé sous le compte. La variable n'est donc jamais laissée en place : « lancer »
// vérifie d'abord le dossier contre les fichiers embarqués dans l'exe, l'arme le temps du démarrage, puis la remet.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type options struct {
	profil   string
	lanceur  string
	sansMaj  bool
	positifs []string
}

func main() {
	os.Exit(executer(os.Args[1:]))
}

func executer(args []string) int {
	if len(args) == 0 {
		return menu()
	}
	action := args[0]
	fs := flag.NewFlagSet(action, flag.ContinueOnError)
	var o options
	fs.StringVar(&o.profil, "profil", "", "dossier claude_* à utiliser s'il y en a plusieurs")
	fs.StringVar(&o.lanceur, "lanceur", "", `claude.exe, ou shell:AppsFolder\<AppID>`)
	fs.BoolVar(&o.sansMaj, "sans-maj", false, "ne pas chercher de mise à jour")
	if err := fs.Parse(args[1:]); err != nil {
		return codeAction
	}
	o.positifs = fs.Args()
	var err error
	switch action {
	case "installer":
		err = actionInstaller(o)
	case "lancer":
		err = actionLancer(o)
	case "retirer":
		err = actionRetirer(o)
	case "etat":
		err = actionEtat(o)
	case "maj":
		err = actionMaj(o)
	case "cle":
		err = actionCle(o)
	case "signer":
		err = actionSigner(o)
	case "version":
		fmt.Println(version())
	default:
		fmt.Fprintf(os.Stderr, "action inconnue « %s » : installer | lancer | retirer | etat | maj | cle | signer | version\n", action)
		return codeAction
	}
	return terminer(err)
}

func terminer(err error) int {
	if err == nil {
		return okCode
	}
	fmt.Fprintln(os.Stderr, "Erreur : "+err.Error())
	var e *erreurCode
	if errors.As(err, &e) {
		return e.code
	}
	return codeEcriture
}

// Double-clic : l'état, puis un choix ; la fenêtre attend Entrée avant de se fermer.
func menu() int {
	_ = actionEtat(options{})
	fmt.Println()
	fmt.Println("  1  Installer ou réinstaller l'extension (et le raccourci « Claude (cercle) »)")
	fmt.Println("  2  Lancer Claude avec l'extension")
	fmt.Println("  3  Retirer l'extension")
	fmt.Println("  Q  Quitter")
	code := okCode
	switch strings.ToLower(demander("Choix : ")) {
	case "1":
		code = terminer(actionInstaller(options{}))
	case "2":
		code = terminer(actionLancer(options{}))
	case "3":
		code = terminer(actionRetirer(options{}))
	}
	demander("Entrée pour fermer.")
	return code
}

var entree = bufio.NewReader(os.Stdin)

func demander(invite string) string {
	fmt.Print(invite)
	l, _ := entree.ReadString('\n')
	return strings.TrimSpace(l)
}

func oui(question string) bool {
	r := strings.ToLower(demander(question + " (o/N) "))
	return r == "o" || r == "oui" || r == "y" || r == "yes"
}

func dossierCercle() string { return filepath.Join(dossierLocal(), "sonar-cercle") }

func dossierDe(o options) (string, error) {
	if dossierLocal() == "" {
		return "", echec(codeProfil, "LOCALAPPDATA n'est pas défini : cercle.exe ne sert que sous Windows, avec Claude Desktop installé.")
	}
	p, err := trouverProfil(dossierLocal(), o.profil)
	if err != nil {
		return "", err
	}
	return dossierExtension(p), nil
}

// La variable posée en permanence (ancien outil, sonde) arme le crochet pour tout lancement de Claude.
func avertirVariable() {
	if v, existe, err := lireReactProfile(); err == nil && existe && v == "1" {
		fmt.Println("Attention : REACT_PROFILE vaut 1 en permanence pour votre compte : tout lancement de Claude charge")
		fmt.Println("l'extension sans vérification. Si aucun autre outil n'en a besoin, retirez-la (Paramètres > Système >")
		fmt.Println("Informations système > Paramètres système avancés > Variables d'environnement).")
	}
}

func actionInstaller(o options) error {
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	if err := installer(dossier, time.Now()); err != nil {
		return err
	}
	fmt.Printf("Extension %s installée dans %s.\n", version(), dossier)
	exe, err := installerExe()
	if err != nil {
		return err
	}
	args := "lancer"
	if o.profil != "" {
		args += fmt.Sprintf(` --profil "%s"`, o.profil)
	}
	if o.lanceur != "" {
		args += fmt.Sprintf(` --lanceur "%s"`, o.lanceur)
	}
	if err := creerRaccourci(cheminRaccourci(), exe, args, filepath.Dir(exe)); err != nil {
		return echec(codeEcriture, "raccourci impossible : %v", err)
	}
	fmt.Println("Raccourci « Claude (cercle) » créé dans le menu Démarrer.")
	avertirVariable()
	fmt.Println("Quittez complètement Claude (zone de notification > Quitter), puis lancez-le par « Claude (cercle) ».")
	fmt.Println("Un Claude lancé autrement ne charge pas l'extension : c'est voulu.")
	return nil
}

// installerExe : cercle.exe copié dans %LOCALAPPDATA%\sonar-cercle (sauf s'il y tourne déjà) ; renvoie son chemin.
func installerExe() (string, error) {
	moi, err := os.Executable()
	if err != nil {
		return "", err
	}
	cible := filepath.Join(dossierCercle(), nomExe)
	if strings.EqualFold(filepath.Clean(moi), filepath.Clean(cible)) {
		return cible, nil
	}
	b, err := os.ReadFile(moi)
	if err == nil {
		err = os.MkdirAll(dossierCercle(), 0o755)
	}
	if err == nil {
		err = remplacerFichier(cible, b)
	}
	if err != nil {
		return "", echec(codeEcriture, "copie de cercle.exe impossible : %v", err)
	}
	return cible, nil
}

// remplacerFichier : écrit à côté, puis échange ; un exe en cours d'exécution peut être renommé, pas écrasé.
func remplacerFichier(chemin string, contenu []byte) error {
	nouveau, ancien := chemin+".nouveau", chemin+".ancien"
	if err := os.WriteFile(nouveau, contenu, 0o755); err != nil {
		return err
	}
	_ = os.Remove(ancien)
	if _, err := os.Stat(chemin); err == nil {
		if err := os.Rename(chemin, ancien); err != nil {
			return err
		}
	}
	return os.Rename(nouveau, chemin)
}

// Lancement interrompu (fenêtre fermée, panne) : REACT_PROFILE a pu rester à 1. La valeur d'avant est notée hors du
// dossier chargé par Claude, et remise au passage suivant.
type lancement struct {
	Existait bool   `json:"existait"`
	Valeur   string `json:"valeur"`
}

func fichierLancement() string { return filepath.Join(dossierCercle(), "lancement-en-cours.json") }

func reparerLancement() {
	b, err := os.ReadFile(fichierLancement())
	if err != nil {
		return
	}
	var l lancement
	if json.Unmarshal(b, &l) == nil && poserReactProfile(l.Valeur, l.Existait) == nil {
		_ = os.Remove(fichierLancement())
		fmt.Println("Lancement précédent interrompu : REACT_PROFILE remise comme avant.")
	}
}

func actionLancer(o options) error {
	reparerLancement()
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	if !o.sansMaj {
		if fait, code, err := proposerMaj(o); fait {
			return codeVersErreur(code)
		} else if err != nil {
			fmt.Println("Mise à jour : " + err.Error() + " — lancement avec la version actuelle.")
		}
	}
	if oc := occupant(dossier); oc != "nôtre" {
		return echec(codeVerif, "l'extension n'est pas installée (%s) : « cercle installer » d'abord.", oc)
	}
	// Claude ouvert : un nouveau lancement ne ferait que le ramener devant, sans charger l'extension.
	if claudeOuvert() {
		return echec(codeOuvert, "Claude est encore ouvert : quittez-le complètement (zone de notification > Quitter), puis relancez.")
	}
	if e := ecarts(dossier); len(e) > 0 {
		fmt.Println("Les fichiers installés ne sont plus ceux de cercle.exe :")
		for _, x := range e {
			fmt.Println("  " + x)
		}
		if !oui("Les réinstaller depuis cercle.exe avant de lancer ?") {
			return echec(codeVerif, "lancement refusé : fichiers installés modifiés.")
		}
		if err := installer(dossier, time.Now()); err != nil {
			return err
		}
	}
	cible, err := trouverClaude(o.lanceur)
	if err != nil {
		return err
	}
	if err := lancerArme(cible); err != nil {
		return err
	}
	fmt.Printf("Claude lancé avec l'extension %s (fichiers vérifiés). REACT_PROFILE remise comme avant.\n", version())
	return nil
}

// lancerArme : REACT_PROFILE=1 le temps que Claude démarre, puis la valeur d'avant, quoi qu'il arrive.
func lancerArme(cible string) (err error) {
	avant, existait, err := lireReactProfile()
	if err != nil {
		return echec(codeEcriture, "lecture de REACT_PROFILE impossible : %v", err)
	}
	b, _ := json.Marshal(lancement{existait, avant})
	if err := os.MkdirAll(dossierCercle(), 0o755); err != nil {
		return echec(codeEcriture, "%v", err)
	}
	if err := os.WriteFile(fichierLancement(), b, 0o644); err != nil {
		return echec(codeEcriture, "%v", err)
	}
	defer func() {
		if e := poserReactProfile(avant, existait); e != nil && err == nil {
			err = echec(codeEcriture, "REACT_PROFILE n'a pas pu être remise : %v (elle le sera au prochain passage)", e)
			return
		}
		_ = os.Remove(fichierLancement())
	}()
	if err := poserReactProfile("1", true); err != nil {
		return echec(codeEcriture, "REACT_PROFILE n'a pas pu être posée : %v", err)
	}
	if err := demarrerClaude(cible); err != nil {
		return echec(codeIntrouv, "démarrage de « %s » impossible : %v", cible, err)
	}
	// Claude lit son environnement au démarrage : on attend son processus, puis un peu de marge.
	for limite := time.Now().Add(30 * time.Second); !claudeOuvert(); time.Sleep(500 * time.Millisecond) {
		if time.Now().After(limite) {
			return echec(codeIntrouv, "Claude n'a pas démarré en 30 s avec « %s » : essayez --lanceur.", cible)
		}
	}
	time.Sleep(5 * time.Second)
	return nil
}

func codeVersErreur(code int) error {
	if code == okCode {
		return nil
	}
	return &erreurCode{code, "voir ci-dessus"}
}

// proposerMaj : s'il y a une version signée plus récente et que l'utilisateur l'accepte, remplace cercle.exe,
// réinstalle avec le nouvel exe et le relance (fait = true, avec son code). Sinon fait = false.
func proposerMaj(o options) (fait bool, code int, err error) {
	ctx, fin := contexteCourt(20 * time.Second)
	defer fin()
	m, err := chercherMiseAJour(ctx, version())
	if err != nil || m == nil {
		var e *erreurCode
		if errors.As(err, &e) && e.code == codeMiseAJour {
			// Une release plus récente mais mal signée : on le dit fort, on n'installe rien.
			fmt.Println("ATTENTION : " + e.msg)
			return false, okCode, nil
		}
		return false, okCode, err
	}
	fmt.Printf("Version %s disponible (actuelle : %s), signature vérifiée.\n", m.Version, version())
	if notes := strings.TrimSpace(m.Notes); notes != "" {
		fmt.Println(notes)
	}
	if !oui("L'installer ?") {
		return false, okCode, nil
	}
	exe := filepath.Join(dossierCercle(), nomExe)
	if err := os.MkdirAll(dossierCercle(), 0o755); err != nil {
		return true, codeEcriture, err
	}
	if err := remplacerFichier(exe, m.Exe); err != nil {
		fmt.Println("Erreur : remplacement de cercle.exe impossible : " + err.Error())
		return true, codeEcriture, nil
	}
	fmt.Println("cercle.exe mis à jour : réinstallation de l'extension et lancement avec la nouvelle version.")
	base := []string{}
	if o.profil != "" {
		base = append(base, "--profil", o.profil)
	}
	if c := relancer(exe, append([]string{"installer"}, base...)); c != okCode {
		return true, c, nil
	}
	if o.lanceur != "" {
		base = append(base, "--lanceur", o.lanceur)
	}
	return true, relancer(exe, append([]string{"lancer", "--sans-maj"}, base...)), nil
}

func relancer(exe string, args []string) int {
	c := exec.Command(exe, args...)
	c.Stdin, c.Stdout, c.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := c.Run(); err != nil {
		var e *exec.ExitError
		if errors.As(err, &e) {
			return e.ExitCode()
		}
		fmt.Println("Erreur : " + err.Error())
		return codeEcriture
	}
	return okCode
}

func actionMaj(o options) error {
	fait, code, err := proposerMaj(options{profil: o.profil, lanceur: o.lanceur})
	if err != nil {
		return echec(codeMiseAJour, "%v", err)
	}
	if !fait {
		fmt.Println("Pas de mise à jour à installer (version " + version() + ").")
		return nil
	}
	return codeVersErreur(code)
}

func actionRetirer(o options) error {
	if r := cheminRaccourci(); r != "" {
		if err := os.Remove(r); err == nil {
			fmt.Println("Raccourci supprimé.")
		}
	}
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	supprime, err := retirer(dossier)
	if err != nil {
		return err
	}
	if supprime {
		fmt.Println("Extension retirée de " + dossier + ".")
	} else {
		fmt.Println("Rien à retirer : " + dossier + " n'existe pas.")
	}
	avertirVariable()
	fmt.Println("cercle.exe reste dans " + dossierCercle() + " : supprimez ce dossier pour l'enlever aussi.")
	return nil
}

func actionEtat(o options) error {
	fmt.Println("cercle " + version())
	if pub, err := clePublique(); pub == nil || err != nil {
		fmt.Println("Mises à jour : désactivées (aucune clé publique embarquée).")
	}
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	oc := occupant(dossier)
	fmt.Println("Dossier : " + dossier)
	fmt.Println("Occupant : " + oc)
	if v, existe, err := lireReactProfile(); err == nil {
		if existe {
			fmt.Printf("REACT_PROFILE (utilisateur) : « %s »\n", v)
		} else {
			fmt.Println("REACT_PROFILE (utilisateur) : absente (bien : rien ne se charge hors « lancer »)")
		}
	}
	if e := lireEtat(dossier); e != nil {
		fmt.Printf("Installée : version %s, le %s\n", e.Version, e.Installe)
	}
	if oc == "nôtre" || oc == "nôtre sans état" {
		if e := ecarts(dossier); len(e) == 0 {
			fmt.Println("Fichiers installés identiques à ceux de cercle.exe.")
		} else {
			fmt.Println("ÉCARTS avec cercle.exe : " + strings.Join(e, " ; "))
		}
	}
	avertirVariable()
	return nil
}

func actionCle(o options) error {
	if len(o.positifs) != 1 {
		return echec(codeAction, "usage : cercle cle <fichier de clé privée à créer>")
	}
	chemin := o.positifs[0]
	if _, err := os.Stat(chemin); err == nil {
		return echec(codeEcriture, "%s existe déjà : je ne l'écrase pas.", chemin)
	}
	p1, err := lirePhrase("Phrase de passe (12 caractères au moins) : ")
	if err != nil {
		return err
	}
	p2, err := lirePhrase("Encore une fois : ")
	if err != nil {
		return err
	}
	if p1 != p2 {
		return echec(codeAction, "les deux phrases diffèrent.")
	}
	fichier, pub, err := nouvelleCle(p1)
	if err != nil {
		return echec(codeAction, "%v", err)
	}
	if err := os.WriteFile(chemin, fichier, 0o600); err != nil {
		return echec(codeEcriture, "%v", err)
	}
	fmt.Println("Clé privée chiffrée écrite dans " + chemin + " : gardez-la hors de GitHub (gestionnaire de mots de passe).")
	fmt.Println("Clé publique, à mettre dans extension/cle-publique.txt puis à commiter :")
	fmt.Println(pub)
	return nil
}

func actionSigner(o options) error {
	if len(o.positifs) != 3 {
		return echec(codeAction, "usage : cercle signer <cercle.exe à signer> <fichier de clé privée> <version>")
	}
	exe, cle, v := o.positifs[0], o.positifs[1], strings.TrimPrefix(o.positifs[2], "v")
	if parts(v) == nil {
		return echec(codeAction, "version illisible : %s", v)
	}
	contenu, err := os.ReadFile(exe)
	if err != nil {
		return err
	}
	fichierCle, err := os.ReadFile(cle)
	if err != nil {
		return err
	}
	phrase, err := lirePhrase("Phrase de passe : ")
	if err != nil {
		return err
	}
	prive, err := ouvrirCle(fichierCle, phrase)
	if err != nil {
		return echec(codeAction, "%v", err)
	}
	if err := os.WriteFile(exe+".sig", []byte(signer(prive, v, contenu)), 0o644); err != nil {
		return echec(codeEcriture, "%v", err)
	}
	fmt.Printf("%s.sig écrit (version %s). Ajoutez-le à la release v%s, puis publiez-la.\n", exe, v, v)
	return nil
}
