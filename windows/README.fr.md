# sonar pour Windows

*[English version](README.md) · [retour au mod sonar](../README.fr.md)*

Une extension pour **l'appli Claude Desktop sous Windows**, adaptée de
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, licence MIT, `LICENSE-UI-PLUS`).
Elle montre :

- dans le popover du **cercle d'usage** (à droite sous la saisie) : la ligne de temps et le rythme de chaque limite,
  le contexte de la session et les réglages de UI+, plus un bloc **Cache · Coût** venu du mod sonar ;
- dans la **barre latérale**, sous « Personnalisation » : une ligne « Utilisation » repliable et la ligne courte de
  sonar, par exemple `🔥 cache → 21:03 · ⎇ main · 4,00 $`.

Le bloc Cache · Coût demande le mod sonar (0.5.1 ou plus) : il dépose ses chiffres, invisibles, dans le bandeau
au-dessus de la saisie. Sans le mod, la partie UI+ fonctionne quand même.

## Installer

1. Récupérer ce dossier (`git clone`, ou *Code > Download ZIP* sur GitHub).
2. Double-cliquer **`windows\installer.cmd`** (Claude Desktop doit avoir été lancé au moins une fois). Si Claude est
   ouvert, il propose de le relancer.

Ensuite, lancer Claude comme d'habitude (menu Démarrer, barre des tâches, à l'ouverture de session) : l'extension est
là. Si elle n'apparaît pas, fermer la session Windows et la rouvrir une fois.

**Mettre à jour** : `git pull` (ou un nouveau ZIP), puis `installer.cmd` de nouveau. **Retirer** :
`windows\desinstaller.cmd`, puis relancer Claude. **Vérifier** :
`powershell -ExecutionPolicy Bypass -File windows\sonar.ps1 etat`.

## Fonctionnement

Claude Desktop charge le dossier d'extension de React DevTools
(`%LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi`) quand `REACT_PROFILE=1` à son
démarrage. `installer.cmd` y copie l'extension, pour chaque profil `claude_*`, et pose `REACT_PROFILE=1` pour votre
compte, en permanence, comme le fait UI+. Il n'écrase jamais un dossier qui contient une autre extension (React
DevTools).

## Limites

- **Crochet de développement** : Anthropic ne le garantit pas ; une mise à jour de Claude peut le supprimer.
- **Sécurité** : tant que `REACT_PROFILE=1` est posée, Claude charge ce qui se trouve dans ce dossier, modifiable par
  tout programme lancé sous votre compte. Un programme malveillant déjà présent pourrait donc faire tourner du code
  dans Claude ; il pourrait aussi bien lire directement les données de Claude. `desinstaller.cmd` retire la variable.
- Les sélecteurs viennent de relevés de Claude Desktop Windows en français (`test/fixtures`) : une mise à jour de
  Claude peut les casser.
- Avec plusieurs organisations, le cercle peut montrer l'usage d'une autre (comportement de UI+).
- Le bouton « Compacter » de UI+ n'est cherché qu'en anglais et en allemand.
- Le porteur des données est invisible, mais un lecteur d'écran peut annoncer son texte (`sonar:1 {…}`).

Provenance et audit du code repris de UI+ : [PROVENANCE.md](PROVENANCE.md).
Tests : `node --test windows/test/` ; le script d'installation est testé par GitHub Actions (workflow `tests`).
