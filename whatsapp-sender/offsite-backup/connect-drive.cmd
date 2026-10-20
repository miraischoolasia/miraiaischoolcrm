@echo off
rem Double-click: connects the server's backup to your Google Drive (runs connect-drive.ps1 next to this file).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0connect-drive.ps1"
