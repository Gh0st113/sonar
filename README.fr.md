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

**L'extension cercle** (Windows, en option) : cache et coût dans le popover du **cercle d'usage** de Claude Desktop,
avec le rythme des limites de [UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude). Installation, fonctionnement
et limites : [extension/README.fr.md](extension/README.fr.md).

*(Comme le sonar d'un navire : il sonde en continu ce qui vous entoure — quotas, cache, branche — pour ne jamais toucher le fond par surprise.)*

Licence : [MIT](LICENSE).

Rien n'est propre à un abonnement ni à une personne : un chiffre que le moteur n'a pas (quotas hors abonnement,
coût quand il n'est pas suivi) n'est simplement pas affiché ; seuils, langue, segments et branches protégées sont des options.

## Installation

Depuis GitHub :

```powershell
claude plugin marketplace add Gh0st113/sonar
claude plugin install sonar@sonar-mods
```

Puis `/reload-plugins` dans une session ouverte (ou une nouvelle session). La ligne apparaît après la première réponse :
avant, le moteur n'a encore rien mesuré. Le mod tourne dans les sessions locales : une session cloud ne le charge pas
(elle s'exécute dans un conteneur qui n'a pas vos plugins).

Depuis un clone local (pour le modifier) :

```powershell
claude plugin marketplace add <chemin-du-depot>
claude plugin install sonar@sonar-mods
```

Le mod est alors lu **depuis ce dossier** : après une modification, `/reload-plugins` dans la session suffit.

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

Sur le bureau, le bandeau porte aussi, quel que soit l'emplacement choisi, une image transparente de 1 pixel dont le texte
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
