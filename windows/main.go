// sonar.exe, le moteur de l'installeur « Claude + sonar » (installeur/sonar.iss). L'installeur le copie dans
// %LOCALAPPDATA%\Programs\sonar, crée le raccourci du menu Démarrer (= sonar.exe sans argument = lancer) et
// l'entrée de Paramètres > Applications, et appelle « installer » / « retirer ».
//
//	sonar [lancer] [--profil <nom>] [--lanceur <cible>]  propose une mise à jour signée, verrouille et vérifie les
//	                                     fichiers de l'extension, puis lance Claude avec REACT_PROFILE=1 le temps du
//	                                     démarrage seulement
//	sonar installer                      copie l'extension dans le profil de Claude (appelé par l'installeur)
//	sonar retirer                        la supprime (appelé à la désinstallation)
//	sonar etat                           ce qui est installé, fichiers intacts ou non
//	sonar verifier                       code de retour seul : 0 extension intacte, 6 sinon (scripts, CI)
//	sonar gerer                          « Gérer Claude + sonar » : version, état, réparation, mise à jour (fenêtres)
//	sonar maj                            cherche une mise à jour signée et l'installe sur accord (sans lancer Claude)
//	sonar ouvert                         code de retour seul : 0 Claude fermé, 5 ouvert (appelé par l'installeur)
//	sonar fermer                         ferme Claude de force (installeur, sur accord de l'utilisateur) ; 0, sinon 5
//	sonar cle <fichier>                  crée la clé de signature (à garder hors de GitHub)
//	sonar signer <setup> <clé> [--exe <sonar.exe recompilé>]   écrit <setup>.sig
//	sonar version
//
// Option commune : --silencieux (aucune fenêtre sauf les erreurs ; pour l'installeur).
//
// Sécurité : Claude charge le dossier de l'extension quand REACT_PROFILE=1 à son démarrage, et ce dossier est
// modifiable par tout programme lancé sous le compte. La variable n'est donc jamais laissée en place : « lancer »
// verrouille le dossier, le compare aux fichiers embarqués dans l'exe, arme la variable le temps du démarrage, puis
// la remet (même si le processus est interrompu : signal, puis fichier de reprise relu par chaque action).
package main

//go:generate go run ./icone/ecrire

import (
	"bytes"
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
	exe      string
	sansMaj  bool
	positifs []string
}

func main() {
	os.Exit(executer(os.Args[1:]))
}

func executer(args []string) int {
	action := "lancer"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		action, args = args[0], args[1:]
	}
	fs := flag.NewFlagSet(action, flag.ContinueOnError)
	var o options
	fs.StringVar(&o.profil, "profil", "", "dossier claude_* à utiliser s'il y en a plusieurs")
	fs.StringVar(&o.lanceur, "lanceur", "", `claude.exe, ou shell:AppsFolder\<AppID>`)
	fs.StringVar(&o.exe, "exe", "", "signer : sonar.exe recompilé chez soi, qui doit se trouver tel quel dans le setup")
	fs.BoolVar(&o.sansMaj, "sans-maj", false, "ne pas chercher de mise à jour")
	fs.BoolVar(&silencieux, "silencieux", false, "aucune fenêtre sauf les erreurs")
	// Options avant, entre ou après les arguments (le paquet flag s'arrête au premier argument).
	for {
		if err := fs.Parse(args); err != nil {
			return codeAction
		}
		if args = fs.Args(); len(args) == 0 {
			break
		}
		o.positifs, args = append(o.positifs, args[0]), args[1:]
	}
	// Pour l'installeur : code de retour seul, aucune fenêtre (il pose lui-même la question à l'utilisateur).
	switch action {
	case "ouvert":
		if claudeOuvert() {
			return codeOuvert
		}
		return okCode
	case "fermer":
		if fermerClaude() != nil {
			return codeOuvert
		}
		return okCode
	}
	if action != "version" && action != "cle" && action != "signer" {
		reparerLancement()
	}
	var err error
	switch action {
	case "lancer":
		err = actionLancer(o)
	case "installer":
		err = actionInstaller(o)
	case "retirer":
		err = actionRetirer(o)
	case "etat":
		err = actionEtat(o)
		vider(boiteInfo, true)
	case "gerer":
		err = actionGerer(o)
	case "verifier":
		err = actionVerifier(o)
	case "maj":
		err = actionMaj(o)
	case "cle":
		err = actionCle(o)
	case "signer":
		err = actionSigner(o)
	case "version":
		dire("%s", version())
		vider(boiteInfo, true)
	default:
		err = echec(codeAction, "action inconnue « %s » : lancer | installer | retirer | etat | verifier | gerer | maj | ouvert | fermer | cle | signer | version", action)
	}
	return terminer(err)
}

