#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 scripts/generate-icon.py
mkdir -p build/icon.iconset
for pixels in 16 32 128 256 512; do
  sips -z "$pixels" "$pixels" build/icon.png --out "build/icon.iconset/icon_${pixels}x${pixels}.png" >/dev/null
  retina=$((pixels * 2))
  sips -z "$retina" "$retina" build/icon.png --out "build/icon.iconset/icon_${pixels}x${pixels}@2x.png" >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns
