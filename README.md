# Board Flujo · YoDesarrollo

Board de flujo con bolsas por proyecto, sincronizado con Google Sheets ("YOD - Flujo 2026").

## URL en vivo
https://yodesarrollomx.github.io/board-flujo-yod/

## Acceso (Portero YOD)
- El acceso lo gobierna el **Portero YOD** (`portero.js` de potenciales-yod): liga mágica de 90 días, clave de equipo o Google.
- Toda petición al backend viaja con la credencial del Portero (`k`) y **el servidor la valida** contra el endpoint de canje del Portero. Sin credencial válida el backend responde `{ ok:false, error:'liga' }` y no entrega datos.
- El HTML público ya no contiene ningún secreto (el antiguo secreto compartido se retiró en la contención 2026-07-12; ese deployment quedó archivado).

## Reconexión del backend (pendiente, una vez)
1. En el Apps Script del Flujo, pegar `apps-script/portero-auth.gs` y sustituir la validación del secreto por `credencialValida_(payload.k)` (instrucciones dentro del archivo).
2. Implementar → **Nueva implementación** → copiar la URL `/exec`.
3. Pegar esa URL en `APPS_SCRIPT_URL` de `index.html` y hacer push.
4. Marcar SYS-FLUJO como Activo en Control Maestro.

## Cómo funciona
- Datos: Google Sheet vía Apps Script (pestañas Movimientos, PagosPlanificados, IngresosEsperados, Bolsas, Config, Historial).
- Nada se borra: historial append-only.
- Los movimientos de WhatsApp ("Yod: Flujo 2026") los sincroniza Claude y los escribe al Sheet.
