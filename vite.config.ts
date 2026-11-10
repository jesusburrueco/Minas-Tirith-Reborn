import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS + LAN: WebXR, DeviceOrientation y Gamepad exigen contexto seguro.
export default defineConfig({
  base: './', // desplegable en cualquier subcarpeta de cualquier hosting estático
  plugins: [basicSsl()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
