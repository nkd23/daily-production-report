@echo off
rem Double-click: send the Close order numbers now (no need to wait for Thursday 15:00), then open the log.
cd /d "%~dp0"
echo Dang doc bang tien do (Close order) va gui len web, vui long cho khoang 1-2 phut...
start /wait "" "%~dp0DayTienDo.exe" --close-order
notepad "%~dp0DayTienDo.log"
