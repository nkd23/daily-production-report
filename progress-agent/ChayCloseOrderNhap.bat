@echo off
rem Double-click: refresh the Close order DRAFT (Finishing only, not published to managers), then open the log.
cd /d "%~dp0"
echo Dang cap nhat ban nhap Close order (chi Finishing xem), vui long cho khoang 1-2 phut...
start /wait "" "%~dp0DayTienDo.exe" --close-order --nhap
notepad "%~dp0DayTienDo.log"
