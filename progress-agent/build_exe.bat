@echo off
rem Builds dist\DayTienDo.exe (one file, no console window) from push_progress.py.
rem Needs Python 3.11+ on the build machine only - the office PC just runs the .exe.
cd /d "%~dp0"
python -m venv .build-venv || exit /b 1
call .build-venv\Scripts\activate.bat
python -m pip install --quiet openpyxl==3.1.5 pyinstaller==6.11.1 || exit /b 1
pyinstaller --onefile --noconsole --name DayTienDo --clean push_progress.py || exit /b 1
echo.
echo Xong: %~dp0dist\DayTienDo.exe
