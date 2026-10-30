//go:build windows

// La partie propre à Windows, sans module externe (appels système de la bibliothèque standard) : variable
// d'environnement utilisateur REACT_PROFILE, processus de Claude, verrous sur les fichiers, lancement, raccourci,
// saisie sans écho.
package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	advapi32               = syscall.NewLazyDLL("advapi32.dll")
	procRegSetValueExW     = advapi32.NewProc("RegSetValueExW")
	procRegDeleteValueW    = advapi32.NewProc("RegDeleteValueW")
	user32                 = syscall.NewLazyDLL("user32.dll")
	procSendMessageTO      = user32.NewProc("SendMessageTimeoutW")
	kernel32               = syscall.NewLazyDLL("kernel32.dll")
	procSetConsoleMode     = kernel32.NewProc("SetConsoleMode")
	procQueryFullImageName = kernel32.NewProc("QueryFullProcessImageNameW")
)

const (
	nomVariable  = "REACT_PROFILE"
	regExpandSz  = 2
	processQuery = 0x1000 // PROCESS_QUERY_LIMITED_INFORMATION
)

func dossierLocal() string { return os.Getenv("LOCALAPPDATA") }

// systeme : un programme de Windows par son chemin absolu, jamais cherché dans le PATH ou le dossier courant.
func systeme(nom string) string {
	racine := os.Getenv("SystemRoot")
	if racine == "" {
		racine = `C:\Windows`
	}
	if nom == "powershell.exe" {
		return filepath.Join(racine, "System32", "WindowsPowerShell", "v1.0", nom)
	}
	if nom == "explorer.exe" {
		return filepath.Join(racine, nom)
	}
	return filepath.Join(racine, "System32", nom)
}

func cleEnvironnement(acces uint32) (syscall.Handle, error) {
	var h syscall.Handle
	nom, _ := syscall.UTF16PtrFromString("Environment")
	if err := syscall.RegOpenKeyEx(syscall.HKEY_CURRENT_USER, nom, 0, acces, &h); err != nil {
		return 0, err
	}
	return h, nil
}

// lireReactProfile : la variable utilisateur, avec son type (texte simple ou à développer). Un autre type est refusé :
// on ne saurait pas la remettre telle quelle.
func lireReactProfile() (valeurVariable, error) {
	h, err := cleEnvironnement(syscall.KEY_READ)
	if err != nil {
		return valeurVariable{}, err
	}
	defer syscall.RegCloseKey(h)
	nom, _ := syscall.UTF16PtrFromString(nomVariable)
	var typ, n uint32
	err = syscall.RegQueryValueEx(h, nom, nil, &typ, nil, &n)
	if errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) {
		return valeurVariable{}, nil
	}
	if err != nil {
		return valeurVariable{}, err
	}
	if typ != syscall.REG_SZ && typ != regExpandSz {
		return valeurVariable{}, fmt.Errorf("REACT_PROFILE a un type inattendu (%d) : retirez-la ou corrigez-la à la main", typ)
	}
	buf := make([]uint16, n/2+1)
	if err := syscall.RegQueryValueEx(h, nom, nil, &typ, (*byte)(unsafe.Pointer(&buf[0])), &n); err != nil {
		return valeurVariable{}, err
	}
	return valeurVariable{Existe: true, Valeur: syscall.UTF16ToString(buf), Type: typ}, nil
}

// poserReactProfile : pose la variable utilisateur avec son type (ou la retire), puis prévient Windows pour que les
// programmes lancés ensuite (l'Explorateur, donc Claude) la voient.
func poserReactProfile(v valeurVariable) error {
	h, err := cleEnvironnement(syscall.KEY_READ | syscall.KEY_WRITE)
	if err != nil {
		return err
	}
	defer syscall.RegCloseKey(h)
	nom, _ := syscall.UTF16PtrFromString(nomVariable)
	if v.Existe {
		texte, err := syscall.UTF16FromString(v.Valeur)
		if err != nil {
			return fmt.Errorf("valeur de REACT_PROFILE illisible : %v", err)
		}
		typ := v.Type
		if typ != regExpandSz {
			typ = syscall.REG_SZ
		}
		r, _, _ := procRegSetValueExW.Call(uintptr(h), uintptr(unsafe.Pointer(nom)), 0, uintptr(typ),
			uintptr(unsafe.Pointer(&texte[0])), uintptr(len(texte)*2))
		if r != 0 {
			return syscall.Errno(r)
		}
	} else {
		r, _, _ := procRegDeleteValueW.Call(uintptr(h), uintptr(unsafe.Pointer(nom)))
		if r != 0 && syscall.Errno(r) != syscall.ERROR_FILE_NOT_FOUND {
			return syscall.Errno(r)
		}
	}
	env, _ := syscall.UTF16PtrFromString("Environment")
	var res uintptr
	// HWND_BROADCAST, WM_SETTINGCHANGE, SMTO_ABORTIFHUNG, 5 s.
	procSendMessageTO.Call(0xFFFF, 0x1A, 0, uintptr(unsafe.Pointer(env)), 0x2, 5000, uintptr(unsafe.Pointer(&res)))
	return nil
}

func cheminProcessus(pid uint32) string {
	h, err := syscall.OpenProcess(processQuery, false, pid)
	if err != nil {
		return ""
	}
	defer syscall.CloseHandle(h)
	buf := make([]uint16, 1024)
	n := uint32(len(buf))
	r, _, _ := procQueryFullImageName.Call(uintptr(h), 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n)))
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf[:n])
}

