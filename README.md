# sonar

*[Version française](README.fr.md)*

A Claude Code **mod** that gives the **Claude Desktop Code tab** what the terminal's *status line* shows —
**without spending a single token**: it reads figures the engine already has and runs `git status` locally.

In the prompt footer, between the permission mode and the model name, a short line — alerts first, since the app cuts the end
of the line when the window is narrow:

```
⚠️7d 80% · ctx 34% · 5h 23% · 🔥 · ⎇ feat/x ●2 · $13
```

Type `/sonar` for the full detail (reset times, daily budget, cache expiry, repo name):

```
ctx 34% · 5h 23% → 15:00 · ⚠️ 7d 80% ≈ 6.7%/d → Fri 13:00 · cache 🔥 92% → 13:42 · my-repo ⎇ feat/x ●2 · $12.84
```

Hovering the footer shows what the app cut. The `banner` placement shows the full line across the window
(the `hint` and `status` placements exist for the terminal; the desktop app does not draw them).

*(Like a ship's sonar: it keeps sounding what lies around you — context, limits, cache — so you never hit bottom by surprise.)*

License: [MIT](LICENSE).

Nothing is tied to one plan or one person: a figure the engine does not have (usage limits off a subscription,
cost where no ledger is kept) is simply not shown, and thresholds, language, segments and protected branches are plugin options.

## Segments

| Segment | Source | Warning |
|---|---|---|
| `ctx` context window fill | `session.measure` | orange from `contextWarn` (50), red above `contextAlert` (80) |
| `5h`, `7d` subscription usage limits, reset time | `session.measure` | by **pace**: usage compared with the share of the window already elapsed — orange more than `paceWarn` (5) points ahead, red more than `paceAlert` (15) ahead; and orange from `quotaWarn` (70 %), red from `quotaAlert` (90 %) whatever the pace |
| `≈ X%/d` (7d) | what is left ÷ days to the reset | under a day left: `(X% left)` |
| other limits (e.g. a gateway's `budget`) | `session.measure` | absolute thresholds only (no known window length) |
| `cache` 🔥 hit ratio → when it goes cold; ❔ uncertain; ❄️ cold | last request of the main thread (`turn.step`, subagents excluded) | ❄️ in orange |
| repo `⎇` branch `●` changed files | `$.session.repo()` + `git status` (at most every 5 s, 3 s timeout) | ⚠️ on `protectedBranches` (`main,master`) |
| session cost estimate (list price) | `session.measure` | — |

Cache lifetime: inferred from responses (a cache read after more than 6 minutes proves 1 h; a full rewrite points to 5 min),
or told by the engine on a model switch, or forced with `/sonar ttl`. Until it is known, the cache is shown warm for 5 minutes (`≥`),
uncertain up to an hour, then cold.

In the banner, only the figure at fault is coloured; everywhere, ⚠️ doubles the colour.

## `/sonar` command (English or French words)

| Command | Effect |
|---|---|
| `/sonar` | full detail, current placement, cache lifetime, help |
| `/sonar footer` (`pied`) | short line in the prompt footer (default); in the terminal, with the mode labels |
| `/sonar hint` (`indice`) | in place of the hint line under the prompt |
| `/sonar status` (`ligne`) | pinned status line under the prompt (`$.ui.status`) |
| `/sonar banner` (`bandeau`) | one grey line above the prompt, full width |
| `/sonar ttl 5m` / `1h` / `auto` | prompt cache lifetime; `auto` infers it |
| `/sonar hide` / `show` (`masquer` / `afficher`) | hide / bring back |

The placement and a forced `ttl` are kept across sessions.

## Options

Set in `settings.json` under `pluginConfigs.sonar.options` (or the config menu where the host has one):
`language` (`auto` / `en` / `fr`), `clock` (`auto` / `24h` / `12h`), `placement`, `segments` (comma-separated:
`context,quotas,cache,repo,cost`), `contextWarn`, `contextAlert`, `paceWarn`, `paceAlert`, `quotaWarn`, `quotaAlert`,
`protectedBranches`. An invalid value falls back to its default.

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

## Tests

```powershell
node --test sonar/test/
claude plugin validate sonar
claude plugin test sonar
```
