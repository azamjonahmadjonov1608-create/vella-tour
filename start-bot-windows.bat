@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Vella Tour bot
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js topilmadi - ornatilmoqda, 1-2 daqiqa kuting...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo Tayyor. Shu oynani yoping va start-bot-windows.bat ni qayta oching.
  pause
  exit /b
)
if not exist .env (
  copy .env.example .env >nul
  echo .env fayli yaratildi. Uni Bloknotda ochib TELEGRAM_BOT_TOKEN ni yozing, keyin qayta ishga tushiring.
  notepad .env
  pause
  exit /b
)
echo ==========================================
echo  Vella Tour Telegram bot ishlayapti
echo  BU OYNANI YOPMANG. Kompyuter uxlasa bot ham toxtaydi.
echo ==========================================
:loop
node run-bot.mjs
echo Bot toxtadi, 5 soniyadan keyin qayta ishga tushadi...
timeout /t 5 >nul
goto loop
