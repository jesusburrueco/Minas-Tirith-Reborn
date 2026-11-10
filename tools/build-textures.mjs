// Convierte raw-assets/<id>/ a KTX2 en public/assets/textures/:
//   <id>_albedo.ktx2 → ETC1S, sRGB, con mipmaps (color)
//   <id>_nrm.ktx2    → UASTC + Zstd, lineal, 512 px: R,G = normal (OpenGL), B = rugosidad
// y regenera la tabla de assets de CREDITS.md. Uso: npm run assets:build
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'tools', 'assets.json'), 'utf8'));
const out = join(root, 'public', 'assets', 'textures');
mkdirSync(out, { recursive: true });

const raw = async (file, size) => {
  const { data, info } = await sharp(file).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
const encode = (img, opts) => encodeToKTX2(new Uint8Array(1), { generateMipmap: true, imageDecoder: async () => img, ...opts });

// El codificador escribe trazas por stdout; se silencian mientras trabaja.
const quiet = async (fn) => {
  const w = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try { return await fn(); } finally { process.stdout.write = w; }
};

const credits = [];
for (const t of manifest.textures) {
  const dir = join(root, 'raw-assets', t.id);
  const info = JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8'));

  const albedo = await raw(join(dir, 'diff.jpg'), t.size);
  const a = await quiet(() => encode(albedo, { isUASTC: false, qualityLevel: 200, compressionLevel: 2, isSetKTX2SRGBTransferFunc: true }));
  writeFileSync(join(out, `${t.id}_albedo.ktx2`), a);

  // Normal + rugosidad a menor resolución: UASTC apenas comprime y en el móvil pesa mucho.
  const nsize = t.nrmSize ?? Math.min(512, t.size);
  const n = await raw(join(dir, 'nrm.jpg'), nsize);
  const r = await raw(join(dir, 'rough.jpg'), nsize);
  for (let i = 0; i < n.data.length; i += 4) {
    n.data[i + 2] = r.data[i];
    n.data[i + 3] = 255;
  }
  const b = await quiet(() => encode(n, { isUASTC: true, needSupercompression: true, uastcLDRQualityLevel: 1, isSetKTX2SRGBTransferFunc: false, isPerceptual: false, isNormalMap: true }));
  writeFileSync(join(out, `${t.id}_nrm.ktx2`), b);

  console.log(`✓ ${t.id}: albedo ${(a.length / 1024).toFixed(0)} KB · nrm ${(b.length / 1024).toFixed(0)} KB`);
  credits.push(`| ${t.id}_albedo / ${t.id}_nrm (.ktx2) | Textura PBR — ${t.use} | ${info.authors} | [${info.name}](${info.url}) | ${info.license} |`);
}

const cpath = join(root, 'CREDITS.md');
const md = readFileSync(cpath, 'utf8');
const start = '<!-- assets:start -->';
const end = '<!-- assets:end -->';
const table = `${start}\n| Asset | Tipo | Autor | Fuente | Licencia |\n|---|---|---|---|---|\n${credits.join('\n')}\n${end}`;
writeFileSync(cpath, md.includes(start) ? md.replace(new RegExp(`${start}[\\s\\S]*${end}`), table) : `${md.trimEnd()}\n\n${table}\n`);
console.log('CREDITS.md actualizado');
