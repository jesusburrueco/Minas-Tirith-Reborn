# Checklist de pruebas en el móvil

Dispositivo de referencia: **iPhone 13** (modo estéreo, calidad Media, objetivo 60 fps).

## 1. Servidor y red
- [ ] PC y móvil en la **misma Wi-Fi**.
- [ ] En el PC: `npm run dev`. Copia la URL `Network: https://192.168.x.x:5173`.
- [ ] Si no carga, permite Node.js en el **Firewall de Windows** (redes privadas).

## 2. Aceptar el certificado (una sola vez)
- [ ] **iPhone (Safari)**: "Esta conexión no es privada" → *Mostrar detalles* → *visitar este sitio web* → *Visitar sitio web*.
- [ ] **Android (Chrome)**: "La conexión no es privada" → *Configuración avanzada* → *Acceder a 192.168.x.x (sitio no seguro)*.
- [ ] En la pantalla inicial debe aparecer **HTTPS ✓**. Sin eso no funcionan ni el giroscopio ni WebXR.

## 3. Emparejar el mando de PS4
- [ ] Mando apagado: mantén **Share + PS** hasta que la barra de luz parpadee en blanco muy rápido.
- [ ] Móvil: *Ajustes → Bluetooth* → elige **Wireless Controller** (DUALSHOCK 4).
- [ ] Ya en la página, **pulsa cualquier botón**: el navegador no expone el mando hasta entonces. Debe aparecer "Mando conectado".

## 4. Antes de probar en iPhone
- [ ] **Modo de bajo consumo desactivado**: en ese modo Safari limita la página a 30 fps.
- [ ] Bloqueo de rotación vertical desactivado y el móvil en **horizontal**.
- [ ] Opcional, para pantalla completa: *Compartir → Añadir a pantalla de inicio*, y abrir desde el icono. Si con el
      certificado autofirmado no abre, úsalo desde Safari.

## 5. Entrar en VR / estéreo
- [ ] **iPhone** → *Modo estéreo (Cardboard)* → Safari pregunta por **"movimiento y orientación"** → *Permitir*.
      Si lo deniegas, cierra la pestaña y vuelve a abrir la URL para que lo pregunte otra vez.
- [ ] **Android** → *Entrar en VR*. La primera vez Chrome puede pedir escanear el QR del visor Cardboard.
- [ ] Mete el móvil en el visor. Si la imagen no está centrada, pulsa **Triángulo** (recentrar).

## 6. Qué comprobar
- [ ] Menú (**Options**) → *Estadísticas: Sí* → **fps ≥ 58** en el inicio y en la *Zona de pruebas* (calidad Media).
- [ ] Al girar la cabeza, la imagen sigue sin retraso ni temblor, y el horizonte queda nivelado.
- [ ] El stick izquierdo te mueve hacia donde miras, **R2** corre y la viñeta se oscurece al moverte.
- [ ] El stick derecho gira por pasos de 30°. Prueba también el giro suave (*Confort y control*).
- [ ] Zona de pruebas: subir las rampas verde y amarilla (la roja no), la escalera, saltar a las cajas (**X**), abrir
      la puerta y leer el cartel (**Círculo**), y no poder atravesar ningún muro.
- [ ] **L1/R1** cambian la hora del día.
- [ ] Apaga el mando (mantén PS 10 s): aparece "Conecta un mando". Al reencenderlo y pulsar un botón, se recupera solo.
- [ ] Sin mando: mantener pulsada la pantalla = andar, toque = interactuar, doble toque = menú.
- [ ] Estéreo: menú → *Visor estéreo* → prueba **Corrección de lente**, *Distancia entre ojos* y *Campo de visión*.

## 7. Qué apuntar y pasarme
- fps, draw calls/ojo y la calidad que acaba eligiendo la automática.
- Si hay mareo: con qué acción (andar, correr, girar).
- Con la corrección de lente: si las líneas rectas de la rejilla se ven rectas en el visor, o qué valores te van mejor.
