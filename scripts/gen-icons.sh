#!/usr/bin/env bash
# Regenerates every raster app icon from the one basketweave mark.
# Colours are the dark-theme brand tokens (packages/ui/src/tokens.ts), so the
# home-screen icon matches the mark in the app header. Needs ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/.."

mark() { # $1 = corner radius in the 32x32 grid
  cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="$1" fill="#8b72ff"/>
  <path d="M16 0V32M0 16H32M8.5 0V16M16 8.5H32M0 23.5H16M23.5 16V32" stroke="#12091f" stroke-opacity="0.85" stroke-width="1.6"/>
</svg>
SVG
}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mark 7 > "$tmp/rounded.svg"
mark 0 > "$tmp/square.svg"

png() { # $1 = svg, $2 = px, $3 = out
  mkdir -p "$(dirname "$3")"
  magick -background none -density $(( $2 * 72 / 32 )) "$1" -resize "$2x$2" "$3"
  echo "  $3"
}

cp "$tmp/rounded.svg" apps/nextjs/src/app/icon.svg

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

magick -background none -density 576 "$tmp/rounded.svg" -resize 256x256 \
  -define icon:auto-resize=48,32,16 apps/nextjs/public/favicon.ico
echo "  apps/nextjs/public/favicon.ico"
