@echo off
REM Double-click this file to start the report app (backend + frontend).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-lan.ps1"
echo.
echo ============================================================
echo  Da mo xong. Xem dia chi "Frontend: http://..." o tren de
echo  vao web (tren May nay dung http://localhost:3000).
echo  Cua so nay co the dong lai, KHONG dong 2 cua so PowerShell
echo  moi vua mo (do la backend/frontend dang chay).
echo ============================================================
pause
