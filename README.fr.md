# sonar

*[English version](README.md)*

Un **mod** Claude Code qui donne à **l'onglet Code de Claude Desktop** ce que la *status line* montre dans le terminal —
**sans dépenser un seul token** : il lit les chiffres que le moteur a déjà et lance `git status` en local.

Il ne répète pas ce que Claude Code affiche déjà (remplissage du contexte, pourcentage des 5 h) et ne montre que ce qui
mérite un coup d'œil. Trois niveaux de lecture :

**Le pied** de la zone de saisie (par défaut), entre le mode de permission et le nom du modèle. Le plus souvent, un seul mot :

```
sem. 41 %
```

S'y ajoutent, seulement quand c'est utile, `5 h rapide` (les 5 h partent plus vite que le temps), `cache froid`
(la prochaine réponse réécrira tout le cache) et `branche main` (vous êtes sur une branche protégée). L'étiquette est pâle,
le chiffre net ; la couleur (orange, rouge) ne touche que la valeur en cause.

**Le bandeau** (`/sonar bandeau`, en option) au-dessus de la saisie : une jauge par fenêtre et pour le cache. La barre est
l'usage, le petit trait vertical la part de la fenêtre déjà écoulée : barre au-delà du trait = vous consommez plus vite que
le rythme régulier. Viennent ensuite la branche et le coût, en clair.

**Le panneau** (`/sonar`) : tout le détail, jauges comprises, avec les heures de remise à zéro, le budget par jour, le taux
de lecture du cache, la branche et les fichiers modifiés, le coût et le fichier des relevés. Il se ferme par sa croix.
Quand le panneau ne peut pas s'ouvrir, `/sonar` écrit ce détail, une ligne par élément :

```
5 h 23 % (remise 15:00)
semaine 41 % (20 %/j, remise ven. 13:00)
cache chaud (92 % relu, jusqu'à 13:42)
branche feat/x (mon-depot, 2 modifiés)
coût 12,84 $
```

Dans le terminal, le bandeau et le panneau s'écrivent en texte (le terminal ne dessine pas de jauge). Les emplacements
`indice` et `ligne` servent au terminal ; l'appli de bureau ne les dessine pas.

