// Commandes de cercle.exe. Double-clic (sans argument) : un petit menu.
//
//	cercle installer [--profil <nom>] [--lanceur <cible>]  copie l'extension, installe cercle.exe dans
//	                                     %LOCALAPPDATA%\sonar-cercle, crée le raccourci « Claude (cercle) »
//	cercle lancer [--profil] [--lanceur] propose une mise à jour signée, verrouille et vérifie les fichiers installés,
//	                                     puis lance Claude avec REACT_PROFILE=1 le temps du démarrage seulement
//	cercle retirer                       supprime l'extension et le raccourci
//	cercle etat                          ce qui est installé, fichiers intacts ou non
//	cercle maj                           cherche une mise à jour signée et l'installe sur accord (sans lancer Claude)
//	cercle cle <fichier>                 crée la clé de signature (à garder hors de GitHub)
//	cercle signer <exe> <clé>            écrit <exe>.sig pour la version embarquée dans cet exe
//	cercle version
//
// Sécurité : Claude charge le dossier de l'extension quand REACT_PROFILE=1 à son démarrage, et ce dossier est
// modifiable par tout programme lancé sous le compte. La variable n'est donc jamais laissée en place : « lancer »
// verrouille le dossier, le compare aux fichiers embarqués dans l'exe, arme la variable le temps du démarrage, puis
// la remet (même si la fenêtre est fermée : signal, puis fichier de reprise relu par chaque action).
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
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
	if strings.Contains(o.profil+o.lanceur, `"`) {
		fmt.Fprintln(os.Stderr, `Erreur : --profil et --lanceur ne peuvent pas contenir de guillemet double (").`)
		return codeAction
	}
	if action != "version" && action != "cle" && action != "signer" {
		reparerLancement()
	}
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
	reparerLancement()
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

func verifierWindows() error {
	if dossierLocal() == "" {
		return echec(codeProfil, "LOCALAPPDATA n'est pas défini : cercle.exe ne sert que sous Windows, avec Claude Desktop installé.")
	}
	return nil
}

func dossierDe(o options) (string, error) {
	if err := verifierWindows(); err != nil {
		return "", err
	}
	p, err := trouverProfil(dossierLocal(), o.profil)
	if err != nil {
		return "", err
	}
	return dossierExtension(p), nil
}

// La variable posée en permanence (ancien outil, sonde) arme le crochet pour tout lancement de Claude.
func avertirVariable() {
	if v, err := lireReactProfile(); err == nil && v.Existe && v.Valeur == "1" {
		fmt.Println("Attention : REACT_PROFILE vaut 1 en permanence pour votre compte : tout lancement de Claude charge")
		fmt.Println("l'extension sans vérification. « cercle lancer » propose de la retirer.")
	}
}

