# sonar

*[English version](README.md)*

Un **mod** Claude Code qui donne à **l'onglet Code de Claude Desktop** ce que la *status line* montre dans le terminal —
**sans dépenser un seul token** : il lit les chiffres que le moteur a déjà et lance `git status` en local.

Il ne répète pas ce que Claude Code affiche déjà (remplissage du contexte, pourcentage des 5 h) et ne montre que ce qui
mérite un coup d'œil. Trois niveaux de lecture :

**Le pied** de la zone de saisie (par défaut), entre le mode de permission et le nom du modèle. Court (l'appli coupe un
pied trop long par « … ») :

```
🔥 2,40 $ · ⎇ master
```

Dans cet ordre, séparés par « · », chacun seulement s'il est connu :

1. l'état du cache collé au coût de la session : 🔥 chaud, ❄️ froid (orange, la prochaine réponse réécrira tout le cache),
   ❔ incertain (orange), puis le montant ;
2. la branche (`⎇`), raccourcie : dernier segment après « / », sans suffixe d'empreinte, 20 caractères au plus
   (`claude/mod-pied-cache-79d924` → `mod-pied-cache`) ; orange sur une branche protégée ; `détachée` pour une tête détachée.

Les limites (5 h, semaine) n'y sont jamais, même en alerte : elles sont dans le bandeau, le panneau, `/sonar` et le
popover de sonar pour Windows.
Une seule couleur d'alerte au pied, l'orange, sur la valeur (le rouge est réservé au bandeau et au panneau).

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

**sonar pour Windows** (en option) : cache et coût dans le popover du **cercle d'usage** de Claude Desktop,
avec le rythme des limites de [UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude). Installation, fonctionnement
et limites : [windows/README.fr.md](windows/README.fr.md).

