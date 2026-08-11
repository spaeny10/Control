/* Generates PWA icons from the BIGVIEW mark into /public.
   Run: npx tsx scripts/generate-icons.ts */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const NAVY = "#2b3245"; // matches the app's sidebar / theme color

// Mountain mark on the brand navy, sized for app icons. Maskable variants
// keep the art inside the safe zone (80% of the canvas).
function markSvg(size: number, safeRatio: number, rounded: boolean) {
  const inset = (size * (1 - safeRatio)) / 2;
  const artW = size * safeRatio;
  const scale = artW / 300;
  // Vertically center the 100-tall artwork within the safe area.
  const artH = 100 * scale;
  const ty = (size - artH) / 2;
  const radius = rounded ? size * 0.22 : 0;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${NAVY}"/>
  <g transform="translate(${inset} ${ty}) scale(${scale})">
    <polygon fill="#FCB316" points="140,100 208,10 300,100 262,100 208,48 172,100"/>
    <polygon fill="#F07322" points="62,100 130,20 216,100 180,100 130,56 96,100"/>
    <polygon fill="#C4272F" points="8,100 58,40 118,100 88,100 58,70 36,100"/>
  </g>
</svg>`);
}

async function main() {
  await mkdir("public/icons", { recursive: true });

  const targets = [
    { file: "public/icons/icon-192.png", size: 192, safe: 0.78, rounded: true },
    { file: "public/icons/icon-512.png", size: 512, safe: 0.78, rounded: true },
    // Maskable: art well inside the safe zone, full-bleed background.
    { file: "public/icons/maskable-192.png", size: 192, safe: 0.6, rounded: false },
    { file: "public/icons/maskable-512.png", size: 512, safe: 0.6, rounded: false },
    // iOS home screen (no transparency, no rounding — iOS masks it).
    { file: "public/icons/apple-touch-icon.png", size: 180, safe: 0.72, rounded: false },
    { file: "public/favicon-32.png", size: 32, safe: 0.86, rounded: false },
  ];

  for (const t of targets) {
    await sharp(markSvg(t.size, t.safe, t.rounded)).png().toFile(t.file);
    console.log(`wrote ${t.file} (${t.size}px)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
