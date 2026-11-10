@echo off
rem Double-click: creates the 9:30 daily schedule (runs cai_lich_9h30.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cai_lich_9h30.ps1"
pause
