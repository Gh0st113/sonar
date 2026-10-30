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

Le contexte n'est affiché nulle part : Claude Code le montre déjà.

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

Le dossier `extension/` contient une extension pour **Claude Desktop sous Windows**, adaptée de
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, licence MIT,
`extension/LICENSE-UI-PLUS`). Elle remplace le bandeau de sonar au-dessus de la zone de saisie :

- **cercle d'usage** sous la zone de saisie : son popover garde ce qu'ajoute UI+ (ligne de temps et rythme de
  chaque limite, contexte de la session, réglages) et reçoit un bloc **Cache · Branche · Coût** lu dans sonar ;
- **barre latérale**, juste sous « Personnalisation » : une ligne « Utilisation » repliable comme dans UI+, et la
  ligne courte de sonar, par exemple `🔥 cache → 21:03 · ⎇ master · 4,00 $` (`🧊 cache froid` quand le cache est froid) ;
- le **bandeau sonar** est masqué tant que son texte se lit comme sonar ; les bandeaux d'autres mods restent visibles.

L'extension lit le texte que sonar dessine au-dessus de la zone de saisie : sonar doit rester installé, en emplacement `bandeau` (`/sonar bandeau`).
Pendant que Claude travaille, le bandeau disparaît ; l'extension montre alors la dernière lecture et son heure.

Installation (PowerShell 7, depuis la racine du dépôt), puis **quitter complètement Claude** (zone de notification >
Quitter) et le relancer :

```powershell
pwsh -NoProfile -File .\extension\install.ps1 installer
```

État, sans rien changer :

```powershell
pwsh -NoProfile -File .\extension\install.ps1 etat
```

Retrait (supprime seulement le dossier de cette extension et remet `REACT_PROFILE` comme avant), puis redémarrage complet :

```powershell
pwsh -NoProfile -File .\extension\install.ps1 retirer
```

Limites :
- le chargement passe par un **crochet de développement** de Claude Desktop (`REACT_PROFILE=1` charge le dossier
  de React DevTools, `%LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi`) :
  rien ne garantit qu'Anthropic le garde ; si React DevTools occupe déjà ce dossier, le script refuse ;
- `REACT_PROFILE` est une variable **utilisateur** : toutes les applis lancées ensuite la voient ;
- tout changement demande un **redémarrage complet** de Claude ;
- s'il y a plusieurs dossiers `claude_*` (après une réinstallation de Claude), le script s'arrête : précisez lequel avec `-Profil <nom>` ;
- les sélecteurs viennent de relevés de Claude Desktop Windows en français (`extension/test/fixtures`) : une mise à
  jour de Claude peut les casser.

Tests (Node 22, sans dépendance) : `node --test extension/test/`.

## Tests

```powershell
node --test sonar/test/
claude plugin validate sonar
claude plugin test sonar
```
