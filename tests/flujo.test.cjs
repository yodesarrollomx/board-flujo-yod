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
