# Essai réel de l'installeur sur le runner Windows de la CI (job « windows » de .github/workflows/cercle.yml) :
# installation silencieuse, raccourcis, entrée de désinstallation, extension dans un faux profil Claude, détection d'un
# fichier modifié, réparation, nettoyage d'une REACT_PROFILE vide, désinstallation. Pas de Claude Desktop sur le runner :
# le lancement de Claude lui-même n'est pas essayé ici.
#
#   pwsh -File extension/installeur/essai-ci.ps1 -Setup <cercle-setup.exe>
param([Parameter(Mandatory)] [string] $Setup)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:CERCLE_SANS_FENETRE = '1' # aucune boîte de dialogue : elle attendrait un clic pour toujours

$app = Join-Path $env:LOCALAPPDATA 'Programs\sonar-cercle'
$exe = Join-Path $app 'cercle.exe'
$profil = Join-Path $env:LOCALAPPDATA 'Claude-Data\claude_essai'
$extension = Join-Path $profil 'extensions\fmkadmapgofadopljbjfkapdkoienihi'
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Claude (cercle)'
$bureau = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Claude (cercle).lnk'
$cleDesinstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{FFFE350C-70CE-4845-A01E-C9337B03B368}_is1'
$version = (Get-Content (Join-Path $PSScriptRoot '..\manifest.json') -Raw | ConvertFrom-Json).version
$echecs = 0

function Verifier([string] $Nom, [bool] $Ok) {
  if ($Ok) { Write-Host "ok     $Nom" } else { Write-Host "ÉCHEC  $Nom" -ForegroundColor Red; $script:echecs++ }
}

function Cercle([string[]] $Arguments) {
  $p = Start-Process -FilePath $exe -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden
  $p.ExitCode
}

# Un faux profil Claude, et une REACT_PROFILE vide comme celle laissée par la sonde chez l'utilisateur.
New-Item -ItemType Directory -Force -Path $profil | Out-Null
[Environment]::SetEnvironmentVariable('REACT_PROFILE', '', 'User')

Write-Host "--- Installation silencieuse (raccourcis menu + bureau)"
$p = Start-Process -FilePath $Setup -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/LANG=fr', '/TASKS=menu,bureau', '/LOG=setup.log' -Wait -PassThru
Verifier "installeur : code 0 (reçu $($p.ExitCode))" ($p.ExitCode -eq 0)
Verifier "cercle.exe dans $app" (Test-Path $exe)
Verifier "raccourci « Claude (cercle) » du menu Démarrer" (Test-Path (Join-Path $menu 'Claude (cercle).lnk'))
Verifier "raccourci « Gérer Claude (cercle) »" (Test-Path (Join-Path $menu 'Gérer Claude (cercle).lnk'))
Verifier "raccourci « Désinstaller Claude (cercle) »" (Test-Path (Join-Path $menu 'Désinstaller Claude (cercle).lnk'))
Verifier "icône du Bureau" (Test-Path $bureau)
$entree = Get-ItemProperty -Path $cleDesinstall -ErrorAction SilentlyContinue
Verifier "entrée de Paramètres > Applications" ($null -ne $entree)
Verifier "version affichée $version (reçu $($entree.DisplayVersion))" ($entree -and $entree.DisplayVersion -eq $version)
Verifier "extension copiée dans le profil" (Test-Path (Join-Path $extension 'manifest.json'))
Verifier "REACT_PROFILE vide retirée" ($null -eq [Environment]::GetEnvironmentVariable('REACT_PROFILE', 'User'))

Write-Host "--- Vérification et réparation"
Verifier "cercle verifier : intacte (0)" ((Cercle @('verifier')) -eq 0)
Add-Content -Path (Join-Path $extension 'widget.js') -Value '// piège'
Verifier "cercle verifier : fichier modifié vu (6)" ((Cercle @('verifier')) -eq 6)
Verifier "cercle installer : réparation (0)" ((Cercle @('installer', '--silencieux')) -eq 0)
Verifier "cercle verifier : de nouveau intacte (0)" ((Cercle @('verifier')) -eq 0)
Verifier "cercle version (0)" ((Cercle @('version')) -eq 0)

Write-Host "--- Désinstallation silencieuse"
$desinstalleur = Join-Path $app 'unins000.exe'
Start-Process -FilePath $desinstalleur -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait
# Le désinstalleur se recopie et rend la main tout de suite : on attend qu'il ait fini (60 s au plus).
for ($i = 0; $i -lt 60 -and ((Test-Path $exe) -or (Test-Path $cleDesinstall)); $i++) { Start-Sleep -Seconds 1 }
Verifier "cercle.exe supprimé" (-not (Test-Path $exe))
Verifier "entrée de désinstallation supprimée" (-not (Test-Path $cleDesinstall))
Verifier "raccourcis du menu supprimés" (-not (Test-Path $menu))
Verifier "icône du Bureau supprimée" (-not (Test-Path $bureau))
Verifier "extension retirée du profil" (-not (Test-Path $extension))

Write-Host "--- Journal de l'installeur"
Get-Content setup.log -ErrorAction SilentlyContinue | Select-Object -Last 40

if ($echecs -gt 0) { Write-Error "$echecs vérification(s) en échec"; exit 1 }
Write-Host "Toutes les vérifications passent."