func terminer(err error) int {
	if err == nil {
		vider(boiteAlerte, false)
		return okCode
	}
	alerter("Erreur : %s", err.Error())
	vider(boiteErreur, true)
	var e *erreurCode
	if errors.As(err, &e) {
		return e.code
	}
	return codeEcriture
}

// Données de sonar.exe (fichier de reprise, téléchargements), à part du dossier du programme.
func dossierCercle() string { return filepath.Join(dossierLocal(), "sonar-cercle") }

func dossierDe(o options) (string, error) {
	if dossierLocal() == "" {
		return "", echec(codeProfil, "LOCALAPPDATA n'est pas défini : sonar.exe ne sert que sous Windows, avec Claude Desktop installé.")
	}
	p, err := trouverProfil(dossierLocal(), o.profil)
	if err != nil {
		return "", err
	}
	return dossierExtension(p), nil
}

// La variable posée en permanence (ancien outil, sonde) arme le crochet pour tout lancement de Claude.
func avertirVariable() {
	if v, err := lireReactProfile(); err == nil && v.Existe && strings.TrimSpace(v.Valeur) == "1" {
		alerter("Attention : REACT_PROFILE vaut 1 en permanence pour votre compte : tout lancement de Claude charge l'extension sans vérification. Le prochain lancement par « Claude + sonar » propose de la retirer.")
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
	dire("Extension %s installée dans %s.", version(), dossier)
	// Une REACT_PROFILE vide (reste d'un ancien outil) n'arme rien, mais traîne : on la retire.
	if v, err := lireReactProfile(); err == nil && v.Existe && strings.TrimSpace(v.Valeur) == "" {
		if poserReactProfile(valeurVariable{}) == nil {
			dire("REACT_PROFILE vide retirée.")
		}
	}
	avertirVariable()
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
		alerter("Lancement précédent interrompu : REACT_PROFILE remise comme avant.")
	}
}

func actionLancer(o options) error {
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	if !o.sansMaj {
		if fait, err := proposerMaj(true); fait || err != nil {
			return err
		}
	}
	if oc := occupant(dossier); oc != "nôtre" {
		return echec(codeVerif, "l'extension n'est pas installée (%s) : réinstallez « Claude + sonar ».", oc)
	}
	// Claude ouvert : un nouveau lancement ne ferait que le ramener devant, sans charger l'extension.
	if claudeOuvert() {
		return echec(codeOuvert, "Claude est encore ouvert : quittez-le complètement (zone de notification > Quitter), puis relancez « Claude + sonar ».")
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
			return echec(codeVerif, "%s (%s) serait chargé aussi : retirez-le, ou lancez Claude normalement.", d, oc)
		}
		aVerrouiller = append(aVerrouiller, d)
		for _, f := range append(append([]string{}, fichiers...), fichierEtat) {
			aVerrouiller = append(aVerrouiller, filepath.Join(d, f))
		}
	}
	// Verrouiller AVANT de vérifier : ce qui est vérifié ne peut plus changer jusqu'au démarrage de Claude.
	liberer, err := verrouiller(aVerrouiller)
	if err != nil {
		return echec(codeVerif, "verrouillage impossible (fichier manquant ou ouvert ailleurs) : %v", err)
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
		alerter("Les fichiers de l'extension (%s) ne sont plus ceux de sonar.exe :", d)
		for _, x := range e {
			dire("  %s", x)
		}
		if d != dossier || !oui("Les réinstaller depuis sonar.exe avant de lancer Claude ?") {
			return echec(codeVerif, "lancement refusé : fichiers de l'extension modifiés.")
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
	dire("Claude lancé avec l'extension %s (fichiers vérifiés).", version())
	return nil
}

// lancerArme : REACT_PROFILE=1 le temps que Claude démarre, puis la valeur d'avant, quoi qu'il arrive (retour,
// erreur, interruption ; sinon le fichier de reprise). Lancé directement (claude.exe), Claude reçoit la variable dans
// son seul environnement : le registre n'est pas touché.
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
		alerter("REACT_PROFILE vaut déjà 1 en permanence : tout Claude lancé autrement charge l'extension sans vérification.")
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
	// Interruption (Ctrl+C, fermeture, arrêt de session) : Go reçoit un signal et a quelques secondes pour remettre.
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
			err = echec(codeEcriture, "REACT_PROFILE n'a pas pu être remise : %v (elle le sera à la prochaine action de sonar.exe)", e)
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
			return echec(codeIntrouv, "Claude n'a pas démarré en 30 s avec « %s ».", cible)
		}
	}
	time.Sleep(10 * time.Second)
	return nil
}

