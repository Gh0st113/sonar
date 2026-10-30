# sonar

*[Version française](README.fr.md)*

A Claude Code **mod** that gives the **Claude Desktop Code tab** what the terminal's *status line* shows —
**without spending a single token**: it reads figures the engine already has and runs `git status` locally.

It does not repeat what Claude Code already shows (context fill, the 5-hour percentage) and shows only what deserves a
glance. Three levels of reading:

**The footer** of the prompt (default), between the permission mode and the model name. Most of the time, one word:

```
week 41%
```

Only when it matters, it adds `5h fast` (the 5-hour window is going faster than time), `cache cold` (the next response
will rewrite the whole cache) and `branch main` (you are on a protected branch). The label is pale, the figure crisp;
colour (orange, red) touches only the value at fault.

**The banner** (`/sonar banner`, optional) above the prompt: one gauge per window and for the cache. The bar is usage,
the small vertical tick the share of the window already elapsed: bar past the tick = you are using it faster than an even
pace. Then the branch and the cost, in plain text.

**The pane** (`/sonar`): the full detail, gauges included, with reset times, daily budget, cache hit ratio, branch and
changed files, cost and the usage log file. Close it with its cross. When the pane cannot open, `/sonar` writes that
detail, one line per item:

```
5h 23% (resets 15:00)
week 41% (20%/d, resets Fri 13:00)
cache warm (92% reused, until 13:42)
branch feat/x (my-repo, 2 modified)
cost $12.84
```

In the terminal, the banner and the pane are written as text (the terminal draws no gauge). The `hint` and `status`
placements exist for the terminal; the desktop app does not draw them.

