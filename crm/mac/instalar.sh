#!/bin/zsh
# Compila la app de Mac del CRM y la instala en /Applications/CRM NomoTax.app
set -e
cd "${0:A:h}"
A="/Applications/CRM NomoTax.app"
rm -rf "$A"; mkdir -p "$A/Contents/MacOS" "$A/Contents/Resources"
swiftc -O main.swift -o "$A/Contents/MacOS/CRM NomoTax" -framework Cocoa -framework WebKit
cp Info.plist "$A/Contents/Info.plist"
I="${TMPDIR:-/tmp}/crm-icono.iconset"; rm -rf "$I"; mkdir "$I"
for s in 16 32 128 256 512; do
  sips -z $s $s icono-1024.png --out "$I/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) icono-1024.png --out "$I/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$I" -o "$A/Contents/Resources/icono.icns"
codesign --force --deep -s - "$A"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$A"
echo "OK → $A"