*(Comme le sonar d'un navire : il sonde en continu ce qui vous entoure — quotas, cache, branche — pour ne jamais toucher le fond par surprise.)*

Licence : [MIT](LICENSE).

Rien n'est propre à un abonnement ni à une personne : un chiffre que le moteur n'a pas (quotas hors abonnement,
coût quand il n'est pas suivi) n'est simplement pas affiché ; seuils, langue, segments et branches protégées sont des options.

## Installation

Depuis GitHub :

```sh
claude plugin marketplace add Gh0st113/sonar
claude plugin install sonar@sonar-mods
```

Puis `/reload-plugins` dans une session ouverte (ou une nouvelle session). La ligne apparaît après la première réponse :
avant, le moteur n'a encore rien mesuré. Le mod tourne dans les sessions locales : une session cloud ne le charge pas
(elle s'exécute dans un conteneur qui n'a pas vos plugins).

Depuis un clone local (pour le modifier) :

```sh
claude plugin marketplace add <chemin-du-depot>
claude plugin install sonar@sonar-mods
```

Le mod est alors lu **depuis ce dossier** : après une modification, `/reload-plugins` dans la session suffit.

Systèmes : Windows (appli et terminal) et Linux (terminal, essayé sous Ubuntu) ; macOS attendu, pas encore essayé
([issue #22](https://github.com/Gh0st113/sonar/issues/22)). Seule l'extension sonar pour Windows est propre à Windows.

## Ce qui est affiché

| Élément | Source | Pied | Couleur |
|---|---|---|---|
| `semaine` (quota sur 7 jours), heure de remise, budget par jour | `session.measure` | jamais, même en alerte | selon le **rythme** : consommation comparée à la part de la fenêtre déjà écoulée — orange à plus de `paceWarn` (5) points d'avance, rouge à plus de `paceAlert` (15) ; et orange dès `quotaWarn` (70 %), rouge dès `quotaAlert` (90 %) quel que soit le rythme |
| `5 h`, heure de remise | `session.measure` | jamais, même en alerte | orange (rouge au bandeau et au panneau au-delà de `paceAlert`) |
| autres limites (ex. `budget` d'une passerelle) | `session.measure` | jamais | seuils absolus seulement (durée de fenêtre inconnue) |
| `cache` chaud (taux de lecture, heure où il refroidit), incertain, froid | dernière requête du fil principal (`turn.step`, sous-agents exclus) ; à l'ouverture d'une session déjà commencée, sa dernière réponse lue dans le journal local de la session (voir plus bas) | 1ᵉʳ : l'icône, collée au coût (🔥 chaud, ❄️ froid, ❔ incertain) | froid en orange |
| `branche`, dépôt, fichiers modifiés | `$.session.repo()` + `git status` (au plus toutes les 5 s, délai 3 s) | 2ᵉ : `⎇` et le nom raccourci | orange sur une branche protégée |
| `coût` estimé de la session (prix catalogue) | `session.measure` | 1ᵉʳ, après l'icône du cache (`🔥 2,40 $`) ; rien s'il vaut 0 (session neuve, ou ancienne session dont le moteur n'a pas gardé le coût) | — |

Le mod n'affiche le contexte nulle part : Claude Code le montre déjà (l'extension sonar pour Windows, en option, reprend le bloc
contexte de UI+ dans le popover du cercle).

Sur le bureau, le bandeau porte aussi, quel que soit l'emplacement choisi, une image transparente de 1 pixel dont le texte
alternatif contient le cache, la branche et le coût en JSON (`sonar:1 {…}`) : c'est ce que lit l'extension sonar pour Windows.
Rien de visible ; un lecteur d'écran peut toutefois l'annoncer.

Durée de vie du cache : déduite des réponses (une lecture du cache après plus de 6 minutes prouve 1 h ; une réécriture complète
indique 5 min), donnée par le moteur lors d'un changement de modèle, ou forcée par `/sonar ttl`. Tant qu'elle est inconnue,
le cache est affiché chaud pendant 5 minutes (« au moins jusqu'à »), incertain jusqu'à une heure, puis froid.

Session déjà commencée (reprise, appli relancée) : le mod n'a encore vu passer aucune réponse. Au chargement, il lit donc
la dernière réponse du fil principal dans le journal local que Claude Code tient pour chaque session
(`~/.claude/projects/<projet>/<id de session>.jsonl`, ou sous `CLAUDE_CONFIG_DIR`) : son heure, son usage du cache et
la durée qu'elle a écrite (5 min ou 1 h). Lecture seule, aucun token. L'heure retenue est celle de l'envoi de la requête
quand le journal la donne, sinon celle de la réponse moins une minute (prudence : le cache court depuis l'envoi).

Limite : le mod ne lit pas un fichier de plus de 4 Mio (une très longue session : sur le poste de l'auteur, environ une
session sur cinq). Dans Claude Desktop pour Windows, il prend alors l'heure de dernière activité que l'appli garde dans
sa fiche de la session (`%LOCALAPPDATA%\Claude-Data\claude_*\claude-code-sessions\…\<id>.json`, trouvée par les
variables que l'appli passe au moteur), moins la même minute. L'heure seule, sans taux ni durée du cache : chaud 5 min
« au moins », incertain jusqu'à une heure, puis froid. Elle suit la dernière réponse à quelques secondes près dans la
plupart des sessions, mais une activité sans réponse peut la décaler. Ailleurs (autre système, terminal), le cache reste
inconnu jusqu'au prochain message.

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
`language` et `clock` à `auto` suivent la langue du système : français pour `fr`, anglais ailleurs, 12 h pour `en-US`.
Quand le moteur ne la connaît pas (sous Linux, il répond toujours `en-US`), elle est prise dans `LC_ALL`, `LC_MESSAGES`
ou `LANG` (`C` et `POSIX` ne comptent pas).

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

## Tests

```sh
node --test mod/test/
claude plugin validate mod
claude plugin test mod
node --test windows/test/
```

GitHub Actions lance les tests Node et un essai du script d'installation Windows à chaque push.

## Crédits et sources

- **[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude)**, de Lukas van Uden (support Windows par
  DarkstarDEV), sous licence MIT : sonar pour Windows reprend son code (`widget.js`, `widget.css`, `manifest.json`, un
  test, le script d'installation), au commit
  [`1e8274f`](https://github.com/LukasvanUden/ui-plus-for-claude/commit/1e8274fc149a49979c8688a447ae9bf9bd0d3028)
  (tag `v0.5.0`). Sa licence est jointe telle quelle (`windows/LICENSE-UI-PLUS`, aussi copiée avec l'extension).
  Fichiers repris, empreintes git d'origine, modifications et audit : `windows/PROVENANCE.md`.
