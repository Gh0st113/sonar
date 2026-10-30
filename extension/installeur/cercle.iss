; Installeur « Claude (cercle) » (Inno Setup 6). Construit par GitHub Actions (.github/workflows/cercle.yml) :
;   ISCC /DVersion=<version du manifeste> /DExe=<chemin de cercle.exe> extension\installeur\cercle.iss
;
; Par défaut sans droits administrateur : le programme va dans %LOCALAPPDATA%\Programs\sonar-cercle (dossier modifiable
; sur la page « Dossier de destination »), le raccourci dans le menu Démarrer, la désinstallation dans Paramètres >
; Applications. Un dossier qui demande des droits (Program Files…) : l'installeur se relance en administrateur
; (/ALLUSERS) avec ce dossier ; l'extension et Claude restent alors sous le compte de l'utilisateur (runasoriginaluser),
; jamais en administrateur. cercle.exe est stocké NON compressé :
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
; /ALLUSERS (relance en administrateur pour un dossier protégé, mises à jour d'une telle installation).
PrivilegesRequiredOverridesAllowed=commandline
DisableDirPage=no
UsePreviousAppDir=yes
DefaultGroupName=Claude (cercle)
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
fr.DroitsAdmin=Ce dossier demande des droits administrateur.%n%nRelancer l'installation en administrateur, avec ce dossier ? (Windows va demander votre accord.)%n%nL'extension et Claude resteront sous votre compte.
en.DroitsAdmin=This folder needs administrator rights.%n%nRestart the installation as administrator, with this folder? (Windows will ask for your consent.)%n%nThe extension and Claude will stay under your account.
fr.ElevationRefusee=L'installation en administrateur n'a pas pu démarrer. Choisissez un autre dossier.
en.ElevationRefusee=The installation as administrator could not start. Choose another folder.
fr.TacheMenu=Créer un dossier « Claude (cercle) » dans le menu Démarrer
en.TacheMenu=Create a "Claude (cercle)" folder in the Start menu
fr.TacheBureau=Créer une icône « Claude (cercle) » sur le Bureau
en.TacheBureau=Create a "Claude (cercle)" icon on the desktop
fr.Raccourcis=Raccourcis :
en.Raccourcis=Shortcuts:
fr.Gerer=Gérer Claude (cercle)
en.Gerer=Manage Claude (cercle)
fr.CommentaireGerer=Version, état de l'extension, réparation et mises à jour
en.CommentaireGerer=Version, extension state, repair and updates
fr.Desinstaller=Désinstaller Claude (cercle)
en.Desinstaller=Uninstall Claude (cercle)
fr.Commentaire=Lance Claude avec l'extension cercle, après vérification des fichiers
en.Commentaire=Starts Claude with the cercle extension, after checking its files

[Messages]
fr.WelcomeLabel2=[name/ver]%n%nClaude (cercle) ajoute à Claude Desktop le rythme de vos limites, le cache, la branche et le coût (avec le mod sonar), dans le cercle d'usage et sous « Personnalisation ».%n%nAprès l'installation, quittez complètement Claude (zone de notification > Quitter) puis lancez-le par « Claude (cercle) » dans le menu Démarrer. Lancé autrement, Claude ne charge pas l'extension : c'est voulu.
en.WelcomeLabel2=[name/ver]%n%nClaude (cercle) adds your limits' pace, the cache, the branch and the cost (with the sonar mod) to Claude Desktop, in the usage circle and below "Customize".%n%nAfter installing, quit Claude completely (notification area > Quit), then start it from "Claude (cercle)" in the Start menu. Started any other way, Claude does not load the extension: on purpose.

[Files]
Source: "{#Exe}"; DestDir: "{app}"; DestName: "cercle.exe"; Flags: ignoreversion nocompression
Source: "..\LICENSE-UI-PLUS"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\PROVENANCE.md"; DestDir: "{app}"; Flags: ignoreversion

[Tasks]
Name: "menu"; Description: "{cm:TacheMenu}"; GroupDescription: "{cm:Raccourcis}"
Name: "bureau"; Description: "{cm:TacheBureau}"; GroupDescription: "{cm:Raccourcis}"

[Icons]
; Menu Démarrer : un dossier « Claude (cercle) » avec le lanceur, la gestion (version, mises à jour) et la désinstallation.
Name: "{group}\Claude (cercle)"; Filename: "{app}\cercle.exe"; Comment: "{cm:Commentaire}"; Tasks: menu
Name: "{group}\{cm:Gerer}"; Filename: "{app}\cercle.exe"; Parameters: "gerer"; Comment: "{cm:CommentaireGerer}"; Tasks: menu
Name: "{group}\{cm:Desinstaller}"; Filename: "{uninstallexe}"; Tasks: menu
Name: "{autodesktop}\Claude (cercle)"; Filename: "{app}\cercle.exe"; Comment: "{cm:Commentaire}"; Tasks: bureau

[Run]
; Toujours : copier l'extension dans le profil de Claude (une erreur s'affiche dans une fenêtre).
; runasoriginaluser : même si l'installeur tourne en administrateur, l'extension va dans le profil de l'utilisateur
; et Claude démarre sous son compte.
Filename: "{app}\cercle.exe"; Parameters: "installer --silencieux"; StatusMsg: "{cm:Installation}"; Flags: waituntilterminated runasoriginaluser
; Fin de l'assistant : case « Lancer Claude ».
Filename: "{app}\cercle.exe"; Parameters: "lancer --sans-maj"; Description: "{cm:Lancer}"; Flags: nowait postinstall skipifsilent unchecked runasoriginaluser
; Mise à jour silencieuse demandée par cercle avant un lancement : relancer Claude ensuite.
Filename: "{app}\cercle.exe"; Parameters: "lancer --sans-maj"; Flags: nowait runasoriginaluser; Check: LancerApresMaj

