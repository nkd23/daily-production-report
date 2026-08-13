@echo off
REM Double-click file nay de chay thu app tren may (backend + frontend).
REM Dong 2 cua so terminal moi bung ra la dang tat = app dang ngung chay.

start "DUY1 - Backend" powershell -NoExit -ExecutionPolicy Bypass -Command "cd '%~dp0backend'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"

start "DUY1 - Frontend" powershell -NoExit -ExecutionPolicy Bypass -Command "cd '%~dp0frontend'; npm run dev"

echo.
echo Da mo 2 cua so: Backend va Frontend.
echo Doi khoang 10-15 giay roi mo trinh duyet vao: http://localhost:3000
echo.
pause
