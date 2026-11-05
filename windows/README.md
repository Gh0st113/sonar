# sonar for Windows

*[Version française](README.fr.md) · [back to the sonar mod](../README.md)*

An extension for **the Claude Desktop app on Windows**, adapted from
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, MIT licence, `LICENSE-UI-PLUS`).
It shows:

- in the **usage circle** popover (right, below the prompt): UI+'s time line and pace of each limit, session context
  and settings, plus a **Cache · Cost** block from the sonar mod;
- in the **sidebar**, below "Customize": a collapsible "Usage" row and sonar's short line, e.g.
  `🔥 cache → 21:03 · ⎇ main · $4.00`.

The Cache · Cost block needs the sonar mod (0.5.1 or later): it leaves its numbers, invisible, in the banner above the
prompt. Without the mod, the UI+ part still works.

## Install

1. Get this folder (`git clone`, or *Code > Download ZIP* on GitHub).
2. Double-click **`windows\installer.cmd`** (Claude Desktop must have been started at least once). If Claude is open,
   it offers to restart it.

Then start Claude as usual (Start menu, taskbar, at sign-in): the extension is there. If it does not show, sign out of
Windows and back in once.

**Update**: `git pull` (or a new ZIP), then `installer.cmd` again. **Remove**: `windows\desinstaller.cmd`, then restart
Claude. **Check**: `powershell -ExecutionPolicy Bypass -File windows\sonar.ps1 etat`.

## How it works

Claude Desktop loads the React DevTools extension folder
(`%LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi`) when `REACT_PROFILE=1` at
startup. `installer.cmd` copies the extension there, for each `claude_*` profile, and sets `REACT_PROFILE=1` for your
account, permanently, as UI+ does. It never overwrites a folder that holds another extension (React DevTools).

## Limits

- **Development hook**: Anthropic does not guarantee it; a Claude update may drop it.
- **Security**: while `REACT_PROFILE=1` is set, Claude loads whatever is in that folder, which any program running
  under your account can write. Malware already on your account could thus run code inside Claude, though it could
  also read Claude's data directly. `desinstaller.cmd` removes the variable.
- The selectors come from captures of Claude Desktop for Windows in French (`test/fixtures`): a Claude update can
  break them.
- With several organizations, the circle may show another one's usage (UI+ behaviour).
- UI+'s "Compact" button is only looked up in English and German.
- The data carrier is invisible but a screen reader may read its text (`sonar:1 {…}`).

Provenance and audit of the code taken from UI+: [PROVENANCE.md](PROVENANCE.md) (in French).
Tests: `node --test windows/test/`; the install script is tested by GitHub Actions (`tests` workflow).
