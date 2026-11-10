/**
 * Rutas de los assets de runtime (public/assets/). Siempre relativas a la base de
 * Vite, así funcionan en la raíz de Vercel, en una subcarpeta o en local.
 * Nunca uses rutas absolutas ("/assets/...") ni rutas del disco.
 */
const BASE = import.meta.env.BASE_URL; // './' (vite.config.ts → base)

export function assetUrl(path: string): string {
  return `${BASE}assets/${path.replace(/^\/+/, '')}`;
}

/** Carpeta del transcoder Basis para KTX2Loader.setTranscoderPath(). */
export const BASIS_TRANSCODER_PATH = assetUrl('basis/');
