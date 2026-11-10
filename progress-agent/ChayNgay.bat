@echo off
rem Double-click: send the trackers to the web now (no need to wait for 9:30), then open the log.
cd /d "%~dp0"
echo Dang doc bang tien do va gui len web, vui long cho khoang 1 phut...
start /wait "" "%~dp0DayTienDo.exe"
notepad "%~dp0DayTienDo.log"