**L'extension cercle** (Windows, en option) : cache · branche · coût dans le popover du **cercle d'usage** et sous
« Personnalisation » dans la barre latérale, avec le rythme des limites de [UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude).
Elle s'installe avec `cercle-setup.exe`, publié dans les [releases](https://github.com/Gh0st113/sonar/releases) :
voir [Extension cercle (Windows)](#extension-cercle-windows).

*(Comme le sonar d'un navire : il sonde en continu ce qui vous entoure — quotas, cache, branche — pour ne jamais toucher le fond par surprise.)*

Licence : [MIT](LICENSE).

Rien n'est propre à un abonnement ni à une personne : un chiffre que le moteur n'a pas (quotas hors abonnement,
coût quand il n'est pas suivi) n'est simplement pas affiché ; seuils, langue, segments et branches protégées sont des options.

## Ce qui est affiché

| Élément | Source | Pied | Couleur |
|---|---|---|---|
| `semaine` (quota sur 7 jours), heure de remise, budget par jour | `session.measure` | toujours (`sem. 41 %`) | selon le **rythme** : consommation comparée à la part de la fenêtre déjà écoulée — orange à plus de `paceWarn` (5) points d'avance, rouge à plus de `paceAlert` (15) ; et orange dès `quotaWarn` (70 %), rouge dès `quotaAlert` (90 %) quel que soit le rythme |
| `5 h`, heure de remise | `session.measure` | `5 h rapide`, sans pourcentage, seulement en avance sur le rythme | orange, rouge au-delà de `paceAlert` |
| autres limites (ex. `budget` d'une passerelle) | `session.measure` | avec leur pourcentage | seuils absolus seulement (durée de fenêtre inconnue) |
| `cache` chaud (taux de lecture, heure où il refroidit), incertain, froid | dernière requête du fil principal (`turn.step`, sous-agents exclus) | `cache froid` seulement | froid en orange |
| `branche`, dépôt, fichiers modifiés | `$.session.repo()` + `git status` (au plus toutes les 5 s, délai 3 s) | seulement sur `protectedBranches` (`main,master`) | orange sur une branche protégée |
| `coût` estimé de la session (prix catalogue) | `session.measure` | jamais | — |

Le mod n'affiche le contexte nulle part : Claude Code le montre déjà (l'extension cercle, en option, reprend le bloc
contexte de UI+ dans le popover du cercle).

Sur le bureau, le pied porte aussi, quel que soit l'emplacement choisi, une image transparente de 1 pixel dont le texte
alternatif contient le cache, la branche et le coût en JSON (`sonar:1 {…}`) : c'est ce que lit l'extension cercle.
Rien de visible ; un lecteur d'écran peut toutefois l'annoncer.

Durée de vie du cache : déduite des réponses (une lecture du cache après plus de 6 minutes prouve 1 h ; une réécriture complète
indique 5 min), donnée par le moteur lors d'un changement de modèle, ou forcée par `/sonar ttl`. Tant qu'elle est inconnue,
le cache est affiché chaud pendant 5 minutes (« au moins jusqu'à »), incertain jusqu'à une heure, puis froid.

## Commande `/sonar` (mots français ou anglais)

| Commande | Effet |
|---|---|
| `/sonar` | ouvre le panneau de détail ; répond par l'emplacement actuel, la durée du cache et l'aide |
| `/sonar pied` (`footer`) | l'essentiel dans le pied de la saisie (par défaut) ; dans le terminal, avec les libellés de mode |
| `/sonar indice` (`hint`) | le détail à la place de la ligne d'aide sous la saisie |
| `/sonar ligne` (`status`) | le détail en ligne d'état fixe sous la saisie (`$.ui.status`) |
| `/sonar bandeau` (`banner`) | les jauges au-dessus de la saisie |
| `/sonar ttl 5m` / `1h` / `auto` | durée de vie du cache ; `auto` la déduit |
| `/sonar masquer` / `afficher` (`hide` / `show`) | masquer / réafficher |

L'emplacement et une `ttl` forcée sont gardés d'une session à l'autre.

## Options

Dans `settings.json`, sous `pluginConfigs["sonar@sonar-mods"].options` (la clé est `<plugin>@<catalogue>` une fois installé ; ou le menu de configuration quand l'hôte en a un) :
`language` (`auto` / `en` / `fr`), `clock` (`auto` / `24h` / `12h`), `placement`, `segments` (séparés par des virgules :
`quotas,cache,repo,cost`), `paceWarn`, `paceAlert`, `quotaWarn`, `quotaAlert`, `protectedBranches`.
Une valeur invalide revient à sa valeur par défaut ; `contextWarn`, `contextAlert` et le segment `context` des versions
précédentes sont ignorés.

## Journal des relevés de quota (désactivé par défaut)

Pour suivre l'évolution de vos quotas dans le temps, `quotaLog: true` ajoute une ligne JSON à un fichier local chaque fois
que le pourcentage `5 h` ou `7 j` — ou son heure de remise à zéro — change. Aucune ligne si rien n'a bougé, aucun appel au
modèle (zéro token) ; l'écriture ne retarde jamais l'affichage et une erreur disque est ignorée.

```json
{"ts":"2026-10-27T22:42:00.000Z","five_hour":{"pct":66,"resets_at":"2026-10-27T23:00:00Z"},"seven_day":{"pct":67,"resets_at":"2026-11-01T10:00:00Z"}}
```

`pct` est le pourcentage utilisé tel que le moteur le donne, `resets_at` l'heure de remise en UTC ; une fenêtre inconnue est omise.
Le fichier est `quotaLogPath` (`~/…` accepté), par défaut `~/.claude/sonar/quota-log.jsonl` ; `/sonar` affiche le chemin
utilisé. Au-delà de 3 Mio, son contenu part dans une archive à côté (`quota-log.<date>.jsonl`) et le fichier repart de zéro.

```json
"pluginConfigs": { "sonar@sonar-mods": { "options": { "quotaLog": true } } }
```

## Installation

Depuis GitHub :

```powershell
claude plugin marketplace add Gh0st113/sonar
claude plugin install sonar@sonar-mods
```

Puis `/reload-plugins` dans une session ouverte (ou une nouvelle session). La ligne apparaît après la première réponse :
avant, le moteur n'a encore rien mesuré.

Depuis un clone local (pour le modifier) :

```powershell
claude plugin marketplace add <chemin-du-depot>
claude plugin install sonar@sonar-mods
```

Le mod est alors lu **depuis ce dossier** : après une modification, `/reload-plugins` dans la session suffit.

## Extension cercle (Windows)

Le dossier `extension/` contient une extension pour **l'appli Claude Desktop sous Windows**, adaptée de
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, licence MIT,
`extension/LICENSE-UI-PLUS`). Pas de navigateur à ouvrir : l'appli embarque son propre Chromium et charge elle-même ce
dossier. Elle montre ce que sonar sait, à deux endroits :

- **le cercle d'usage** (à droite sous la zone de saisie) : son popover garde ce qu'ajoute UI+ (ligne de temps et rythme de
  chaque limite, contexte de la session, réglages) et reçoit un bloc **Cache · Branche · Coût**, avec l'heure du relevé (sans données du mod, une ligne le recommande :
  mod absent, antérieur à 0.5.0, ou pas de session de l'onglet Code ouverte) ;
- **la barre latérale**, juste sous « Personnalisation » : une ligne « Utilisation » repliable comme dans UI+, et la
  ligne courte de sonar, par exemple `🔥 cache → 21:03 · ⎇ master · 4,00 $` (`🧊 cache froid` quand le cache est froid).

D'où viennent les données : sur le bureau, le mod sonar ajoute à son pied (à côté du nom du modèle) une image
transparente de 1 pixel dont le texte alternatif porte ses chiffres en JSON, sans langue. L'extension la lit et les écrit
en français ou en anglais, selon la langue de l'appli. Rien n'est masqué, le bandeau n'est pas utilisé : sonar peut rester
à son emplacement par défaut (`pied`), qui ne montre que ce qui mérite un coup d'œil (si vous aviez choisi `/sonar bandeau`,
revenez-y avec `/sonar pied` pour ne pas voir les infos en double). Les données partent même avec `/sonar masquer`, qui
cache seulement l'affichage de sonar. Le mod sonar (0.5.0 ou plus) est **recommandé**, pas obligatoire : sans lui,
l'extension montre la partie UI+ (utilisation, ligne de temps, rythme des limites), sans le bloc Cache · Branche · Coût
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
la demande ; la version se lit aussi dans Claude, sur la ligne de réglages du popover du cercle (`cercle 0.5.0 · UI+`). Windows peut afficher un
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

Mises à jour (**pas encore actives** : la version actuelle n'embarque pas encore de clé de signature ; « Gérer
Claude (cercle) » le dit) : à chaque lancement, « Claude (cercle) » regarde la dernière release GitHub. Il ne propose une version que si
elle est **plus récente** que la sienne et **signée** par la clé du mainteneur (ed25519 ; la clé publique est embarquée
dans `cercle.exe`, la clé privée n'est jamais sur GitHub), et ne l'installe **que sur votre accord** : la recherche ne
retarde pas Claude de plus de 5 secondes ; après votre « Oui », il télécharge l'installeur signé, le vérifie, l'exécute
sans assistant, puis relance Claude. Une release mal signée est signalée et
ignorée : un compte GitHub piraté ne suffit pas à pousser du code dans Claude. Les notes de version affichées viennent de
GitHub et ne sont **pas** signées. Sans réseau, Claude se lance avec la version actuelle.
L'icône de `cercle.exe` et de l'installeur est dessinée par le code (`extension/icone`, refaite par `go generate`).

Depuis un terminal (`%LOCALAPPDATA%\Programs\sonar-cercle\cercle.exe <action>`) : `lancer` (ce que fait le raccourci),
`gerer` (ce que fait « Gérer Claude (cercle) »), `etat` (fichiers intacts ou non, état de la variable), `maj` (cherche une version signée et l'installe sur accord, sans
lancer Claude), `installer` / `retirer` (appelés par l'installeur et la désinstallation), `version` ; options
`--profil <claude_…>` s'il y a plusieurs profils, `--lanceur <claude.exe ou shell:AppsFolder\…>` si Claude n'est pas
trouvé. Codes de retour : 0 réussi, 1 action inconnue, 2 profil introuvable ou ambigu, 3 dossier occupé par autre chose
(React DevTools ?), 4 écriture, 5 Claude encore ouvert, 6 fichiers installés modifiés, 7 Claude introuvable, 8 mise à jour
refusée.

Publier une version (mainteneur) :
1. une fois : prendre un installeur d'essai (onglet **Actions** du dépôt > dernière exécution « cercle » > **Artifacts** >
   `cercle-setup-essai` ; un installeur d'essai n'est pas signé : pour soi seulement, jamais à distribuer), l'installer,
   puis dans un terminal `%LOCALAPPDATA%\Programs\sonar-cercle\cercle.exe cle <fichier>` : il crée la clé (chiffrée par
   une phrase de passe ; à garder hors de GitHub, par exemple dans un gestionnaire de mots de passe) et affiche la clé
   publique, à mettre dans `extension/cle-publique.txt` et à commiter. Sans elle, la CI refuse de construire une release ;
2. monter `version` dans `extension/manifest.json`, commiter, pousser le tag `vX.Y.Z` : GitHub Actions teste, construit
   `cercle.exe` (Linux) puis `cercle-setup.exe` (Inno Setup, Windows), vérifie que le setup contient l'exe tel quel, et
   crée une release **en brouillon** ;
3. pour ne pas faire confiance à GitHub Actions, recompiler `cercle.exe` chez soi (build reproductible :
   `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags="-buildid= -H windowsgui"
   -o cercle.exe .` dans `extension/` du tag, Go 1.24.7) ;
4. télécharger `cercle-setup.exe` du brouillon, puis `cercle signer cercle-setup.exe <fichier de clé> --exe <cercle.exe
   recompilé>` : il vérifie que le setup contient exactement votre exe, lit la version, vérifie que la clé est celle de
   `cle-publique.txt`, et écrit `cercle-setup.exe.sig`. L'ajouter au brouillon, publier.

Limites :
- le chargement passe par un **crochet de développement** de Claude Desktop (`REACT_PROFILE=1` charge le dossier
  de React DevTools, `%LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi`) :
  rien ne garantit qu'Anthropic le garde ; si React DevTools occupe déjà ce dossier, l'installation refuse ;
- un programme malveillant déjà lancé sous votre compte peut toujours remplacer `cercle.exe` lui-même : la vérification
  protège des modifications du dossier de l'extension et des mises à jour piégées, pas d'un poste déjà compromis ;
- si `REACT_PROFILE` vaut 1 **en permanence** sur votre compte (ancien outil, sonde), « Claude (cercle) » propose de la retirer ;
- audit et provenance du code repris de UI+ : `extension/PROVENANCE.md` ;
- tout changement demande un **redémarrage complet** de Claude ;
- si vous décochez les deux raccourcis, il n'en reste aucun pour lancer Claude avec l'extension : lancer
  `cercle.exe` depuis son dossier d'installation ;
- installé « pour tous » avec le mot de passe d'un **autre** compte administrateur, la désinstallation tourne sous ce
  compte et ne trouve pas votre profil de Claude : l'extension y reste (`cercle.exe retirer` avant de désinstaller, ou
  supprimer le dossier `fmkadmapgofadopljbjfkapdkoienihi` à la main) ;
- le porteur est invisible mais **pas muet** : un lecteur d'écran peut annoncer son texte (`sonar:1 {…}`) dans le pied ;
- l'hôte du pied n'a pas encore été relevé dans l'appli (seul celui du bandeau l'a été) : à confirmer à l'essai ;
- les verrous tiennent jusqu'au démarrage de Claude (+10 s) : si Claude relit l'extension plus tard (nouvelle fenêtre), ce
  n'est plus couvert. À vérifier à l'essai (Process Monitor) ; l'AppID du paquet de Claude, cherché dans le menu Démarrer,
  aussi (sinon `--lanceur`) ;
- avec plusieurs organisations, le cercle peut montrer l'usage d'une autre que celle affichée (comportement de UI+) ;
- le bouton « Compacter » du bloc contexte de UI+ n'est cherché qu'en anglais et en allemand : en français, il n'apparaît pas ;
- les sélecteurs viennent de relevés de Claude Desktop Windows en français (`extension/test/fixtures`) : une mise à
  jour de Claude peut les casser.

Tests (Node 22 et Go 1.24, sans dépendance) : `node --test extension/test/`, et `go test ./...` dans `extension/`.

## Tests

```powershell
node --test sonar/test/
claude plugin validate sonar
claude plugin test sonar
node --test extension/test/
```

Et pour `cercle.exe` (Go 1.24), dans `extension/` : `go test ./...`. GitHub Actions lance l'ensemble à chaque push.

## Crédits et sources

- **[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude)**, de Lukas van Uden, sous licence MIT : l'extension
  cercle reprend son code (`widget.js`, `widget.css`, `manifest.json`, un test), à partir du commit
  [`126cf95`](https://github.com/LukasvanUden/ui-plus-for-claude/commit/126cf9540f557466f697f679e9ea20505bf6442a)
  (fichiers identiques au tag `v0.4.3`). Sa licence est jointe telle quelle (`extension/LICENSE-UI-PLUS`, aussi installée
  avec `cercle.exe`). Fichiers repris, empreintes git d'origine, modifications et audit : `extension/PROVENANCE.md`.
- **[Inno Setup](https://jrsoftware.org/isinfo.php)** (Jordan Russell et Martijn Laan) : construit l'installeur
  `cercle-setup.exe`.
