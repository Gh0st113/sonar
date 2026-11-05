# Provenance

`widget.js`, `widget.css`, `manifest.json`, `LICENSE-UI-PLUS`, `test/widget.test.mjs` et `sonar.ps1` viennent de
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, licence MIT ; support Windows
par DarkstarDEV), commit `1e8274fc149a49979c8688a447ae9bf9bd0d3028` (tag `v0.5.0`, 30/10/2026). Reprise précédente :
commit `126cf95` (tag `v0.4.3`).

Empreintes git des fichiers d'origine à ce commit (`git rev-parse 1e8274f:<chemin>`) :

| Fichier amont | Empreinte git | Copie ici |
|---|---|---|
| `Extension/widget.js` | `9b385dfea95176327699197e7863801b51399674` | `widget.js`, modifié (voir son en-tête) |
| `Extension/widget.css` | `03e1d8ffdd7079acb63ddfd0dc9174320d9cb2a0` | `widget.css`, lignes « Sonar » ajoutées à la fin |
| `Extension/manifest.json` | `53df197a93ccc0bb6468a4394a5fa8c14b5e304c` | `manifest.json`, nom, version, `sonar-lecture.js` |
| `LICENSE` | `3750c082cb8c41cb39ceedec3824bdbbbbb0a04a` | `LICENSE-UI-PLUS`, identique |
| `Tests/widget.test.mjs` | `b0963ce9e3ec4463c75ec56b440d7406a0e170b6` | `test/widget.test.mjs`, chemin du `require` seul |
| `Windows/ui-plus.ps1` | `ee9e025a3bf4aa5105ef773f2cac533db391a004` | `sonar.ps1`, réécrit : dossier `Claude-Data\claude_*` (celui que Claude charge ici), refus d'écraser une autre extension, pas de tâche planifiée ni de recherche de mise à jour, relance de Claude sur accord |

## Audits

**30/10/2026 (v0.4.3)** : réseau limité à des GET vers claude.ai même (`/api/organizations`,
`/api/organizations/<id>/usage`), avec la session ; rien d'envoyé ailleurs. Lus : le cookie `lastActiveOrg`, les clés
`usage-pace:*` du stockage local. Ni `eval`, ni `innerHTML`, ni ressource externe ; manifeste sans permission, actif sur
`https://claude.ai/*`. Un seul clic programmé, sur « Compact session » (ou « Show session rail ») de Claude, et
seulement quand on clique le bouton de l'extension.

**05/11/2026 (v0.5.0)** : diff de `Extension/` depuis `126cf95` : +32/−1 lignes dans `widget.js` (une session terminée
hors de vue est marquée « prête », gardé en `sessionStorage`) ; ni réseau, ni permission, ni clic, ni injection de
HTML en plus. `Windows/ui-plus.ps1` relu : il écrit dans le profil de Claude, dans `%LOCALAPPDATA%\UI+ for Claude`
(copie du script et de l'extension) et la variable utilisateur, crée une tâche planifiée et interroge l'API GitHub
pour signaler les nouvelles versions, sans rien télécharger (tâche et recherche supprimées ici). Historique : deux
auteurs (Lukas van Uden ; DarkstarDEV pour Windows, PR relue puis fusionnée), aucun commit signé.

Avant de reprendre une version plus récente : relire le diff de `Extension/` et `Windows/` depuis ce commit (réseau,
permissions, injection, clics), et vérifier que ce commit existe toujours et que le tag `v0.5.0` n'a pas bougé.
