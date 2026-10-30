; Installeur « Claude (cercle) » (Inno Setup 6). Construit par GitHub Actions (.github/workflows/cercle.yml) :
;   ISCC /DVersion=<version du manifeste> /DExe=<chemin de cercle.exe> extension\installeur\cercle.iss
;
; Sans droits administrateur : le programme va dans %LOCALAPPDATA%\Programs\sonar-cercle, le raccourci dans le menu
; Démarrer de l'utilisateur, la désinstallation dans Paramètres > Applications. cercle.exe est stocké NON compressé :
; « cercle signer » y lit la version, et y retrouve octet pour octet un cercle.exe recompilé (build reproductible).

#ifndef Version
  #error Passez /DVersion=x.y.z
#endif
#ifndef Exe
  #define Exe "..\cercle.exe"
#endif

[Setup]
AppId={{FFFE350C-70CE-4845-A01E-C9337B03B368}
AppName=Claude (cercle)
AppVersion={#Version}
AppVerName=Claude (cercle) {#Version}
AppPublisher=Gh0st113
AppPublisherURL=https://github.com/Gh0st113/sonar
AppSupportURL=https://github.com/Gh0st113/sonar/issues
AppUpdatesURL=https://github.com/Gh0st113/sonar/releases
VersionInfoVersion={#Version}
DefaultDirName={autopf}\sonar-cercle
PrivilegesRequired=lowest
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=no
OutputDir=sortie
OutputBaseFilename=cercle-setup
UninstallDisplayName=Claude (cercle)
UninstallDisplayIcon={app}\cercle.exe
; Une mise à jour lancée par cercle.exe : l'ancien cercle.exe a déjà quitté ; s'il tourne encore, on le ferme.
CloseApplications=force
RestartApplications=no

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
fr.Installation=Installation de l'extension dans le profil de Claude…
en.Installation=Installing the extension into Claude's profile…
fr.Lancer=Lancer Claude avec l'extension (Claude doit être fermé)
en.Lancer=Start Claude with the extension (Claude must be closed)
fr.Commentaire=Lance Claude avec l'extension cercle, après vérification des fichiers
en.Commentaire=Starts Claude with the cercle extension, after checking its files

[Messages]
fr.WelcomeLabel2=[name/ver]%n%nClaude (cercle) ajoute à Claude Desktop le rythme de vos limites, le cache, la branche et le coût (avec le mod sonar), dans le cercle d'usage et sous « Personnalisation ».%n%nAprès l'installation, quittez complètement Claude (zone de notification > Quitter) puis lancez-le par « Claude (cercle) » dans le menu Démarrer. Lancé autrement, Claude ne charge pas l'extension : c'est voulu.
en.WelcomeLabel2=[name/ver]%n%nClaude (cercle) adds your limits' pace, the cache, the branch and the cost (with the sonar mod) to Claude Desktop, in the usage circle and below "Customize".%n%nAfter installing, quit Claude completely (notification area > Quit), then start it from "Claude (cercle)" in the Start menu. Started any other way, Claude does not load the extension: on purpose.

[Files]
Source: "{#Exe}"; DestDir: "{app}"; DestName: "cercle.exe"; Flags: ignoreversion nocompression
Source: "..\LICENSE-UI-PLUS"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\PROVENANCE.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Claude (cercle)"; Filename: "{app}\cercle.exe"; Comment: "{cm:Commentaire}"

[Run]
; Toujours : copier l'extension dans le profil de Claude (une erreur s'affiche dans une fenêtre).
Filename: "{app}\cercle.exe"; Parameters: "installer --silencieux"; StatusMsg: "{cm:Installation}"; Flags: waituntilterminated
; Fin de l'assistant : case « Lancer Claude ».
Filename: "{app}\cercle.exe"; Parameters: "lancer --sans-maj"; Description: "{cm:Lancer}"; Flags: nowait postinstall skipifsilent unchecked
; Mise à jour silencieuse demandée par cercle avant un lancement : relancer Claude ensuite.
Filename: "{app}\cercle.exe"; Parameters: "lancer --sans-maj"; Flags: nowait; Check: LancerApresMaj

[UninstallRun]
Filename: "{app}\cercle.exe"; Parameters: "retirer --silencieux"; Flags: waituntilterminated; RunOnceId: "RetirerExtension"

[Code]
function LancerApresMaj: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:LANCER|non}') = 'oui');
end;
