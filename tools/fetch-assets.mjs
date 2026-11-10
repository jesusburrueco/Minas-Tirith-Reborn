// Descarga las texturas CC0 de tools/assets.json en raw-assets/<id>/ (diff, nrm, rough)
// y guarda autor, licencia y URL en raw-assets/<id>/info.json.
// Uso: npm run assets:fetch  (Poly Haven y ambientCG son CC0 y no piden registro)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'tools', 'assets.json'), 'utf8'));
const UA = { 'User-Agent': 'asset-fetch/1.0' };

async function get(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}
const bytes = async (url) => new Uint8Array(await (await get(url)).arrayBuffer());

async function polyhaven(t, dir) {
  const files = await (await get(`https://api.polyhaven.com/files/${t.asset}`)).json();
  const info = await (await get(`https://api.polyhaven.com/info/${t.asset}`)).json();
  const pick = (k) => files[k]['1k'].jpg.url;
  writeFileSync(join(dir, 'diff.jpg'), await bytes(pick('Diffuse')));
  writeFileSync(join(dir, 'nrm.jpg'), await bytes(pick('nor_gl')));
  writeFileSync(join(dir, 'rough.jpg'), await bytes(pick('Rough')));
  return { name: info.name, authors: Object.keys(info.authors ?? {}).join(', '), url: `https://polyhaven.com/a/${t.asset}`, license: 'CC0 1.0' };
}

async function ambientcg(t, dir) {
  const zip = unzipSync(await bytes(`https://ambientcg.com/get?file=${t.asset}_1K-JPG.zip`));
  const map = { '_Color.jpg': 'diff.jpg', '_NormalGL.jpg': 'nrm.jpg', '_Roughness.jpg': 'rough.jpg' };
  for (const [name, data] of Object.entries(zip))
    for (const [suffix, out] of Object.entries(map)) if (name.endsWith(suffix)) writeFileSync(join(dir, out), data);
  return { name: t.asset, authors: 'ambientCG (Lennart Demes)', url: `https://ambientcg.com/view?id=${t.asset}`, license: 'CC0 1.0' };
}

for (const t of manifest.textures) {
  const dir = join(root, 'raw-assets', t.id);
  if (existsSync(join(dir, 'info.json'))) {
    console.log(`✓ ${t.id} (ya descargado)`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  const info = t.source === 'polyhaven' ? await polyhaven(t, dir) : await ambientcg(t, dir);
  writeFileSync(join(dir, 'info.json'), JSON.stringify({ ...info, source: t.source, asset: t.asset, use: t.use }, null, 2));
  console.log(`↓ ${t.id}: ${info.name} — ${info.authors}`);
}
