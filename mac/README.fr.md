# sonar pour macOS

*[English version](README.md) · [retour au mod sonar](../README.fr.md)*

La même extension que [sonar pour Windows](../windows/README.fr.md) (popover du cercle d'usage, ligne de la barre
latérale, bloc Cache · Coût), pour **l'appli Claude Desktop sur Mac**. Elle réutilise les fichiers de `windows/` et les
installe comme le fait [UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) sous macOS
(`App/ui-plus.sh`, licence MIT).

> **Pas encore vérifié sur un vrai Mac.** Le script n'est exécuté que par GitHub Actions sur un runner macOS
> (installation, état, réinstallation, retrait dans un faux dossier personnel). Testeurs bienvenus :
> [issue #22](https://github.com/Gh0st113/sonar/issues/22).

## Installer

```sh
git clone https://github.com/Gh0st113/sonar.git
sh sonar/mac/installer.sh installer
```

Claude Desktop doit avoir été lancé au moins une fois. Puis quittez complètement Claude (⌘Q) et rouvrez-le.

**Mettre à jour** : `git pull`, puis `sh mac/installer.sh installer` de nouveau. **Vérifier** : `sh mac/installer.sh etat`.
**Retirer** : `sh mac/installer.sh desinstaller`, puis ⌘Q et rouvrez Claude.

## Comment ça marche

Claude Desktop charge le dossier d'extension de React DevTools
(`~/Library/Application Support/Claude/extensions/fmkadmapgofadopljbjfkapdkoienihi`) quand `REACT_PROFILE=1` au
démarrage. Le script y copie l'extension et ajoute un agent de connexion
(`~/Library/LaunchAgents/io.github.gh0st113.sonar.plist`) qui lance `launchctl setenv REACT_PROFILE 1` à chaque
ouverture de session, car une appli ouverte depuis le Dock ne voit pas les variables du shell. Il n'écrase jamais un
dossier qui contient une autre extension ; il remplace celui de UI+ for Claude, dont l'agent de connexion reste. Son
désinstalleur (`/Applications/UI+ for Claude.app/Contents/Resources/UI+ for Claude uninstall`) efface aussi sonar et la
variable : lancez-le, puis `sh mac/installer.sh installer` de nouveau.

## Limites

Celles de [sonar pour Windows](../windows/README.fr.md#limites), et en plus : pas essayé sur un vrai Mac, et les
sélecteurs viennent de captures de Claude Desktop pour Windows en français.