// Délais : au lancement de Claude, la recherche ne doit pas le faire attendre ; à la demande (Gérer, « maj »), on
// peut patienter un peu plus. Le téléchargement, lui, n'a lieu qu'après l'accord.
const (
	delaiRechercheLancement = 5 * time.Second
	delaiRechercheDemande   = 30 * time.Second
	delaiTelechargement     = 3 * time.Minute
)

func chercher(delai time.Duration) (*disponible, error) {
	ctx, fin := contexteCourt(delai)
	defer fin()
	return chercherDisponible(ctx, version())
}

// proposerMaj : au lancement. S'il y a une version plus récente et que l'utilisateur l'accepte, lance son installeur
// (qui relance Claude) et renvoie fait = true. Une release mal signée est signalée ; une panne réseau ou une réponse
// trop lente, ignorée : Claude démarre avec la version actuelle.
func proposerMaj(lancer bool) (bool, error) {
	d, err := chercher(delaiRechercheLancement)
	if err != nil {
		var e *erreurCode
		if errors.As(err, &e) && e.code == codeMiseAJour {
			alerter("ATTENTION : %s", e.msg)
		} else {
			dire("Mise à jour : %v — version actuelle gardée.", err)
		}
		return false, nil
	}
	if d == nil {
		return false, nil
	}
	fait, err := installerDisponible(d, lancer)
	if err != nil {
		alerter("Mise à jour abandonnée : %v — Claude démarre avec la version actuelle.", err)
		return false, nil
	}
	return fait, nil
}

// installerDisponible : présente la version, demande l'accord, télécharge et vérifie l'installeur, puis le lance.
func installerDisponible(d *disponible, lancer bool) (bool, error) {
	alerter("Version %s disponible (actuelle : %s).", d.Version, version())
	if notes := nettoyer(d.Notes, 1500); notes != "" {
		dire("Notes de la release (texte de GitHub, non signé) :\n%s", notes)
	}
	if !oui("Télécharger et installer la version " + d.Version + " ? (sa signature est vérifiée avant l'installation)") {
		return false, nil
	}
	ctx, fin := contexteCourt(delaiTelechargement)
	defer fin()
	m, err := d.recuperer(ctx)
	if err != nil {
		return false, err
	}
	if err := os.MkdirAll(dossierCercle(), 0o755); err != nil {
		return false, echec(codeEcriture, "%v", err)
	}
	setup := filepath.Join(dossierCercle(), "sonar-setup-"+m.Version+".exe")
	if err := os.WriteFile(setup, m.Exe, 0o755); err != nil {
		return false, echec(codeEcriture, "écriture de l'installeur impossible : %v", err)
	}
	// /SILENT : la fenêtre de progression s'affiche, sans questions (l'accord est déjà donné).
	args := []string{"/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART"}
	// Pas de /ALLUSERS ni de /CURRENTUSER : l'installeur reprend de lui-même le mode de l'installation existante (pour
	// moi ou pour tous, UsePreviousPrivileges) ; pour tous, Windows demande l'accord.
	if lancer {
		args = append(args, "/LANCER=oui")
	}
	// L'installeur remplace sonar.exe : on le démarre et on s'arrête (il ferme ce qui le gênerait encore).
	if err := exec.Command(setup, args...).Start(); err != nil {
		return false, echec(codeEcriture, "lancement de l'installeur impossible : %v", err)
	}
	dire("Signature vérifiée. Installation de la version %s en cours.", m.Version)
	return true, nil
}

