# Provenance

`widget.js`, `widget.css`, `manifest.json`, `LICENSE-UI-PLUS`, `test/widget.test.mjs` et `sonar.ps1` viennent de
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, licence MIT ; support Windows
par DarkstarDEV), commit `690afab5b1501a15979e2dfc3334e7839e6b3022` (tag `v0.5.2`, 18/11/2026). Reprises précédentes :
commit `1e8274f` (tag `v0.5.0`), commit `126cf95` (juste avant le tag `v0.4.3`, `de2ad1c`). `sonar.ps1` et
`mac/installer.sh` citent encore `1e8274f` : leurs fichiers d'origine n'ont pas changé jusqu'à `v0.5.2` (mêmes empreintes).

Empreintes git des fichiers d'origine à ce commit (`git rev-parse 690afab:<chemin>`) :

| Fichier amont | Empreinte git | Copie ici |
|---|---|---|
| `Extension/widget.js` | `6411548feb7727b1c5f99a34f3f106294749644d` | `widget.js`, modifié (voir son en-tête) |
| `Extension/widget.css` | `122709123fbb4880edbd6b60a94dc54e93b0ab8c` | `widget.css`, lignes « Sonar » ajoutées à la fin |
| `Extension/manifest.json` | `2373d493ee9b6090436f0bc747a45ae88fd63fe6` | `manifest.json`, nom, version, `sonar-lecture.js` |
| `LICENSE` | `3750c082cb8c41cb39ceedec3824bdbbbbb0a04a` | `LICENSE-UI-PLUS`, identique |
| `Tests/widget.test.mjs` | `b0963ce9e3ec4463c75ec56b440d7406a0e170b6` | `test/widget.test.mjs`, chemin du `require` seul |
| `Windows/ui-plus.ps1` | `ee9e025a3bf4aa5105ef773f2cac533db391a004` | `sonar.ps1`, réécrit : dossier `Claude-Data\claude_*` (celui que Claude charge ici), refus d'écraser une autre extension, pas de tâche planifiée ni de recherche de mise à jour, relance de Claude sur accord |
| `App/ui-plus.sh` | `f857ff71f4cc02709bd8b7c6dd125aeb2b7e161c` | `mac/installer.sh`, réécrit : mêmes dossier d'extension et agent de connexion (`launchctl setenv REACT_PROFILE 1`), mais fichiers de `windows/`, refus d'écraser une autre extension, pas de recherche de mise à jour ni d'appel périodique |

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

**19/11/2026 (v0.5.2)** : diff de `1e8274f` à `690afab` (2 commits de Lukas van Uden, non signés, aucune PR) :
`Extension/` +28/−7 lignes — la barre de temps ne superpose plus ses segments (styles `left`, `width`,
`borderRadius`) ; l'état d'une session est aussi lu sur le point `[data-cds="Pulse"]` des lignes en onglets
(Claude 4.23118 et plus : classe et couleur de l'attribut `style`), masqué en CSS comme `.status-dot` ; manifeste :
version seule. `Windows/`, `App/`, `LICENSE`, `Tests/widget.test.mjs` inchangés. Ni réseau, ni permission, ni clic, ni
injection de HTML, ni lecture de cookie ou de stockage en plus. Relecture adverse DeepSeek flash : rien de douteux.
Appliqué tel quel ici.

Avant de reprendre une version plus récente : relire le diff de `Extension/` et `Windows/` depuis ce commit (réseau,
permissions, injection, clics), et vérifier que ce commit existe toujours et que le tag `v0.5.2` n'a pas bougé.
