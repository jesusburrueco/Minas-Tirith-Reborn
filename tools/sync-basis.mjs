// Copia el transcoder Basis de three.js a public/assets/basis/.
// Ejecutar tras actualizar three (npm run sync:basis): la versión del transcoder
// debe coincidir con la del KTX2Loader que se empaqueta en el bundle.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis');
const dst = join(root, 'public', 'assets', 'basis');
mkdirSync(dst, { recursive: true });
for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) copyFileSync(join(src, f), join(dst, f));
const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'three', 'package.json'), 'utf8'));
console.log(`Transcoder Basis de three ${version} copiado a public/assets/basis/`);
