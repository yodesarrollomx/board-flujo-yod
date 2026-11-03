const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
const app = scripts.find(s => s.includes('const APPS_SCRIPT_URL'));
assert.ok(app && app.includes('// init —'), 'se encuentra el script principal y su inicialización');
const payload = `\"><img src=x onerror=alert(1)> ' & <svg/onload=alert(2)>`;
const trickyId = `id'\\\";alert(3);//\n&dato`;

function harness() {
  const nodes = new Map();
  function element() {
    let markup = '', text = '';
    return {
      value: '', dataset: {}, style: {}, children: [], disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      get innerHTML() { return markup; }, set innerHTML(value) { markup = String(value); text = ''; },
      get textContent() { return text; }, set textContent(value) { text = String(value); markup = ''; },
      appendChild(child) { this.children.push(child); }, focus() {}
    };
  }
  const node = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const context = vm.createContext({
    document: { getElementById: node, querySelectorAll: () => [], createElement: element, body: element(), documentElement: element() },
    window: {}, console, Date, TextEncoder, TextDecoder, Uint8Array,
    localStorage: { getItem: key => key === 'yodflujo-user' ? 'Usuario prueba' : '', setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => '', setItem() {}, removeItem() {} },
    setTimeout: () => 1, clearTimeout() {}, prompt: () => '', confirm: () => true, alert() {},
    fetch: () => { throw new Error('La prueba no permite transporte real'); }
  });
  // Se ejecuta el código real de renderizado/acciones; se omite únicamente el arranque que consulta el servidor.
  vm.runInContext(app.slice(0, app.indexOf('// init —')), context, { filename: 'index.html:inline' });
  const run = source => vm.runInContext(source, context);
  return { context, node, run, setDB(data) { context.fixture = data; run('DB=fixture'); } };
}

function fixture() {
  return {
    saldo: { monto: 1000, fecha: '2026-01-02' + payload }, saldos: [],
    bolsas: [{ nombre: payload, presupuesto: 0 }, { nombre: 'Destino', presupuesto: 0 }],
    movimientos: [
      { id: trickyId, fecha: '2026-01-02', tipo: 'Egreso', monto: 100, beneficiario: payload, proyecto: payload, notas: payload },
      { id: 'duda' + trickyId, fecha: '2026-01-03', tipo: 'Egreso', monto: 50, beneficiario: payload, proyecto: 'Por clasificar', notas: payload }
    ],
    pagos: [{ id: trickyId, fechaLimite: '2026-01-04', concepto: payload, monto: 200, tipoPago: 'Único', prioridad: 'Alta', proyecto: payload, estado: 'Pendiente' }],
    ingresosEsperados: [{ concepto: payload, monto: 300, fechaEsperada: '2026-01-05', estatus: payload, proyecto: payload }],
    historial: [{ ts: payload, usuario: payload, accion: payload, detalle: payload }],
    mensajes: [{ f: payload, q: payload, t: payload }]
  };
}

