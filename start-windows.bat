@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Vella Tour server
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js topilmadi - ornatilmoqda, 1-2 daqiqa kuting...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Tayyor. Shu oynani yoping va start-windows.bat ni qayta oching.
  pause
  exit /b
)
echo ==========================================================
echo  Vella Tour ishlayapti: Telegram bot + sayt
echo  Sayt: http://localhost:3000    Menejer: http://localhost:3000/#menejer
echo  BU OYNANI YOPMANG. Kompyuter uxlab qolsa bot ham toxtaydi.
echo ==========================================================
:loop
node server.mjs
echo Server toxtadi, 5 soniyadan keyin qayta ishga tushadi...
timeout /t 5 >nul
goto loop
