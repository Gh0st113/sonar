<#
  sonar pour Windows : installe l'extension dans Claude Desktop.
  D'après Windows/ui-plus.ps1 de UI+ for Claude (Lukas van Uden et DarkstarDEV, licence MIT, voir LICENSE-UI-PLUS),
  commit 1e8274fc149a49979c8688a447ae9bf9bd0d3028.

  Claude Desktop charge le dossier d'extension de React DevTools quand REACT_PROFILE=1 à son démarrage (crochet de
  développement). « installer » copie l'extension dans ce dossier, pour chaque profil claude_* de
  %LOCALAPPDATA%\Claude-Data, et pose REACT_PROFILE=1 pour le compte, en permanence : Claude se lance ensuite comme
  d'habitude. « desinstaller » retire les deux. Mise à jour : git pull, puis installer.cmd de nouveau.

  Usage : powershell -NoProfile -ExecutionPolicy Bypass -File sonar.ps1 installer|desinstaller|etat
  Codes de retour : 0 réussi, 1 échec (message affiché), 2 action inconnue.
  Ce fichier est en UTF-8 avec BOM : sans BOM, Windows PowerShell 5.1 lit les accents de travers.
#>
param([Parameter(Position = 0)][string]$Action = '')

$ErrorActionPreference = 'Stop'

$IdExtension = 'fmkadmapgofadopljbjfkapdkoienihi'
$Fichiers    = 'manifest.json', 'widget.js', 'widget.css', 'sonar-lecture.js', 'LICENSE-UI-PLUS'
$Donnees     = Join-Path $env:LOCALAPPDATA 'Claude-Data'

# Un dossier d'extension par profil claude_* (Claude Desktop du Microsoft Store).
function Get-DossiersExtension {
  if (-not (Test-Path $Donnees)) { return @() }
  @(Get-ChildItem $Donnees -Directory -Filter 'claude_*' | ForEach-Object { Join-Path $_.FullName "extensions\$IdExtension" })
}

# Un dossier est à nous s'il est absent, vide, ou si son manifeste porte le nom de UI+ (sonar ou l'original).
# Sinon c'est sans doute React DevTools : on n'y touche pas.
function Test-ANous([string]$dossier) {
  if (-not (Test-Path $dossier)) { return $true }
  if (@(Get-ChildItem $dossier -Force).Count -eq 0) { return $true }
  $mf = Join-Path $dossier 'manifest.json'
  if (-not (Test-Path $mf)) { return $false }
  try { return [bool]((Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json).name -like 'UI+ for Claude*') } catch { return $false }
}

# Prévient l'Explorateur que l'environnement a changé : les applis qu'il lance ensuite voient REACT_PROFILE.
# Sans effet sur ce qui est installé : un échec (Add-Type bloqué par un antivirus…) n'est qu'un avertissement.
function Send-ChangementEnvironnement {
  try {
    if (-not ('Sonar.Natif' -as [type])) {
      Add-Type -Namespace Sonar -Name Natif -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint Msg, System.UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out System.UIntPtr lpdwResult);
'@
    }
    $r = [UIntPtr]::Zero
    # HWND_BROADCAST, WM_SETTINGCHANGE, SMTO_ABORTIFHUNG, 5 s.
    [void][Sonar.Natif]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$r)
  } catch {
    Write-Warning "Windows n'a pas pu être prévenu du changement : fermez votre session Windows et rouvrez-la."
  }
}

# Claude Desktop, pas Claude Code (lui aussi claude.exe) : reconnu à l'endroit où il est installé.
function Get-ClaudeBureau {
  @(Get-Process claude -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -match '\\WindowsApps\\(Claude_|Anthropic\.Claude)|\\AnthropicClaude\\' })
}