// claudeOuvert : un processus de Claude Desktop tourne. Claude Code s'appelle aussi claude.exe : on regarde le chemin
// de l'image (paquet du Microsoft Store, ou installation classique). Chemin illisible : on le compte, par prudence.
func claudeOuvert() bool {
	snap, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(snap)
	var p syscall.ProcessEntry32
	p.Size = uint32(unsafe.Sizeof(p))
	for err = syscall.Process32First(snap, &p); err == nil; err = syscall.Process32Next(snap, &p) {
		if strings.EqualFold(syscall.UTF16ToString(p.ExeFile[:]), "claude.exe") && estClaudeDesktop(cheminProcessus(p.ProcessID)) {
			return true
		}
	}
	return false
}

func powershell(script string) (string, error) {
	c := exec.Command(systeme("powershell.exe"), "-NoProfile", "-NonInteractive", "-Command", script)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := c.Output()
	return strings.TrimSpace(string(out)), err
}

// trouverClaude : --lanceur, sinon l'appli « Claude » du menu Démarrer dont l'identifiant est celui d'Anthropic (paquet
// du Microsoft Store ou installation classique ; pas une appli web du navigateur ni un raccourci quelconque nommé
// « Claude »), sinon l'installation classique.
func trouverClaude(lanceur string) (string, error) {
	if lanceur != "" {
		return lanceur, nil
	}
	id, err := powershell(`(Get-StartApps | Where-Object { $_.Name -eq 'Claude' -and ($_.AppID -like 'Claude_*!*' -or ` +
		`$_.AppID -like 'Anthropic*!*' -or $_.AppID -like 'com.squirrel.AnthropicClaude.*') } | Select-Object -First 1).AppID`)
	if err == nil && id != "" && !strings.ContainsAny(id, `"&|<>^`) {
		return `shell:AppsFolder\` + id, nil
	}
	classique := filepath.Join(dossierLocal(), "AnthropicClaude", "claude.exe")
	if _, err := os.Stat(classique); err == nil {
		return classique, nil
	}
	return "", echec(codeIntrouv, `Claude introuvable : donnez-le avec --lanceur (chemin de claude.exe, ou shell:AppsFolder\<AppID> : voir Get-StartApps).`)
}

// demarrerClaude : par l'Explorateur pour une appli du menu Démarrer (elle prend l'environnement de l'Explorateur, d'où
// la variable utilisateur), ou directement avec REACT_PROFILE=1 dans son seul environnement.
func demarrerClaude(cible string) error {
	var c *exec.Cmd
	if parExplorateur(cible) {
		c = exec.Command(systeme("explorer.exe"), cible)
	} else {
		c = exec.Command(cible)
		c.Env = append(os.Environ(), nomVariable+"=1")
	}
	return c.Start()
}

// verrouiller : ouvre le dossier et chaque fichier sans partage en écriture ni en suppression. Tant que les handles
// sont ouverts, personne ne peut modifier, remplacer, renommer ou supprimer ce qui vient d'être vérifié.
func verrouiller(chemins []string) (func(), error) {
	var handles []syscall.Handle
	liberer := func() {
		for _, h := range handles {
			syscall.CloseHandle(h)
		}
	}
	for _, c := range chemins {
		p, err := syscall.UTF16PtrFromString(c)
		if err != nil {
			liberer()
			return nil, err
		}
		// FILE_FLAG_BACKUP_SEMANTICS pour ouvrir un dossier ; FILE_FLAG_OPEN_REPARSE_POINT pour ne pas suivre un lien.
		h, err := syscall.CreateFile(p, syscall.GENERIC_READ, syscall.FILE_SHARE_READ, nil, syscall.OPEN_EXISTING,
			syscall.FILE_FLAG_BACKUP_SEMANTICS|0x00200000, 0)
		if err != nil {
			liberer()
			return nil, fmt.Errorf("%s : %v", c, err)
		}
		handles = append(handles, h)
	}
	return liberer, nil
}

func cheminRaccourci() string {
	return filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Claude (cercle).lnk")
}

func creerRaccourci(chemin, cible, args, travail string) error {
	_, err := powershell(fmt.Sprintf(
		"$r = (New-Object -ComObject WScript.Shell).CreateShortcut(%s); $r.TargetPath = %s; $r.Arguments = %s; "+
			"$r.WorkingDirectory = %s; $r.Description = %s; $r.Save()",
		ps(chemin), ps(cible), ps(args), ps(travail), ps("Lance Claude avec l'extension cercle, après vérification des fichiers")))
	return err
}

// lirePhrase : une phrase de passe tapée sans écho.
func lirePhrase(invite string) (string, error) {
	fmt.Print(invite)
	h := syscall.Handle(os.Stdin.Fd())
	var mode uint32
	if syscall.GetConsoleMode(h, &mode) == nil {
		procSetConsoleMode.Call(uintptr(h), uintptr(mode&^0x0004)) // sans ENABLE_ECHO_INPUT
		defer procSetConsoleMode.Call(uintptr(h), uintptr(mode))
	}
	l, err := entree.ReadString('\n')
	fmt.Println()
	return strings.TrimRight(l, "\r\n"), err
}
