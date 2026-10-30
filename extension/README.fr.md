# Extension cercle (Windows)

*[English version](README.md) · [retour au mod sonar](../README.fr.md)*

Ce dossier contient une extension pour **l'appli Claude Desktop sous Windows**, adaptée de
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, licence MIT,
`LICENSE-UI-PLUS`). Pas de navigateur à ouvrir : l'appli embarque son propre Chromium et charge elle-même ce
dossier. Elle montre ce que sonar sait, à deux endroits :

- **le cercle d'usage** (à droite sous la zone de saisie) : son popover garde ce qu'ajoute UI+ (ligne de temps et rythme de
  chaque limite, contexte de la session, réglages) et reçoit un bloc **Cache · Coût** (la branche est déjà dans le pied de la saisie), avec l'heure du relevé (sans données du mod, une ligne le recommande :
  mod absent, antérieur à 0.5.1, ou pas de session de l'onglet Code ouverte) ;
- **la barre latérale**, juste sous « Personnalisation » : une ligne « Utilisation » repliable comme dans UI+, et la
  ligne courte de sonar, par exemple `🔥 cache → 21:03 · ⎇ master · 4,00 $` (`🧊 cache froid` quand le cache est froid).

D'où viennent les données : sur le bureau, le mod sonar ajoute au bandeau au-dessus de la saisie une image
transparente de 1 pixel dont le texte alternatif porte ses chiffres en JSON, sans langue. L'extension la lit et les écrit
en français ou en anglais, selon la langue de l'appli. Le bandeau reste invisible si sonar n'y est pas affiché : sonar peut rester
à son emplacement par défaut (`pied`), qui ne montre que ce qui mérite un coup d'œil (si vous aviez choisi `/sonar bandeau`,
revenez-y avec `/sonar pied` pour ne pas voir les infos en double). Les données partent même avec `/sonar masquer`, qui
cache seulement l'affichage de sonar. Le mod sonar (0.5.1 ou plus) est **recommandé**, pas obligatoire : sans lui,
l'extension montre la partie UI+ (utilisation, ligne de temps, rythme des limites), sans le bloc Cache · Coût
ni la ligne courte.

Installation : téléchargez **`cercle-setup.exe`** dans les [releases](https://github.com/Gh0st113/sonar/releases) (installeur signé, recommandé). Pour
essayer l'état actuel de `main` : [Actions > cercle > branche main](https://github.com/Gh0st113/sonar/actions/workflows/cercle.yml?query=branch%3Amain) > dernière exécution
réussie > **Artifacts** > `cercle-setup-essai` (installeur d'essai non signé, en zip ; compte GitHub nécessaire). Lancez-le : un assistant classique. Il demande d'abord **« pour moi seulement »** (par défaut, sans droits
administrateur, dans `%LOCALAPPDATA%\Programs\sonar-cercle`) ou **« pour tous les utilisateurs »** (`Program Files`,
Windows demande votre accord ; l'extension et Claude restent sous votre compte, et les mises à jour redemandent cet
accord), puis le dossier, modifiable. « Pour moi seulement » refuse un dossier protégé : choisissez-en un à vous, ou
relancez l'installeur en « pour tous ». Une mise à jour reprend le mode et le dossier de l'installation existante. Au choix : un dossier **« Claude (cercle) »** dans le menu Démarrer (lancer
Claude, **« Gérer Claude (cercle) »**, désinstaller) et une icône sur le Bureau. Il s'inscrit dans **Paramètres >
Applications** (version, désinstallation), puis copie l'extension dans le profil de Claude. **« Gérer Claude (cercle) »**
montre la version et l'état de l'extension, propose de la réparer si ses fichiers ont changé, et cherche une mise à jour à
la demande ; la version se lit aussi dans Claude, sur la ligne de réglages du popover du cercle (`cercle 0.5.2 · UI+`). Windows peut afficher un
avertissement SmartScreen (installeur non signé par un certificat payant) : « Informations complémentaires > Exécuter
quand même ». Ensuite, **quitter complètement Claude** (zone de notification > Quitter) et le lancer par
« Claude (cercle) ». Un Claude lancé autrement ne charge **pas** l'extension : c'est voulu. Pas de fenêtre noire : un
lancement normal n'affiche rien, une question ou un problème s'affiche dans une fenêtre de dialogue Windows.

Pourquoi un lanceur : Claude charge l'extension quand `REACT_PROFILE=1` à son démarrage, et ce dossier est modifiable par
tout programme lancé sous votre compte. La variable n'est donc **jamais** laissée en place. À chaque lancement,
« Claude (cercle) » :
- **verrouille** les fichiers de l'extension (plus personne ne peut les modifier, les remplacer ou les supprimer jusqu'au
  démarrage de Claude), puis les **compare** à ceux qu'embarque `cercle.exe` : mêmes octets, vrais fichiers (pas de
  liens), rien en trop ; sinon il propose de réinstaller, ou refuse. Avec plusieurs profils `claude_*`, il vérifie tous
  les dossiers d'extension, car la variable vaut pour tous ;
