@echo off
rem Double-click: creates the 9:00 daily and Thursday 15:00 schedules (runs cai_lich.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cai_lich.ps1"
pause
