@echo off
chcp 65001 >nul
title Agente UI con OpenRouter + Stitch MCP
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\.package-lock.json" (
  echo Instalando dependencias...
  call npm install
)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Se creo el archivo .env: pon tus claves de OpenRouter y Stitch y vuelve a ejecutar.
  notepad ".env"
  pause
  exit /b 0
)
node agente.js
echo.
pause
