# Board Flujo YOD — *la tesorería de Yo Desarrollo (flujo de efectivo por bolsas)*

Lee este archivo completo antes de tocar nada.

## Qué es

Tablero de **flujo de efectivo**: saldo del día, bolsas por proyecto, movimientos (ingresos/egresos), pagos planificados e ingresos esperados, más un historial que nunca se borra. No tiene nada que ver con leads ni con ventas (memoria `plomeria-leads-boards`, línea 20).

- **Quién lo usa:** Alejandro y el equipo de YoDesarrollo, entrando por el Portero YOD (liga mágica, clave de equipo o Google).
- **Dirección en vivo:** `https://yodesarrollomx.github.io/board-flujo-yod/` — **HTTP 200 comprobado el 2026-09-04**.
- La casa vieja `https://alexpueblag.github.io/board-flujo-yod/` responde 200 pero solo es un **cascarón que reenvía** (`<meta http-equiv="refresh">` + canonical a la nueva; comprobado 2026-09-04).
- `https://tableros.yodesarrollo.mx/board-flujo-yod/` **todavía NO existe** (curl 2026-09-04: código `000`, no resuelve). No escribas esa dirección como si funcionara.
- El clon local está **a la par** de lo desplegado: mismo md5 de `index.html` local y servido (`d42f6b1e…`, 2026-09-04), `git status` limpio, nada sin subir.

## Reglas INVIOLABLES

1. **Nada se borra.** Todo cambio deja renglón en `DB.historial` (`index.html:589, 728, 759, 915, 951-974`). Borrar rompe la trazabilidad del dinero.
2. **Los datos reales NO viven en el repo.** `DB` arranca vacío a propósito (`index.html:384-392`, comentario explícito). En junio-2026 se filtraron 21 movimientos, saldos y 307 mensajes de WhatsApp con nombres y RFCs en el HTML público; se limpió el 2026-06-27 reescribiendo el historial git (memoria `yod-boards-seguridad`). No vuelvas a sembrar datos aquí.
3. **El respaldo va CIFRADO, nunca en claro.** `datos.enc` (AES-256-CBC, PBKDF2 200k, sin frase escrita en el código: `index.html:449-483`). `datos.json` está en `.gitignore`. Si el archivo se pudiera leer, el gate no serviría: `portero.js` corre en el navegador y no protege archivos estáticos.
4. **El servidor valida, no el navegador.** El backend valida la credencial `k` contra el Portero (`apps-script/portero-auth.gs:credencialValida_`), fail-closed. Sin credencial: `{ok:false,error:'liga'}`. El HTML público ya no lleva ningún secreto (el `SHARED_SECRET` viejo se retiró en la contención 2026-07-12).
5. **Un rechazo del backend NUNCA cierra la sesión.** `credencialRechazada()` solo muestra aviso (`index.html:404-410`). Si vuelves a poner ahí el borrado de credencial + reload, regresa el bucle infinito de pantalla en blanco de agosto-2026.
6. **Guardar confirma con el servidor ANTES de pintar.** Nada de movimientos fantasma (commit `27fbbe0`, 2026-07-15).
7. **No hagas POST a `/exec`.** Cada `addMovimiento` / `addPago` escribe dinero real en el Sheet de tesorería.
8. **No toques el Apps Script desde aquí.** Ver la advertencia de ESPEJO abajo.

## Archivos

- `index.html` — el tablero completo, un solo archivo (1,039 líneas). CSS con tokens en `:root` + bloque `[data-tema="oscuro"]` (canon YoD, commit `a1d6ebe` 2026-08-02: 0 fallas WCAG medidas en ambos temas). 4 pestañas: Bolsas · Movimientos · Planificación · Historial (`:181-184`). Carga en vivo `portero.js` y `os/shell.js` desde `yodesarrollomx.github.io` (`:1036-1037`) y `os/shell.css` (`:149`).
- `apps-script/portero-auth.gs` — **no corre solo**: es el pedazo que hay que pegar en el Apps Script del Flujo para que valide contra el Portero. Trae sus instrucciones adentro.
- `datos.enc` — foto cifrada de la tesorería (243,756 bytes) para modo consulta cuando el backend no responde.
- `README.md` — versión corta de esto.
- `.gitignore` — solo una línea, y es la importante: `datos.json` nunca se publica.

## Arquitectura de datos

