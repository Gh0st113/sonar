#!/bin/sh
# sonar pour macOS : installe l'extension dans Claude Desktop.
# D'après App/ui-plus.sh de UI+ for Claude (Lukas van Uden, licence MIT, voir windows/LICENSE-UI-PLUS),
# commit 1e8274fc149a49979c8688a447ae9bf9bd0d3028.
#
# Claude Desktop charge le dossier d'extension de React DevTools quand REACT_PROFILE=1 à son démarrage.
# « installer » copie l'extension dans ce dossier et pose un agent de connexion qui règle REACT_PROFILE=1
# (une appli ouverte depuis le Dock ne voit pas les variables du shell). Mise à jour : git pull, puis relancer.
# Usage : sh mac/installer.sh installer|desinstaller|etat      Codes : 0 réussi, 1 échec, 2 action inconnue.
set -eu

SRC="$(cd "$(dirname "$0")/.." && pwd)/windows"
DONNEES="$HOME/Library/Application Support/Claude"
DOSSIER="$DONNEES/extensions/fmkadmapgofadopljbjfkapdkoienihi"
LABEL=io.github.gh0st113.sonar
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAINE="gui/$(/usr/bin/id -u)"
FICHIERS="manifest.json widget.js widget.css sonar-lecture.js LICENSE-UI-PLUS"

echec() { printf '\nÉchec : %s\n' "$1" >&2; exit 1; }
nom() { /usr/bin/plutil -extract name raw -o - "$DOSSIER/manifest.json" 2>/dev/null || true; }

# Le dossier est à nous s'il est absent, vide, ou si son manifeste porte le nom de UI+ (sonar ou l'original).
# Sinon c'est sans doute React DevTools : on n'y touche pas.
a_nous() {
  [ -d "$DOSSIER" ] || return 0
  [ -n "$(/bin/ls -A "$DOSSIER")" ] || return 0
  case "$(nom)" in "UI+ for Claude"*) return 0 ;; *) return 1 ;; esac
}

case "${1:-}" in
  installer)
    for f in $FICHIERS; do [ -f "$SRC/$f" ] || echec "fichier manquant : windows/$f"; done
    [ -d "$DONNEES" ] || echec "~${DONNEES#"$HOME"} est absent : lancez Claude Desktop une fois, quittez-le (⌘Q), puis relancez cette commande."
    a_nous || echec "le dossier d'extension est occupé par une autre extension (React DevTools ?) : rien n'a été posé."
    # UI+ d'origine : son agent de connexion reste et pourrait réinstaller le sien.
    case "$(nom)" in *sonar*) ;; "UI+"*) echo "UI+ for Claude d'origine remplacé. Son agent de connexion reste et son désinstalleur efface aussi sonar : pour le retirer, lancez « /Applications/UI+ for Claude.app/Contents/Resources/UI+ for Claude uninstall », puis de nouveau cette commande." ;; esac
    /bin/rm -rf "$DOSSIER"
    /bin/mkdir -p "$DOSSIER" "$(dirname "$AGENT")"
    for f in $FICHIERS; do /bin/cp "$SRC/$f" "$DOSSIER/"; done
    # Un version_name neuf à chaque installation : « Désinstaller… » dans le popover masque l'extension jusqu'à la
    # prochaine installation (widget.js, INSTALL_ID).
    /usr/bin/plutil -replace version_name -string "install-$(/bin/date +%s)" "$DOSSIER/manifest.json"
    /bin/cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key><array><string>/bin/launchctl</string><string>setenv</string><string>REACT_PROFILE</string><string>1</string></array>
    <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
    /bin/launchctl bootout "$DOMAINE" "$AGENT" 2>/dev/null || true
    /bin/launchctl bootstrap "$DOMAINE" "$AGENT" 2>/dev/null || echo "Avertissement : agent de connexion non chargé (session graphique absente ?) ; il le sera à la prochaine ouverture de session."
    /bin/launchctl setenv REACT_PROFILE 1
    echo "Extension installée : ~${DOSSIER#"$HOME"}"
    echo "sonar est installé. Quittez complètement Claude (⌘Q), puis rouvrez-le."
    ;;
  desinstaller)
    /bin/launchctl bootout "$DOMAINE" "$AGENT" 2>/dev/null || true
    /bin/rm -f "$AGENT"
    /bin/launchctl unsetenv REACT_PROFILE
    if [ -d "$DOSSIER" ] && ! a_nous; then echo "Laissé en place (pas sonar) : ~${DOSSIER#"$HOME"}"; else /bin/rm -rf "$DOSSIER"; fi
    echo "sonar est désinstallé. Quittez complètement Claude (⌘Q), puis rouvrez-le."
    ;;
  etat)
    if [ -f "$DOSSIER/manifest.json" ]; then
      a_nous || echo "Dossier d'extension : autre extension (pas sonar)"
      a_nous && echo "Extension : $(nom) $(/usr/bin/plutil -extract version raw -o - "$DOSSIER/manifest.json")"
    else echo "Extension : absente"; fi
    if [ -f "$AGENT" ]; then echo "Agent de connexion : présent"; else echo "Agent de connexion : absent"; fi
    echo "REACT_PROFILE (session) : $(/bin/launchctl getenv REACT_PROFILE 2>/dev/null || true)"
    ;;
  *) echo "Usage : sh mac/installer.sh installer|desinstaller|etat" >&2; exit 2 ;;
esac
