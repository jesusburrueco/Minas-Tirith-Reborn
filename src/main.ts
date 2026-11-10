import './style.css';
import { App } from './app/App';

const app = new App();
void app.init();

// Acceso de depuración desde la consola en desarrollo: window.__app
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
