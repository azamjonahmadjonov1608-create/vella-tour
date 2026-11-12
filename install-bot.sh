#!/bin/bash
# Vella Tour Telegram botini Linux serverga o'rnatish (Ubuntu). Bot 24/7 ishlaydi, o'chsa o'zi qayta yonadi.
#   bash install-bot.sh
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"; APP=/opt/vella-bot
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null && apt-get install -y curl ca-certificates >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null && apt-get install -y nodejs >/dev/null
fi
mkdir -p "$APP" && cp -r "$SRC"/. "$APP"/ && mkdir -p "$APP/data" && cd "$APP"
[ -f .env ] || cp .env.example .env
chmod 600 .env
if ! grep -q '^TELEGRAM_BOT_TOKEN=.\+' .env; then read -rp "Bot tokenini kiriting (@BotFather): " T; sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$T|" .env; fi
cat > /etc/systemd/system/vella-bot.service <<UNIT
[Unit]
Description=Vella Tour Telegram bot
After=network-online.target
Wants=network-online.target
[Service]
WorkingDirectory=$APP
ExecStart=$(command -v node) run-bot.mjs
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now vella-bot.service >/dev/null
sleep 3
systemctl is-active --quiet vella-bot && echo "✅ Bot ishlayapti. Loglar: journalctl -u vella-bot -f" || journalctl -u vella-bot -n 30 --no-pager
