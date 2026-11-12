#!/bin/bash
# Vella Tour — serverga bir buyruq bilan o'rnatish (Ubuntu 22.04 / 24.04, Oracle Cloud ham).
#   unzip vella-server.zip && sudo bash vella-server/install.sh
set -e
[ "$(id -u)" = 0 ] || { echo "sudo bilan ishga tushiring:  sudo bash $0"; exit 1; }
SRC="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/vella
echo "== 1/6 Kerakli dasturlar o'rnatilmoqda (2-4 daqiqa)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y curl unzip ca-certificates python3 python3-pil iptables-persistent >/dev/null 2>&1 || apt-get install -y curl unzip ca-certificates python3 python3-pil >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
fi
echo "   Node $(node -v)"

echo "== 2/6 Fayllar $APP ga ko'chirilmoqda..."
mkdir -p "$APP"
[ -f "$APP/.env" ] && cp "$APP/.env" /tmp/vella.env.bak
cp -r "$SRC"/. "$APP"/
[ -f /tmp/vella.env.bak ] && cp /tmp/vella.env.bak "$APP/.env"
mkdir -p "$APP/data" "$APP/public/hotels"
cd "$APP"
[ -f .env ] || cp .env.example .env
chmod 600 .env

echo "== 3/6 Sozlamalar (.env)"
ask() { # ask KEY "Savol"
  local cur; cur=$(grep "^$1=" .env | cut -d= -f2-)
  if [ -z "$cur" ] && [ -t 0 ]; then read -rp "   $2: " v; [ -n "$v" ] && sed -i "s|^$1=.*|$1=${v//|/\\|}|" .env; fi
}
ask TELEGRAM_BOT_TOKEN "Telegram bot tokeni (@BotFather; bo'sh qoldirsangiz bot ishlamaydi)"
ask TELEGRAM_CHAT_ID "Saytdagi arizalar keladigan Telegram ID (o'zingizniki; @userinfobot dan bilasiz)"
ask MANAGER_KEY "Menejer bo'limi uchun parol o'ylab toping"
grep -q '^ADMIN_KEY=.\+' .env || sed -i "s|^ADMIN_KEY=.*|ADMIN_KEY=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')|" .env

echo "== 4/6 Sayt va Telegram bot xizmati (24/7, o'chsa o'zi qayta yonadi)..."
cat > /etc/systemd/system/vella.service <<UNIT
[Unit]
Description=Vella Tour sayt + Telegram bot
After=network-online.target
Wants=network-online.target
[Service]
WorkingDirectory=$APP
ExecStart=$(command -v node) server.mjs
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/vella-snapshot.service <<UNIT
[Unit]
Description=Vella Tour kunlik narxlar bazasi
[Service]
Type=oneshot
WorkingDirectory=$APP
ExecStart=/bin/bash -c '$(command -v node) snapshot.mjs && python3 photopack.py public/packages.json public/photos.json 350 && python3 hotelpack.py public/packages.json public/hotels 300'
UNIT
cat > /etc/systemd/system/vella-snapshot.timer <<UNIT
[Unit]
Description=Har kuni 00:00 (Toshkent) da narxlarni yangilash
[Timer]
OnCalendar=*-*-* 19:00:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now vella.service vella-snapshot.timer >/dev/null

echo "== 5/6 80-port (sayt) ochilmoqda..."
# Oracle Cloud Ubuntu obrazlarida iptables 80-portni yopib qo'ygan bo'ladi
if iptables -L INPUT -n 2>/dev/null | grep -q REJECT; then
  iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
  command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
fi
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp >/dev/null; fi

echo "== 6/6 Birinchi narxlar bazasi orqa fonda yig'ilmoqda (15-25 daqiqa)..."
[ -f public/packages.json ] || systemctl start --no-block vella-snapshot.service

sleep 4
IP=$(curl -s -4 -m 10 https://api.ipify.org || hostname -I | awk '{print $1}')
if systemctl is-active --quiet vella.service; then
  echo ""
  echo "✅ TAYYOR!"
  echo "   Sayt:            http://$IP   (narxlar 15-25 daqiqadan keyin to'ladi)"
  echo "   Menejer bo'limi: http://$IP/#menejer"
  echo "   Telegram bot ishlayapti. Narxlar har kuni tunda 00:00 da yangilanadi."
  echo "   Sozlamalar: sudo nano $APP/.env  →  sudo systemctl restart vella"
  echo "   Holat: systemctl status vella   |   Loglar: journalctl -u vella -f"
  echo ""
  echo "   ⚠️ Sayt ochilmasa: Oracle Cloud'da 80-port (Ingress rule) ochilganini tekshiring."
else
  echo "❌ Xizmat ishga tushmadi. Quyidagi xatoni Claude'ga yuboring:"
  journalctl -u vella -n 30 --no-pager
fi