- pose `REACT_PROFILE=1`, démarre Claude, attend son démarrage, puis remet la variable comme avant. Interruption : elle
  est remise aussitôt ; si ce n'est pas possible, la valeur d'avant est notée hors du dossier et remise au lancement
  suivant. Si elle valait déjà 1 en permanence, il propose de la retirer ; une variable vide (reste d'un ancien outil)
  est retirée à l'installation ;
- reconnaît Claude Desktop par le chemin de son programme : un Claude Code ouvert (lui aussi `claude.exe`) ne compte pas.

Mises à jour (actives quand `cercle.exe` embarque une clé publique ; « Gérer Claude (cercle) » indique si c'est le
cas) : à chaque lancement, « Claude (cercle) » regarde la dernière release GitHub. Il ne propose une version que si
elle est **plus récente** que la sienne et **signée** par la clé du mainteneur (ed25519 ; la clé publique est embarquée
dans `cercle.exe`), et ne l'installe **que sur votre accord** : la recherche ne
retarde pas Claude de plus de 5 secondes ; après votre « Oui », il télécharge l'installeur signé, le vérifie, l'exécute
sans assistant, puis relance Claude. Une release mal signée est signalée et
ignorée. Chaque publication est signée sur GitHub, dans un environnement protégé, et, si le mainteneur
l'a activé, validée par lui d'un clic ; son compte GitHub est donc protégé par une double authentification. Les notes de version affichées viennent de
GitHub et ne sont **pas** signées. Sans réseau, Claude se lance avec la version actuelle.
L'icône de `cercle.exe` et de l'installeur est dessinée par le code (`icone/`, refaite par `go generate`).

Depuis un terminal (`%LOCALAPPDATA%\Programs\sonar-cercle\cercle.exe <action>`) : `lancer` (ce que fait le raccourci),
`gerer` (ce que fait « Gérer Claude (cercle) »), `etat` (fichiers intacts ou non, état de la variable), `maj` (cherche une version signée et l'installe sur accord, sans
lancer Claude), `installer` / `retirer` (appelés par l'installeur et la désinstallation), `version` ; options
`--profil <claude_…>` s'il y a plusieurs profils, `--lanceur <claude.exe ou shell:AppsFolder\…>` si Claude n'est pas
trouvé. Codes de retour : 0 réussi, 1 action inconnue, 2 profil introuvable ou ambigu, 3 dossier occupé par autre chose
(React DevTools ?), 4 écriture, 5 Claude encore ouvert, 6 fichiers installés modifiés, 7 Claude introuvable, 8 mise à jour
refusée.

Publier une version (mainteneur) : voir [PUBLIER.md](../PUBLIER.md).

Limites :
- le chargement passe par un **crochet de développement** de Claude Desktop (`REACT_PROFILE=1` charge le dossier
  de React DevTools, `%LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi`) :
  rien ne garantit qu'Anthropic le garde ; si React DevTools occupe déjà ce dossier, l'installation refuse ;
- un programme malveillant déjà lancé sous votre compte peut toujours remplacer `cercle.exe` lui-même : la vérification
  protège des modifications du dossier de l'extension et des mises à jour piégées, pas d'un poste déjà compromis ;
- si `REACT_PROFILE` vaut 1 **en permanence** sur votre compte (ancien outil, sonde), « Claude (cercle) » propose de la retirer ;
- audit et provenance du code repris de UI+ : [PROVENANCE.md](PROVENANCE.md) ;
- tout changement demande un **redémarrage complet** de Claude ;
- si vous décochez les deux raccourcis, il n'en reste aucun pour lancer Claude avec l'extension : lancer
  `cercle.exe` depuis son dossier d'installation ;
- installé « pour tous » avec le mot de passe d'un **autre** compte administrateur, la désinstallation tourne sous ce
  compte et ne trouve pas votre profil de Claude : l'extension y reste (`cercle.exe retirer` avant de désinstaller, ou
  supprimer le dossier `fmkadmapgofadopljbjfkapdkoienihi` à la main) ;
- le porteur est invisible mais **pas muet** : un lecteur d'écran peut annoncer son texte (`sonar:1 {…}`) dans le bandeau ;
- le pied n'est pas une zone que l'extension peut lire (essai du 30/10) : les données passent par le bandeau, qui
  pourrait laisser un léger espace vide au-dessus de la saisie, à confirmer à l'essai ;
- les verrous tiennent jusqu'au démarrage de Claude (+10 s) : si Claude relit l'extension plus tard (nouvelle fenêtre), ce
  n'est plus couvert. À vérifier à l'essai (Process Monitor) ; l'AppID du paquet de Claude, cherché dans le menu Démarrer,
  aussi (sinon `--lanceur`) ;
- avec plusieurs organisations, le cercle peut montrer l'usage d'une autre que celle affichée (comportement de UI+) ;
- le bouton « Compacter » du bloc contexte de UI+ n'est cherché qu'en anglais et en allemand : en français, il n'apparaît pas ;
- les sélecteurs viennent de relevés de Claude Desktop Windows en français (`test/fixtures`) : une mise à
  jour de Claude peut les casser.

Tests (Node 22 et Go 1.24, sans dépendance) : `node --test extension/test/`, et `go test ./...` dans `extension/`.

Linux et macOS : une sonde (retirée, voir l'historique git) a montré que Claude Desktop y a le même crochet
(`~/.config/Claude/extensions/<id>` sous Linux, probablement `~/Library/Application Support/Claude/extensions/<id>` sous
macOS) et charge une extension témoin. Rien n'est prévu tant que la version Windows n'est pas stable.