```
WhatsApp "Yod: Flujo 2026"
      │  (rutina YodBot 10:30 y 20:30 · memoria yod-sistema-arquitectura-real)
      ▼
GAS del Flujo ──────► Sheet "YOD_Flujo_2026"  1ToCxZ3sBhqKWlciGeJAnUgMcgD_MQXfj7YSEobd55vk
   /exec:                pestañas: Movimientos · PagosPlanificados · IngresosEsperados
   AKfycbxbQpBn…GzTA               Bolsas · Config · Historial · Mensajes
      ▲   │                        (Movimientos = 13 columnas; el nivel más fino es la BOLSA:
      │   │                         no hay concepto ni categoría — se perdió en la migración de junio)
      │   │
      │   └── POST {k, action} ──► respuesta JSON ──► index.html pinta todo
      │        acciones: getAll · addMovimiento · updateMovimiento · addBolsa · mergeBolsa
      │                  addPago · pagoRealizado · addIngreso · seedMensajes · ai · checkkey
      │
      └── credencialValida_(k) ──► Portero YOD (potenciales-yod)
                                   AKfycbwlDDCW…/exec?recurso=canje&board=FL
                                   (fail-closed, caché 10 min OK / 1 min rechazo)

Si getAll falla  ──► datos.enc (fetch local) ──► descifra con la credencial del Portero
                     ──► "Modo consulta · respaldo local", solo lectura (index.html:492-518)
Si no hay llave  ──► "Necesitas iniciar sesión para ver la tesorería" y NO pinta nada.
```

**ADVERTENCIA — el repo es ESPEJO.** Lo que corre es lo que está pegado en el editor de Apps Script, no lo que está en `apps-script/`. `portero-auth.gs` de este repo es una copia de referencia. Antes de tocar el backend, pide el código vivo del editor. El deployment vivo es `AKfycbxbQpBn7fpbrjXppE3e-DFMBjDmZ8Yy9CZqfuZa4vHNWthS0fl2EzrKnMHHOtPGzTA/exec` (`index.html:377`), scriptId `1J0bPZxTSvtPAZg8N_v9273_teh9NVTao0etoKvnnaJHPDdhbSakJ6o_v` (memoria `yod-boards-seguridad`). Y ojo: **el clon local suele ir atrás del desplegado** — comprobar con md5, no con `git log origin/main..main` (memoria `yod-sistema-arquitectura-real`, regla verificada 4 veces).

### Reglas de cálculo que ya están en el código
- Bolsa: `resta = presupuesto + ingresos − egresos`; `burn` = egresos de los últimos 14 días / 14; `días` = resta/burn (`index.html:536-548`).
- Semáforo: `crítica` si resta < 0 · `riesgo` si lo comprometido > resta · `atención` si queda <25% o menos de 14 días · si no, `sana` (`:545-548`).
- Los movimientos sin bolsa caen en **"Por clasificar"** y salen arriba como "Dudas por acomodar" (`:620-623`).
- Las transferencias entre bolsas se detectan por etiqueta en notas o `⇄` en beneficiario, y **no cuentan** para días de caja (`:734, 563-567`).

## Decisiones

- **2026-06-27 · Alejandro** — Sacar del HTML público toda la semilla de datos (movimientos, saldos, pagos, historial, 307 mensajes de WhatsApp, `DEMO_PW`) y reescribir el historial git (16 commits → 1, force-push). Porqué: el repo es público y ahí iban nombres y RFCs (commit `b54fe06`; memoria `yod-boards-seguridad`).
- **2026-07-04 · Alejandro** — Identidad "Fintech Editorial" (fondo oscuro + oro, Instrument Serif/Manrope). Solo estilos (commit `0a8e1d7`).
- **2026-07-12 · contención** — Se archivó el deployment que validaba con `SHARED_SECRET` porque el secreto estaba en el HTML público. Porqué: cualquiera con la liga leía la tesorería (`portero-auth.gs`, encabezado; commit `5a52a4c`).
- **2026-07-13/14 · Alejandro + Claude** — El acceso pasa al **Portero YOD** y la validación se mueve al servidor. Porqué: un gate de navegador no protege un backend (commits `494f0f1`, `e01503a`).
- **2026-07-14 · Claude** — Un rechazo de ESTE tablero ya no tumba la sesión global, y `credentials:'omit'` en el fetch a `script.google.com`. Porqué: entrar con Google tumbaba la sesión (commits `37e6929`, `9ed7cc5`).
- **2026-07-14/15 · Alejandro** — "Metamorfosis": el Flujo toma la cara de YOD OS, acotada a `.yod-canvas` para no contaminar el shell (commits `47ff381`, `b65b754`).
- **2026-07-15 · Sprint 0** — Se retiró la clave legacy en texto plano de la pestaña `Config` del Sheet y se borraron `checkPassword`/`setPassword` del backend (Versión 13, misma URL). Verificado en vivo. Porqué: era la clave pre-Portero, quemada (memoria `yod-boards-seguridad`).
- **2026-07-29 · Alejandro (autorizó en su Chrome)** — El Sheet `YOD_Flujo_2026` pasó a **Restringido**. Porqué: se leían 238 movimientos, 102 nombres y 54 saldos sin credencial. El GAS corre como dueño, así que el board no se rompió (memoria `yod-auditoria-total-29jul`).
- **2026-08-02 · editor externo** — Código de colores tokenizado, modo oscuro canon, semáforo por variables, gráfica que se repinta con el toggle (commits `926a8e4`, `267d4ea`, `ff0170d`, `a1d6ebe`).
- **2026-08-13 · Claude** — Respaldo local: si el backend rechaza la clave, el tablero no queda en blanco (commit `1099db7`). Porqué: con la suscripción del dominio suspendida el backend contestaba `liga` a sesiones válidas.
- ~~El respaldo local es `datos.json` en claro.~~ **OBSOLETO desde 2026-08-28** (commit `cbe9a75`): pasó a `datos.enc` cifrado con la credencial del usuario. Porqué: en claro, la tesorería se pintaba sola a cualquiera que abriera la liga.
- **2026-09-01 · Alejandro** — Mudanza a la org `yodesarrollomx`: el tablero y sus dependencias (`portero.js`, `os/shell.*`) se sirven desde `yodesarrollomx.github.io`; la puerta vieja reenvía (commits `f2f51e9`, `58d620f`).

