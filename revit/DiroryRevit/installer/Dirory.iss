; Dirory for Revit - one Windows installer for Revit 2024-2027.
;
; Built by scripts/build-revit-installer.ps1, which first builds each year with
; scripts/build-revit.ps1 into dist\revit\<year>\ and then runs
;   ISCC /DAppVersion=x.y.z /DDist=<dist\revit> /DOutDir=<dist\revit> Dirory.iss
;
; Installs for the current Windows user only (no admin prompt), into the same
; place Install-Dirory.cmd has always used, so it upgrades a .zip install:
;   %APPDATA%\Autodesk\Revit\Addins\<year>\Dirory.addin
;   %APPDATA%\Autodesk\Revit\Addins\<year>\Dirory\DiroryRevit.dll, ui\, icons
; Revit 2024 gets the .NET Framework 4.8 build, 2025-2026 the .NET 8 build and
; 2027 the .NET 10 build. Only the Revit years found on this PC are offered;
; if none is found, all four are installed so Dirory is ready when Revit is.

#ifndef AppVersion
  #error Pass /DAppVersion=x.y.z (scripts/build-revit-installer.ps1 does).
#endif
#ifndef Dist
  #define Dist "..\..\..\dist\revit"
#endif
#ifndef OutDir
  #define OutDir Dist
#endif

[Setup]
; Never change AppId: Windows uses it to find the installed copy to upgrade.
AppId={{6B1F4E2A-3C7D-4A58-9E0B-D1A2F3C4B5E6}
AppName=Dirory for Revit
AppVersion={#AppVersion}
AppVerName=Dirory for Revit {#AppVersion}
AppPublisher=Dirory
AppPublisherURL=https://dirory.com
AppSupportURL=https://dirory.com/download
AppUpdatesURL=https://dirory.com/download
VersionInfoVersion={#AppVersion}
VersionInfoDescription=Dirory for Revit installer
VersionInfoCopyright=Dirory
PrivilegesRequired=lowest
; {app} only holds the uninstaller and its icon; the add-in goes to Revit's
; Addins folders below. Kept apart from %LOCALAPPDATA%\Dirory, where the
; add-in keeps sign-in and settings that must survive an uninstall.
DefaultDirName={localappdata}\Programs\Dirory for Revit
DisableDirPage=yes
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Revit is checked for by name below, with a clearer message.
CloseApplications=no
OutputDir={#OutDir}
OutputBaseFilename=Dirory-Revit-Setup-{#AppVersion}
SetupIconFile=dirory.ico
UninstallDisplayIcon={app}\dirory.ico
UninstallDisplayName=Dirory for Revit
WizardStyle=modern
WizardImageFile=wizard-large-100.bmp,wizard-large-200.bmp
WizardSmallImageFile=wizard-small-100.bmp,wizard-small-200.bmp
Compression=lzma2/max
SolidCompression=yes

[Messages]
WelcomeLabel2=This installs Dirory for Revit [ver]: the Indonesian product and material library, quantity takeoff and RAB, inside Revit.%n%nClose Revit before you continue.
SelectComponentsLabel2=Dirory will be added to the Revit versions ticked below (the ones found on this PC).
FinishedLabel=Dirory for Revit is installed.%n%nStart Revit, open the Dirory tab and click Library. If Revit says Dirory is not signed by a known publisher, choose Always Load.%n%nYour sign-in and settings are kept between versions.

[Types]
Name: "revit"; Description: "Dirory for Revit"; Flags: iscustom

[Components]
Name: "r2024"; Description: "Revit 2024"; Types: revit; Check: OfferYear('2024')
Name: "r2025"; Description: "Revit 2025"; Types: revit; Check: OfferYear('2025')
Name: "r2026"; Description: "Revit 2026"; Types: revit; Check: OfferYear('2026')
Name: "r2027"; Description: "Revit 2027"; Types: revit; Check: OfferYear('2027')

[InstallDelete]
; Replace the add-in folder whole (as Install-Dirory.cmd does), so a file an
; older version had cannot linger.
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2024\Dirory"; Components: r2024
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2025\Dirory"; Components: r2025
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2026\Dirory"; Components: r2026
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2027\Dirory"; Components: r2027

[Files]
Source: "dirory.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Dist}\2024\Dirory.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024"; Components: r2024; Flags: ignoreversion
Source: "{#Dist}\2024\Dirory\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024\Dirory"; Components: r2024; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Dist}\2025\Dirory.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025"; Components: r2025; Flags: ignoreversion
Source: "{#Dist}\2025\Dirory\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\Dirory"; Components: r2025; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Dist}\2026\Dirory.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026"; Components: r2026; Flags: ignoreversion
Source: "{#Dist}\2026\Dirory\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\Dirory"; Components: r2026; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Dist}\2027\Dirory.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2027"; Components: r2027; Flags: ignoreversion
Source: "{#Dist}\2027\Dirory\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2027\Dirory"; Components: r2027; Flags: ignoreversion recursesubdirs createallsubdirs

[UninstallDelete]
; Anything Dirory wrote into its own add-in folder after install.
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2024\Dirory"; Components: r2024
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2025\Dirory"; Components: r2025
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2026\Dirory"; Components: r2026
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2027\Dirory"; Components: r2027

[Code]
function RevitInstalled(Year: String): Boolean;
begin
  Result := FileExists(ExpandConstant('{commonpf64}\Autodesk\Revit ' + Year + '\Revit.exe'));
end;

function AnyRevitInstalled(): Boolean;
begin
  Result := RevitInstalled('2024') or RevitInstalled('2025') or
            RevitInstalled('2026') or RevitInstalled('2027');
end;

// Offer the years found on this PC; with none found, offer all of them.
function OfferYear(Year: String): Boolean;
begin
  Result := RevitInstalled(Year) or not AnyRevitInstalled();
end;

function RevitRunning(): Boolean;
var
  Locator, Service, Procs: Variant;
begin
  Result := False;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Service := Locator.ConnectServer('.', 'root\CIMV2');
    Procs := Service.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE Name = ''Revit.exe''');
    Result := Procs.Count > 0;
  except
    // No WMI: carry on; a locked DLL still makes Setup stop with Retry.
  end;
end;

// Revit holds DiroryRevit.dll open while it runs, so ask for it to be closed.
function RevitClosed(Action: String): Boolean;
begin
  Result := True;
  while RevitRunning() do
    if SuppressibleMsgBox('Revit is running. Save your work, close every Revit window, then click Retry to ' + Action + ' Dirory.',
         mbError, MB_RETRYCANCEL, IDCANCEL) = IDCANCEL then
    begin
      Result := False;
      Exit;
    end;
end;

function InitializeSetup(): Boolean;
begin
  Result := RevitClosed('install');
  if Result and not AnyRevitInstalled() then
    Result := SuppressibleMsgBox('No Revit 2024, 2025, 2026 or 2027 was found on this PC.' + #13#10#13#10 +
      'Install Dirory for all of them anyway, so it is ready when Revit is installed?',
      mbConfirmation, MB_YESNO, IDYES) = IDYES;
end;

function InitializeUninstall(): Boolean;
begin
  Result := RevitClosed('remove');
end;
