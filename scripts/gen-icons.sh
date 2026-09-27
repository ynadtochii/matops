#!/usr/bin/env bash
# Regenerates every raster app icon from the one basketweave mark.
# Colours are the dark-theme brand tokens (packages/ui/src/tokens.ts), so the
# home-screen icon matches the mark in the app header. Needs ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/.."

SEAMS="M16 0V32M0 16H32M8.5 0V16M16 8.5H32M0 23.5H16M23.5 16V32"

tile() { # $1 = corner radius in the 32x32 grid, $2 = rim radius (inset 0.175)
  cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="$1" fill="#000000"/>
  <rect x="0.175" y="0.175" width="31.65" height="31.65" rx="$2" fill="none" stroke="#ebebeb" stroke-opacity="0.3" stroke-width="0.35"/>
</svg>
SVG
}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# ImageMagick's SVG renderer skips a stroke with no stroke-opacity and has no
# blur filter, so the seams render on black and the bloom is blurred here.
cat > "$tmp/seams.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#000000"/>
  <path d="$SEAMS" stroke="#ebebeb" stroke-opacity="1" stroke-width="1.1"/>
</svg>
SVG

tile 7 6.825 > "$tmp/rounded.svg"
tile 0 0 > "$tmp/square.svg"

png() { # $1 = tile svg, $2 = px, $3 = out
  mkdir -p "$(dirname "$3")"
  local d=$(( $2 * 72 / 32 )) blur=$(( $2 / 32 ))
  magick -background none -density $d "$1" -resize "$2x$2" \
    \( -density $d "$tmp/seams.svg" -resize "$2x$2" -blur "0x$blur" -evaluate multiply 0.5 \) \
    -compose screen -composite \
    \( -density $d "$tmp/seams.svg" -resize "$2x$2" -evaluate multiply 0.92 \) \
    -compose screen -composite \
    \( -background none -density $d "$1" -resize "$2x$2" \) \
    -compose DstIn -composite "$3"
  echo "  $3"
}

cat > apps/nextjs/src/app/icon.svg <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs><filter id="bloom" x="0" y="0" width="32" height="32" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1"/></filter></defs>
  <rect width="32" height="32" rx="7" fill="#000000"/>
  <path d="$SEAMS" stroke="#ebebeb" stroke-opacity="0.5" stroke-width="1.1" filter="url(#bloom)"/>
  <path d="$SEAMS" stroke="#ebebeb" stroke-opacity="0.92" stroke-width="1.1"/>
  <rect x="0.175" y="0.175" width="31.65" height="31.65" rx="6.825" fill="none" stroke="#ebebeb" stroke-opacity="0.3" stroke-width="0.35"/>
</svg>
SVG

png "$tmp/rounded.svg" 192 apps/nextjs/public/icon-192.png
png "$tmp/rounded.svg" 512 apps/nextjs/public/icon-512.png
# apple-touch + maskable are masked by the OS, so they bleed to the edge.
png "$tmp/square.svg" 512 apps/nextjs/public/icon-maskable-512.png
png "$tmp/square.svg" 180 apps/nextjs/public/apple-touch-icon.png

png "$tmp/square.svg" 1024 apps/expo/assets/icon-light.png
cp apps/expo/assets/icon-light.png apps/expo/assets/icon-dark.png
echo "  apps/expo/assets/icon-dark.png"

# apps/expo/ios is prebuild output (gitignored); refresh it so the installed
# dev client shows the new icon without a full `expo prebuild`.
ios=apps/expo/ios/matops/Images.xcassets
if [ -d "$ios" ]; then
  for f in App-Icon-1024x1024@1x App-Icon-dark-1024x1024@1x; do
    cp apps/expo/assets/icon-light.png "$ios/AppIcon.appiconset/$f.png"
    echo "  $ios/AppIcon.appiconset/$f.png"
  done
  for s in 1 2 3; do
    sfx=$([ $s = 1 ] && echo "" || echo "@${s}x")
    png "$tmp/rounded.svg" $(( s * 100 )) "$ios/SplashScreenLogo.imageset/image$sfx.png"
    cp "$ios/SplashScreenLogo.imageset/image$sfx.png" "$ios/SplashScreenLogo.imageset/dark_image$sfx.png"
  done
fi

png "$tmp/rounded.svg" 256 "$tmp/favicon.png" >/dev/null
magick "$tmp/favicon.png" -define icon:auto-resize=48,32,16 \
  apps/nextjs/public/favicon.ico
echo "  apps/nextjs/public/favicon.ico"