function decode(value) {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity]));
}
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1]] = decode(match[2] ?? match[3] ?? match[4]);
  return result;
}
function safeMarkup(markup) {
  assert.doesNotMatch(markup, /<(?:img|script|iframe)\b|<svg\s*\/onload/i);
  for (const tag of markup.match(/<[a-z][^<>]*>/gi) || []) {
    const attrs = attributes(tag);
    assert.equal(attrs.onerror, undefined);
    assert.equal(attrs.onload, undefined);
    if (attrs.onclick) assert.doesNotMatch(attrs.onclick, /alert|img|svg|id'/);
  }
}

test('los scripts inline mantienen sintaxis válida', () => {
  for (const source of scripts) new vm.Script(source);
});

test('planificación e historial muestran datos como texto y conservan importes/estilos', () => {
  const h = harness(); h.setDB(fixture());
  h.context.renderPlan(); h.context.renderHist();
  const plan = h.node('planMeses').innerHTML, hist = h.node('tHist').innerHTML;
  safeMarkup(plan); safeMarkup(hist);
  assert.ok(plan.includes('&lt;img'));
  assert.ok(plan.includes('<span class="pill único">Único</span>'));
  assert.ok(plan.includes('<span class="pill alta">Alta</span>'));
  assert.ok(plan.includes('$200') && plan.includes('$300') && plan.includes('$1,100'));
  assert.equal((hist.match(/&lt;img/g) || []).length, 4);
  const hostile = fixture(); hostile.pagos[0].tipoPago = payload; hostile.pagos[0].prioridad = payload;
  h.setDB(hostile); h.context.renderPlan(); safeMarkup(h.node('planMeses').innerHTML);
});

test('movimientos, bolsas, alertas, dudas y opciones conservan texto literal', () => {
  const h = harness(); h.setDB(fixture());
  h.context.renderAll(); h.context.openTransfer(); h.context.openUnify(); h.context.verBolsa(payload);
  for (const id of ['kpis', 'tMovs', 'bolsas', 'alertas', 'dudas', 'mvProy', 'fMes', 'trOrigen', 'unOrigen', 'bBody']) {
    safeMarkup(h.node(id).innerHTML);
  }
  assert.ok(h.node('mvProy').innerHTML.includes('&lt;img'));
  assert.ok(h.node('bBody').innerHTML.includes('$100'));
  assert.equal(h.node('bTitle').textContent, 'Cuenta T — ' + payload);
});

test('botones reciben IDs y nombres originales como datos, sin interpretarlos como código', () => {
  const h = harness(); h.setDB(fixture()); h.context.renderAll();
  const targets = [
    ['planMeses', 'data-pago-id', 'marcarPagado', trickyId],
    ['tMovs', 'data-mov-id', 'openMov', trickyId],
    ['tMovs', 'data-mov-id', 'toggleFact', trickyId],
    ['dudas', 'data-mov-id', 'resolverDuda', 'duda' + trickyId],
    ['bolsas', 'data-bolsa', 'verBolsa', payload],
    ['bolsas', 'data-bolsa', 'openTransfer', payload]
  ];
  for (const [id, attribute, action, expected] of targets) {
    const attrs = (h.node(id).innerHTML.match(/<[a-z][^<>]*>/gi) || []).map(attributes).find(a => a.onclick?.includes(action + '(') && a[attribute] === expected);
    assert.ok(attrs, action);
    assert.equal(attrs[attribute], expected);
    let received;
    h.context[action] = value => { received = value; };
    h.context.button = { dataset: { pagoId: attrs[attribute], movId: attrs[attribute], bolsa: attrs[attribute] } };
    h.context.event = { stopPropagation() {} };
    h.run(`(function(){${attrs.onclick}}).call(button)`);
    assert.equal(received, expected);
  }
});

test('préstamos, gráfico SVG y citas tratan sus campos como texto', () => {
  const h = harness(), data = fixture();
  data.movimientos = [{ id: 'T-1', fecha: '2026-01-01', tipo: 'Egreso', monto: 90, beneficiario: '⇄ ' + payload, proyecto: payload + ' origen', notas: '«Transferencia»' }];
  data.saldos = [{ ts: '2026-01-01' + payload, monto: 100 }, { ts: '2026-01-02' + payload, monto: 200 }];
  h.setDB(data); h.context.openPrestamos(); h.context.renderSaldoChart();
  safeMarkup(h.node('prBody').innerHTML); safeMarkup(h.node('saldoChart').innerHTML);
  assert.ok(h.node('prBody').innerHTML.includes('$90.00'));
  const citations = h.context.citasHTML(data.mensajes);
  safeMarkup(citations); assert.equal((citations.match(/&lt;img/g) || []).length, 3);
});

test('respuestas IA mantienen negritas seguras y errores en texto', async () => {
  const h = harness(); h.setDB(fixture());
  h.context.api = async () => ({ answer: '**Resumen** ' + payload, premium: false });
  h.node('aiInput').value = payload;
  await h.context.aiAsk();
  const children = h.node('aiBody').children;
  children.forEach(child => safeMarkup(child.innerHTML));
  assert.ok(children[1].innerHTML.includes('<b>Resumen</b>'));
  h.context.api = async () => ({ error: payload }); h.node('aiInput').value = 'Consulta prueba';
  await h.context.aiAsk();
  const last = h.node('aiBody').children.at(-1);
  assert.equal(last.innerHTML, ''); assert.ok(last.textContent.includes(payload));
});

function transferHarness() {
  const h = harness(); h.setDB(fixture());
  const values = { trOrigen: 'Origen', trDestino: 'Destino', trMonto: '25', trFecha: '2026-01-06', trConcepto: 'Prueba', trQuien: 'Equipo' };
  for (const [id, value] of Object.entries(values)) h.node(id).value = value;
  h.context.renderAll = () => {};
  return h;
}

test('transferencia confirmada envía dos partidas y evita un segundo envío simultáneo', async () => {
  const h = transferHarness(), calls = [];
  let release;
  h.context.api = (action, body) => {
    calls.push({ action, body });
    return calls.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ ok: true });
  };
  const before = h.run('DB.movimientos.length'), history = h.run('DB.historial.length');
  const pending = h.context.saveTransfer();
  assert.equal(h.node('trGuardar').disabled, true);
  await h.context.saveTransfer(); assert.equal(calls.length, 1);
  release({ ok: true }); await pending;
  assert.equal(calls.length, 2); assert.ok(calls.every(c => c.action === 'addMovimiento'));
  assert.equal(calls[0].body.mov.tipo, 'Egreso'); assert.equal(calls[1].body.mov.tipo, 'Ingreso');
  assert.equal(calls[0].body.mov.monto, calls[1].body.mov.monto);
  assert.equal(h.run('DB.movimientos.length'), before + 2);
  assert.equal(h.run('DB.historial.length'), history + 1);
  assert.equal(h.node('trGuardar').disabled, false);
  assert.match(h.node('trEstado').textContent, /confirmada.*#T/);
});

