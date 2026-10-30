# Essai réel de l'installeur sur le runner Windows de la CI (job « windows » de .github/workflows/cercle.yml) :
# installation « pour moi » silencieuse, raccourcis, ancien raccourci retiré, entrée de désinstallation, extension dans
# un faux profil Claude, détection d'un fichier modifié, réparation, fichier verrouillé, nettoyage d'une REACT_PROFILE
# vide, désinstallation ; puis installation « pour tous » dans Program Files, sans raccourci. Pas de Claude Desktop
# sur le runner : le lancement de Claude n'est pas essayé ici. Le runner tourne déjà en administrateur : la
# demande d'accord de Windows (UAC) et runasoriginaluser ne peuvent pas être essayés ici non plus.
#
#   pwsh -File extension/installeur/essai-ci.ps1 -Setup <cercle-setup.exe>
param([Parameter(Mandatory)] [string] $Setup)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:CERCLE_SANS_FENETRE = '1' # aucune boîte ni question de cercle : elle attendrait un clic pour toujours

$Setup = (Resolve-Path $Setup).Path
$journaux = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$app = Join-Path $env:LOCALAPPDATA 'Programs\sonar-cercle'
$exe = Join-Path $app 'cercle.exe'
$profil = Join-Path $env:LOCALAPPDATA 'Claude-Data\claude_essai'
$extension = Join-Path $profil 'extensions\fmkadmapgofadopljbjfkapdkoienihi'
$programmes = [Environment]::GetFolderPath('Programs')
$menu = Join-Path $programmes 'Claude (cercle)'
$ancienRaccourci = Join-Path $programmes 'Claude (cercle).lnk'
$bureau = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Claude (cercle).lnk'
$id = '{FFFE350C-70CE-4845-A01E-C9337B03B368}_is1'
$cleUtilisateur = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$id"
$cleTous = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$id"
$version = (Get-Content (Join-Path $PSScriptRoot '..\manifest.json') -Raw | ConvertFrom-Json).version
$echecs = 0

function Verifier([string] $Nom, [bool] $Ok) {
  if ($Ok) { Write-Host "ok     $Nom" } else { Write-Host "ÉCHEC  $Nom" -ForegroundColor Red; $script:echecs++ }
}

# Un programme lancé et attendu 120 s au plus : un blocage (boîte invisible) devient un échec lisible.
function Executer([string] $Programme, [string[]] $Arguments) {
  $p = Start-Process -FilePath $Programme -ArgumentList $Arguments -PassThru -WindowStyle Hidden
  if (-not $p.WaitForExit(120000)) {
    $p.Kill()
    Write-Host "BLOQUÉ $Programme $Arguments" -ForegroundColor Red
    return -1
  }
  $p.ExitCode
}

function Cercle([string[]] $Arguments) { Executer $exe $Arguments }

# Attendre la fin d'une désinstallation (le désinstalleur se recopie et rend la main tout de suite), 60 s au plus.
function AttendreAbsence([string[]] $Chemins) {
  for ($i = 0; $i -lt 60 -and ($Chemins | Where-Object { Test-Path $_ })) { Start-Sleep -Seconds 1; $i++ }
}

