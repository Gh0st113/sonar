# sonar for macOS

*[Version française](README.fr.md) · [back to the sonar mod](../README.md)*

The same extension as [sonar for Windows](../windows/README.md) (usage circle popover, sidebar line, Cache · Cost
block), for **the Claude Desktop app on a Mac**. It reuses the files of `windows/` and installs them the way
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) does on macOS (`App/ui-plus.sh`, MIT licence).

> **Not verified on a real Mac yet.** The script is only run by GitHub Actions on a macOS runner (install, state,
> reinstall, removal in a fake home). Testers welcome: [issue #22](https://github.com/Gh0st113/sonar/issues/22).

## Install

```sh
git clone https://github.com/Gh0st113/sonar.git
sh sonar/mac/installer.sh installer
```

Claude Desktop must have been started at least once. Then quit Claude completely (⌘Q) and reopen it.

**Update**: `git pull`, then `sh mac/installer.sh installer` again. **Check**: `sh mac/installer.sh etat`.
**Remove**: `sh mac/installer.sh desinstaller`, then ⌘Q and reopen Claude.

## How it works

Claude Desktop loads the React DevTools extension folder
(`~/Library/Application Support/Claude/extensions/fmkadmapgofadopljbjfkapdkoienihi`) when `REACT_PROFILE=1` at startup.
The script copies the extension there, and adds a login item (`~/Library/LaunchAgents/io.github.gh0st113.sonar.plist`)
that runs `launchctl setenv REACT_PROFILE 1` at each login, because an app opened from the Dock does not see shell
variables. It never overwrites a folder that holds another extension; it replaces UI+ for Claude's, whose own login
item stays. Its uninstaller (`/Applications/UI+ for Claude.app/Contents/Resources/UI+ for Claude uninstall`) also deletes
sonar and the variable: run it, then `sh mac/installer.sh installer` again.

## Limits

Those of [sonar for Windows](../windows/README.md#limits), plus: not tried on a real Mac, and the selectors come from
captures of Claude Desktop for Windows in French.
