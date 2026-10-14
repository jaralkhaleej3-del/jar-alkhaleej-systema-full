@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Jar Al Khaleej Unified System
start "" "http://localhost:8000"
where py >nul 2>&1
if %errorlevel%==0 (
  py -m http.server 8000
) else (
  python -m http.server 8000
)
pause
