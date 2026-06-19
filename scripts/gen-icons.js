/**
 * Generate iOS app icons from SVG source
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '..', 'public', 'icon.svg');
const IOS_ICON_DIR = path.join(__dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

async function main() {
  const svg = fs.readFileSync(SVG_PATH);
  
  // Generate 1024x1024 iOS app icon
  await sharp(svg)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(IOS_ICON_DIR, 'AppIcon-512@2x.png'));
  console.log('✅ iOS AppIcon 1024x1024 generated');

  // Also generate standard size PNGs for the PWA manifest
  await sharp(svg)
    .resize(192, 192)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
  console.log('✅ PWA icon 192x192 generated');

  await sharp(svg)
    .resize(512, 512)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'icon-512.png'));
  console.log('✅ PWA icon 512x512 generated');

  // Also update the apple-touch-icon in the public directory
  await sharp(svg)
    .resize(180, 180)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('✅ Apple touch icon 180x180 generated');
  
  console.log('\n✨ All icons generated!');
}

main().catch(console.error);
