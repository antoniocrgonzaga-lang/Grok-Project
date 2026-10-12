@echo off
setlocal
chcp 65001 >nul
title NEON HYPERDRIVE
cd /d "%~dp0"

echo.
echo  ==============================
echo     N E O N   H Y P E R D R I V E
echo  ==============================
echo.

where node >nul 2>nul
if %errorlevel%==0 goto :usar_node

where python >nul 2>nul
if %errorlevel%==0 goto :usar_python

where py >nul 2>nul
if %errorlevel%==0 goto :usar_py

echo  Nenhum servidor disponivel: instale o Node.js (https://nodejs.org)
echo  ou o Python (https://www.python.org) e execute este arquivo de novo.
echo.
pause
exit /b 1

:usar_node
echo  O jogo vai abrir no navegador. Mantenha esta janela aberta enquanto joga.
echo  Para encerrar, feche esta janela ou pressione Ctrl+C.
echo.
node server.mjs --open
goto :fim

:usar_python
echo  O jogo vai abrir no navegador em http://localhost:5173
echo  Mantenha esta janela aberta enquanto joga. Para encerrar, feche-a ou pressione Ctrl+C.
echo.
start "" "http://localhost:5173"
python -m http.server 5173
goto :fim

:usar_py
echo  O jogo vai abrir no navegador em http://localhost:5173
echo  Mantenha esta janela aberta enquanto joga. Para encerrar, feche-a ou pressione Ctrl+C.
echo.
start "" "http://localhost:5173"
py -m http.server 5173
goto :fim

:fim
if errorlevel 1 (
  echo.
  echo  O servidor foi encerrado com erro. Veja a mensagem acima.
  pause
)
endlocal