[UninstallRun]
Filename: "{app}\cercle.exe"; Parameters: "retirer --silencieux"; Flags: waituntilterminated; RunOnceId: "RetirerExtension"

[Code]
procedure ExitProcess(uExitCode: Integer);
  external 'ExitProcess@kernel32.dll stdcall';

function LancerApresMaj: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:LANCER|non}') = 'oui');
end;

// Peut-on écrire dans ce dossier (ou, s'il n'existe pas encore, dans son premier parent existant) ?
function DossierInscriptible(Dossier: string): Boolean;
var
  Test: string;
begin
  while (not DirExists(Dossier)) and (ExtractFileDir(Dossier) <> Dossier) and (Dossier <> '') do
    Dossier := ExtractFileDir(Dossier);
  Test := AddBackslash(Dossier) + 'cercle-test-ecriture.tmp';
  Result := SaveStringToFile(Test, 'x', False);
  if Result then
    DeleteFile(Test);
end;

// Dossier protégé choisi sans droits : proposer de relancer l'installeur en mode « tous les utilisateurs » avec ce
// dossier. On le relance NORMALEMENT avec /ALLUSERS : c'est Inno Setup qui demande l'élévation, et il garde ainsi le
// compte d'origine pour runasoriginaluser (lancé directement en administrateur, il ne le connaîtrait pas).
function NextButtonClick(CurPageID: Integer): Boolean;
var
  Dossier: string;
  Code: Integer;
begin
  Result := True;
  if (CurPageID = wpSelectDir) and (not IsAdminInstallMode) then
  begin
    Dossier := WizardDirValue;
    if not DossierInscriptible(Dossier) then
    begin
      Result := False;
      if MsgBox(CustomMessage('DroitsAdmin'), mbConfirmation, MB_YESNO) = IDYES then
      begin
        if ShellExec('', ExpandConstant('{srcexe}'), '/ALLUSERS /DIR="' + Dossier + '" /LANG=' + ActiveLanguage,
             '', SW_SHOW, ewNoWait, Code) then
          ExitProcess(0)
        else
          MsgBox(CustomMessage('ElevationRefusee'), mbError, MB_OK);
      end;
    end;
  end;
end;
