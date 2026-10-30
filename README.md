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

**The circle extension** (Windows, optional): cache and cost in Claude Desktop's **usage circle** popover, with the
limits' pace from [UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude). Install, how it works and limits:
[extension/README.md](extension/README.md).

*(Like a ship's sonar: it keeps sounding what lies around you — limits, cache, branch — so you never hit bottom by surprise.)*

License: [MIT](LICENSE).

Nothing is tied to one plan or one person: a figure the engine does not have (usage limits off a subscription,
cost where no ledger is kept) is simply not shown, and thresholds, language, segments and protected branches are plugin options.

## Install

From GitHub:

```powershell
claude plugin marketplace add Gh0st113/sonar
claude plugin install sonar@sonar-mods
```

Then `/reload-plugins` in an open session (or start a new one). The line shows up after the first answer:
before it, the engine has measured nothing yet. The mod runs in local sessions: a cloud session does not load it
(it runs in a container that does not have your plugins).

From a local clone (for hacking on it):

```powershell
claude plugin marketplace add <path-to-this-repo>
claude plugin install sonar@sonar-mods
```

The mod is then read **from that folder**: after an edit, `/reload-plugins` in the session is enough.

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

On the desktop, the banner also carries, whatever the placement, a transparent 1-pixel image whose alt text holds the
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
