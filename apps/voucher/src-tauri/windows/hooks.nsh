; Voucher's installer hooks (Tauri NSIS). The installer runs as an
; administrator, so it can register the guard service and start Voucher in
; the tray for everyone who signs in.

!macro NSIS_HOOK_POSTINSTALL
  ; The guard: a service running as SYSTEM, started at boot, restarted if it dies.
  nsExec::ExecToLog '"$INSTDIR\voucher-guard.exe" install'
  ; Voucher in the tray at every sign-in.
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Voucher" '"$INSTDIR\Voucher.exe" --tray'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Stops the guard and clears the browser policy it wrote. While the guard
  ; is gone the Ledger sees no check-ins, so its absence shows as a Gap.
  nsExec::ExecToLog '"$INSTDIR\voucher-guard.exe" uninstall'
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Voucher"
!macroend
