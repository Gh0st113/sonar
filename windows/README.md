# sonar for Windows

*[Version française](README.fr.md) · [back to the sonar mod](../README.md)*

This folder holds an extension for **the Claude Desktop app on Windows**, adapted from
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, MIT licence,
`LICENSE-UI-PLUS`). No browser involved: the app ships its own Chromium and loads this folder itself. It shows
what sonar knows in two places:

- the **usage circle** (right, below the prompt): its popover keeps what UI+ adds (time line and pace of each limit,
  session context, settings) and gets a **Cache · Cost** block (the branch is already in the prompt footer), with the time of the reading (without data from the mod, one line
  recommends it: mod missing, older than 0.5.1, or no Code tab session open);
- the **sidebar**, right below "Customize": a collapsible "Usage" row as in UI+, plus sonar's short line, e.g.
  `🔥 cache → 21:03 · ⎇ main · $4.00` (`🧊 cache cold` when the cache is cold).

Where the data comes from: on the desktop, the sonar mod adds to the banner above the prompt a transparent
1-pixel image whose alt text carries its numbers as language-neutral JSON. The extension reads it and words it in
English or French, following the app's language. The banner stays invisible when sonar is not shown there: sonar can stay in its
default `footer` placement, which only shows what deserves a glance (if you picked `/sonar banner`, go back with
`/sonar footer` to avoid seeing things twice). The data still flows with `/sonar hide`, which only hides sonar's own
display. The sonar mod (0.5.1 or later) is **recommended**, not required: without it, the extension shows the UI+
part (usage, timeline, limits' pace), without the Cache · Cost block or the short line.

From "Claude (cercle)" 0.5.x (the former name): the automatic update does not find 0.6.0; install
`sonar-setup.exe` by hand, over it: it replaces the former installation and removes its shortcuts.

Install: download **`sonar-setup.exe`** from the [releases](https://github.com/Gh0st113/sonar/releases) (signed installer, recommended). To try the
current state of `main`: [Actions > windows > main branch](https://github.com/Gh0st113/sonar/actions/workflows/windows.yml?query=branch%3Amain) > latest successful run > **Artifacts** >
`sonar-setup-essai` (unsigned test installer, zipped; a GitHub account is needed). Run it: a classic wizard. It first asks **"for me only"** (default, no administrator rights, into
`%LOCALAPPDATA%\Programs\sonar`) or **"for all users"** (`Program Files`, Windows asks for your consent; the
extension and Claude stay under your account, and updates ask for that consent again), then the folder, which you can
change. "For me only" refuses a protected folder: pick one of your own, or restart the installer and choose "for all
users". An update keeps the mode and folder of the existing installation. Optionally: a **"Claude + sonar"** Start menu folder (start Claude, **"Manage Claude
+ sonar"**, uninstall) and a desktop icon. It registers in **Settings > Apps** (version, uninstall), then copies the
extension into Claude's profile. **"Manage Claude + sonar"** shows the version and the extension's state, offers to
repair it if its files changed, and looks for an update on demand; the version also shows in Claude, on the settings row
of the circle's popover (`sonar 0.6.0 · UI+`). Windows may show a SmartScreen warning (installer without a
paid code-signing certificate): "More info > Run anyway". If Claude is open when installing, the installer says so before copying anything: "Retry"
once Claude is closed, or "Force close". Then start Claude from "Claude + sonar". Claude started any other way does **not** load the extension: on purpose. No black
window: a normal launch shows nothing; a question or a problem shows in a Windows dialog.

Why a launcher: Claude loads the extension when `REACT_PROFILE=1` at startup, and that folder can be written by any
program running under your account. So the variable is **never** left set. On every launch, "Claude + sonar":
- **locks** the extension's files (nobody can change, replace or delete them until Claude has started), then **compares**
  them with the ones `sonar.exe` embeds: same bytes, real files (no links), nothing extra; otherwise it offers to
  reinstall, or refuses. With several `claude_*` profiles it checks every extension folder, since the variable applies to
  all of them;
- sets `REACT_PROFILE=1`, starts Claude, waits for it, then puts the variable back. Interrupted: it is put back at once;
  if that fails, the previous value is recorded outside the folder and restored on the next launch. If it was already
  set to 1 permanently, it offers to remove it; an empty variable (left over by an older tool) is removed at install;
- recognises Claude Desktop by its program's path: an open Claude Code (also `claude.exe`) does not count.

Updates (active when `sonar.exe` embeds a public key; "Manage Claude + sonar" tells whether it does): on every
launch, "Claude + sonar" looks at the latest GitHub release. It only offers a version that is
**newer** than its own and **signed** with the maintainer's key (ed25519; the public key is embedded in `sonar.exe`), and only installs it **with your consent**: the lookup never delays Claude by more than
5 seconds; after your "Yes", it downloads the signed installer, checks it, runs it without the wizard, then starts
Claude again. A badly signed release is reported and ignored. Each release is signed on GitHub, in a protected
environment, and, when the maintainer has turned it on, approved by them with one click; their GitHub account is therefore protected by two-factor authentication.
The release notes shown come from GitHub and are **not** signed.
Offline, Claude starts with the current version.
The icon of `sonar.exe` and of the installer is drawn by code (`icone/`, rebuilt by `go generate`).

From a terminal (`%LOCALAPPDATA%\Programs\sonar\sonar.exe <action>`): `lancer` (what the shortcut does), `gerer`
(what "Manage Claude + sonar" does), `etat` (files intact or not, variable state), `maj` (looks for a signed version and installs it with your consent, without
starting Claude), `installer` / `retirer` (called by the installer and the uninstaller), `ouvert` (code 0 when Claude
is closed, 5 when open) and `fermer` (force-closes it), called by the installer, `version`; options
`--profil <claude_…>` with several profiles, `--lanceur <claude.exe or shell:AppsFolder\…>` if Claude is not found. Exit
codes: 0 success, 1 unknown action, 2 profile missing or ambiguous, 3 folder used by something else (React DevTools?),
4 write error, 5 Claude still open, 6 installed files changed, 7 Claude not found, 8 update refused.

Publishing a version (maintainer): see [PUBLIER.md](../PUBLIER.md) (in French).

Limits:
- loading goes through a **development hook** of Claude Desktop (`REACT_PROFILE=1` loads the React DevTools folder,
  `%LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi`): Anthropic does not
  guarantee it; if React DevTools already uses that folder, installing refuses;
- malware already running under your account can still replace `sonar.exe` itself: the check protects against changes
  to the extension folder and against tampered updates, not against an already compromised machine;
- if `REACT_PROFILE` is set to 1 **permanently** on your account (older tool, probe), "Claude + sonar" offers to remove it;
- audit and provenance of the code taken from UI+: [PROVENANCE.md](PROVENANCE.md);
- every change needs a **full restart** of Claude;
- if you untick both shortcuts, none is left to start Claude with the extension: run `sonar.exe` from its install
  folder;
- installed "for all users" with **another** administrator account's password, the uninstaller runs under that account
  and does not find your Claude profile: the extension stays there (`sonar.exe retirer` before uninstalling, or delete
  the `fmkadmapgofadopljbjfkapdkoienihi` folder by hand);
- the carrier is invisible but **not silent**: a screen reader may read its text (`sonar:1 {…}`) in the banner;
- the footer is not an area the extension can read (test of 10/30): the data goes through the banner, which may leave
  a slight empty gap above the prompt, to be confirmed when trying it;
- the locks hold until Claude has started (+10 s): if Claude reads the extension again later (new window), that is not
  covered. To be checked when trying it (Process Monitor); so is the AppID of Claude's package looked up in the Start
  menu (otherwise `--lanceur`);
- with several organizations, the circle may show another one's usage than the one displayed (UI+ behaviour);
- the "Compact" button of UI+'s context block is only looked up in English and German: in French it does not show;
- the selectors come from captures of Claude Desktop for Windows in French (`test/fixtures`): a Claude
  update can break them.

Tests (Node 22 and Go 1.24, no dependency): `node --test windows/test/`, and `go test ./...` in `windows/`.

Linux and macOS: a probe (removed, see git history) showed that Claude Desktop has the same hook there
(`~/.config/Claude/extensions/<id>` on Linux, probably `~/Library/Application Support/Claude/extensions/<id>` on
macOS) and loads a test extension. Nothing is planned until the Windows version is stable.
