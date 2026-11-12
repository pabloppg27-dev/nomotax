#!/bin/zsh
# Deja la copia automática funcionando siempre en este Mac (se arranca sola al iniciar sesión).
# Uso: npm run sincronizar:instalar      ·  Para quitarla: npm run sincronizar:quitar
set -e
APP="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/io.nomotax.copia-clientes.plist"
NODE="$(command -v node)"
if [[ "$1" == "--quitar" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Copia automática desactivada."
  exit 0
fi
if [[ ! -s "$APP/scripts/sincronizar.env" ]] || ! grep -q '^SUPABASE_SECRET_KEY=sb_' "$APP/scripts/sincronizar.env"; then
  echo "Primero crea scripts/sincronizar.env con la clave secreta (mira scripts/sincronizar.env.example)."
  exit 1
fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.nomotax.copia-clientes</string>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--env-file=scripts/sincronizar.env</string>
    <string>scripts/sincronizar.ts</string>
    <string>--vigilar</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/nomotax-copia-clientes.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/nomotax-copia-clientes.log</string>
</dict>
</plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Copia automática activada. Registro: ~/Library/Logs/nomotax-copia-clientes.log"