// majDemandee : « sonar maj » et Gérer. Les erreurs sont rendues (pas d'ignorance silencieuse ici).
func majDemandee() error {
	d, err := chercher(delaiRechercheDemande)
	if err != nil {
		var e *erreurCode
		if errors.As(err, &e) {
			return err
		}
		return echec(codeMiseAJour, "recherche impossible : %v", err)
	}
	if d == nil {
		alerter("Vous avez la dernière version (%s).", version())
		vider(boiteInfo, true)
		return nil
	}
	_, err = installerDisponible(d, false)
	return err
}

func actionMaj(o options) error { return majDemandee() }

func actionRetirer(o options) error {
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	supprime, err := retirer(dossier)
	if err != nil {
		return err
	}
	if supprime {
		dire("Extension retirée de %s.", dossier)
	} else {
		dire("Rien à retirer : %s n'existe pas.", dossier)
	}
	avertirVariable()
	return nil
}

func actionEtat(o options) error {
	dire("sonar %s", version())
	if pub, err := clePublique(); pub == nil || err != nil {
		dire("Mises à jour : désactivées (aucune clé publique embarquée).")
	}
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	oc := occupant(dossier)
	dire("Dossier : %s", dossier)
	dire("Occupant : %s", oc)
	if v, err := lireReactProfile(); err != nil {
		dire("REACT_PROFILE : %v", err)
	} else if v.Existe {
		dire("REACT_PROFILE (utilisateur) : « %s »", v.Valeur)
	} else {
		dire("REACT_PROFILE (utilisateur) : absente (bien : rien ne se charge hors « Claude + sonar »)")
	}
	if e := lireEtat(dossier); e != nil {
		dire("Installée : version %s, le %s", e.Version, e.Installe)
	}
	if oc == "nôtre" || oc == "nôtre sans état" {
		if e := ecarts(dossier); len(e) == 0 {
			dire("Fichiers de l'extension identiques à ceux de sonar.exe.")
		} else {
			alerter("ÉCARTS avec sonar.exe : %s", strings.Join(e, " ; "))
		}
	}
	avertirVariable()
	return nil
}

// actionVerifier : pour un script ou la CI, où la sortie d'un exe « windowsgui » n'est pas fiable : le code dit tout.
func actionVerifier(o options) error {
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	if oc := occupant(dossier); oc != "nôtre" {
		return echec(codeVerif, "extension non installée (%s)", oc)
	}
	if e := ecarts(dossier); len(e) > 0 {
		return echec(codeVerif, "écarts : %s", strings.Join(e, " ; "))
	}
	dire("Extension intacte.")
	return nil
}

