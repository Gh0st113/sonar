# sonar

*[English version](README.md)*

Un **mod** Claude Code qui donne à **l'onglet Code de Claude Desktop** ce que la *status line* montre dans le terminal —
**sans dépenser un seul token** : il lit les chiffres que le moteur a déjà et lance `git status` en local.

Dans le pied de la zone de saisie, entre le mode de permission et le nom du modèle, une ligne courte — alertes en tête,
car l'appli coupe la fin de la ligne quand la fenêtre est étroite :

```
⚠️7j 80% · ctx 34% · 5h 23% · 🔥 · ⎇ feat/x ●2 · 13 $
```

Tapez `/sonar` pour le détail complet (heures de remise à zéro, budget par jour, expiration du cache, nom du dépôt) :

```
ctx 34 % · 5 h 23 % → 15:00 · ⚠️ 7 j 80 % ≈ 6,7 %/j → ven. 13:00 · cache 🔥 92 % → 13:42 · mon-depot ⎇ feat/x ●2 · 12,84 $
```

Le survol du pied montre ce que l'appli a coupé. L'emplacement `bandeau` montre la ligne complète sur toute la largeur
(les emplacements `indice` et `ligne` servent au terminal ; l'appli de bureau ne les dessine pas).

*(Comme le sonar d'un navire : il sonde en continu ce qui vous entoure — contexte, quotas, cache — pour ne jamais toucher le fond par surprise.)*

Licence : [MIT](LICENSE).

Rien n'est propre à un abonnement ni à une personne : un chiffre que le moteur n'a pas (quotas hors abonnement,
coût quand il n'est pas suivi) n'est simplement pas affiché ; seuils, langue, segments et branches protégées sont des options.

## Segments

| Segment | Source | Alerte |
|---|---|---|
| `ctx` remplissage du contexte | `session.measure` | orange dès `contextWarn` (50), rouge au-delà de `contextAlert` (80) |
| `5 h`, `7 j` quotas de l'abonnement, heure de remise | `session.measure` | selon le **rythme** : consommation comparée à la part de la fenêtre déjà écoulée — orange à plus de `paceWarn` (5) points d'avance, rouge à plus de `paceAlert` (15) ; et orange dès `quotaWarn` (70 %), rouge dès `quotaAlert` (90 %) quel que soit le rythme |
| `≈ X %/j` (7 j) | ce qui reste ÷ jours avant la remise | sous un jour : `(reste X %)` |
| autres limites (ex. `budget` d'une passerelle) | `session.measure` | seuils absolus seulement (durée de fenêtre inconnue) |
| `cache` 🔥 taux de lecture → heure où il refroidit ; ❔ incertain ; ❄️ froid | dernière requête du fil principal (`turn.step`, sous-agents exclus) | ❄️ en orange |
| dépôt `⎇` branche `●` fichiers modifiés | `$.session.repo()` + `git status` (au plus toutes les 5 s, délai 3 s) | ⚠️ sur `protectedBranches` (`main,master`) |
| coût estimé de la session (prix catalogue) | `session.measure` | — |

Durée de vie du cache : déduite des réponses (une lecture du cache après plus de 6 minutes prouve 1 h ; une réécriture complète
indique 5 min), donnée par le moteur lors d'un changement de modèle, ou forcée par `/sonar ttl`. Tant qu'elle est inconnue,
le cache est affiché chaud pendant 5 minutes (`≥`), incertain jusqu'à une heure, puis froid.

Dans le bandeau, seul le chiffre en cause est en couleur ; partout, ⚠️ double la couleur.

## Commande `/sonar` (mots français ou anglais)

| Commande | Effet |
|---|---|
| `/sonar` | détail complet, emplacement actuel, durée du cache, aide |
| `/sonar pied` (`footer`) | ligne courte dans le pied de la saisie (par défaut) ; dans le terminal, avec les libellés de mode |
| `/sonar indice` (`hint`) | à la place de la ligne d'aide sous la saisie |
| `/sonar ligne` (`status`) | ligne d'état fixe sous la saisie (`$.ui.status`) |
| `/sonar bandeau` (`banner`) | une ligne grise au-dessus de la saisie, sur toute la largeur |
| `/sonar ttl 5m` / `1h` / `auto` | durée de vie du cache ; `auto` la déduit |
| `/sonar masquer` / `afficher` (`hide` / `show`) | masquer / réafficher |

L'emplacement et une `ttl` forcée sont gardés d'une session à l'autre.

## Options

Dans `settings.json`, sous `pluginConfigs.sonar.options` (ou le menu de configuration quand l'hôte en a un) :
`language` (`auto` / `en` / `fr`), `clock` (`auto` / `24h` / `12h`), `placement`, `segments` (séparés par des virgules :
`context,quotas,cache,repo,cost`), `contextWarn`, `contextAlert`, `paceWarn`, `paceAlert`, `quotaWarn`, `quotaAlert`,
`protectedBranches`. Une valeur invalide revient à sa valeur par défaut.

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

## Tests

```powershell
node --test sonar/test/
claude plugin validate sonar
claude plugin test sonar
```