function Journal([string] $Fichier) {
  Write-Host "--- $Fichier (fin)"
  Get-Content $Fichier -ErrorAction SilentlyContinue | Select-Object -Last 25
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')
Write-Host "Runner en administrateur : $admin"

# Un faux profil Claude ; une REACT_PROFILE vide comme celle laissée par la sonde chez l'utilisateur (écrite dans le
# registre : [Environment]::SetEnvironmentVariable avec '' supprimerait la variable au lieu de la vider) ; l'ancien
# raccourci seul, posé par l'installeur d'avant le dossier « Claude (cercle) ».
New-Item -ItemType Directory -Force -Path $profil | Out-Null
New-ItemProperty -Path HKCU:\Environment -Name REACT_PROFILE -Value '' -PropertyType String -Force | Out-Null
Verifier "REACT_PROFILE vide posée" ((Get-Item HKCU:\Environment).GetValueNames() -contains 'REACT_PROFILE')
Set-Content -Path $ancienRaccourci -Value 'ancien raccourci'

Write-Host "--- Installation « pour moi », silencieuse (raccourcis menu + bureau)"
$log = Join-Path $journaux 'setup-moi.log'
$c = Executer $Setup @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/LANG=fr', '/TASKS=menu,bureau', "/LOG=`"$log`"")
Verifier "installeur : code 0 (reçu $c)" ($c -eq 0)
Verifier "cercle.exe dans $app" (Test-Path $exe)
Verifier "raccourci « Claude (cercle) » du menu Démarrer" (Test-Path (Join-Path $menu 'Claude (cercle).lnk'))
Verifier "raccourci « Gérer Claude (cercle) »" (Test-Path (Join-Path $menu 'Gérer Claude (cercle).lnk'))
Verifier "raccourci « Désinstaller Claude (cercle) »" (Test-Path (Join-Path $menu 'Désinstaller Claude (cercle).lnk'))
Verifier "icône du Bureau" (Test-Path $bureau)
Verifier "ancien raccourci seul retiré" (-not (Test-Path $ancienRaccourci))
$entree = Get-ItemProperty -Path $cleUtilisateur -ErrorAction SilentlyContinue
Verifier "entrée de Paramètres > Applications (HKCU)" ($null -ne $entree)
Verifier "version affichée $version (reçu $(if ($entree) { $entree.DisplayVersion }))" ($entree -and $entree.DisplayVersion -eq $version)
Verifier "pas d'entrée « pour tous » (HKLM)" (-not (Test-Path $cleTous))
Verifier "extension copiée dans le profil" (Test-Path (Join-Path $extension 'manifest.json'))
Verifier "REACT_PROFILE vide retirée" ((Get-Item HKCU:\Environment).GetValueNames() -notcontains 'REACT_PROFILE')
Journal $log

Write-Host "--- Vérification, réparation, fichier verrouillé"
Verifier "cercle verifier : intacte (0)" ((Cercle @('verifier')) -eq 0)
Add-Content -Path (Join-Path $extension 'widget.js') -Value '// piège'
Verifier "cercle verifier : fichier modifié vu (6)" ((Cercle @('verifier')) -eq 6)
Verifier "cercle installer : réparation (0)" ((Cercle @('installer', '--silencieux')) -eq 0)
Verifier "cercle verifier : de nouveau intacte (0)" ((Cercle @('verifier')) -eq 0)
# Un fichier ouvert sans partage (comme par Claude) : refus propre (4), et l'extension reste entière.
$f = [IO.File]::Open((Join-Path $extension 'widget.js'), 'Open', 'Read', 'None')
try {
  Verifier "cercle installer, fichier verrouillé : refus (4)" ((Cercle @('installer', '--silencieux')) -eq 4)
} finally { $f.Close() }
Verifier "cercle verifier : extension restée intacte (0)" ((Cercle @('verifier')) -eq 0)
Verifier "pas de reste .nouveau" (-not (Test-Path "$extension.nouveau"))
Verifier "cercle version (0)" ((Cercle @('version')) -eq 0)
# Sortie redirigée (tube) : elle doit arriver au lanceur, et pas dans une console.
$psi = [Diagnostics.ProcessStartInfo]::new($exe, 'version')
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$p = [Diagnostics.Process]::Start($psi)
$lu = $p.StandardOutput.ReadToEnd()
$p.WaitForExit(30000) | Out-Null
Verifier "cercle version | tube : $version (reçu « $($lu.Trim()) »)" ($lu -match [regex]::Escape($version))

Write-Host "--- Désinstallation « pour moi », silencieuse"
$log = Join-Path $journaux 'unins-moi.log'
Executer (Join-Path $app 'unins000.exe') @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=`"$log`"") | Out-Null
AttendreAbsence @($exe, $cleUtilisateur)
Verifier "cercle.exe supprimé" (-not (Test-Path $exe))
Verifier "entrée de désinstallation supprimée" (-not (Test-Path $cleUtilisateur))
Verifier "raccourcis du menu supprimés" (-not (Test-Path $menu))
Verifier "icône du Bureau supprimée" (-not (Test-Path $bureau))
Verifier "extension retirée du profil" (-not (Test-Path $extension))
Journal $log

Write-Host "--- Installation « pour tous » dans Program Files, aucun raccourci"
$dossierTous = Join-Path $env:ProgramFiles 'cercle-essai'
$menuTous = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Claude (cercle)'
$log = Join-Path $journaux 'setup-tous.log'
$c = Executer $Setup @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/ALLUSERS', "/DIR=`"$dossierTous`"", '/LANG=en', '/TASKS=""', "/LOG=`"$log`"")
Verifier "installeur : code 0 (reçu $c)" ($c -eq 0)
Verifier "cercle.exe dans $dossierTous" (Test-Path (Join-Path $dossierTous 'cercle.exe'))
Verifier "entrée de Paramètres > Applications (HKLM)" (Test-Path $cleTous)
Verifier "pas d'entrée « pour moi » (HKCU)" (-not (Test-Path $cleUtilisateur))
Verifier "aucun raccourci (tâches décochées)" (-not (Test-Path $menuTous) -and -not (Test-Path $menu))
Verifier "extension copiée dans le profil" (Test-Path (Join-Path $extension 'manifest.json'))
Journal $log
$log = Join-Path $journaux 'unins-tous.log'
Executer (Join-Path $dossierTous 'unins000.exe') @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=`"$log`"") | Out-Null
AttendreAbsence @((Join-Path $dossierTous 'cercle.exe'), $cleTous)
Verifier "désinstallé (HKLM)" (-not (Test-Path $cleTous))
Verifier "extension retirée du profil" (-not (Test-Path $extension))
Journal $log

if ($echecs -gt 0) { Write-Error "$echecs vérification(s) en échec" }
Write-Host "Toutes les vérifications passent."
