#!/bin/bash
# Vella Tour — serverga bir buyruq bilan o'rnatish (Ubuntu 22.04 / 24.04).
#   unzip vella-tour-server.zip && bash vella-server/install.sh
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/vella
echo "== 1/5 Kerakli dasturlar o'rnatilmoqda..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y curl unzip ca-certificates python3 python3-pil >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
fi
echo "   Node $(node -v)"

echo "== 2/5 Fayllar $APP ga ko'chirilmoqda..."
mkdir -p "$APP"
cp -r "$SRC"/. "$APP"/
mkdir -p "$APP/data" "$APP/public/hotels"
cd "$APP"
touch .env
grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=80/' .env || echo "PORT=80" >> .env
chmod 600 .env

echo "== 3/5 Sayt va Telegram bot xizmati (24/7, o'chsa o'zi qayta yonadi)..."
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

echo "== 4/5 Har kuni ertalab narxlar bazasini yangilash..."
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
Description=Har kuni 07:40 (Toshkent) da narxlarni yangilash
[Timer]
OnCalendar=*-*-* 02:40:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now vella.service vella-snapshot.timer >/dev/null
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp >/dev/null; fi

echo "== 5/5 Tekshirish..."
sleep 4
IP=$(curl -s -4 https://api.ipify.org || hostname -I | awk '{print $1}')
if systemctl is-active --quiet vella.service; then
  echo ""
  echo "✅ TAYYOR!"
  echo "   Sayt:            http://$IP"
  echo "   Menejer bo'limi: http://$IP/#menejer"
  echo "   Telegram bot ishlayapti. Narxlar har kuni 07:40 da yangilanadi."
  echo "   Holatni ko'rish: systemctl status vella   |   Loglar: journalctl -u vella -f"
else
  echo "❌ Xizmat ishga tushmadi. Quyidagi xatoni Claude'ga yuboring:"
  journalctl -u vella -n 30 --no-pager
fi
