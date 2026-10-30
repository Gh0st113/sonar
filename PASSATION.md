# Passation (30/10/2026)

Note pour la prochaine session de travail (locale, sur le PC du mainteneur). À lire en premier, puis à supprimer
quand tout est fait.

## Règles de travail

- Répondre **en français**, simplement : le mainteneur est ingénieur systèmes et réseaux, pas développeur.
- **Vérifier avant d'affirmer** (CI, release, fichiers) ; dire ce qui n'a pas été vérifié.
- Merger seulement sur « ok merge », publier seulement sur « publie » (Actions > publier > Run workflow, sur main).
- Ni secret, ni e-mail, ni identifiant de modèle dans le dépôt. Aucune dépendance ajoutée sans accord.
- La phrase de passe et `cle-cercle.json` ne passent jamais par Claude : le mainteneur les gère lui-même
  (secrets `CERCLE_CLE` et `CERCLE_PHRASE` de l'environnement GitHub « publication »).
- Une PR à la fois, petite ; la CI (tests, installeur, windows) doit être verte avant le merge.

## Où on en est

- **Mod sonar 0.5.1** (`mod/`) : pied, bandeau, panneau `/sonar`. Il porte les données de l'extension dans le
  **bandeau** (image invisible `sonar:1 {json}`) : le pied n'est pas lisible par l'extension (essai du 30/10).
  Il ne tourne pas dans les sessions cloud (le conteneur n'a pas les plugins).
- **sonar pour Windows 0.6.0** (`windows/`), publié et signé : https://github.com/Gh0st113/sonar/releases/tag/v0.6.0
  - renommé de « Claude (cercle) » en « Claude + sonar » ; même AppId, il s'installe par-dessus la 0.5.x ;
  - l'installeur détecte Claude ouvert : « Réessayer », « Forcer la fermeture », Annuler ;
  - essai réel du 30/10 réussi (0.5.2) : mises à jour signées OK, popover Cache · Coût OK.

## À faire, dans l'ordre

1. **Essai réel de la 0.6.0** (rien n'a encore été vérifié sur le PC) :
   - télécharger `sonar-setup.exe` à la main (les 0.5.x cherchent `cercle-setup.exe` et ne voient pas la 0.6.0) ;
   - l'installer par-dessus avec Claude **ouvert**, pour tester la fenêtre « Réessayer / Forcer la fermeture » ;
   - vérifier : anciens raccourcis « Claude (cercle) » retirés, raccourci « Claude + sonar », popover
     « sonar 0.6.0 · UI+ » avec Cache et Coût ;
   - mettre à jour le mod (`claude plugin marketplace update sonar-mods`, puis `claude plugin update sonar@sonar-mods`)
     et vérifier qu'il se charge toujours : son dossier dans le dépôt est passé de `sonar/` à `mod/`.
2. **À confirmer à l'essai** : le bandeau du mod laisse-t-il un espace vide au-dessus de la saisie quand sonar
   est en mode pied ? (le porteur invisible y est toujours sur le bureau).
3. **Fenêtre de mise à jour** : texte de GitHub brut (`##`, `**`) et liens non cliquables ; nettoyer le texte
   et/ou ajouter un bouton « Voir sur GitHub ».
4. **Message en session cloud** : quand le diagnostic voit « zones de mods : aucune », dire « session cloud ou sans
   mod : pas de données » au lieu de recommander d'installer le mod.
5. **Test du mod en échec** (existait avant ces travaux) : `claude plugin test mod`, « journal des quotas : une
   ligne par changement, chemin par défaut » ; à comprendre et corriger.
6. **Idées notées, après le reste** :
   - logo de branche vert (pas encore mergée dans main) / violet (mergée), calculé par git en local ;
   - sonar dans les sessions cloud (plugins déclarés dans `.claude/settings.json` du dépôt ?) : à essayer ;
   - Linux et macOS : le crochet `REACT_PROFILE` y existe aussi (voir `windows/README.fr.md`).

## Repères

- Procédure de publication : `PUBLIER.md`. Documentation Windows : `windows/README.fr.md`.
- Tests : `node --test windows/test/ mod/test/logique.test.mjs`, `claude plugin test mod`, et dans `windows/` :
  `go test ./...`.
- Relecture neutre du projet (30/10) : simplicité 3/10 au départ ; plan suivi : essai réel, sonde retirée,
  README court, un seul nom. Reste éventuel : simplifier encore l'installeur.