// actionGerer : l'entrée « Gérer Claude + sonar » du menu Démarrer. La version et l'état, la réparation si les
// fichiers de l'extension ont changé, puis la recherche d'une mise à jour à la demande.
func actionGerer(o options) error {
	// La version d'abord : visible même si le profil de Claude est introuvable.
	dire("Claude + sonar version %s", version())
	dossier, err := dossierDe(o)
	if err != nil {
		return err
	}
	switch oc := occupant(dossier); {
	case oc == "absent":
		alerter("L'extension n'est pas installée dans le profil de Claude.")
		if oui("L'installer maintenant ?") {
			if err := installer(dossier, time.Now()); err != nil {
				return err
			}
			dire("Extension installée.")
		}
	case oc != "nôtre" && oc != "nôtre sans état":
		alerter("Le dossier de l'extension est occupé par autre chose (%s) : %s", oc, dossier)
	default:
		if e := ecarts(dossier); len(e) == 0 {
			dire("Extension : installée, fichiers intacts.")
		} else {
			alerter("Extension : fichiers modifiés (%s).", strings.Join(e, " ; "))
			if oui("Réparer (réinstaller les fichiers de l'extension) ?") {
				if err := installer(dossier, time.Now()); err != nil {
					return err
				}
				dire("Extension réparée.")
			}
		}
	}
	if v, err := lireReactProfile(); err == nil && v.Existe && strings.TrimSpace(v.Valeur) == "1" {
		alerter("REACT_PROFILE vaut 1 en permanence : le prochain lancement par « Claude + sonar » propose de la retirer.")
	}
	if pub, err := clePublique(); pub == nil || err != nil {
		dire("Mises à jour : pas encore activées (aucune clé de signature dans cette version).")
		vider(boiteInfo, true)
		return nil
	}
	if !oui("Chercher une mise à jour maintenant ?") {
		return nil
	}
	return majDemandee()
}

func actionCle(o options) error {
	if len(o.positifs) != 1 {
		return echec(codeAction, "usage : sonar cle <fichier de clé privée à créer>")
	}
	if !enConsole {
		return echec(codeAction, "à lancer depuis un terminal.")
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
	dire("Clé privée chiffrée écrite dans %s : gardez-la hors de GitHub (gestionnaire de mots de passe).", chemin)
	dire("Clé publique, à mettre dans windows/cle-publique.txt puis à commiter :\n%s", fmt.Sprint(pub))
	return nil
}

func actionSigner(o options) error {
	if len(o.positifs) != 2 {
		return echec(codeAction, "usage : sonar signer <sonar-setup.exe> <fichier de clé privée> [--exe <sonar.exe recompilé>]")
	}
	// CERCLE_PHRASE (nom d'avant le renommage, gardé) : la phrase de passe fournie par l'environnement (publication par GitHub Actions, secret de
	// l'environnement « publication ») ; sinon elle est demandée dans le terminal.
	phraseEnv, avecPhraseEnv := os.LookupEnv("CERCLE_PHRASE")
	if !enConsole && !avecPhraseEnv {
		return echec(codeAction, "à lancer depuis un terminal.")
	}
	setup, cle := o.positifs[0], o.positifs[1]
	contenu, err := os.ReadFile(setup)
	if err != nil {
		return err
	}
	// La version signée est celle de sonar.exe, stocké non compressé dans le setup : lue telle quelle.
	v := versionDansExe(contenu)
	if parts(v) == nil {
		return echec(codeAction, "%s ne contient pas de sonar.exe lisible (version introuvable).", setup)
	}
	if o.exe != "" {
		local, err := os.ReadFile(o.exe)
		if err != nil {
			return err
		}
		if !bytes.Contains(contenu, local) {
			return echec(codeAction, "le sonar.exe recompilé (%s) ne se trouve pas tel quel dans %s : ne signez pas.", o.exe, setup)
		}
		dire("Le setup contient exactement le sonar.exe recompilé.")
	} else {
		alerter("Conseil : recompilez sonar.exe chez vous et passez-le avec --exe pour vérifier le setup avant de signer.")
	}
	fichierCle, err := os.ReadFile(cle)
	if err != nil {
		return err
	}
	phrase := phraseEnv
	if !avecPhraseEnv {
		if phrase, err = lirePhrase("Phrase de passe : "); err != nil {
			return err
		}
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
		alerter("Attention : ce sonar.exe n'embarque pas de clé publique ; vérifiez qu'elle est bien commitée.")
	}
	if err := os.WriteFile(setup+".sig", []byte(sig), 0o644); err != nil {
		return echec(codeEcriture, "%v", err)
	}
	dire("%s.sig écrit (version %s). Ajoutez-le à la release v%s, puis publiez-la.", setup, v, v)
	return nil
}
