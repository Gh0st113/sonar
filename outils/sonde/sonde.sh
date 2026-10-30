#!/usr/bin/env bash
# Sonde « cercle sous Linux et macOS » (job de .github/workflows/sonde.yml) : Claude Desktop charge-t-il, comme sous
# Windows, le dossier de React DevTools quand REACT_PROFILE=1 au démarrage, et où ? Aucune connexion à un compte :
# on regarde seulement le code de l'appli, les dossiers qu'elle crée, et si une extension témoin se charge.
#
#   sonde.sh <dossier de l'appli (contenant app.asar quelque part)> <commande qui lance Claude…>
set -uo pipefail

APP="$1"
shift
LANCER=("$@")
ID=fmkadmapgofadopljbjfkapdkoienihi
SORTIE="${SORTIE:-$PWD/sonde-sortie}"
mkdir -p "$SORTIE"
RESUME="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
TEMOIN="SONDE-CERCLE-CHARGEE"

dire() { echo "$*" | tee -a "$RESUME"; }

dire "## Sonde : $(uname -s)"
dire ""

# 1. Le code de l'appli mentionne-t-il le crochet ? (app.asar est une archive non compressée : grep y lit le JS.)
mapfile -t ASARS < <(find "$APP" -name 'app.asar' -type f 2>/dev/null)
dire "- archives app.asar : ${#ASARS[@]} (${ASARS[*]:-aucune})"
for a in "${ASARS[@]}"; do
  for motif in REACT_PROFILE "$ID" Claude-Data loadExtension; do
    n=$(grep -a -o "$motif" "$a" | wc -l)
    dire "  - « $motif » : $n occurrence(s)"
  done
  grep -a -o -E ".{0,300}REACT_PROFILE.{0,400}" "$a" | head -5 > "$SORTIE/contexte-react-profile.txt" || true
  grep -a -o -E ".{0,300}$ID.{0,300}" "$a" | head -5 > "$SORTIE/contexte-id.txt" || true
  grep -a -o -E ".{0,200}Claude-Data.{0,200}" "$a" | head -10 > "$SORTIE/contexte-claude-data.txt" || true
done

# Lancer Claude 60 s avec REACT_PROFILE=1 (journal du processus principal et des pages : --enable-logging), dans son
# propre groupe de processus (set -m) : on l'arrête ensuite en entier, sans toucher à ce script.
lancer() {
  local nom="$1" prefixe=()
  if [ "$(uname -s)" = Linux ] && command -v strace >/dev/null; then
    prefixe=(strace -f -qq -e trace=%file -o "$SORTIE/$nom-strace.txt")
  fi
  set -m
  (
    export REACT_PROFILE=1 ELECTRON_ENABLE_LOGGING=1
    exec "${prefixe[@]}" "${LANCER[@]}" --enable-logging >"$SORTIE/$nom-journal.txt" 2>&1
  ) &
  local pid=$!
  set +m
  sleep "${DUREE:-60}"
  kill -TERM -- "-$pid" 2>/dev/null
  sleep 5
  kill -KILL -- "-$pid" 2>/dev/null
  # Filet : processus de l'appli sortis du groupe (noms exacts, jamais ce script).
  pkill -9 -x Claude 2>/dev/null
  pkill -9 -x claude-desktop 2>/dev/null
  pkill -9 -f 'Claude Helper' 2>/dev/null
  sleep 2
  return 0
}

# 2. Premier lancement : quels dossiers l'appli crée-t-elle, cherche-t-elle le dossier de l'extension ?
lancer premier
dire "- premier lancement : journal $(wc -l <"$SORTIE/premier-journal.txt") lignes"
find "$HOME" -maxdepth 5 \( -iname '*claude*' -o -name "$ID" \) -not -path '*/sonde-sortie/*' 2>/dev/null \
  | grep -v -E '/(\.cache/go-build|go/pkg)/' | sort > "$SORTIE/dossiers-claude.txt"
dire "- dossiers « claude » sous ~ : $(wc -l <"$SORTIE/dossiers-claude.txt") (liste dans les artifacts)"
if [ -f "$SORTIE/premier-strace.txt" ]; then
  grep -E "$ID|Claude-Data|/extensions" "$SORTIE/premier-strace.txt" | head -50 > "$SORTIE/strace-extension.txt"
  dire "- accès au dossier de l'extension vus par strace : $(grep -c "$ID" "$SORTIE/premier-strace.txt")"
  grep -o -E '"[^"]*'"$ID"'[^"]*"' "$SORTIE/premier-strace.txt" | sort -u | head -5 | sed 's/^/  - /' | tee -a "$RESUME"
fi

# 3. Une extension témoin là où l'appli range ses profils (dossiers claude_* d'un Claude-Data, sinon tout dossier
# « extensions » d'un dossier Claude), puis second lancement : son script écrit le témoin dans la console de la page.
mapfile -t PROFILS < <(find "$HOME" -maxdepth 6 -type d -path '*Claude-Data/claude_*' -prune 2>/dev/null)
if [ "${#PROFILS[@]}" -eq 0 ]; then
  mapfile -t PROFILS < <(find "$HOME" -maxdepth 6 -type d -iname '*claude*' 2>/dev/null | grep -v sonde-sortie | head -5)
fi
dire "- profils candidats : ${#PROFILS[@]}"
for p in "${PROFILS[@]}"; do
  d="$p/extensions/$ID"
  mkdir -p "$d"
  cat >"$d/manifest.json" <<'EOF'
{ "manifest_version": 3, "name": "sonde cercle", "version": "0.0.1",
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["sonde.js"], "run_at": "document_start" }] }
EOF
  echo "console.log('$TEMOIN ' + location.href);" >"$d/sonde.js"
  dire "  - témoin déposé : ${d/#$HOME/~}"
done
lancer second
n=$(grep -c "$TEMOIN" "$SORTIE/second-journal.txt" 2>/dev/null || true)
dire ""
if [ "${n:-0}" -gt 0 ]; then
  dire "**Résultat : l'extension témoin s'est chargée ($n message(s)).**"
  grep "$TEMOIN" "$SORTIE/second-journal.txt" | head -3 | sed 's/^/    /' | tee -a "$RESUME"
else
  dire "**Résultat : aucun message de l'extension témoin.** (Crochet absent, autre dossier, ou page jamais chargée : voir les journaux.)"
fi
grep -i -E 'extension|devtools|react' "$SORTIE/second-journal.txt" | head -20 > "$SORTIE/journal-extension.txt" || true
exit 0