func argsRaccourci(o options) string {
	args := "lancer"
	if o.profil != "" {
		args += fmt.Sprintf(` --profil "%s"`, o.profil)
	}
	if o.lanceur != "" {
		args += fmt.Sprintf(` --lanceur "%s"`, o.lanceur)
	}
	return args
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
	if err := creerRaccourci(cheminRaccourci(), exe, argsRaccourci(o), filepath.Dir(exe)); err != nil {
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

// remplacerFichier : écrit à côté, puis échange ; un exe en cours d'exécution peut être renommé, pas écrasé. En cas
// d'échec, l'ancien est remis à sa place.
func remplacerFichier(chemin string, contenu []byte) error {
	nouveau, ancien := chemin+".nouveau", chemin+".ancien"
	if err := os.WriteFile(nouveau, contenu, 0o755); err != nil {
		return err
	}
	_ = os.Remove(ancien)
	_, existait := os.Stat(chemin)
	if existait == nil {
		if err := os.Rename(chemin, ancien); err != nil {
			_ = os.Remove(nouveau)
			return err
		}
	}
	if err := os.Rename(nouveau, chemin); err != nil {
		if existait == nil {
			_ = os.Rename(ancien, chemin)
		}
		return err
	}
	return nil
}

// Lancement interrompu : REACT_PROFILE a pu rester à 1. La valeur à remettre est notée hors du dossier chargé par
// Claude, et remise par l'action suivante, quelle qu'elle soit.
func fichierLancement() string { return filepath.Join(dossierCercle(), "lancement-en-cours.json") }

func reparerLancement() {
	if dossierLocal() == "" {
		return
	}
	b, err := os.ReadFile(fichierLancement())
	if err != nil {
		return
	}
	var v valeurVariable
	if json.Unmarshal(b, &v) != nil {
		v = valeurVariable{}
	}
	// Jamais remettre « 1 » sans le dire : ce serait réarmer le crochet en permanence (fichier modifié ?).
	if v.Existe && strings.TrimSpace(v.Valeur) == "1" {
		v = valeurVariable{}
	}
	if poserReactProfile(v) == nil {
		_ = os.Remove(fichierLancement())
		fmt.Println("Lancement précédent interrompu : REACT_PROFILE remise comme avant.")
	}
}

func actionLancer(o options) error {
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	if !o.sansMaj {
		if fait, code := proposerMaj(o, true); fait {
			return codeVersErreur(code)
		}
	}
	if oc := occupant(dossier); oc != "nôtre" {
		return echec(codeVerif, "l'extension n'est pas installée (%s) : « cercle installer » d'abord.", oc)
	}
	// Claude ouvert : un nouveau lancement ne ferait que le ramener devant, sans charger l'extension.
	if claudeOuvert() {
		return echec(codeOuvert, "Claude est encore ouvert : quittez-le complètement (zone de notification > Quitter), puis relancez.")
	}
	cible, err := trouverClaude(o.lanceur)
	if err != nil {
		return err
	}
	// La variable vaut pour tous les profils : chaque dossier d'extension doit être absent, ou le nôtre et intact.
	var aVerrouiller []string
	for _, p := range tousLesProfils(dossierLocal()) {
		d := dossierExtension(p)
		switch oc := occupant(d); {
		case oc == "absent":
			continue
		case d != dossier && oc != "nôtre":
			return echec(codeVerif, "%s (%s) serait chargé aussi : retirez-le, ou lancez Claude sans cercle.", d, oc)
		}
		aVerrouiller = append(aVerrouiller, d)
		for _, f := range append(append([]string{}, fichiers...), fichierEtat) {
			aVerrouiller = append(aVerrouiller, filepath.Join(d, f))
		}
	}
	// Verrouiller AVANT de vérifier : ce qui est vérifié ne peut plus changer jusqu'au démarrage de Claude.
	liberer, err := verrouiller(aVerrouiller)
	if err != nil {
		return echec(codeVerif, "verrouillage impossible (fichier manquant ou déjà ouvert ailleurs) : %v. « cercle etat » pour voir.", err)
	}
	defer func() { liberer() }()
	for _, d := range aVerrouiller {
		if filepath.Base(d) != idExtension {
			continue
		}
		e := ecarts(d)
		if len(e) == 0 {
			continue
		}
		fmt.Println("Les fichiers installés dans " + d + " ne sont plus ceux de cercle.exe :")
		for _, x := range e {
			fmt.Println("  " + x)
		}
		if d != dossier || !oui("Les réinstaller depuis cercle.exe avant de lancer ?") {
			return echec(codeVerif, "lancement refusé : fichiers installés modifiés.")
		}
		liberer()
		liberer = func() {}
		if err := installer(dossier, time.Now()); err != nil {
			return err
		}
		return actionLancer(options{profil: o.profil, lanceur: o.lanceur, sansMaj: true})
	}
	if err := lancerArme(cible); err != nil {
		return err
	}
	fmt.Printf("Claude lancé avec l'extension %s (fichiers vérifiés).\n", version())
	return nil
}

// lancerArme : REACT_PROFILE=1 le temps que Claude démarre, puis la valeur d'avant, quoi qu'il arrive (retour,
// erreur, fenêtre fermée ou Ctrl+C ; sinon le fichier de reprise). Lancé directement (claude.exe), Claude reçoit la
// variable dans son seul environnement : le registre n'est pas touché.
func lancerArme(cible string) (err error) {
	if !parExplorateur(cible) {
		if err := demarrerClaude(cible); err != nil {
			return echec(codeIntrouv, "démarrage de « %s » impossible : %v", cible, err)
		}
		return attendreClaude(cible)
	}
	avant, err := lireReactProfile()
	if err != nil {
		return echec(codeEcriture, "lecture de REACT_PROFILE impossible : %v", err)
	}
	remettre := avant
	if avant.Existe && strings.TrimSpace(avant.Valeur) == "1" {
		fmt.Println("REACT_PROFILE vaut déjà 1 en permanence : tout Claude lancé autrement charge l'extension sans vérification.")
		if oui("La retirer après ce lancement (recommandé) ?") {
			remettre = valeurVariable{}
		}
	}
	b, _ := json.Marshal(remettre)
	if err := os.MkdirAll(dossierCercle(), 0o755); err != nil {
		return echec(codeEcriture, "%v", err)
	}
	if err := os.WriteFile(fichierLancement(), b, 0o644); err != nil {
		return echec(codeEcriture, "%v", err)
	}
	remise := func() error {
		if e := poserReactProfile(remettre); e != nil {
			return e // le fichier de reprise reste : l'action suivante réessaiera
		}
		_ = os.Remove(fichierLancement())
		return nil
	}
	// Fenêtre fermée ou Ctrl+C : Go reçoit un signal et a quelques secondes pour remettre la variable.
	signaux := make(chan os.Signal, 1)
	signal.Notify(signaux, os.Interrupt, syscall.SIGTERM)
	fini := make(chan struct{})
	defer func() { signal.Stop(signaux); close(fini) }()
	go func() {
		select {
		case <-signaux:
			_ = remise()
			os.Exit(codeEcriture)
		case <-fini:
		}
	}()
	defer func() {
		if e := remise(); e != nil && err == nil {
			err = echec(codeEcriture, "REACT_PROFILE n'a pas pu être remise : %v (elle le sera à la prochaine action de cercle)", e)
		}
	}()
	if err := poserReactProfile(valeurVariable{Existe: true, Valeur: "1", Type: 1}); err != nil {
		return echec(codeEcriture, "REACT_PROFILE n'a pas pu être posée : %v", err)
	}
	if err := demarrerClaude(cible); err != nil {
		return echec(codeIntrouv, "démarrage de « %s » impossible : %v", cible, err)
	}
	return attendreClaude(cible)
}

// attendreClaude : son processus, puis une marge pour qu'il lise son environnement et l'extension (verrous tenus).
func attendreClaude(cible string) error {
	for limite := time.Now().Add(30 * time.Second); !claudeOuvert(); time.Sleep(500 * time.Millisecond) {
		if time.Now().After(limite) {
			return echec(codeIntrouv, "Claude n'a pas démarré en 30 s avec « %s » : essayez --lanceur.", cible)
		}
	}
	time.Sleep(10 * time.Second)
	return nil
}

func codeVersErreur(code int) error {
	if code == okCode {
		return nil
	}
	return &erreurCode{code, "voir ci-dessus"}
}

// proposerMaj : avant un lancement. S'il y a une version signée plus récente et que l'utilisateur l'accepte, l'installe
// et (si lancer) relance Claude avec elle : fait = true, avec le code. Toute autre issue laisse lancer la version
// actuelle ; une release mal signée est signalée fort.
func proposerMaj(o options, lancer bool) (fait bool, code int) {
	m, err := chercherAvecDelai()
	if err != nil {
		var e *erreurCode
		if errors.As(err, &e) && e.code == codeMiseAJour {
			fmt.Println("ATTENTION : " + e.msg)
		} else {
			fmt.Println("Mise à jour : " + err.Error() + " — lancement avec la version actuelle.")
		}
		return false, okCode
	}
	if m == nil {
		return false, okCode
	}
	return appliquerMaj(m, o, lancer)
}

func chercherAvecDelai() (*miseAJour, error) {
	ctx, fin := contexteCourt(3 * time.Minute)
	defer fin()
	return chercherMiseAJour(ctx, version())
}

func appliquerMaj(m *miseAJour, o options, lancer bool) (bool, int) {
	fmt.Printf("Version %s disponible (actuelle : %s), signature vérifiée.\n", m.Version, version())
	if notes := nettoyer(m.Notes, 2000); notes != "" {
		fmt.Println("Notes de la release (texte de GitHub, NON signé) :")
		fmt.Println(notes)
	}
	if !oui("Installer la version " + m.Version + " ?") {
		return false, okCode
	}
	exe := filepath.Join(dossierCercle(), nomExe)
	if err := os.MkdirAll(dossierCercle(), 0o755); err == nil {
		err = remplacerFichier(exe, m.Exe)
		if err != nil {
			fmt.Println("Erreur : remplacement de cercle.exe impossible : " + err.Error())
			return true, codeEcriture
		}
	}
	fmt.Println("cercle.exe mis à jour : réinstallation de l'extension avec la nouvelle version.")
	var base []string
	if o.profil != "" {
		base = append(base, "--profil", o.profil)
	}
	if o.lanceur != "" {
		base = append(base, "--lanceur", o.lanceur)
	}
	if c := relancer(exe, append([]string{"installer"}, base...)); c != okCode || !lancer {
		return true, c
	}
	return true, relancer(exe, append([]string{"lancer", "--sans-maj"}, base...))
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
	m, err := chercherAvecDelai()
	if err != nil {
		var e *erreurCode
		if errors.As(err, &e) {
			return err
		}
		return echec(codeMiseAJour, "%v", err)
	}
	if m == nil {
		fmt.Println("Déjà à jour (version " + version() + ").")
		return nil
	}
	_, code := appliquerMaj(m, o, false)
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
	if v, err := lireReactProfile(); err != nil {
		fmt.Println("REACT_PROFILE : " + err.Error())
	} else if v.Existe {
		fmt.Printf("REACT_PROFILE (utilisateur) : « %s »\n", v.Valeur)
	} else {
		fmt.Println("REACT_PROFILE (utilisateur) : absente (bien : rien ne se charge hors « lancer »)")
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
	if len(o.positifs) != 2 {
		return echec(codeAction, "usage : cercle signer <cercle.exe à signer> <fichier de clé privée>")
	}
	exe, cle := o.positifs[0], o.positifs[1]
	contenu, err := os.ReadFile(exe)
	if err != nil {
		return err
	}
	// La version signée est celle embarquée dans l'exe, pas une version tapée à la main.
	v := versionDansExe(contenu)
	if parts(v) == nil {
		return echec(codeAction, "%s ne ressemble pas à un cercle.exe (version introuvable).", exe)
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
	sig := signer(prive, v, contenu)
	if pub, err := clePublique(); err == nil && pub != nil {
		if _, err := verifier(pub, sig, contenu); err != nil {
			return echec(codeAction, "cette clé n'est pas celle de cle-publique.txt : signature refusée.")
		}
	} else {
		fmt.Println("Attention : ce cercle.exe n'embarque pas de clé publique ; vérifiez qu'elle est bien commitée.")
	}
	if err := os.WriteFile(exe+".sig", []byte(sig), 0o644); err != nil {
		return echec(codeEcriture, "%v", err)
	}
	fmt.Printf("%s.sig écrit (version %s). Ajoutez-le à la release v%s, puis publiez-la.\n", exe, v, v)
	return nil
}
