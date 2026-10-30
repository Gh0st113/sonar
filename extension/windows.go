//go:build windows

// La partie propre à Windows, sans module externe (appels système de la bibliothèque standard) : variable
// d'environnement utilisateur REACT_PROFILE, processus de Claude, lancement, raccourci, saisie sans écho.
package main

import (
	"bufio"
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
	advapi32            = syscall.NewLazyDLL("advapi32.dll")
	procRegSetValueExW  = advapi32.NewProc("RegSetValueExW")
	procRegDeleteValueW = advapi32.NewProc("RegDeleteValueW")
	user32              = syscall.NewLazyDLL("user32.dll")
	procSendMessageTO   = user32.NewProc("SendMessageTimeoutW")
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	procSetConsoleMode  = kernel32.NewProc("SetConsoleMode")
)

const nomVariable = "REACT_PROFILE"

func dossierLocal() string { return os.Getenv("LOCALAPPDATA") }

func cleEnvironnement(acces uint32) (syscall.Handle, error) {
	var h syscall.Handle
	nom, _ := syscall.UTF16PtrFromString("Environment")
	if err := syscall.RegOpenKeyEx(syscall.HKEY_CURRENT_USER, nom, 0, acces, &h); err != nil {
		return 0, err
	}
	return h, nil
}

// lireReactProfile : la valeur de la variable utilisateur, et si elle existe.
func lireReactProfile() (string, bool, error) {
	h, err := cleEnvironnement(syscall.KEY_READ)
	if err != nil {
		return "", false, err
	}
	defer syscall.RegCloseKey(h)
	nom, _ := syscall.UTF16PtrFromString(nomVariable)
	var typ, n uint32
	err = syscall.RegQueryValueEx(h, nom, nil, &typ, nil, &n)
	if errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	buf := make([]uint16, n/2+1)
	if err := syscall.RegQueryValueEx(h, nom, nil, &typ, (*byte)(unsafe.Pointer(&buf[0])), &n); err != nil {
		return "", false, err
	}
	return syscall.UTF16ToString(buf), true, nil
}

// poserReactProfile : pose la variable utilisateur (ou la retire si !existe), puis prévient Windows pour que les
// programmes lancés ensuite (l'Explorateur, donc Claude) la voient.
func poserReactProfile(valeur string, existe bool) error {
	h, err := cleEnvironnement(syscall.KEY_READ | syscall.KEY_WRITE)
	if err != nil {
		return err
	}
	defer syscall.RegCloseKey(h)
	nom, _ := syscall.UTF16PtrFromString(nomVariable)
	if existe {
		v, _ := syscall.UTF16FromString(valeur)
		r, _, _ := procRegSetValueExW.Call(uintptr(h), uintptr(unsafe.Pointer(nom)), 0, syscall.REG_SZ,
			uintptr(unsafe.Pointer(&v[0])), uintptr(len(v)*2))
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

// claudeOuvert : un processus claude.exe tourne.
func claudeOuvert() bool {
	snap, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(snap)
	var p syscall.ProcessEntry32
	p.Size = uint32(unsafe.Sizeof(p))
	for err = syscall.Process32First(snap, &p); err == nil; err = syscall.Process32Next(snap, &p) {
		if strings.EqualFold(syscall.UTF16ToString(p.ExeFile[:]), "claude.exe") {
			return true
		}
	}
	return false
}

func powershell(script string) (string, error) {
	c := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := c.Output()
	return strings.TrimSpace(string(out)), err
}

// guillemets simples PowerShell : ' doublé.
func ps(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// trouverClaude : --lanceur, sinon l'appli « Claude » du menu Démarrer (paquet MSIX), sinon l'installation classique.
func trouverClaude(lanceur string) (string, error) {
	if lanceur != "" {
		return lanceur, nil
	}
	if id, err := powershell("(Get-StartApps | Where-Object Name -eq 'Claude' | Select-Object -First 1).AppID"); err == nil && id != "" {
		return `shell:AppsFolder\` + id, nil
	}
	classique := filepath.Join(dossierLocal(), "AnthropicClaude", "claude.exe")
	if _, err := os.Stat(classique); err == nil {
		return classique, nil
	}
	return "", echec(codeIntrouv, `Claude introuvable : donnez-le avec --lanceur (chemin de claude.exe, ou shell:AppsFolder\<AppID> : voir Get-StartApps).`)
}

func demarrerClaude(cible string) error {
	var c *exec.Cmd
	if strings.HasPrefix(strings.ToLower(cible), "shell:") {
		c = exec.Command("explorer.exe", cible)
	} else {
		c = exec.Command(cible)
	}
	c.Env = append(os.Environ(), nomVariable+"=1")
	return c.Start()
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
	l, err := bufio.NewReader(os.Stdin).ReadString('\n')
	fmt.Println()
	return strings.TrimRight(l, "\r\n"), err
}
