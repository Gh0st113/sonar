# Publier une version de cercle

Procédure du mainteneur. Les utilisateurs n'en ont pas besoin : le README leur suffit.

Tout se fait sur GitHub, sans PC, par le workflow **publier** (`.github/workflows/publier.yml`). Il refait tous les tests et l'essai réel sous Windows, attend l'approbation si elle
est exigée, vérifie que la version est plus récente que la dernière release, signe `cercle-setup.exe` (en vérifiant
qu'il contient exactement le `cercle.exe` construit et que la clé est celle de `cle-publique.txt`), puis publie la
release `vX.Y.Z`.

## Une seule fois

1. Activer la **double authentification** du compte GitHub (Settings > Password and authentication) ;
2. Créer la clé : installer un installeur d'essai (Actions > cercle > Artifacts > `cercle-setup-essai`), puis dans
   PowerShell (`Start-Process` : PowerShell attend ainsi que cercle ait lu la phrase) :

   ```powershell
   Start-Process -FilePath "$env:LOCALAPPDATA\Programs\sonar-cercle\cercle.exe" -ArgumentList 'cle', "$env:USERPROFILE\Desktop\cle-cercle.json" -NoNewWindow -Wait
   ```

   Phrase de passe : 12 caractères au moins, **sans accent ni symbole spécial** (pas de é, €… : la console Windows les
   code autrement que GitHub). Il affiche la clé **publique** : la mettre dans `extension/cle-publique.txt` et commiter (elle n'a rien de
   secret) ;
3. Dans le dépôt, Settings > Environments > **New environment** `publication` :
   - Deployment branches and tags : **Selected branches**, `main` seulement ;
   - Environment secrets : `CERCLE_CLE` = tout le contenu de `cle-cercle.json`, `CERCLE_PHRASE` = la phrase de passe ;
   - **Required reviewers** : soi-même, pour valider chaque publication d'un clic (sans : publication directe) ;
4. Garder `cle-cercle.json` et la phrase dans un gestionnaire de mots de passe, puis supprimer le fichier du PC.

## À chaque version

1. Monter `version` dans `extension/manifest.json`, dans une PR mergée sur `main` (ou le demander à Claude) ;
2. Actions > **publier** > Run workflow, branche `main` (ou le demander à Claude) ;
3. si l'approbation est exigée : notification de GitHub, puis **Review deployments > Approve**, depuis le site ou
   l'appli mobile.

## Signer chez soi (sans la clé sur GitHub)

`cercle signer cercle-setup.exe <fichier de clé> --exe <cercle.exe recompilé>`, avec un `cercle.exe` recompilé à
l'identique (build reproductible, Go 1.24.7, dans `extension/`) :

```bash
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags="-buildid= -H windowsgui" -o cercle.exe .
```
