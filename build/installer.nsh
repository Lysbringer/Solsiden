!include WordFunc.nsh
!ifndef BUILD_UNINSTALLER
Var existingVersion
Var existingUninstaller
Var existingUninstallScope
!endif

!macro checkInstalledVersion ROOT SCOPE
  ReadRegStr $0 ${ROOT} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $1 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $1 != ""
  ${AndIf} $0 != ""
    ${VersionCompare} "${VERSION}" "$1" $2
    ${If} $2 != 1
      StrCpy $existingVersion $1
      StrCpy $existingUninstaller "$0\${UNINSTALL_FILENAME}"
      StrCpy $existingUninstallScope "${SCOPE}"
      IfSilent 0 +3
        SetErrorLevel 1
        Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro checkInstalledVersion HKCU /currentuser
  !insertmacro checkInstalledVersion HKLM /allusers
!macroend

!macro customWelcomePage
  Page custom ExistingSolsidePage ExistingSolsideLeave
  Var uninstallChoice
  Function ExistingSolsidePage
    ${If} $existingVersion == ""
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Solside is already installed" "Installed version: $existingVersion"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 28u "Choose how to continue."
    Pop $0
    ${NSD_CreateRadioButton} 0 35u 100% 14u "Open the uninstall wizard"
    Pop $uninstallChoice
    ${NSD_CreateLabel} 12u 53u 95% 28u "Choose which articles and API settings to keep before removing Solside."
    Pop $0
    ${NSD_CreateRadioButton} 0 90u 100% 14u "Exit setup"
    Pop $0
    ${NSD_Check} $0
    nsDialogs::Show
  FunctionEnd
  Function ExistingSolsideLeave
    ${NSD_GetState} $uninstallChoice $0
    ${If} $0 == ${BST_CHECKED}
      ${If} ${FileExists} "$existingUninstaller"
        ; Exec uses $OUTDIR as its working directory.
        SetOutPath "$TEMP"
        ClearErrors
        Exec '"$existingUninstaller" $existingUninstallScope'
        IfErrors launchFailed
        Quit
      ${EndIf}
      launchFailed:
      MessageBox MB_OK|MB_ICONEXCLAMATION "The uninstall wizard could not be opened. Use Windows Settings to uninstall Solside."
      Abort
    ${EndIf}
    Quit
  FunctionEnd
  Function HideWelcomeBackButton
    GetDlgItem $0 $HWNDPARENT 3
    ShowWindow $0 ${SW_HIDE}
  FunctionEnd
  Function RestoreWelcomeBackButton
    GetDlgItem $0 $HWNDPARENT 3
    ShowWindow $0 ${SW_SHOW}
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HideWelcomeBackButton
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE RestoreWelcomeBackButton
  !define MUI_WELCOMEPAGE_TITLE "Solside installation guide"
  !define MUI_WELCOMEPAGE_TEXT "Set up Solside on your computer. Click Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  Page custom SolsideFinish SolsideFinishLeave
  Var solsideDesktop
  Var solsideStart
  Var solsideLaunch

  Function SolsideFinish
    !insertmacro MUI_HEADER_TEXT "Solside is ready" "Choose your shortcuts, then click Finish."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 24u "Solside has been installed successfully."
    Pop $0
    ${NSD_CreateCheckbox} 0 35u 100% 14u "Create a desktop shortcut"
    Pop $solsideDesktop
    ${NSD_Check} $solsideDesktop
    ${NSD_CreateCheckbox} 0 58u 100% 14u "Create a Start menu shortcut"
    Pop $solsideStart
    ${NSD_Check} $solsideStart
    ${NSD_CreateCheckbox} 0 81u 100% 14u "Launch Solside"
    Pop $solsideLaunch
    ${NSD_Check} $solsideLaunch
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Finish"
    nsDialogs::Show
  FunctionEnd

  Function SolsideFinishLeave
    ${NSD_GetState} $solsideDesktop $0
    ${If} $0 == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\Solside.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      WinShell::SetLnkAUMI "$DESKTOP\Solside.lnk" "${APP_ID}"
    ${EndIf}
    ${NSD_GetState} $solsideStart $0
    ${If} $0 == ${BST_CHECKED}
      CreateShortCut "$SMPROGRAMS\Solside.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      WinShell::SetLnkAUMI "$SMPROGRAMS\Solside.lnk" "${APP_ID}"
    ${EndIf}
    ${NSD_GetState} $solsideLaunch $0
    ${If} $0 == ${BST_CHECKED}
      ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" ""
    ${EndIf}
  FunctionEnd
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall Solside"
  !define MUI_WELCOMEPAGE_TEXT "Choose what to keep before removing Solside."
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.SolsideOptions un.SolsideOptionsLeave
  Var uninstallMode
  Var keepAllOption
  Var removeAllOption
  Var keepKeysOption

  Function un.SolsideOptions
    !insertmacro MUI_HEADER_TEXT "Choose what to keep" "All options remove the app, shortcuts and updater cache."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateRadioButton} 0 0 100% 14u "Uninstall app"
    Pop $keepAllOption
    ${NSD_Check} $keepAllOption
    ${NSD_CreateLabel} 12u 17u 95% 24u "Keep saved articles and API settings for reinstallation."
    Pop $0
    ${NSD_CreateRadioButton} 0 48u 100% 14u "Remove everything"
    Pop $removeAllOption
    ${NSD_CreateLabel} 12u 65u 95% 24u "Delete saved articles, API keys and all other app data."
    Pop $0
    ${NSD_CreateRadioButton} 0 96u 100% 14u "Remove everything except API keys"
    Pop $keepKeysOption
    ${NSD_CreateLabel} 12u 113u 95% 24u "Delete articles and other app data. Keep API settings for reinstallation."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function un.SolsideOptionsLeave
    StrCpy $uninstallMode "keep"
    ${NSD_GetState} $removeAllOption $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $uninstallMode "remove"
    ${EndIf}
    ${NSD_GetState} $keepKeysOption $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $uninstallMode "keys"
    ${EndIf}
    ${If} $uninstallMode != "keep"
      MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Permanently delete all saved Solside articles and local backups for this Windows user?" IDYES confirmed
      Abort
      confirmed:
    ${EndIf}
  FunctionEnd
