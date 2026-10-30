# Provenance

`widget.js`, `widget.css`, `manifest.json`, `LICENSE-UI-PLUS` et `test/widget.test.mjs` viennent de
[UI+ for Claude](https://github.com/LukasvanUden/ui-plus-for-claude) (Lukas van Uden, licence MIT), commit
`126cf9540f557466f697f679e9ea20505bf6442a` (30/10/2026, tête de `main` ; fichiers `Extension/` identiques au tag `v0.4.3`).

Empreintes git des fichiers d'origine à ce commit (`git rev-parse 126cf95:<chemin>`) :

| Fichier amont | Empreinte git | Copie ici |
|---|---|---|
| `Extension/widget.js` | `f027a3e16564e674b3dd51b9b756880bf48751fd` | `widget.js`, modifié (voir son en-tête) |
| `Extension/widget.css` | `03e1d8ffdd7079acb63ddfd0dc9174320d9cb2a0` | `widget.css`, lignes « Sonar » ajoutées à la fin |
| `Extension/manifest.json` | `f88ec4f054ce6ede342d5c1fa3748b34abb68afd` | `manifest.json`, nom, version, `sonar-lecture.js` |
| `LICENSE` | `3750c082cb8c41cb39ceedec3824bdbbbbb0a04a` | `LICENSE-UI-PLUS`, identique |
| `Tests/widget.test.mjs` | `b0963ce9e3ec4463c75ec56b440d7406a0e170b6` | `test/widget.test.mjs`, chemin du `require` seul |

## Audit du 30/10/2026 (code de l'amont)

- Réseau : uniquement des GET vers claude.ai même (`/api/organizations`, `/api/organizations/<id>/usage`), avec la
  session ; aucune autre destination, rien d'envoyé.
- Lus : le cookie `lastActiveOrg`, les clés `usage-pace:*` du stockage local (réglages).
- Ni `eval`, ni `innerHTML`, ni ressource externe en CSS ; manifeste sans permission, actif sur `https://claude.ai/*`.
- Un seul clic programmé, sur le bouton « Compact session » (ou « Show session rail ») de Claude, et seulement quand
  on clique le bouton de l'extension.
- Historique : un seul auteur, aucun commit signé, dépôt créé le 01/10/2026. App/ et Scripts/ (macOS) non importés.

Avant de reprendre une version plus récente : relire le diff de `Extension/` depuis ce commit (réseau, permissions,
injection, clics), et vérifier que ce commit existe toujours et que le tag `v0.4.3` n'a pas bougé.