## Pendientes

| Tema | Dueño | Evidencia para darlo por cerrado |
|---|---|---|
| **`board=FL` no está en el vocabulario del Portero.** Integrantes con boards scopeados rebotan salvo que su fila de ACCESOS traiga `FL` explícito (mismo patrón que el bug `IV`). | Alejandro / quien administre ACCESOS | Un usuario con acceso scopeado abre el tablero y carga datos, sin `error:'liga'`. Atender junto con el fix de `IV` (memoria `yod-boards-seguridad`). |
| **Credencial de servicio para YodBot.** Si el Chrome de la tarea no tiene credencial canjeada del board FL, el sync de WhatsApp NO escribe. Hoy depende de que Alejandro abra el board una vez. | Alejandro (Portero admin) | Una corrida de `sync-whatsapp-flujo-yod` que escriba movimientos sin intervención manual (memoria `yodbot-corridas-fallas`). |
| **4 filas "Pago Nex" $35k del 16-jun duplicadas** en la pestaña Pagos. `pagoRealizado` no sirve para limpiarlas (crea egreso + recurrente). | Alejandro, a mano en el Sheet | Las 4 filas ya no están y el saldo cuadra (memoria `google-workspace-reactivado-16ago`). |
| **Presupuestos de las bolsas en 0** — con presupuesto 0 el `pct` y el semáforo pierden sentido. | Alejandro | Bolsas con presupuesto capturado y la tarjeta Dinero encendida (memoria `yodbot-corridas-fallas`). |
| **Purga del historial git** del commit viejo con datos (higiene; el secreto ya no es explotable). | Quien tenga acceso a GitHub Support | El SHA viejo ya no responde (memoria `yod-boards-seguridad`). |
| **Marcar SYS-FLUJO como Activo en Control Maestro** — paso 4 del README de reconexión. | Alejandro | La fila SYS-FLUJO en Control Maestro dice Activo. |
| **Título "Flujo 2026" envejece.** Aparece en el `<title>` y el `<h1>`. | Alejandro | Decidir si se vuelve dinámico o se deja (memoria `datos-que-envejecen-auditoria`, G5). |

## Por confirmar (NO afirmar sin preguntar)

- ¿El paso de reconexión del README (pegar `portero-auth.gs` y hacer **Nueva implementación**) ya se hizo? El README lo pinta como pendiente, pero `index.html:377` ya trae una URL `/exec` y la memoria `yod-boards-seguridad` dice que ese deployment se verificó vivo el 2026-07-15. **Pregunta:** ¿el README está desactualizado, o falta todavía un paso? (marcado 2026-09-04)
- ¿La pestaña `Mensajes` del Sheet sigue existiendo y alimentando el panel de IA? `CHAT_DATA` está vacío en el repo (`index.html:980`) y el saludo del panel dice "307 mensajes" a mano (`:996`). **Pregunta:** ¿ese número es real hoy o quedó congelado?
- ¿Quién es el proveedor del modelo detrás de la acción `ai` y de la clave `checkkey` ("5.5 Pro" en el badge, `index.html:1021`)? No está en este repo — vive en el Apps Script.
- `datos.enc` se descarga público (HTTP 200, 243,756 bytes, comprobado 2026-09-04). Está cifrado, pero cualquiera puede bajarlo y atacarlo sin límite de intentos. **Pregunta a Alejandro:** ¿se deja así o el respaldo debe servirse detrás del backend?
- ¿Cada cuándo se refresca `datos.enc`? La última escritura del archivo es del 2026-08-28; la foto envejece en silencio.

## Qué NO hacer

- No hacer POST al `/exec` para "probar": escribe dinero real.
- No poner datos reales, nombres, montos ni claves en el HTML ni en ningún archivo versionado.
- No editar el Apps Script desde el repo — pide el código vivo del editor primero.
- No agregar frameworks ni build: es un HTML estático que se sirve desde GitHub Pages.
