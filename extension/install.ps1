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

  Codes de retour : 0 réussi ; 1 action inconnue ; 2 dossier Claude-Data introuvable ou ambigu ;
  3 dossier d'extension occupé par autre chose (React DevTools ?) ; 4 échec de copie, de suppression ou d'écriture.

.EXAMPLE
  pwsh -NoProfile -File .\extension\install.ps1 installer
#>
param(
  [Parameter(Position = 0)]
  [string] $Action = 'etat'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$IdExtension = 'fmkadmapgofadopljbjfkapdkoienihi'
$Marque = 'sonar-cercle'
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
  if ($profils.Count -eq 0) {
    Sortir 2 "aucun dossier claude_* dans $base. Claude Desktop a-t-il déjà été lancé ?"
  }
  if ($profils.Count -gt 1) {
    $noms = ($profils | ForEach-Object Name) -join ', '
    Sortir 2 "plusieurs dossiers claude_* dans $base ($noms) : impossible de savoir lequel Claude utilise."
  }
  $profils[0].FullName
}

# Qui occupe le dossier de l'extension : absent | nôtre | sonde | autre.
function Occupant([string] $Dossier) {
  if (-not (Test-Path -LiteralPath $Dossier)) { return 'absent' }
  $etat = Lire-Etat $Dossier
  if ($etat -and $etat.marque -eq $Marque) { return 'nôtre' }
  $manifeste = Join-Path $Dossier 'manifest.json'
  if (Test-Path -LiteralPath $manifeste) {
    try {
      $nom = (Get-Content -LiteralPath $manifeste -Raw | ConvertFrom-Json).name
      if ($nom -like 'Sonde cercle*') { return 'sonde' }
    } catch { }
  }
  'autre'
}

function Lire-Etat([string] $Dossier) {
  $chemin = Join-Path $Dossier $FichierEtat
  if (-not (Test-Path -LiteralPath $chemin)) { return $null }
  try { Get-Content -LiteralPath $chemin -Raw | ConvertFrom-Json } catch { $null }
}

function Valeur-Utilisateur { [Environment]::GetEnvironmentVariable('REACT_PROFILE', 'User') }

function Installer([string] $Dossier) {
  $occupant = Occupant $Dossier
  if ($occupant -eq 'autre') {
    Sortir 3 "$Dossier existe et n'est ni cette extension ni la sonde (React DevTools ?). Rien n'a été touché."
  }
  foreach ($f in $Fichiers) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $f))) { Sortir 4 "fichier source absent : $f" }
  }

  # Valeur de REACT_PROFILE à remettre au retrait. Réinstallation : on garde celle notée la première fois.
  # Après la sonde, qui avait posé la variable elle-même, elle compte comme « n'existait pas ».
  $ancien = if ($occupant -eq 'nôtre') { Lire-Etat $Dossier } else { $null }
  if ($ancien) {
    $precedent = [pscustomobject]@{ existait = [bool] $ancien.existait; valeur = $ancien.valeur }
  } elseif ($occupant -eq 'sonde') {
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
    [pscustomobject]@{ marque = $Marque; existait = $precedent.existait; valeur = $precedent.valeur; installe = (Get-Date -Format o) } |
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
  Sortir 0 "Installée dans $Dossier. REACT_PROFILE=1 (avant : $avant). Quittez complètement Claude puis relancez-le."
}

function Retirer([string] $Dossier) {
  $occupant = Occupant $Dossier
  if ($occupant -eq 'absent') { Sortir 0 "Rien à retirer : $Dossier n'existe pas. REACT_PROFILE n'a pas été touchée." }
  if ($occupant -ne 'nôtre') {
    Sortir 3 "$Dossier n'est pas cette extension ($occupant) : rien n'a été supprimé ni changé."
  }
  $etat = Lire-Etat $Dossier
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
