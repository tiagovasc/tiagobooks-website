// Pika resized/served images for you; static hosting does not. Shrinks images in public/uploads in place.
// Usage: node scripts/optimize-images.mjs [dir=public/uploads] [maxWidth=1800]
// Re-running is safe: files within bounds, or that would shrink by under 10%, are left alone. Originals: keep your own backup first.
import sharp from 'sharp';
import { readdirSync, statSync, renameSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = process.argv[2] ?? 'public/uploads';
const maxW = Number(process.argv[3] ?? 1800);
if (!existsSync(root)) { console.log(`${root} does not exist, nothing to do.`); process.exit(0); }
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
let before = 0, after = 0, changed = 0;
for (const file of walk(root)) {
  const ext = extname(file).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
  const size = statSync(file).size;
  const img = sharp(file, { failOn: 'none' }).rotate(); // bake in EXIF orientation
  const meta = await img.metadata();
  const needsResize = (meta.width ?? 0) > maxW;
  if (!needsResize && size < 1_000_000) continue;
  let pipe = needsResize ? img.resize({ width: maxW, withoutEnlargement: true }) : img;
  pipe = ext === '.png' ? pipe.png({ compressionLevel: 9, palette: false }) : ext === '.webp' ? pipe.webp({ quality: 82 }) : pipe.jpeg({ quality: 82, mozjpeg: true });
  const tmp = file + '.tmp';
  await pipe.toFile(tmp);
  const newSize = statSync(tmp).size;
  if (newSize < size * 0.9) { renameSync(tmp, file); before += size; after += newSize; changed++; }
  else { (await import('node:fs')).unlinkSync(tmp); }
}
console.log(`Optimized ${changed} image(s): ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