test('transferencia con respuesta incierta conserva referencia y no reintenta escrituras', async () => {
  for (const failedCall of [1, 2]) {
    const h = transferHarness(); let calls = 0;
    h.context.api = async () => { calls++; if (calls === failedCall) throw new Error('respuesta perdida'); return { ok: true }; };
    const before = h.run('JSON.stringify(DB)');
    await h.context.saveTransfer();
    assert.equal(calls, failedCall); assert.equal(h.run('JSON.stringify(DB)'), before);
    assert.equal(h.node('trGuardar').disabled, false);
    const message = h.node('trEstado').textContent;
    assert.match(message, /Referencia #T\d+/); assert.match(message, /revisa Movimientos antes de volver/);
    if (failedCall === 2) assert.match(message, /egreso está confirmado/);
    else assert.match(message, /puede haber quedado un movimiento/);
    assert.doesNotMatch(message, /No se guardó|Nada quedó/);
  }
});

test('cálculos de bolsa y proyección conservan resultados conocidos', () => {
  const h = harness();
  h.setDB({ saldo: { monto: 1000 }, bolsas: [{ nombre: 'Prueba', presupuesto: 500 }], saldos: [], historial: [],
    movimientos: [{ tipo: 'Ingreso', monto: 300, proyecto: 'Prueba', fecha: '2026-01-01' }, { tipo: 'Egreso', monto: 200, proyecto: 'Prueba', fecha: '2026-01-02' }],
    pagos: [{ estado: 'Pendiente', monto: 200, fechaLimite: '2026-01-03', proyecto: 'Prueba' }, { estado: 'Pagado', monto: 999, fechaLimite: '2026-01-03' }],
    ingresosEsperados: [{ estatus: 'Pendiente', monto: 300, fechaEsperada: '2026-01-04' }, { estatus: 'Cobrado', monto: 999, fechaEsperada: '2026-01-04' }] });
  const bolsa = h.context.bolsasCalc()[0];
  assert.equal(bolsa.resta, 600); assert.equal(bolsa.comprometido, 200);
  const projection = h.run('proyeccion8(DB,"2026-01-01T00:00:00")');
  assert.equal(projection[0].saldo, 1100); assert.equal(projection.at(-1).saldo, 1100);
});

function dbSintetica(extra) {
  return Object.assign({ saldo: { monto: 777, fecha: '2026-01-01' }, saldos: [], historial: [], pagos: [], ingresosEsperados: [], mensajes: [],
    bolsas: [{ nombre: 'Alfa', presupuesto: 0 }], movimientos: [] }, extra);
}

test('un duplicado marcado borrada ("TRUE", "true" o true) no cuenta en bolsas, totales, tabla ni IA', () => {
  const base = { id: 'M-1', fecha: '2026-01-02', tipo: 'Ingreso', monto: 500, beneficiario: 'Cliente sintético', proyecto: 'Alfa' };
  for (const marca of ['TRUE', 'true', true]) {
    const h = harness();
    h.setDB(dbSintetica({ movimientos: [base, { ...base, id: 'M-2', borrada: marca }, { id: 'M-3', fecha: '2026-01-03', tipo: 'Egreso', monto: 100, beneficiario: 'Proveedor sintético', proyecto: 'Alfa' }] }));
    assert.equal(h.run('movsVivos().length'), 2);
    const bolsa = h.context.bolsasCalc().find(b => b.nombre === 'Alfa');
    assert.equal(bolsa.ing, 500); assert.equal(bolsa.egr, 100); assert.equal(bolsa.resta, 400); assert.equal(bolsa.movs.length, 2);
    h.context.renderDash(); h.context.renderMovs();
    const kpis = h.node('kpis').innerHTML;
    assert.ok(kpis.includes('$500') && !kpis.includes('$1,000'));
    assert.match(h.node('movsTotal').innerHTML, /^2 movimientos/);
    assert.equal(h.run('fuenteTodo().length'), 2);
  }
  const h = harness();
  h.setDB(dbSintetica({ movimientos: [{ ...base, borrada: false }, { ...base, id: 'M-2', borrada: 'FALSE' }, { ...base, id: 'M-4', borrada: '' }] }));
  assert.equal(h.run('movsVivos().length'), 3);
});

test('esTransfer reconoce ids T-123 y T456 sin confundir los M-', () => {
  const h = harness();
  assert.equal(h.context.esTransfer({ id: 'T-123', notas: '', beneficiario: 'Alguien' }), true);
  assert.equal(h.context.esTransfer({ id: 'T456', notas: '', beneficiario: 'Alguien' }), true);
  assert.equal(h.context.esTransfer({ id: 'M-123', notas: '', beneficiario: 'Alguien' }), false);
  assert.equal(h.context.esTransfer({ id: 'Texto', notas: '', beneficiario: 'Alguien' }), false);
  assert.equal(h.context.esTransfer({ id: 'M-1', notas: '', beneficiario: '⇄ Otra' }), true);
});

test('el indicador de frescura calcula los días con una fecha fija y avisa si pasan de 3', () => {
  const h = harness();
  const mov = (fecha, extra) => ({ id: 'M-x', fecha, tipo: 'Egreso', monto: 1, beneficiario: 'B', proyecto: 'Alfa', ...extra });
  h.setDB(dbSintetica({ movimientos: [mov('2026-10-20'), mov('2026-10-28'), mov('2026-11-02', { borrada: 'TRUE' })] }));
  assert.equal(h.run('diasDesdeUltimoMov("2026-11-03")'), 6); // el borrado de noviembre no cuenta
  const f = h.run('textoFrescura("2026-11-03")');
  assert.equal(f.texto, '· último movimiento hace 6 días'); assert.equal(f.alerta, true);
  h.setDB(dbSintetica({ movimientos: [mov('2026-10-31T07:00:00.000Z')] }));
  assert.equal(h.run('diasDesdeUltimoMov("2026-11-03")'), 3);
  assert.equal(h.run('textoFrescura("2026-11-03")').alerta, false);
  h.setDB(dbSintetica({ movimientos: [mov(new Date(2026, 10, 2))] }));
  assert.equal(h.run('textoFrescura("2026-11-03")').texto, '· último movimiento hace 1 día');
  h.setDB(dbSintetica({ movimientos: [] }));
  assert.equal(h.run('diasDesdeUltimoMov("2026-11-03")'), null);
  h.setDB(dbSintetica({ movimientos: [mov('2026-10-20')] }));
  h.run('syncBase="Sync: 10:00"'); h.context.pintarSync('2026-11-03');
  const info = h.node('syncInfo').innerHTML;
  assert.ok(info.includes('Sync: 10:00') && info.includes('class="sync-vieja"') && info.includes('hace 14 días'));
});

function guardarHarness() {
  const h = harness();
  h.setDB(dbSintetica());
  const campos = { mvId: '', mvTipo: 'Egreso', mvFecha: '2026-01-05', mvMonto: '75', mvBen: ' Proveedor Sintético ', mvProy: 'Alfa', mvNotas: '' };
  for (const [id, value] of Object.entries(campos)) { h.node(id).value = value; h.context[id] = h.node(id); }
  h.context.renderAll = () => {};
  return h;
}

test('saveMov no escribe dos veces con doble llamada y libera el candado al fallar', async () => {
  const h = guardarHarness(), calls = [];
  let release;
  h.context.api = (action, body) => { calls.push({ action, body }); return new Promise(resolve => { release = resolve; }); };
  const primera = h.context.saveMov(), segunda = h.context.saveMov();
  await segunda; assert.equal(calls.length, 1);
  release({ ok: true }); await primera;
  assert.equal(calls.length, 1); assert.equal(calls[0].action, 'addMovimiento');
  assert.equal(h.run('DB.movimientos.length'), 1);
  h.context.api = async () => { throw new Error('sin respuesta'); };
  h.node('mvBen').value = 'Otro beneficiario';
  await h.context.saveMov();
  assert.equal(h.run('guardandoMov'), false); assert.equal(h.run('DB.movimientos.length'), 1);
  let n = 0; h.context.api = async () => { n++; return { ok: true }; };
  await h.context.saveMov(); assert.equal(n, 1);
});

test('saveMov pide confirmación ante un duplicado vivo y no guarda si se cancela', async () => {
  const h = guardarHarness(); let escrituras = 0, preguntas = 0;
  h.context.api = async () => { escrituras++; return { ok: true }; };
  h.run('DB.movimientos.push({id:"M-9",fecha:"2026-01-05",tipo:"Egreso",monto:75,beneficiario:"proveedor sintético",proyecto:"Alfa"})');
  h.context.confirm = () => { preguntas++; return false; };
  await h.context.saveMov();
  assert.equal(preguntas, 1); assert.equal(escrituras, 0); assert.equal(h.run('DB.movimientos.length'), 1); assert.equal(h.run('guardandoMov'), false);
  h.context.confirm = () => { preguntas++; return true; };
  await h.context.saveMov();
  assert.equal(preguntas, 2); assert.equal(escrituras, 1); assert.equal(h.run('DB.movimientos.length'), 2);
  // un borrado con los mismos datos no cuenta como duplicado
  const g = guardarHarness(); let q = 0; g.context.api = async () => ({ ok: true }); g.context.confirm = () => { q++; return false; };
  g.run('DB.movimientos.push({id:"M-9",fecha:"2026-01-05",tipo:"Egreso",monto:75,beneficiario:"Proveedor Sintético",proyecto:"Alfa",borrada:"TRUE"})');
  await g.context.saveMov(); assert.equal(q, 0); assert.equal(g.run('DB.movimientos.length'), 2);
});

test('bolsa sin presupuesto, planificación vacía y conteo de mensajes se muestran sin números inventados', () => {
  const h = harness();
  h.setDB(dbSintetica({ bolsas: [{ nombre: 'Alfa', presupuesto: 0 }, { nombre: 'Beta', presupuesto: 400 }],
    movimientos: [{ id: 'M-1', fecha: '2026-01-02', tipo: 'Ingreso', monto: 100, beneficiario: 'B', proyecto: 'Alfa' }] }));
  h.context.renderDash();
  const bolsas = h.node('bolsas').innerHTML;
  assert.equal((bolsas.match(/sin presupuesto/g) || []).length, 1);
  assert.equal(h.context.bolsasCalc().find(b => b.nombre === 'Alfa').resta, 100);
  assert.match(h.node('alertas').innerHTML, /Planificación vacía: el semáforo no puede medir compromisos/);
  h.setDB(dbSintetica({ pagos: [{ id: 'P-1', estado: 'Pendiente', monto: 10, fechaLimite: '2026-02-01', proyecto: 'Alfa', concepto: 'C', tipoPago: 'Único', prioridad: 'Alta' }] }));
  h.context.renderDash();
  assert.doesNotMatch(h.node('alertas').innerHTML, /Planificación vacía/);
  h.setDB(dbSintetica({ mensajes: [{ f: 'a', q: 'b', t: 'c' }, { f: 'd', q: 'e', t: 'f' }] }));
  h.context.aiWelcome();
  assert.match(h.node('aiBody').children[0].innerHTML, /<b>2 mensajes<\/b> cargados/);
  assert.doesNotMatch(h.node('aiBody').children[0].innerHTML, /307/);
  h.setDB(dbSintetica()); h.context.aiWelcome();
  assert.match(h.node('aiBody').children.at(-1).innerHTML, /los mensajes cargados/);
});
