#Requires -Version 7
<#
.SYNOPSIS
  Installe, lance, retire ou décrit l'extension « cercle » (UI+ for Claude adapté à sonar) dans Claude Desktop pour Windows.

.DESCRIPTION
  Claude Desktop charge une extension quand la variable d'environnement REACT_PROFILE vaut 1 à son démarrage : celle du
  dossier %LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi (l'identifiant de React
  DevTools). C'est un crochet de développement, non garanti par Anthropic.

  Sécurité : ce dossier est modifiable par tout programme lancé sous votre compte, et Claude le charge sans rien montrer.
  Ce script ne laisse donc JAMAIS REACT_PROFILE posée en permanence : un Claude lancé normalement ne charge rien. Seule
  l'action « lancer » arme le crochet, quelques secondes, après avoir vérifié que les fichiers installés sont identiques
  aux sources du dépôt (sans modification non commitée).

  installer : copie l'extension dans ce dossier (sources sans modification non commitée). Ne touche pas REACT_PROFILE.
  lancer    : Claude doit être complètement fermé. Vérifie les fichiers installés, pose REACT_PROFILE=1, lance Claude,
              attend son démarrage, puis remet REACT_PROFILE comme avant (même en cas d'erreur ou d'interruption :
              la valeur d'avant est notée et remise au prochain passage du script).
  raccourci : crée dans le menu Démarrer un raccourci « Claude (cercle) » qui exécute « lancer ».
  retirer   : supprime ce dossier s'il est le nôtre, et le raccourci.
  etat      : dit ce qui est installé et si les fichiers sont intacts, sans rien changer.

  Plusieurs dossiers claude_* (après une réinstallation de Claude) : -Profil désigne celui à utiliser.
  Claude introuvable par « lancer » : -Lanceur donne l'exécutable ou l'identifiant « shell:AppsFolder\… ».

  Codes de retour : 0 réussi ; 1 action inconnue ; 2 dossier Claude-Data introuvable ou ambigu ; 3 dossier d'extension
  occupé par autre chose (React DevTools ?) ; 4 échec de copie, de suppression, d'écriture ou erreur imprévue ;
  5 Claude est encore ouvert ; 6 vérification des fichiers refusée ; 7 Claude introuvable.

.EXAMPLE
  pwsh -NoProfile -File .\extension\install.ps1 installer
  pwsh -NoProfile -File .\extension\install.ps1 lancer
#>
param(
  [Parameter(Position = 0)]
  [string] $Action = 'etat',
  # Dossier claude_* à utiliser quand il y en a plusieurs (nom seul ou chemin complet).
  [string] $Profil,
  # Exécutable de Claude, ou « shell:AppsFolder\<AppID> », si « lancer » ne le trouve pas seul.
  [string] $Lanceur,
  # Attendre Entrée avant de fermer en cas d'erreur (pour le raccourci, dont la fenêtre se fermerait sinon).
  [switch] $Attendre
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Toute erreur imprévue sort en code 4, jamais en 1 (réservé à « action inconnue »).
trap {
  Write-Host "Erreur imprévue : $($_.Exception.Message)" -ForegroundColor Red
  if ($Attendre) { Read-Host 'Entrée pour fermer' | Out-Null }
  exit 4
}

$IdExtension = 'fmkadmapgofadopljbjfkapdkoienihi'
$Marque = 'sonar-cercle'
$NomManifeste = 'UI+ for Claude (sonar, Windows)'
$FichierEtat = '.sonar-etat.json'
$Fichiers = @('manifest.json', 'sonar-lecture.js', 'widget.js', 'widget.css', 'LICENSE-UI-PLUS')
$NomRaccourci = 'Claude (cercle).lnk'
# Hors du dossier chargé par Claude : la valeur de REACT_PROFILE à remettre si un lancement a été interrompu.
$DossierScript = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'sonar-cercle' } else { $null }
$FichierLancement = if ($DossierScript) { Join-Path $DossierScript 'lancement-en-cours.json' } else { $null }

function Sortir([int] $Code, [string] $Message) {
  if ($Code -eq 0) { Write-Host $Message } else { Write-Host "Erreur : $Message" -ForegroundColor Red }
  if ($Attendre -and $Code -ne 0) { Read-Host 'Entrée pour fermer' | Out-Null }
  exit $Code
}

# Le dossier de profil de Claude : exactement un %LOCALAPPDATA%\Claude-Data\claude_*.
function Trouver-Profil {
  if (-not $env:LOCALAPPDATA) {
    Sortir 2 "LOCALAPPDATA n'est pas défini : ce script ne sert que sous Windows, avec Claude Desktop installé."
  }
  $base = Join-Path $env:LOCALAPPDATA 'Claude-Data'
  $profils = @(Get-ChildItem -LiteralPath $base -Directory -Filter 'claude_*' -ErrorAction SilentlyContinue)
  if ($Profil) {
    $profils = @($profils | Where-Object { $_.Name -eq $Profil -or $_.FullName -eq $Profil })
    if ($profils.Count -eq 0) { Sortir 2 "-Profil « $Profil » ne désigne aucun dossier claude_* de $base." }
  }
  if ($profils.Count -eq 0) {
    Sortir 2 "aucun dossier claude_* dans $base. Claude Desktop a-t-il déjà été lancé ?"
  }
  if ($profils.Count -gt 1) {
    $noms = ($profils | ForEach-Object Name) -join ', '
    Sortir 2 "plusieurs dossiers claude_* dans $base ($noms) : impossible de savoir lequel Claude utilise. Précisez-le avec -Profil <nom>."
  }
  $profils[0].FullName
}

# Qui occupe le dossier de l'extension : absent | nôtre | nôtre sans état | sonde | autre.
# « nôtre sans état » : notre manifeste, mais .sonar-etat.json perdu (suppression interrompue, par exemple).
function Occupant([string] $Dossier) {
  if (-not (Test-Path -LiteralPath $Dossier)) { return 'absent' }
  if (Lire-Etat $Dossier) { return 'nôtre' }
  $manifeste = Join-Path $Dossier 'manifest.json'
  if (Test-Path -LiteralPath $manifeste) {
    try {
      $nom = [string] (Get-Content -LiteralPath $manifeste -Raw | ConvertFrom-Json).PSObject.Properties['name']?.Value
      if ($nom -like 'Sonde cercle*') { return 'sonde' }
      if ($nom -eq $NomManifeste) { return 'nôtre sans état' }
    } catch { }
  }
  'autre'
}

# L'état noté à l'installation, seulement s'il porte notre marque ; sinon $null.
function Lire-Etat([string] $Dossier) {
  $chemin = Join-Path $Dossier $FichierEtat
  if (-not (Test-Path -LiteralPath $chemin)) { return $null }
  try { $etat = Get-Content -LiteralPath $chemin -Raw | ConvertFrom-Json } catch { return $null }
  $props = $etat.PSObject.Properties
  if ($props['marque']?.Value -ne $Marque) { return $null }
  [pscustomobject]@{ commit = $props['commit']?.Value; installe = $props['installe']?.Value }
}

function Valeur-Utilisateur { [Environment]::GetEnvironmentVariable('REACT_PROFILE', 'User') }

# Un lancement interrompu (fenêtre fermée, panne) a pu laisser REACT_PROFILE=1 : on remet la valeur notée.
function Reparer-Lancement {
  if (-not $FichierLancement -or -not (Test-Path -LiteralPath $FichierLancement)) { return }
  $l = Get-Content -LiteralPath $FichierLancement -Raw | ConvertFrom-Json
  $valeur = if ($l.PSObject.Properties['existait']?.Value) { [string] $l.valeur } else { $null }
  [Environment]::SetEnvironmentVariable('REACT_PROFILE', $valeur, 'User')
  Remove-Item -LiteralPath $FichierLancement -Force
  Write-Host 'Lancement précédent interrompu : REACT_PROFILE remise comme avant.' -ForegroundColor Yellow
}

# La variable posée en permanence (ancienne installation, sonde, autre outil) arme le crochet pour tout lancement.
function Avertir-Variable {
  if ((Valeur-Utilisateur) -eq '1') {
    Write-Host 'Attention : REACT_PROFILE vaut 1 en permanence pour votre compte : tout lancement de Claude charge ce dossier' -ForegroundColor Yellow
    Write-Host 'sans vérification. Si aucun autre outil n''en a besoin, retirez-la :' -ForegroundColor Yellow
    Write-Host "  [Environment]::SetEnvironmentVariable('REACT_PROFILE', `$null, 'User')"
  }
}

# Commit des sources ; refuse des modifications locales non commitées : ce qui part dans Claude doit être ce qui a
# été relu. Sans git ni dépôt, rien n'est vérifiable : refus.
function Commit-Sources {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Sortir 6 'git est introuvable : impossible de vérifier les sources.' }
  $commit = git -C $PSScriptRoot rev-parse HEAD 2>$null
  if ($LASTEXITCODE -ne 0) { Sortir 6 "$PSScriptRoot n'est pas dans un dépôt git : impossible de vérifier les sources." }
  $modifs = git -C $PSScriptRoot status --porcelain -- . 2>$null
  if ($modifs) { Sortir 6 "modifications non commitées dans $PSScriptRoot : commitez-les ou annulez-les.`n$($modifs -join "`n")" }
  $commit
}

# Le manifeste installé porte en plus version_name (estampille d'installation, cf. « Désinstaller… » de UI+).
function Manifeste-Sans-Estampille([string] $Chemin) {
  $m = Get-Content -LiteralPath $Chemin -Raw | ConvertFrom-Json
  $m.PSObject.Properties.Remove('version_name')
  $m | ConvertTo-Json -Depth 10 -Compress
}

# Compare le dossier installé aux sources : mêmes fichiers, mêmes octets (SHA-256), rien de plus. Renvoie la liste
# des écarts (vide = identique) ; avec -Afficher, écrit chaque empreinte.
function Ecarts([string] $Dossier, [switch] $Afficher) {
  $ecarts = @()
  $attendus = @($Fichiers + $FichierEtat)
  foreach ($en_trop in @(Get-ChildItem -LiteralPath $Dossier -Recurse -Force -File | Where-Object {
        [IO.Path]::GetRelativePath($Dossier, $_.FullName) -notin $attendus })) {
    $ecarts += "fichier en trop : $([IO.Path]::GetRelativePath($Dossier, $en_trop.FullName))"
  }
  foreach ($f in $Fichiers) {
    $installe = Join-Path $Dossier $f
    $source = Join-Path $PSScriptRoot $f
    if (-not (Test-Path -LiteralPath $installe)) { $ecarts += "absent : $f"; continue }
    if ($f -eq 'manifest.json') {
      $ok = (Manifeste-Sans-Estampille $installe) -eq (Manifeste-Sans-Estampille $source)
      $h = '(estampille d''installation exclue)'
    } else {
      $h = (Get-FileHash -LiteralPath $installe -Algorithm SHA256).Hash
      $ok = $h -eq (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    }
    if (-not $ok) { $ecarts += "différent des sources : $f" }
    if ($Afficher) { Write-Host ("  $f : $h " + $(if ($ok) { 'identique' } else { 'DIFFÉRENT' })) -ForegroundColor $(if ($ok) { 'Gray' } else { 'Red' }) }
  }
  , $ecarts
}

function Installer([string] $Dossier) {
  $occupant = Occupant $Dossier
  if ($occupant -eq 'autre') {
    Sortir 3 "$Dossier existe et n'est ni cette extension ni la sonde (React DevTools ?). Rien n'a été touché."
  }
  foreach ($f in $Fichiers) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $f))) { Sortir 4 "fichier source absent : $f" }
  }
  $commit = Commit-Sources

  # Copie dans un dossier voisin, puis échange : jamais d'extension à moitié copiée.
  $temp = "$Dossier.nouveau"
  try {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
    New-Item -ItemType Directory -Path $temp -Force | Out-Null
    foreach ($f in $Fichiers) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $f) -Destination $temp }
    # Chaque installation marque le manifeste : « Désinstaller… » dans le popover masque l'extension jusqu'à
    # la prochaine installation (comme UI+).
    $manifeste = Join-Path $temp 'manifest.json'
    $m = Get-Content -LiteralPath $manifeste -Raw | ConvertFrom-Json
    $m | Add-Member -NotePropertyName version_name -NotePropertyValue ("$($m.version) " + (Get-Date -Format 'yyyyMMddHHmmss')) -Force
    $m | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifeste -Encoding utf8NoBOM
    [pscustomobject]@{ marque = $Marque; commit = $commit; installe = (Get-Date -Format o) } |
      ConvertTo-Json | Set-Content -LiteralPath (Join-Path $temp $FichierEtat) -Encoding utf8NoBOM
    if (Test-Path -LiteralPath $Dossier) { Remove-Item -LiteralPath $Dossier -Recurse -Force }
    New-Item -ItemType Directory -Path (Split-Path $Dossier) -Force | Out-Null
    Move-Item -LiteralPath $temp -Destination $Dossier
  } catch {
    Sortir 4 "copie impossible : $($_.Exception.Message)"
  }
  Avertir-Variable
  Sortir 0 "Installée dans $Dossier (commit $commit). REACT_PROFILE n'est pas touchée : lancez Claude avec « install.ps1 lancer » ou le raccourci (« install.ps1 raccourci »)."
}

# Comment démarrer Claude : -Lanceur, sinon l'appli du menu Démarrer (paquet MSIX), sinon l'installation classique.
function Trouver-Claude {
  if ($Lanceur) { return $Lanceur }
  try {
    $app = @(Get-StartApps | Where-Object { $_.Name -eq 'Claude' }) | Select-Object -First 1
    if ($app) { return "shell:AppsFolder\$($app.AppID)" }
  } catch { }
  $classique = Join-Path $env:LOCALAPPDATA 'AnthropicClaude\claude.exe'
  if (Test-Path -LiteralPath $classique) { return $classique }
  Sortir 7 'Claude introuvable. Donnez-le avec -Lanceur (chemin de claude.exe, ou shell:AppsFolder\<AppID> : voir Get-StartApps).'
}

function Lancer([string] $Dossier) {
  $occupant = Occupant $Dossier
  if ($occupant -ne 'nôtre') { Sortir 6 "l'extension n'est pas installée ($occupant) : « install.ps1 installer » d'abord." }
  # Claude ouvert : un nouveau lancement ne ferait que le ramener devant, sans recharger l'extension.
  if (Get-Process -Name 'claude' -ErrorAction SilentlyContinue) {
    Sortir 5 'Claude est encore ouvert : quittez-le complètement (zone de notification > Quitter), puis relancez.'
  }
  $commit = Commit-Sources
  $ecarts = Ecarts $Dossier
  if ($ecarts.Count -gt 0) {
    Sortir 6 ("les fichiers installés ne sont pas ceux du dépôt (commit $commit) : lancement refusé.`n  " + ($ecarts -join "`n  ") +
      "`nRéinstallez avec « install.ps1 installer » après avoir vérifié le dépôt.")
  }
  $cible = Trouver-Claude

  # Valeur d'avant notée HORS du dossier chargé, pour la remettre même si ce script est interrompu.
  $avant = Valeur-Utilisateur
  New-Item -ItemType Directory -Path $DossierScript -Force | Out-Null
  [pscustomobject]@{ existait = $null -ne $avant; valeur = $avant } | ConvertTo-Json |
    Set-Content -LiteralPath $FichierLancement -Encoding utf8NoBOM
  # Pas de Sortir (exit) dans le try : la remise de la variable, dans finally, doit toujours passer d'abord.
  $demarre = $false
  try {
    [Environment]::SetEnvironmentVariable('REACT_PROFILE', '1', 'User')
    $env:REACT_PROFILE = '1'
    if ($cible -like 'shell:*') { Start-Process -FilePath 'explorer.exe' -ArgumentList $cible } else { Start-Process -FilePath $cible }
    # Claude lit son environnement au démarrage : on attend son processus, puis un peu de marge.
    $limite = (Get-Date).AddSeconds(30)
    while (-not $demarre -and (Get-Date) -lt $limite) {
      $demarre = [bool] (Get-Process -Name 'claude' -ErrorAction SilentlyContinue)
      if (-not $demarre) { Start-Sleep -Milliseconds 500 }
    }
    if ($demarre) { Start-Sleep -Seconds 5 }
  } finally {
    [Environment]::SetEnvironmentVariable('REACT_PROFILE', $avant, 'User')
    $env:REACT_PROFILE = $null
    Remove-Item -LiteralPath $FichierLancement -Force -ErrorAction SilentlyContinue
  }
  if (-not $demarre) { Sortir 7 "Claude n'a pas démarré en 30 s avec « $cible » : essayez -Lanceur. REACT_PROFILE remise comme avant." }
  Sortir 0 "Claude lancé avec l'extension (commit $commit, fichiers vérifiés). REACT_PROFILE remise comme avant."
}

