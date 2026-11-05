# sonar

*[Version française](README.fr.md)*

A Claude Code **mod** that gives the **Claude Desktop Code tab** what the terminal's *status line* shows —
**without spending a single token**: it reads figures the engine already has and runs `git status` locally.

It does not repeat what Claude Code already shows (context fill, the 5-hour percentage) and shows only what deserves a
glance. Three levels of reading:

**The footer** of the prompt (default), between the permission mode and the model name. Short (the app cuts a footer
that is too long with "…"):

```
🔥 $2.40 · ⎇ master
```

In this order, separated by "·", each only when known:

1. the cache state stuck to the session cost: 🔥 warm, ❄️ cold (orange, the next response will rewrite the whole cache),
   ❔ uncertain (orange), then the amount;
2. the branch (`⎇`), shortened: last segment after "/", without a hash suffix, 20 characters at most
   (`claude/mod-pied-cache-79d924` → `mod-pied-cache`); orange on a protected branch; `detached` for a detached HEAD.

The limits (5h, week) are never there, even in alert: they are in the banner, the pane, `/sonar` and the sonar for
Windows popover.
A single warning colour in the footer, orange, on the value (red is kept for the banner and the pane).

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

**sonar for Windows** (optional): cache and cost in Claude Desktop's **usage circle** popover, with the
limits' pace from [UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude). Install, how it works and limits:
[windows/README.md](windows/README.md). The same extension exists for **macOS** (not verified on a real Mac yet):
[mac/README.md](mac/README.md).

*(Like a ship's sonar: it keeps sounding what lies around you — limits, cache, branch — so you never hit bottom by surprise.)*

License: [MIT](LICENSE).

Nothing is tied to one plan or one person: a figure the engine does not have (usage limits off a subscription,
cost where no ledger is kept) is simply not shown, and thresholds, language, segments and protected branches are plugin options.

## Install

From GitHub:

```sh
claude plugin marketplace add Gh0st113/sonar
claude plugin install sonar@sonar-mods
```

Then `/reload-plugins` in an open session (or start a new one). The line shows up after the first answer:
before it, the engine has measured nothing yet. The mod runs in local sessions: a cloud session does not load it
(it runs in a container that does not have your plugins).

From a local clone (for hacking on it):

```sh
claude plugin marketplace add <path-to-this-repo>
claude plugin install sonar@sonar-mods
```

The mod is then read **from that folder**: after an edit, `/reload-plugins` in the session is enough.

Systems: Windows (desktop app and terminal) and Linux (terminal, tried on Ubuntu); macOS expected, not tried yet
([issue #22](https://github.com/Gh0st113/sonar/issues/22)). The desktop extension exists for Windows and, untried, for macOS.

## What is shown

| Item | Source | Footer | Colour |
|---|---|---|---|
| `week` (7-day limit), reset time, daily budget | `session.measure` | never, even in alert | by **pace**: usage compared with the share of the window already elapsed — orange more than `paceWarn` (5) points ahead, red more than `paceAlert` (15) ahead; and orange from `quotaWarn` (70 %), red from `quotaAlert` (90 %) whatever the pace |
| `5h`, reset time | `session.measure` | never, even in alert | orange (red in the banner and pane past `paceAlert`) |
| other limits (e.g. a gateway's `budget`) | `session.measure` | never | absolute thresholds only (no known window length) |
| `cache` warm (hit ratio, when it goes cold), uncertain, cold | last request of the main thread (`turn.step`, subagents excluded); when a session already under way is opened, its last response read from the session's local transcript (see below) | 1st: the icon, stuck to the cost (🔥 warm, ❄️ cold, ❔ uncertain) | cold in orange |
| `branch`, repo, changed files | `$.session.repo()` + `git status` (at most every 5 s, 3 s timeout) | 2nd: `⎇` and the shortened name | orange on a protected branch |
| session `cost` estimate (list price) | `session.measure` | 1st, after the cache icon (`🔥 $2.40`); nothing when 0 (new session, or an old one whose cost the engine did not keep) | — |

The mod shows context nowhere: Claude Code already does (the optional sonar for Windows brings UI+'s context block into
the circle's popover).

On the desktop, the banner also carries, whatever the placement, a transparent 1-pixel image whose alt text holds the
cache, branch and cost as JSON (`sonar:1 {…}`): that is what sonar for Windows reads. Nothing visible; a screen
reader may still announce it.

Cache lifetime: inferred from responses (a cache read after more than 6 minutes proves 1 h; a full rewrite points to 5 min),
or told by the engine on a model switch, or forced with `/sonar ttl`. Until it is known, the cache is shown warm for 5 minutes
("at least until"), uncertain up to an hour, then cold.

A session already under way (resumed, app restarted): the mod has not seen any response yet. So on load it reads the
main thread's last response from the local transcript Claude Code keeps for each session
(`~/.claude/projects/<project>/<session id>.jsonl`, or under `CLAUDE_CONFIG_DIR`): its time, its cache usage and the
lifetime it wrote (5 min or 1 h). Read only, no tokens. The time used is when the request was sent if the transcript
records it, else the response time minus one minute (to be safe: the cache counts from the request).

Log over 4 MiB (a very long session: on the author's machine, about one session in five): the engine does not read
such a file. The mod then reads its end with `tail -c` (3 MB, enough to hold the last response), with the same
result as a small log, where `tail` exists (Linux, macOS; Windows only when it is on the PATH). Otherwise, in Claude
Desktop, it takes the last activity time the app keeps in its own record of the session
(`%LOCALAPPDATA%\Claude-Data\claude_*\claude-code-sessions\…\<id>.json`, found through the variables the app hands the
engine), minus the same minute. The time only, no read ratio or lifetime: warm for 5 min "at least", uncertain up to an
hour, then cold. It follows the last response within seconds for most sessions, but activity without a response can
shift it. With neither `tail` nor that record (Windows terminal): the cache stays unknown until the next message.

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
`language` and `clock` set to `auto` follow the system language: French for `fr`, English elsewhere, 12-hour clock for
`en-US`. When the engine does not know it (on Linux it always answers `en-US`), it is taken from `LC_ALL`, `LC_MESSAGES`
or `LANG` (`C` and `POSIX` do not count).

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

```sh
node --test mod/test/
claude plugin validate mod
claude plugin test mod
node --test windows/test/
```

GitHub Actions runs the Node tests and a trial of the Windows install script on every push.

## Credits and sources

- **[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude)**, by Lukas van Uden (Windows support by
  DarkstarDEV), MIT licence: sonar for Windows reuses its code (`widget.js`, `widget.css`, `manifest.json`, one test,
  the install script), at commit
  [`1e8274f`](https://github.com/LukasvanUden/ui-plus-for-claude/commit/1e8274fc149a49979c8688a447ae9bf9bd0d3028)
  (tag `v0.5.0`). Its licence is included as is (`windows/LICENSE-UI-PLUS`, also copied with the extension).
  Files taken, original git hashes, changes and audit: `windows/PROVENANCE.md` (in French).