!macroend

!macro customUninstallPage
  !define MUI_FINISHPAGE_TITLE "Solside has been removed"
  !define MUI_FINISHPAGE_TEXT "Your selected data preferences have been applied."
  !insertmacro MUI_UNPAGE_FINISH
!macroend

; Only fixed application directories are passed to this macro.
; Keep encrypted credentials in place to avoid a delete-and-restore failure.
!macro cleanSolsideProfile DIRECTORY
  ${If} $uninstallMode == "remove"
    RMDir /r "${DIRECTORY}"
  ${ElseIf} $uninstallMode == "keys"
    FindFirst $R0 $R1 "${DIRECTORY}\*"
    ${DoWhile} $R1 != ""
      ${If} $R1 != "."
      ${AndIf} $R1 != ".."
      ${AndIf} $R1 != "settings.json"
        ${If} ${FileExists} "${DIRECTORY}\$R1\*"
          RMDir /r "${DIRECTORY}\$R1"
        ${Else}
          Delete "${DIRECTORY}\$R1"
        ${EndIf}
      ${EndIf}
      FindNext $R0 $R1
    ${Loop}
    FindClose $R0
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    Delete "$DESKTOP\Solside.lnk"
    Delete "$SMPROGRAMS\Solside.lnk"
    SetShellVarContext current
    RMDir /r "$LOCALAPPDATA\solside-updater"
    RMDir /r "$LOCALAPPDATA\bokmal-desk-updater"
    !insertmacro cleanSolsideProfile "$APPDATA\Solside"
    !insertmacro cleanSolsideProfile "$APPDATA\bokmal-desk"
    ${If} ${FileExists} "$APPDATA\Solside\projects.sqlite"
    ${AndIf} $uninstallMode != "keep"
    ${AndIf} $uninstallMode != ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Some article data could not be removed. Close all Solside windows and try again."
      Abort
    ${EndIf}
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend
