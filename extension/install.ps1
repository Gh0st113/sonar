#Requires -Version 7
<#
.SYNOPSIS
  Installe, retire ou décrit l'extension « cercle » (UI+ for Claude adapté à sonar) dans Claude Desktop pour Windows.

.DESCRIPTION
  Claude Desktop charge une extension de navigateur quand la variable d'environnement REACT_PROFILE vaut 1 :
  celle du dossier %LOCALAPPDATA%\Claude-Data\claude_<id>\extensions\fmkadmapgofadopljbjfkapdkoienihi
  (l'identifiant de React DevTools). C'est un crochet de développement, non garanti par Anthropic.

  installer : copie l'extension dans ce dossier et pose REACT_PROFILE=1 pour l'utilisateur, en notant la valeur
              précédente dans .sonar-etat.json (dans le dossier de l'extension).
  retirer   : supprime ce dossier s'il est le nôtre et remet REACT_PROFILE comme avant (ou la retire si elle
              n'existait pas).
  etat      : dit ce qui est installé, sans rien changer.

  Après installer ou retirer : quitter complètement Claude (icône de la zone de notification > Quitter) puis le relancer.

  S'il y a plusieurs dossiers claude_* (après une réinstallation de Claude), -Profil désigne celui à utiliser.

  Codes de retour : 0 réussi ; 1 action inconnue ; 2 dossier Claude-Data introuvable ou ambigu ;
  3 dossier d'extension occupé par autre chose (React DevTools ?) ; 4 échec de copie, de suppression, d'écriture
  ou erreur imprévue.

.EXAMPLE
  pwsh -NoProfile -File .\extension\install.ps1 installer
#>
param(
  [Parameter(Position = 0)]
  [string] $Action = 'etat',
  # Dossier claude_* à utiliser quand il y en a plusieurs (nom seul ou chemin complet).
  [string] $Profil
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Toute erreur imprévue sort en code 4, jamais en 1 (réservé à « action inconnue »).
trap {
  Write-Host "Erreur imprévue : $($_.Exception.Message)" -ForegroundColor Red
  exit 4
}

$IdExtension = 'fmkadmapgofadopljbjfkapdkoienihi'
$Marque = 'sonar-cercle'
$NomManifeste = 'UI+ for Claude (sonar, Windows)'
$FichierEtat = '.sonar-etat.json'
$Fichiers = @('manifest.json', 'sonar-lecture.js', 'widget.js', 'widget.css', 'LICENSE-UI-PLUS')

function Sortir([int] $Code, [string] $Message) {
  if ($Code -eq 0) { Write-Host $Message } else { Write-Host "Erreur : $Message" -ForegroundColor Red }
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
  if ($props['marque']?.Value -ne $Marque -or -not $props['existait']) { return $null }
  [pscustomobject]@{ existait = [bool] $props['existait'].Value; valeur = $props['valeur']?.Value }
}

function Valeur-Utilisateur { [Environment]::GetEnvironmentVariable('REACT_PROFILE', 'User') }

# Commit des sources, et refus d'installer des modifications locales non commitées : ce qui part dans Claude doit être
# ce qui a été relu. Sans git (copie hors dépôt), on installe et on le dit.
function Commit-Sources {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return $null }
  $commit = git -C $PSScriptRoot rev-parse HEAD 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $modifs = git -C $PSScriptRoot status --porcelain -- . 2>$null
  if ($modifs) { Sortir 4 "modifications non commitées dans $PSScriptRoot : commitez-les ou annulez-les avant d'installer.`n$($modifs -join "`n")" }
  $commit
}

# Empreintes SHA-256 des fichiers installés comparées aux sources : un fichier changé après coup se voit.
function Comparer([string] $Dossier) {
  foreach ($f in $Fichiers) {
    $installe = Join-Path $Dossier $f
    $source = Join-Path $PSScriptRoot $f
    if (-not (Test-Path -LiteralPath $installe)) { Write-Host "  $f : absent du dossier installé" -ForegroundColor Red; continue }
    $h = (Get-FileHash -LiteralPath $installe -Algorithm SHA256).Hash
    # manifest.json est réécrit à l'installation (version_name) : on ne compare que les autres.
    if ($f -eq 'manifest.json') { Write-Host "  $f : $h (réécrit à l'installation)"; continue }
    $ok = (Test-Path -LiteralPath $source) -and $h -eq (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    Write-Host ("  $f : $h " + $(if ($ok) { '(identique aux sources)' } else { 'DIFFÉRENT DES SOURCES' })) -ForegroundColor $(if ($ok) { 'Gray' } else { 'Red' })
  }
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

  # Valeur de REACT_PROFILE à remettre au retrait. Réinstallation : on garde celle notée la première fois.
  # Après la sonde, qui avait posé la variable elle-même, elle compte comme « n'existait pas » ; de même pour
  # notre propre dossier dont l'état s'est perdu (la valeur actuelle, 1, est la nôtre).
  $ancien = if ($occupant -eq 'nôtre') { Lire-Etat $Dossier } else { $null }
  if ($ancien) {
    $precedent = $ancien
  } elseif ($occupant -in @('sonde', 'nôtre sans état')) {
    $precedent = [pscustomobject]@{ existait = $false; valeur = $null }
  } else {
    $v = Valeur-Utilisateur
    $precedent = [pscustomobject]@{ existait = $null -ne $v; valeur = $v }
  }

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
    [pscustomobject]@{ marque = $Marque; existait = $precedent.existait; valeur = $precedent.valeur; installe = (Get-Date -Format o); commit = $commit } |
      ConvertTo-Json | Set-Content -LiteralPath (Join-Path $temp $FichierEtat) -Encoding utf8NoBOM
    if (Test-Path -LiteralPath $Dossier) { Remove-Item -LiteralPath $Dossier -Recurse -Force }
    New-Item -ItemType Directory -Path (Split-Path $Dossier) -Force | Out-Null
    Move-Item -LiteralPath $temp -Destination $Dossier
  } catch {
    Sortir 4 "copie impossible : $($_.Exception.Message)"
  }

  try { [Environment]::SetEnvironmentVariable('REACT_PROFILE', '1', 'User') } catch {
    Sortir 4 "extension copiée, mais REACT_PROFILE n'a pas pu être posée : $($_.Exception.Message)"
  }
  $avant = if ($precedent.existait) { "« $($precedent.valeur) »" } else { 'absente' }
  $source = if ($commit) { "commit $commit" } else { 'hors dépôt git, sources non vérifiées' }
  Sortir 0 "Installée dans $Dossier ($source). REACT_PROFILE=1 (avant : $avant). Quittez complètement Claude puis relancez-le."
}

function Retirer([string] $Dossier) {
  $occupant = Occupant $Dossier
  if ($occupant -eq 'absent') {
    # Le crochet reste armé si la variable est encore posée : tout ce qui serait déposé plus tard dans ce dossier
    # serait chargé par Claude. Valeur d'avant inconnue : on ne la touche pas, on le signale.
    if ((Valeur-Utilisateur) -eq '1') {
      Write-Host "Attention : REACT_PROFILE vaut encore 1. Si personne d'autre n'en a besoin, retirez-la :" -ForegroundColor Yellow
      Write-Host "  [Environment]::SetEnvironmentVariable('REACT_PROFILE', `$null, 'User')"
    }
    Sortir 0 "Rien à retirer : $Dossier n'existe pas. REACT_PROFILE n'a pas été touchée."
  }
  if ($occupant -notin @('nôtre', 'nôtre sans état')) {
    Sortir 3 "$Dossier n'est pas cette extension ($occupant) : rien n'a été supprimé ni changé."
  }
  # État perdu : la valeur d'avant est inconnue ; on retire la variable, que nous avions posée.
  $etat = (Lire-Etat $Dossier) ?? [pscustomobject]@{ existait = $false; valeur = $null }
  try { Remove-Item -LiteralPath $Dossier -Recurse -Force } catch {
    Sortir 4 "suppression impossible (Claude est-il encore ouvert ?) : $($_.Exception.Message)"
  }
  try {
    if ($etat.existait) {
      [Environment]::SetEnvironmentVariable('REACT_PROFILE', [string] $etat.valeur, 'User')
      $apres = "remise à « $($etat.valeur) »"
    } else {
      [Environment]::SetEnvironmentVariable('REACT_PROFILE', $null, 'User')
      $apres = "retirée (elle n'existait pas avant)"
    }
  } catch {
    Sortir 4 "extension supprimée, mais REACT_PROFILE n'a pas pu être remise : $($_.Exception.Message)"
  }
  Sortir 0 "Retirée de $Dossier. REACT_PROFILE $apres. Quittez complètement Claude puis relancez-le."
}

