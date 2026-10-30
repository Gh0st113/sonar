; Installeur « Claude + sonar » (Inno Setup 6). Construit par GitHub Actions (.github/workflows/windows.yml) :
;   ISCC /DVersion=<version du manifeste> /DExe=<chemin de sonar.exe> windows\installeur\sonar.iss
;
; Au démarrage, Inno Setup demande « pour moi seulement » (sans droits administrateur, par défaut :
; %LOCALAPPDATA%\Programs\sonar) ou « pour tous les utilisateurs » (Program Files, Windows demande l'accord).
; Le dossier se choisit ensuite sur la page « Dossier de destination ». Une mise à jour reprend le mode de
; l'installation existante. En mode « pour tous », l'extension et Claude restent sous le compte de l'utilisateur qui a
; lancé l'installeur (runasoriginaluser), jamais en administrateur. sonar.exe est stocké NON compressé :
; « sonar signer » y lit la version, et y retrouve octet pour octet un sonar.exe recompilé (build reproductible).

#ifndef Version
  #error Passez /DVersion=x.y.z
#endif
#ifndef Exe
  #define Exe "..\sonar.exe"
#endif

[Setup]
AppId={{FFFE350C-70CE-4845-A01E-C9337B03B368}
AppName=Claude + sonar
AppVersion={#Version}
AppVerName=Claude + sonar {#Version}
AppPublisher=Gh0st113
AppPublisherURL=https://github.com/Gh0st113/sonar
AppSupportURL=https://github.com/Gh0st113/sonar/issues
AppUpdatesURL=https://github.com/Gh0st113/sonar/releases
VersionInfoVersion={#Version}
DefaultDirName={autopf}\sonar
PrivilegesRequired=lowest
; dialog : la question « pour moi / pour tous » (et /ALLUSERS, /CURRENTUSER en ligne de commande). Elle n'est plus
; posée quand l'application est déjà installée : le mode précédent est repris (UsePreviousPrivileges=yes, défaut).
PrivilegesRequiredOverridesAllowed=dialog
UsePreviousPrivileges=yes
DisableDirPage=no
UsePreviousAppDir=yes
DefaultGroupName=Claude + sonar
DisableProgramGroupPage=yes
DisableReadyPage=no
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=no
OutputDir=sortie
OutputBaseFilename=sonar-setup
UninstallDisplayName=Claude + sonar
UninstallDisplayIcon={app}\sonar.exe
; Icône de l'assistant (même dessin que sonar.exe : windows/icone, « go generate »).
SetupIconFile=..\sonar.ico
; Une mise à jour lancée par sonar.exe : l'ancien sonar.exe a déjà quitté ; s'il tourne encore, on le ferme.
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
fr.DroitsAdmin=Ce dossier demande des droits administrateur, et l'installation a été lancée « pour moi seulement ».%n%nChoisissez un dossier à vous, ou relancez l'installeur et choisissez « pour tous les utilisateurs ».
en.DroitsAdmin=This folder needs administrator rights, and the installation was started "for me only".%n%nChoose a folder of your own, or restart the installer and choose "for all users".
fr.TacheMenu=Créer un dossier « Claude + sonar » dans le menu Démarrer
en.TacheMenu=Create a "Claude + sonar" folder in the Start menu
fr.TacheBureau=Créer une icône « Claude + sonar » sur le Bureau
en.TacheBureau=Create a "Claude + sonar" icon on the desktop
fr.Raccourcis=Raccourcis :
en.Raccourcis=Shortcuts:
fr.Gerer=Gérer Claude + sonar
en.Gerer=Manage Claude + sonar
fr.CommentaireGerer=Version, état de l'extension, réparation et mises à jour
en.CommentaireGerer=Version, extension state, repair and updates
fr.Desinstaller=Désinstaller Claude + sonar
en.Desinstaller=Uninstall Claude + sonar
fr.ClaudeOuvertTitre=Claude est ouvert
en.ClaudeOuvertTitre=Claude is open
fr.ClaudeOuvertTexte=Pour installer l'extension, Claude doit être fermé. Quittez-le complètement (zone de notification > Quitter), puis cliquez sur « Réessayer ».%n%n« Forcer la fermeture » l'arrête tout de suite : un message en cours d'écriture serait perdu.
en.ClaudeOuvertTexte=Claude must be closed to install the extension. Quit it completely (notification area > Quit), then click "Retry".%n%n"Force close" stops it right away: a message being typed would be lost.
fr.Reessayer=Réessayer
en.Reessayer=Retry
fr.ForcerFermeture=Forcer la fermeture
en.ForcerFermeture=Force close
fr.FermetureEchouee=Claude n'a pas pu être fermé. Quittez-le vous-même (zone de notification > Quitter), puis réessayez.
en.FermetureEchouee=Claude could not be closed. Quit it yourself (notification area > Quit), then retry.
fr.ClaudeOuvertAbandon=Claude est encore ouvert : fermez-le, puis relancez l'installation.
en.ClaudeOuvertAbandon=Claude is still open: close it, then run the installation again.
fr.Commentaire=Lance Claude avec l'extension sonar, après vérification des fichiers
en.Commentaire=Starts Claude with the sonar extension, after checking its files

[Messages]
fr.WelcomeLabel2=[name/ver]%n%nClaude + sonar ajoute à Claude Desktop le rythme de vos limites, le cache, la branche et le coût (avec le mod sonar), dans le cercle d'usage et sous « Personnalisation ».%n%nAprès l'installation, quittez complètement Claude (zone de notification > Quitter) puis lancez-le par « Claude + sonar » dans le menu Démarrer. Lancé autrement, Claude ne charge pas l'extension : c'est voulu.
en.WelcomeLabel2=[name/ver]%n%nClaude + sonar adds your limits' pace, the cache, the branch and the cost (with the sonar mod) to Claude Desktop, in the usage circle and below "Customize".%n%nAfter installing, quit Claude completely (notification area > Quit), then start it from "Claude + sonar" in the Start menu. Started any other way, Claude does not load the extension: on purpose.

[Files]
Source: "{#Exe}"; DestDir: "{app}"; DestName: "sonar.exe"; Flags: ignoreversion nocompression
Source: "..\LICENSE-UI-PLUS"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\PROVENANCE.md"; DestDir: "{app}"; Flags: ignoreversion

; Noms d'avant le renommage en « sonar » (0.5.x, « Claude (cercle) ») : même AppId, donc une mise à jour par-dessus
; remplace l'ancienne installation ; ses raccourcis et son exe sont retirés ici. Le plus ancien posait son raccourci
; seul à la racine du menu Démarrer.
[InstallDelete]
Type: filesandordirs; Name: "{autoprograms}\Claude (cercle)"
Type: files; Name: "{autoprograms}\Claude (cercle).lnk"
Type: files; Name: "{autodesktop}\Claude (cercle).lnk"
Type: files; Name: "{app}\cercle.exe"

[Tasks]
Name: "menu"; Description: "{cm:TacheMenu}"; GroupDescription: "{cm:Raccourcis}"
Name: "bureau"; Description: "{cm:TacheBureau}"; GroupDescription: "{cm:Raccourcis}"

[Icons]
; Menu Démarrer : un dossier « Claude + sonar » avec le lanceur, la gestion (version, mises à jour) et la désinstallation.
Name: "{group}\Claude + sonar"; Filename: "{app}\sonar.exe"; Comment: "{cm:Commentaire}"; Tasks: menu
Name: "{group}\{cm:Gerer}"; Filename: "{app}\sonar.exe"; Parameters: "gerer"; Comment: "{cm:CommentaireGerer}"; Tasks: menu
Name: "{group}\{cm:Desinstaller}"; Filename: "{uninstallexe}"; Tasks: menu
Name: "{autodesktop}\Claude + sonar"; Filename: "{app}\sonar.exe"; Comment: "{cm:Commentaire}"; Tasks: bureau

[Run]
; Toujours : copier l'extension dans le profil de Claude (une erreur s'affiche dans une fenêtre).
; runasoriginaluser : même si l'installeur tourne en administrateur, l'extension va dans le profil de l'utilisateur
; et Claude démarre sous son compte.
Filename: "{app}\sonar.exe"; Parameters: "installer --silencieux"; StatusMsg: "{cm:Installation}"; Flags: waituntilterminated runasoriginaluser
; Fin de l'assistant : case « Lancer Claude ».
Filename: "{app}\sonar.exe"; Parameters: "lancer --sans-maj"; Description: "{cm:Lancer}"; Flags: nowait postinstall skipifsilent unchecked runasoriginaluser
; Mise à jour silencieuse demandée par sonar.exe avant un lancement : relancer Claude ensuite.
Filename: "{app}\sonar.exe"; Parameters: "lancer --sans-maj"; Flags: nowait runasoriginaluser; Check: LancerApresMaj

[UninstallRun]
Filename: "{app}\sonar.exe"; Parameters: "retirer --silencieux"; Flags: waituntilterminated; RunOnceId: "RetirerExtension"

[Code]
// Claude Desktop est-il ouvert ? sonar.exe le sait (il distingue Claude Desktop de Claude Code, tous deux claude.exe).
function ClaudeOuvert(Exe: string): Boolean;
var
  Code: Integer;
begin
  Result := Exec(Exe, 'ouvert', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 5);
end;

// Avant d'installer : Claude doit être fermé (sinon l'extension ne peut pas être remplacée). On le dit, et on propose
// « Réessayer » (après l'avoir quitté) ou « Forcer la fermeture ». En silencieux (mise à jour lancée par sonar.exe,
// Claude normalement fermé), personne pour répondre : l'installation s'arrête avec un message.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Exe: string;
  Code, Choix: Integer;
begin
  Result := '';
  ExtractTemporaryFile('sonar.exe');
  Exe := ExpandConstant('{tmp}\sonar.exe');
  while ClaudeOuvert(Exe) do
  begin
    if WizardSilent then
    begin
      Result := CustomMessage('ClaudeOuvertAbandon');
      exit;
    end;
    Choix := TaskDialogMsgBox(CustomMessage('ClaudeOuvertTitre'), CustomMessage('ClaudeOuvertTexte'), mbConfirmation,
      MB_YESNOCANCEL, [CustomMessage('Reessayer'), CustomMessage('ForcerFermeture')], 0);
    if Choix = IDNO then
    begin
      if not (Exec(Exe, 'fermer', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0)) then
        MsgBox(CustomMessage('FermetureEchouee'), mbError, MB_OK);
    end
    else if Choix <> IDYES then
    begin
      Result := CustomMessage('ClaudeOuvertAbandon');
      exit;
    end;
  end;
end;

function LancerApresMaj: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:LANCER|non}') = 'oui');
end;

// Peut-on écrire dans ce dossier ? S'il n'existe pas encore, on essaie de le créer (puis on retire ce qu'on a créé) :
// un utilisateur peut créer C:\sonar même sans pouvoir écrire un fichier à la racine de C:\.
function DossierInscriptible(Dossier: string): Boolean;
var
  Existant, Test: string;
begin
  Dossier := RemoveBackslashUnlessRoot(Dossier);
  Existant := Dossier;
  while (not DirExists(Existant)) and (ExtractFileDir(Existant) <> Existant) and (Existant <> '') do
    Existant := ExtractFileDir(Existant);
  if not ForceDirectories(Dossier) then
  begin
    Result := False;
    exit;
  end;
  Test := AddBackslash(Dossier) + 'sonar-test-ecriture.tmp';
  Result := SaveStringToFile(Test, 'x', False);
  DeleteFile(Test);
  // Retirer les dossiers créés pour le test, du plus profond jusqu'au premier qui existait.
  while (CompareText(Dossier, Existant) <> 0) and (ExtractFileDir(Dossier) <> Dossier) do
  begin
    RemoveDir(Dossier);
    Dossier := ExtractFileDir(Dossier);
  end;
end;

// Mode « pour moi seulement » et dossier protégé : refuser ce dossier. Boîte supprimable (/SUPPRESSMSGBOXES) ; en
// installation silencieuse, False arrête l'installeur au lieu d'attendre un clic.
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = wpSelectDir) and (not IsAdminInstallMode) and (not DossierInscriptible(WizardDirValue)) then
  begin
    Result := False;
    SuppressibleMsgBox(CustomMessage('DroitsAdmin'), mbError, MB_OK, IDOK);
  end;
end;