function Chemin-Raccourci {
  Join-Path ([Environment]::GetFolderPath('Programs')) $NomRaccourci
}

function Raccourci {
  $pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue)?.Source
  if (-not $pwsh) { Sortir 4 'pwsh introuvable dans le PATH.' }
  $lnk = Chemin-Raccourci
  $shell = New-Object -ComObject WScript.Shell
  $r = $shell.CreateShortcut($lnk)
  $r.TargetPath = $pwsh
  $profilArg = if ($Profil) { " -Profil `"$Profil`"" } else { '' }
  $lanceurArg = if ($Lanceur) { " -Lanceur `"$Lanceur`"" } else { '' }
  $r.Arguments = "-NoProfile -File `"$(Join-Path $PSScriptRoot 'install.ps1')`" lancer -Attendre$profilArg$lanceurArg"
  $r.WorkingDirectory = $PSScriptRoot
  $r.Description = 'Lance Claude avec l''extension cercle, après vérification des fichiers'
  $r.Save()
  Sortir 0 "Raccourci créé : $lnk (menu Démarrer, « Claude (cercle) »)."
}

function Retirer([string] $Dossier) {
  $occupant = Occupant $Dossier
  $lnk = Chemin-Raccourci
  if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force; Write-Host "Raccourci supprimé : $lnk" }
  if ($occupant -eq 'absent') {
    Avertir-Variable
    Sortir 0 "Rien à retirer : $Dossier n'existe pas."
  }
  if ($occupant -notin @('nôtre', 'nôtre sans état')) {
    Sortir 3 "$Dossier n'est pas cette extension ($occupant) : rien n'a été supprimé."
  }
  try { Remove-Item -LiteralPath $Dossier -Recurse -Force } catch {
    Sortir 4 "suppression impossible (Claude est-il encore ouvert ?) : $($_.Exception.Message)"
  }
  Avertir-Variable
  Sortir 0 "Retirée de $Dossier. Quittez complètement Claude puis relancez-le normalement."
}

function Etat([string] $Dossier) {
  $occupant = Occupant $Dossier
  $v = Valeur-Utilisateur
  Write-Host "Dossier : $Dossier"
  Write-Host "Occupant : $occupant"
  Write-Host ("REACT_PROFILE (utilisateur) : " + $(if ($null -eq $v) { 'absente (bien : rien ne se charge hors « lancer »)' } else { "« $v »" }))
  Write-Host ("Raccourci : " + $(if (Test-Path -LiteralPath (Chemin-Raccourci)) { Chemin-Raccourci } else { 'aucun' }))
  if ($occupant -eq 'nôtre') {
    $etat = Lire-Etat $Dossier
    Write-Host ("Installée depuis : " + $(if ($etat.commit) { "commit $($etat.commit)" } else { 'commit inconnu' }))
  }
  if ($occupant -in @('nôtre', 'nôtre sans état')) {
    Write-Host 'Comparaison avec les sources (SHA-256) :'
    $ecarts = Ecarts $Dossier -Afficher
    Write-Host $(if ($ecarts.Count -eq 0) { 'Fichiers installés identiques aux sources.' } else { 'ÉCARTS : ' + ($ecarts -join ' ; ') })
  }
  Avertir-Variable
  exit 0
}

if ($Action -notin @('installer', 'lancer', 'raccourci', 'retirer', 'etat')) {
  Sortir 1 "action inconnue « $Action ». Utilisation : install.ps1 installer | lancer | raccourci | retirer | etat"
}
Reparer-Lancement
if ($Action -eq 'raccourci') { Raccourci }
$dossier = Join-Path (Join-Path (Trouver-Profil) 'extensions') $IdExtension
switch ($Action) {
  'installer' { Installer $dossier }
  'lancer' { Lancer $dossier }
  'retirer' { Retirer $dossier }
  'etat' { Etat $dossier }
}
