; ============================================================
;  VideoToNotes — Inno Setup Script
;  Produces: VideoToNotes-Setup.exe  (professional installer)
; ============================================================

#define AppName      "VideoToNotes"
#define AppVersion   "1.0.0"
#define AppPublisher "VideoToNotes.ai"
#define AppURL       "https://videotonotes.ai"
#define AppExeName   "VideoToNotes.exe"
#define AppDesc      "AI-Powered YouTube Summarizer & Chat"

[Setup]
; Basic identity
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppDesc}

; Install location
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes

; Output
OutputDir=installer_output
OutputBaseFilename=VideoToNotes-Setup
SetupIconFile=static\favicon.ico
Compression=lzma2/ultra64
SolidCompression=yes
CompressionThreads=auto

; Appearance
WizardStyle=modern
WizardSizePercent=110
DisableWelcomePage=no
DisableDirPage=no
DisableReadyPage=no

; Permissions — allows install to Program Files
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; Uninstall
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
CreateUninstallRegKey=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";   Description: "Create a &Desktop shortcut";    GroupDescription: "Additional shortcuts:"; Flags: checked
Name: "startmenuicon"; Description: "Create a &Start Menu shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checked

[Files]
; Main application files from PyInstaller dist output
Source: "dist\VideoToNotes\VideoToNotes.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\VideoToNotes\_internal\*";      DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\VideoToNotes\static\*";         DestDir: "{app}\static";    Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; .env config (optional, user can edit after install)
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; Desktop shortcut
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; \
      Comment: "{#AppDesc}"; \
      Tasks: desktopicon

; Start Menu shortcut
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; \
      Comment: "{#AppDesc}"; \
      Tasks: startmenuicon

; Uninstall shortcut in Start Menu
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"; \
      Tasks: startmenuicon

[Run]
; Launch app after install (optional checkbox)
Filename: "{app}\{#AppExeName}"; \
          Description: "Launch {#AppName} now"; \
          Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up the opencode folder downloaded at runtime
Type: filesandordirs; Name: "{app}\opencode"

[Messages]
WelcomeLabel1=Welcome to [name] Setup
WelcomeLabel2=This will install [name/ver] on your computer.%n%nVideoToNotes is an AI-powered YouTube video summarizer and Q&A tool. It uses OpenCode AI to generate summaries and lets you chat with any YouTube video.%n%nClick Next to continue.
FinishedLabel=Setup has finished installing [name] on your computer.%n%nThe application has been added to your Start Menu and Desktop.%n%nOn first launch, VideoToNotes will automatically download the OpenCode AI engine — please ensure you have an internet connection.