function Restart-Claude {
  $ouverts = Get-ClaudeBureau
  $exe = $ouverts[0].Path
  # Ce qu'il faudra relancer, trouvé avant de fermer Claude.
  $cible = $exe
  if ($exe -match '\\WindowsApps\\') {
    # Une appli du Store ne se lance pas par son exe : on passe par le shell, qui lui donne l'environnement du
    # compte (REACT_PROFILE compris, depuis le message envoyé à l'installation).
    $pkg = Get-AppxPackage | Where-Object { $exe.StartsWith($_.InstallLocation + '\', [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1
    if (-not $pkg) { throw 'paquet de Claude introuvable' }
    $appli = @((Get-AppxPackageManifest $pkg).Package.Applications.Application |
      Where-Object { $_.Executable -like '*\Claude.exe' })[0].Id
    if (-not $appli) { throw 'application Claude introuvable dans son paquet' }
    $cible = "shell:AppsFolder\$($pkg.PackageFamilyName)!$appli"
  } else {
    $env:REACT_PROFILE = '1'
  }
  $ouverts | Stop-Process -Force
  Start-Sleep -Seconds 2
  Start-Process $cible
}

# L'ancienne version (sonar.exe ou cercle.exe, installeur Inno Setup) retire l'extension en se désinstallant : elle
# doit partir d'abord. Reconnue à sa clé de désinstallation (même AppId de la 0.5.0 à la 0.6.0).
function Test-AncienSonar {
  foreach ($racine in 'HKCU:', 'HKLM:') {
    $cle = "$racine\Software\Microsoft\Windows\CurrentVersion\Uninstall\{FFFE350C-70CE-4845-A01E-C9337B03B368}_is1"
    if (Test-Path $cle) { return (Get-ItemProperty $cle).DisplayName }
  }
  return $null
}

function Install-Sonar {
  $ancien = Test-AncienSonar
  if ($ancien) {
    throw "L'ancienne version de sonar est installée (« $ancien »). Désinstallez-la d'abord : Paramètres > Applications > « $ancien » > Désinstaller, puis relancez installer.cmd."
  }
  foreach ($f in $Fichiers) {
    if (-not (Test-Path (Join-Path $PSScriptRoot $f))) { throw "Fichier manquant à côté du script : $f" }
  }
  $dossiers = Get-DossiersExtension
  if ($dossiers.Count -eq 0) {
    throw "Aucun profil Claude dans $Donnees : lancez Claude Desktop une fois, quittez-le, puis relancez installer.cmd."
  }
  $installes = 0
  foreach ($d in $dossiers) {
    if (-not (Test-ANous $d)) { Write-Warning "Ignoré, occupé par une autre extension (React DevTools ?) : $d"; continue }
    if (Test-Path $d) { Remove-Item $d -Recurse -Force }
    New-Item -ItemType Directory -Path $d -Force | Out-Null
    foreach ($f in $Fichiers) { Copy-Item (Join-Path $PSScriptRoot $f) $d }
    # Un version_name neuf à chaque installation : « Désinstaller… » dans le popover masque l'extension jusqu'à la
    # prochaine installation (widget.js, INSTALL_ID).
    $mf = Join-Path $d 'manifest.json'
    $json = Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json
    $json | Add-Member -NotePropertyName version_name -NotePropertyValue ('install-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -Force
    [IO.File]::WriteAllText($mf, ($json | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
    Write-Host "Extension installée : $d"
    $installes++
  }
  if ($installes -eq 0) { throw "Aucun dossier d'extension libre : rien n'a été installé." }

  [Environment]::SetEnvironmentVariable('REACT_PROFILE', '1', 'User')
  Send-ChangementEnvironnement
  Write-Host 'REACT_PROFILE=1 posée pour votre compte.'

  if ((Get-ClaudeBureau).Count -gt 0) {
    $r = Read-Host "Claude est ouvert. Le fermer et le relancer maintenant ? Une réponse en cours serait interrompue. [o/N]"
    if ($r -match '^[oOyY]') {
      try { Restart-Claude; Write-Host "`nsonar est installé : Claude redémarre avec lui."; return }
      catch { Write-Warning "Relance impossible ($($_.Exception.Message))." }
    }
    Write-Host "`nsonar est installé. Quittez complètement Claude (zone de notification > Quitter), puis rouvrez-le."
  } else {
    Write-Host "`nsonar est installé. Ouvrez Claude : le popover du cercle d'usage montre Cache et Coût."
  }
  Write-Host "S'il n'apparaît pas, fermez votre session Windows et rouvrez-la une fois."
}

function Uninstall-Sonar {
  foreach ($d in Get-DossiersExtension) {
    if (-not (Test-Path $d)) { continue }
    if (Test-ANous $d) { Remove-Item $d -Recurse -Force; Write-Host "Extension retirée : $d" }
    else { Write-Warning "Laissé en place (pas sonar) : $d" }
  }
  if ([Environment]::GetEnvironmentVariable('REACT_PROFILE', 'User') -eq '1') {
    [Environment]::SetEnvironmentVariable('REACT_PROFILE', $null, 'User')
    Send-ChangementEnvironnement
    Write-Host 'REACT_PROFILE retirée de votre compte.'
  }
  Write-Host "`nsonar est désinstallé. Quittez complètement Claude, puis rouvrez-le."
}

function Get-Etat {
  $variable = [Environment]::GetEnvironmentVariable('REACT_PROFILE', 'User')
  Write-Host ("REACT_PROFILE (compte) : " + $(if ($null -eq $variable) { 'absente' } else { "« $variable »" }))
  $dossiers = Get-DossiersExtension
  if ($dossiers.Count -eq 0) { Write-Host "Aucun profil Claude dans $Donnees" }
  foreach ($d in $dossiers) {
    $mf = Join-Path $d 'manifest.json'
    $etat = if (-not (Test-Path $d)) { 'absente' }
      elseif (-not (Test-ANous $d)) { 'autre extension (pas sonar)' }
      elseif (Test-Path $mf) { $m = Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json; "$($m.name) $($m.version)" }
      else { 'dossier vide' }
    Write-Host "$d : $etat"
  }
}

try {
  switch ($Action) {
    'installer'    { Install-Sonar }
    'desinstaller' { Uninstall-Sonar }
    'etat'         { Get-Etat }
    default        { Write-Host 'Usage : sonar.ps1 installer|desinstaller|etat'; exit 2 }
  }
} catch {
  Write-Host "`nÉchec : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