**The circle extension** (Windows, optional): cache · branch · cost in the **usage circle**'s popover and below
"Customize" in the sidebar, with the limits' pace from [UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude).
Install it with `cercle-setup.exe`, from the [releases](https://github.com/Gh0st113/sonar/releases/latest): see
[Circle extension (Windows)](#circle-extension-windows).

*(Like a ship's sonar: it keeps sounding what lies around you — limits, cache, branch — so you never hit bottom by surprise.)*

License: [MIT](LICENSE).

Nothing is tied to one plan or one person: a figure the engine does not have (usage limits off a subscription,
cost where no ledger is kept) is simply not shown, and thresholds, language, segments and protected branches are plugin options.

## What is shown

| Item | Source | Footer | Colour |
|---|---|---|---|
| `week` (7-day limit), reset time, daily budget | `session.measure` | always (`week 41%`) | by **pace**: usage compared with the share of the window already elapsed — orange more than `paceWarn` (5) points ahead, red more than `paceAlert` (15) ahead; and orange from `quotaWarn` (70 %), red from `quotaAlert` (90 %) whatever the pace |
| `5h`, reset time | `session.measure` | `5h fast`, no percentage, only when ahead of pace | orange, red past `paceAlert` |
| other limits (e.g. a gateway's `budget`) | `session.measure` | with their percentage | absolute thresholds only (no known window length) |
| `cache` warm (hit ratio, when it goes cold), uncertain, cold | last request of the main thread (`turn.step`, subagents excluded) | `cache cold` only | cold in orange |
| `branch`, repo, changed files | `$.session.repo()` + `git status` (at most every 5 s, 3 s timeout) | only on `protectedBranches` (`main,master`) | orange on a protected branch |
| session `cost` estimate (list price) | `session.measure` | never | — |

The mod shows context nowhere: Claude Code already does (the optional circle extension brings UI+'s context block into
the circle's popover).

On the desktop, the footer also carries, whatever the placement, a transparent 1-pixel image whose alt text holds the
cache, branch and cost as JSON (`sonar:1 {…}`): that is what the circle extension reads. Nothing visible; a screen
reader may still announce it.

Cache lifetime: inferred from responses (a cache read after more than 6 minutes proves 1 h; a full rewrite points to 5 min),
or told by the engine on a model switch, or forced with `/sonar ttl`. Until it is known, the cache is shown warm for 5 minutes
("at least until"), uncertain up to an hour, then cold.

## `/sonar` command (English or French words)

| Command | Effect |
|---|---|
| `/sonar` | opens the detail pane; answers with the current placement, cache lifetime and help |
| `/sonar footer` (`pied`) | the essentials in the prompt footer (default); in the terminal, with the mode labels |
| `/sonar hint` (`indice`) | the detail in place of the hint line under the prompt |
| `/sonar status` (`ligne`) | the detail as a pinned status line under the prompt (`$.ui.status`) |
| `/sonar banner` (`bandeau`) | the gauges above the prompt |
| `/sonar ttl 5m` / `1h` / `auto` | prompt cache lifetime; `auto` infers it |
| `/sonar hide` / `show` (`masquer` / `afficher`) | hide / bring back |

The placement and a forced `ttl` are kept across sessions.

## Options

Set in `settings.json` under `pluginConfigs["sonar@sonar-mods"].options` (the key is `<plugin>@<marketplace>` once installed; or the config menu where the host has one):
`language` (`auto` / `en` / `fr`), `clock` (`auto` / `24h` / `12h`), `placement`, `segments` (comma-separated:
`quotas,cache,repo,cost`), `paceWarn`, `paceAlert`, `quotaWarn`, `quotaAlert`, `protectedBranches`.
An invalid value falls back to its default; `contextWarn`, `contextAlert` and the `context` segment of earlier versions
are ignored.

## Usage limit log (off by default)

To follow your usage limits over time, `quotaLog: true` appends a JSON line to a local file whenever the `5h` or `7d`
percentage — or its reset time — changes. No line when nothing moved, no model call (zero tokens); writing never delays the
display and a disk error is ignored.

```json
{"ts":"2026-10-27T22:42:00.000Z","five_hour":{"pct":66,"resets_at":"2026-10-27T23:00:00Z"},"seven_day":{"pct":67,"resets_at":"2026-11-01T10:00:00Z"}}
```

`pct` is the used percentage as the engine reports it, `resets_at` the reset time in UTC; an unknown window is left out.
The file is `quotaLogPath` (`~/…` accepted), by default `~/.claude/sonar/quota-log.jsonl`; `/sonar` shows the path in use.
Past 3 MiB its content moves to an archive next to it (`quota-log.<date>.jsonl`) and the file starts over.

```json
"pluginConfigs": { "sonar@sonar-mods": { "options": { "quotaLog": true } } }
```

## Install

From GitHub:

```powershell
claude plugin marketplace add Gh0st113/sonar
claude plugin install sonar@sonar-mods
```

Then `/reload-plugins` in an open session (or start a new one). The line shows up after the first answer:
before it, the engine has measured nothing yet.

From a local clone (for hacking on it):

```powershell
claude plugin marketplace add <path-to-this-repo>
claude plugin install sonar@sonar-mods
```

The mod is then read **from that folder**: after an edit, `/reload-plugins` in the session is enough.

## Circle extension (Windows)

`extension/` holds an extension for **the Claude Desktop app on Windows**, adapted from
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, MIT licence,
`extension/LICENSE-UI-PLUS`). No browser involved: the app ships its own Chromium and loads this folder itself. It shows
what sonar knows in two places:

- the **usage circle** (right, below the prompt): its popover keeps what UI+ adds (time line and pace of each limit,
  session context, settings) and gets a **Cache · Branch · Cost** block, with the time of the reading (without data from the mod, one line
  recommends it: mod missing, older than 0.5.0, or no Code tab session open);
- the **sidebar**, right below "Customize": a collapsible "Usage" row as in UI+, plus sonar's short line, e.g.
  `🔥 cache → 21:03 · ⎇ main · $4.00` (`🧊 cache cold` when the cache is cold).

Where the data comes from: on the desktop, the sonar mod adds to its footer (next to the model name) a transparent
1-pixel image whose alt text carries its numbers as language-neutral JSON. The extension reads it and words it in
English or French, following the app's language. Nothing is hidden and the banner is not used: sonar can stay in its
default `footer` placement, which only shows what deserves a glance (if you picked `/sonar banner`, go back with
`/sonar footer` to avoid seeing things twice). The data still flows with `/sonar hide`, which only hides sonar's own
display. The sonar mod (0.5.0 or later) is **recommended**, not required: without it, the extension shows the UI+
part (usage, timeline, limits' pace), without the Cache · Branch · Cost block or the short line.

Install: download **`cercle-setup.exe`** from the [latest release](https://github.com/Gh0st113/sonar/releases/latest)
and run it: a classic wizard. It first asks **"for me only"** (default, no administrator rights, into
`%LOCALAPPDATA%\Programs\sonar-cercle`) or **"for all users"** (`Program Files`, Windows asks for your consent; the
extension and Claude stay under your account, and updates ask for that consent again), then the folder, which you can
change. "For me only" refuses a protected folder: pick one of your own, or restart the installer and choose "for all
users". An update keeps the mode and folder of the existing installation. Optionally: a **"Claude (cercle)"** Start menu folder (start Claude, **"Manage Claude
(cercle)"**, uninstall) and a desktop icon. It registers in **Settings > Apps** (version, uninstall), then copies the
extension into Claude's profile. **"Manage Claude (cercle)"** shows the version and the extension's state, offers to
repair it if its files changed, and looks for an update on demand; the version also shows in Claude, on the settings row
of the circle's popover (`cercle 0.5.0 · UI+`). Windows may show a SmartScreen warning (installer without a
paid code-signing certificate): "More info > Run anyway". Then **quit Claude completely** (notification area > Quit) and
start it from "Claude (cercle)". Claude started any other way does **not** load the extension: on purpose. No black
window: a normal launch shows nothing; a question or a problem shows in a Windows dialog.

Why a launcher: Claude loads the extension when `REACT_PROFILE=1` at startup, and that folder can be written by any
program running under your account. So the variable is **never** left set. On every launch, "Claude (cercle)":
- **locks** the extension's files (nobody can change, replace or delete them until Claude has started), then **compares**
  them with the ones `cercle.exe` embeds: same bytes, real files (no links), nothing extra; otherwise it offers to
  reinstall, or refuses. With several `claude_*` profiles it checks every extension folder, since the variable applies to
  all of them;
- sets `REACT_PROFILE=1`, starts Claude, waits for it, then puts the variable back. Interrupted: it is put back at once;
  if that fails, the previous value is recorded outside the folder and restored on the next launch. If it was already
  set to 1 permanently, it offers to remove it; an empty variable (left over by an older tool) is removed at install;
- recognises Claude Desktop by its program's path: an open Claude Code (also `claude.exe`) does not count.

Updates (**not active yet**: the current version does not embed a signing key yet; "Manage Claude (cercle)" says
so): on every launch, "Claude (cercle)" looks at the latest GitHub release. It only offers a version that is
**newer** than its own and **signed** with the maintainer's key (ed25519; the public key is embedded in `cercle.exe`, the
private key is never on GitHub), and only installs it **with your consent**: the lookup never delays Claude by more than
5 seconds; after your "Yes", it downloads the signed installer, checks it, runs it without the wizard, then starts
Claude again. A badly signed release is reported and ignored: a hijacked
GitHub account is not enough to push code into Claude. The release notes shown come from GitHub and are **not** signed.
Offline, Claude starts with the current version.
The icon of `cercle.exe` and of the installer is drawn by code (`extension/icone`, rebuilt by `go generate`).

From a terminal (`%LOCALAPPDATA%\Programs\sonar-cercle\cercle.exe <action>`): `lancer` (what the shortcut does), `gerer`
(what "Manage Claude (cercle)" does), `etat` (files intact or not, variable state), `maj` (looks for a signed version and installs it with your consent, without
starting Claude), `installer` / `retirer` (called by the installer and the uninstaller), `version`; options
`--profil <claude_…>` with several profiles, `--lanceur <claude.exe or shell:AppsFolder\…>` if Claude is not found. Exit
codes: 0 success, 1 unknown action, 2 profile missing or ambiguous, 3 folder used by something else (React DevTools?),
4 write error, 5 Claude still open, 6 installed files changed, 7 Claude not found, 8 update refused.

Publishing a version (maintainer):
1. once: take a trial installer (repository **Actions** tab > latest "cercle" run > **Artifacts** > `cercle-setup-essai`;
   a trial installer is not signed: for yourself only, never to hand out), install it, then in a terminal
   `%LOCALAPPDATA%\Programs\sonar-cercle\cercle.exe cle <file>`: it creates the key (encrypted with a passphrase; keep it
   off GitHub, e.g. in a password manager) and prints the public key, to put in `extension/cle-publique.txt` and commit.
   Without it, CI refuses to build a release;
2. bump `version` in `extension/manifest.json`, commit, push the `vX.Y.Z` tag: GitHub Actions tests, builds `cercle.exe`
   (Linux) then `cercle-setup.exe` (Inno Setup, Windows), checks that the setup holds the exe as is, and creates a
   **draft** release;
3. to avoid trusting GitHub Actions, rebuild `cercle.exe` locally (reproducible build:
   `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags="-buildid= -H windowsgui"
   -o cercle.exe .` in the tag's `extension/`, Go 1.24.7);
4. download `cercle-setup.exe` from the draft, then `cercle signer cercle-setup.exe <key file> --exe <rebuilt
   cercle.exe>`: it checks that the setup holds exactly your exe, reads the version, checks that the key matches
   `cle-publique.txt`, and writes `cercle-setup.exe.sig`. Add it to the draft, publish.

Limits:
- loading goes through a **development hook** of Claude Desktop (`REACT_PROFILE=1` loads the React DevTools folder,
  `%LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi`): Anthropic does not
  guarantee it; if React DevTools already uses that folder, installing refuses;
- malware already running under your account can still replace `cercle.exe` itself: the check protects against changes
  to the extension folder and against tampered updates, not against an already compromised machine;
- if `REACT_PROFILE` is set to 1 **permanently** on your account (older tool, probe), "Claude (cercle)" offers to remove it;
- audit and provenance of the code taken from UI+: `extension/PROVENANCE.md`;
- every change needs a **full restart** of Claude;
- if you untick both shortcuts, none is left to start Claude with the extension: run `cercle.exe` from its install
  folder;
- installed "for all users" with **another** administrator account's password, the uninstaller runs under that account
  and does not find your Claude profile: the extension stays there (`cercle.exe retirer` before uninstalling, or delete
  the `fmkadmapgofadopljbjfkapdkoienihi` folder by hand);
- the carrier is invisible but **not silent**: a screen reader may read its text (`sonar:1 {…}`) in the footer;
- the footer's host has not been captured in the app yet (only the banner's was): to be confirmed when trying it;
- the locks hold until Claude has started (+10 s): if Claude reads the extension again later (new window), that is not
  covered. To be checked when trying it (Process Monitor); so is the AppID of Claude's package looked up in the Start
  menu (otherwise `--lanceur`);
- with several organizations, the circle may show another one's usage than the one displayed (UI+ behaviour);
- the "Compact" button of UI+'s context block is only looked up in English and German: in French it does not show;
- the selectors come from captures of Claude Desktop for Windows in French (`extension/test/fixtures`): a Claude
  update can break them.

Tests (Node 22 and Go 1.24, no dependency): `node --test extension/test/`, and `go test ./...` in `extension/`.

## Tests

```powershell
node --test sonar/test/
claude plugin validate sonar
claude plugin test sonar
node --test extension/test/
```

And for `cercle.exe` (Go 1.24), in `extension/`: `go test ./...`. GitHub Actions runs it all on every push.

## Credits and sources

- **[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude)**, by Lukas van Uden, MIT licence: the cercle
  extension reuses its code (`widget.js`, `widget.css`, `manifest.json`, one test), from commit
  [`126cf95`](https://github.com/LukasvanUden/ui-plus-for-claude/commit/126cf9540f557466f697f679e9ea20505bf6442a)
  (files identical to tag `v0.4.3`). Its licence is included as is (`extension/LICENSE-UI-PLUS`, also installed next
  to `cercle.exe`). Files taken, original git hashes, changes and audit: `extension/PROVENANCE.md`.
- **[Inno Setup](https://jrsoftware.org/isinfo.php)** (Jordan Russell and Martijn Laan): builds the `cercle-setup.exe`
  installer.