function Etat([string] $Dossier) {
  $occupant = Occupant $Dossier
  $v = Valeur-Utilisateur
  Write-Host "Dossier : $Dossier"
  Write-Host "Occupant : $occupant"
  Write-Host ("REACT_PROFILE (utilisateur) : " + $(if ($null -eq $v) { 'absente' } else { "« $v »" }))
  if ($occupant -eq 'nôtre') {
    $etat = Lire-Etat $Dossier
    Write-Host ("Valeur à remettre au retrait : " + $(if ($etat.existait) { "« $($etat.valeur) »" } else { 'aucune (variable retirée)' }))
    $props = (Get-Content -LiteralPath (Join-Path $Dossier $FichierEtat) -Raw | ConvertFrom-Json).PSObject.Properties
    Write-Host ("Installée depuis : " + $(if ($props['commit']?.Value) { "commit $($props['commit'].Value)" } else { 'commit inconnu' }))
  }
  if ($occupant -in @('nôtre', 'nôtre sans état')) {
    Write-Host 'Empreintes SHA-256 :'
    Comparer $Dossier
  }
  exit 0
}

if ($Action -notin @('installer', 'retirer', 'etat')) {
  Sortir 1 "action inconnue « $Action ». Utilisation : install.ps1 installer | retirer | etat"
}
$dossier = Join-Path (Join-Path (Trouver-Profil) 'extensions') $IdExtension
switch ($Action) {
  'installer' { Installer $dossier }
  'retirer' { Retirer $dossier }
  'etat' { Etat $dossier }
}
