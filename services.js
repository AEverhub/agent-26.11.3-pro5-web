'use strict';
/* 自動產生：把 App 後台的 src/services/{logicstate,circuitstate,codestate}.js、src/agent/norepeat.js 包成瀏覽器可用（同一份程式） */
(function () {
  const clip = (s, n = 4000) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…（已截斷，共 ' + s.length + ' 字）' : s; };
  const Buffer = { byteLength: (s) => new TextEncoder().encode(String(s)).length };
  const path = { posix: { join: (...a) => a.join('/').replace(/\/+/g, '/') } };
  const MAP = { '../../ui/logic.js': () => LA.logic, '../../ui/circuit.js': () => LA.circuit, '../core/util': () => ({ clip }), path: () => path };
  const req = (n) => { if (!MAP[n]) throw new Error('網頁版沒有 ' + n); return MAP[n](); };
  const out = {};
  out['logicstate'] = (function (require) { const module = { exports: {} }; const exports = module.exports;

/**
 * 26.11.3 pro2：邏輯閘轉換器的共用狀態（App 頁面和 AI 操作同一份）。存在 store.db.logic_state。
 * { ckt:{inputs, gates:[{id,type,ins,out}], output}, env:{A:0|1}, ics:'7400', tab:'sop'|'pos'|'nand'|'nor', ts }
 */
const L = require('../../ui/logic.js');
const TYPES = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'NOT', 'BUF'];
const FORMS = ['sop', 'pos', 'nand', 'nor'];

class LogicState {
  constructor(ctx) { this.ctx = ctx; }
  get() { const s = this.ctx.store.db.logic_state; return s && s.ckt ? { icmap: {}, wsrc: 'ckt', arith: null, ...s } : { ckt: L.preset(), env: {}, ics: '', tab: 'sop', icmap: {}, wsrc: 'ckt', arith: null, ts: 0 }; }
  /** 26.11.3 pro5：每種閘用哪顆 IC（只留認得、而且能當那種閘用的） */
  cleanMap(m) { const out = {}; for (const [t, v] of Object.entries(m && typeof m === 'object' ? m : {})) { const T = String(t).toUpperCase(); if (!TYPES.includes(T) || T === 'BUF' || !v) continue; const id = L.icId(v); if (!id) throw new Error(`不認得的 IC「${v}」`); if (!L.icChoices(T).includes(id)) throw new Error(`${id} 不能當 ${T} 用；${T} 可以選：${L.icChoices(T).join('、')}`); out[T] = id; } return out; }
  cleanArith(a) {
    if (!a || !a.kind) return null; if (!L.ARITH[a.kind]) throw new Error('加減法器種類：' + Object.keys(L.ARITH).join('、'));
    const bits = Math.max(1, Math.min(8, Math.floor(+a.bits || 4))); const impl = a.impl === 'msi' ? 'msi' : 'gates'; let ic = ''; if (a.ic) { ic = L.icId(a.ic); if (!ic || L.IC[ic].type !== 'ADD4') throw new Error('加法器 IC 可以選：74283、7483、4008'); }
    return { kind: a.kind, bits, a: Math.max(0, Math.floor(+a.a || 0)) & 255, b: Math.max(0, Math.floor(+a.b || 0)) & 255, x: +a.x ? 1 : 0, env: a.env && typeof a.env === 'object' ? Object.fromEntries(Object.entries(a.env).slice(0, 4).map(([k, v]) => [String(k).slice(0, 4), +v ? 1 : 0])) : {}, impl, ic: ic || '74283' };
  }
  put(s, who = 'app') {
    const ck = s.ckt; if (!ck || !Array.isArray(ck.inputs) || !Array.isArray(ck.gates)) throw new Error('電路格式不對');
    if (ck.inputs.length > 6 || ck.gates.length > 60) throw new Error('互動電路最多 6 個變數、60 個閘');
    for (const g of ck.gates) if (!TYPES.includes(g.type) || !Array.isArray(g.ins) || !g.ins.length) throw new Error('閘的格式不對');
    L.simulate(ck, {});   // 有迴圈或接錯會丟錯
    const out = { ckt: ck, env: s.env || {}, ics: String(s.ics || '').slice(0, 80), tab: FORMS.includes(s.tab) ? s.tab : 'sop', icmap: this.cleanMap(s.icmap), wsrc: s.wsrc === 'form' ? 'form' : 'ckt', arith: this.cleanArith(s.arith), ts: Date.now(), by: who };
    this.ctx.store.db.logic_state = out; this.ctx.store.touch(); return out;
  }
  /** 目前電路的完整分析（給 AI 看、也給 App 用） */
  analyze(st = this.get()) {
    const ck = st.ckt; const val = L.simulate(ck, st.env || {});
    const sol = L.solve({ name: 'F', vars: ck.inputs, minterms: L.circuitMinterms(ck), dc: [] });
    return { sol, val, expr: L.circuitExpr(ck), out: val[ck.output] };
  }
  /** 給 AI 的文字說明（電路每個閘、目前輸入、布林式、真值表、卡諾圖、各種形式） */
  describe(st = this.get()) {
    const a = this.analyze(st); const ck = st.ckt; const s = a.sol;
    const lines = [`電路（輸入 ${ck.inputs.join('、')}；輸出 F 接 ${ck.output}）：`, ...ck.gates.map((g) => `・${g.id}：${g.type}(${g.ins.join(', ')}) → ${g.out}`),
      `目前輸入：${ck.inputs.map((v) => `${v}=${st.env[v] ? 1 : 0}`).join('、')} → F=${a.out}`, `電路布林式：F = ${a.expr}`, `F = Σm(${s.minterms.join(',') || '—'})`,
      `最簡 SOP：${s.sopStr}`, `最簡 POS：${s.posStr}`, `只用 NAND：${s.nandStr}`, `只用 NOR：${s.norStr}`, `畫面顯示：${{ sop: 'SOP', pos: 'POS', nand: 'NAND', nor: 'NOR' }[st.tab]}${st.ics ? `；IC：${st.ics}` : ''}`,
      '', '真值表：', L.tableText(s), '', '卡諾圖：', L.kmapText(s)];
    try { const tgt = st.wsrc === 'form' ? L.circuit(s, st.tab, st.tab === 'nand' || st.tab === 'nor' ? 2 : 4) : ck; const w = L.wiringOf(tgt, st.icmap || {}); lines.push('', `實際接線（${st.wsrc === 'form' ? '「轉換結果」的 ' + st.tab.toUpperCase() + ' 電路' : '上面畫的電路'}；每種閘用的 IC：${Object.entries(w.chosen).map(([t, i]) => `${t}→${i}`).join('、')}）：`, L.wiringText(w)); } catch (e) { lines.push('', '實際接線：' + e.message); }
    if (st.arith) { try { const A = st.arith; const multi = ['add', 'sub', 'addsub'].includes(A.kind); lines.push('', '加法器／減法器畫面：', L.arithReport(A.kind, { bits: A.bits, a: A.a, b: A.b, x: A.x, impl: multi ? A.impl : 'gates', ic: A.ic, map: st.icmap })); } catch (e) { lines.push('', '加減法器：' + e.message); } }
    if (st.ics) { try { lines.push('', '（下面是「只有這些 IC」模式）'); const w = L.wiring(s, st.ics); lines.push('', `IC 接線（${w.chips.map((c) => c.ref + '=' + c.ic).join('、')}）：`, ...w.lines.map((l) => `・${l.chip} 閘${l.gate} ${l.type}：${l.ins.map((p) => `腳${p.pin}←${p.sig}`).join('、')} → 腳${l.out.pin}${l.out.sig === w.circuit.output ? '＝F' : '（' + l.out.sig + '）'}`), '電源：' + w.power.join('；')); } catch (e) { lines.push('IC 接線：' + e.message); } }
    return lines.join('\n');
  }
  /**
   * AI 操作：expr（換成這個函數的電路，form 決定用哪種形式建）、form、ics、inputs（{A:1}）、gate（{id, type?, ins?}）、add_gate（{type, ins}）、remove_gate（id）、output（訊號）、add_input、remove_input、reset
   */
  apply(op = {}) {
    let st = JSON.parse(JSON.stringify(this.get())); const ck = () => st.ckt;
    if (op.reset) st = { ckt: L.preset(), env: {}, ics: '', tab: 'sop' };
    if (op.expr) { const s = L.solve(String(op.expr)); if (s.vars.length > 6) throw new Error('互動電路最多 6 個變數'); const form = FORMS.includes(op.form) ? op.form : 'sop'; let c = L.circuit(s, form, form === 'nand' || form === 'nor' ? 2 : 4); if (!c.gates.length) c = { ...c, gates: [{ id: 'g1', type: 'BUF', ins: [c.output], out: 'n1' }], output: 'n1' }; st.ckt = c; st.env = {}; st.tab = form; }
    else if (op.form) { if (!FORMS.includes(op.form)) throw new Error('form 只能是 sop／pos／nand／nor'); st.tab = op.form; if (op.rebuild) { const a = this.analyze(st); const c = L.circuit(a.sol, op.form, op.form === 'nand' || op.form === 'nor' ? 2 : 4); if (c.gates.length) st.ckt = c; } }
    if (op.add_input) { const nv = 'ABCDEFGH'.split('').find((v) => !ck().inputs.includes(v)); if (!nv || ck().inputs.length >= 6) throw new Error('最多 6 個變數'); ck().inputs.push(nv); }
    if (op.remove_input) { const v = String(op.remove_input); if (ck().gates.some((g) => g.ins.includes(v))) throw new Error(`變數 ${v} 還有接到閘`); ck().inputs = ck().inputs.filter((x) => x !== v); delete st.env[v]; }
    if (op.add_gate) { const t = String(op.add_gate.type || 'AND').toUpperCase(); if (!TYPES.includes(t)) throw new Error('閘的種類：' + TYPES.join('、')); const k = Math.max(0, ...ck().gates.map((g) => +String(g.id).slice(1) || 0)) + 1; const ins = (op.add_gate.ins || [ck().output]).map(String); ck().gates.push({ id: 'g' + k, type: t, ins: /NOT|BUF/.test(t) ? ins.slice(0, 1) : ins.length >= 2 ? ins : [ins[0], ins[0]], out: 'n' + k }); if (op.add_gate.as_output !== false) ck().output = 'n' + k; }
    if (op.gate) { const g = ck().gates.find((x) => x.id === op.gate.id); if (!g) throw new Error('沒有這個閘：' + op.gate.id + '（可用：' + ck().gates.map((x) => x.id).join('、') + '）'); if (op.gate.type) { const t = String(op.gate.type).toUpperCase(); if (!TYPES.includes(t)) throw new Error('閘的種類：' + TYPES.join('、')); g.type = t; if (/NOT|BUF/.test(t)) g.ins = g.ins.slice(0, 1); else if (g.ins.length < 2) g.ins = [g.ins[0], g.ins[0]]; } if (Array.isArray(op.gate.ins)) g.ins = op.gate.ins.map(String); }
    if (op.remove_gate) { const g = ck().gates.find((x) => x.id === op.remove_gate); if (!g) throw new Error('沒有這個閘'); ck().gates = ck().gates.filter((x) => x !== g); for (const x of ck().gates) x.ins = x.ins.map((s2) => (s2 === g.out ? g.ins[0] : s2)); if (ck().output === g.out) ck().output = ck().gates.length ? ck().gates[ck().gates.length - 1].out : g.ins[0]; }
    if (op.output) ck().output = String(op.output);
    if (op.inputs && typeof op.inputs === 'object') for (const [k, v] of Object.entries(op.inputs)) { if (!ck().inputs.includes(k)) throw new Error('沒有這個輸入：' + k); st.env[k] = +v ? 1 : 0; }
    if (op.ic_map !== undefined) st.icmap = { ...(op.ic_map && Object.keys(op.ic_map).length ? st.icmap : {}), ...this.cleanMap(op.ic_map) };
    if (op.wire_source) st.wsrc = op.wire_source === 'form' ? 'form' : 'ckt';
    if (op.arith !== undefined) st.arith = op.arith ? this.cleanArith({ ...(st.arith || {}), ...op.arith }) : null;
    if (op.ics !== undefined) { const ics = String(op.ics || ''); if (ics) L.wiring(this.analyze(st).sol, ics); st.ics = ics; }
    if (!ck().gates.length) throw new Error('電路至少要一個閘');
    return this.put(st, 'ai');
  }
}
module.exports = { LogicState };
  return module.exports; })(req);
  out['circuitstate'] = (function (require) { const module = { exports: {} }; const exports = module.exports;

/**
 * 26.11.3 pro7：電路工具的共用狀態（App 頁面和 AI 操作同一份）。存在 store.db.circuit_state。
 * { title, parts:[{id,type,n:[節點…],v,…}], env:{light, temp}, ts, by }
 */
const C = require('../../ui/circuit.js');
const MAXP = 60;

class CircuitState {
  constructor(ctx) { this.ctx = ctx; }
  get() { const s = this.ctx.store.db.circuit_state; return s && Array.isArray(s.parts) ? { env: { light: 300, temp: 25 }, ...s } : { ...C.preset('led'), ts: 0 }; }
  /** 檢查並整理（每個零件重新跑一次文字格式，壞的資料進不來） */
  clean(s) {
    if (!s || !Array.isArray(s.parts)) throw new Error('電路格式不對');
    if (s.parts.length > MAXP) throw new Error(`最多 ${MAXP} 個零件`);
    const ck = C.parse(C.format({ parts: s.parts }));
    const env = { light: 300, temp: 25 }; const e = s.env || {};
    if (e.light != null && e.light !== '') env.light = Math.max(0, Math.min(100000, +e.light || 0));
    if (e.temp != null && e.temp !== '') env.temp = Math.max(-55, Math.min(150, +e.temp));
    if (!Number.isFinite(env.temp)) env.temp = 25;
    return { title: String(s.title || '').slice(0, 60), parts: ck.parts, env };
  }
  put(s, who = 'app') {
    const out = { ...this.clean(s), ts: Date.now(), by: who };
    if (out.parts.length) C.dc(out);   // 解不出來（浮接、電壓源短路）就丟錯，不存
    this.ctx.store.db.circuit_state = out; this.ctx.store.touch(); return out;
  }
  describe(st = this.get(), tran = true) { if (!st.parts.length) return '電路工具目前沒有零件。'; try { return C.report(st, { tran }); } catch (e) { return `電路（${st.parts.length} 個零件）：\n${C.format(st)}\n\n解不出來：${e.message}`; } }
  /**
   * AI 操作：netlist（整個換掉）、preset、add（一行或多行零件）、remove（零件名稱）、set（{id, value, pos, on, color, beta, vz, nodes}）、env（{light, temp}）、title、reset
   */
  apply(op = {}) {
    let st = JSON.parse(JSON.stringify(this.get()));
    if (op.reset) st = C.preset('led');
    if (op.preset) { if (!C.PRESETS[op.preset]) throw new Error('預設電路：' + Object.entries(C.PRESETS).map(([k, v]) => `${k}（${v.name}）`).join('、')); st = C.preset(op.preset); }
    if (op.netlist) { const r = C.parse(String(op.netlist)); st.parts = r.parts; st.env = { ...st.env, ...r.env }; if (!op.title) st.title = ''; }
    if (op.add) { const r = C.parse(String(op.add)); for (const p of r.parts) { if (st.parts.some((x) => x.id.toLowerCase() === p.id.toLowerCase())) throw new Error(`已經有 ${p.id} 了（要改它用 set）`); st.parts.push(p); } st.env = { ...st.env, ...r.env }; }
    if (op.remove) { for (const id of String(op.remove).split(/[\s,，、]+/).filter(Boolean)) { const i = st.parts.findIndex((x) => x.id.toLowerCase() === id.toLowerCase()); if (i < 0) throw new Error(`沒有 ${id}（有：${st.parts.map((x) => x.id).join('、')}）`); st.parts.splice(i, 1); } }
    for (const s of [].concat(op.set || [])) {
      const p = st.parts.find((x) => x.id.toLowerCase() === String(s.id || '').toLowerCase()); if (!p) throw new Error(`沒有 ${s.id}（有：${st.parts.map((x) => x.id).join('、')}）`);
      if (s.value != null) { if (['R', 'C', 'L', 'V', 'I', 'POT', 'NTC'].includes(p.type)) p.v = C.num(s.value); else if (p.type === 'U7805') p.vout = C.num(s.value); else throw new Error(`${p.id}（${C.TYPES[p.type].name}）沒有可以改的數值`); }
      if (s.pos != null) { if (p.type !== 'POT') throw new Error(`${p.id} 不是可變電阻`); p.pos = Math.max(0, Math.min(1, +s.pos > 1 ? +s.pos / 100 : +s.pos)); }
      if (s.on != null) { if (p.type !== 'SW') throw new Error(`${p.id} 不是開關`); p.on = !!s.on && s.on !== 'off' && s.on !== '0'; }
      if (s.color) { if (p.type !== 'LED') throw new Error(`${p.id} 不是 LED`); if (!C.LEDC[s.color]) throw new Error('LED 顏色：' + Object.keys(C.LEDC).join('、')); p.color = s.color; }
      if (s.beta != null) p.beta = Math.max(10, Math.min(1000, +s.beta || 100)); if (s.vz != null && p.type === 'D') { p.model = 'zener'; p.vz = C.num(s.vz); }
      if (s.r1 != null && p.type === 'NE555') p.r1 = C.num(s.r1); if (s.r2 != null && p.type === 'NE555') p.r2 = C.num(s.r2); if (s.c != null && p.type === 'NE555') p.c = C.num(s.c);
      if (Array.isArray(s.nodes)) { if (s.nodes.length !== p.n.length) throw new Error(`${p.id} 要接 ${p.n.length} 個節點（${C.pinNames(p.type).join('、')}）`); p.n = s.nodes.map(String); }
    }
    if (op.env && typeof op.env === 'object') st.env = { ...st.env, ...op.env };
    if (op.title != null) st.title = String(op.title);
    return this.put(st, 'ai');
  }
}
module.exports = { CircuitState };
  return module.exports; })(req);
  out['codestate'] = (function (require) { const module = { exports: {} }; const exports = module.exports;

/**
 * 26.11.3 pro7：程式碼工具的共用狀態（App 頁面和 AI 操作同一份）。存在 store.db.code_state。
 * { files:[{name, lang, code}], cur:0, out:{text, code, lang, name, at, where}, ts, by }
 * 執行：
 *  ・JavaScript 在 App 畫面裡用 Web Worker 跑（跟 App 資料隔開、5 秒逾時），不經過主機
 *  ・其他語言（Python、C、C++、Bash、Go、Java、Rust、PHP、Ruby、Lua，或 JS 用 Node）送到 App 內建 Linux／Termux 執行（要先裝好環境；權限跟 termux_exec 一樣）
 */
const path = require('path');
const { clip } = require('../core/util');

const LANGS = {
  javascript: { name: 'JavaScript', ext: 'js', run: (f) => `node ${f}`, need: 'node', pkg: 'nodejs' },
  python: { name: 'Python', ext: 'py', run: (f) => `python3 ${f}`, need: 'python3', pkg: 'python3（Termux：pkg install python）' },
  c: { name: 'C', ext: 'c', run: (f) => `CC=$(command -v clang || command -v gcc || command -v cc) && $CC -O2 -o main ${f} -lm && ./main`, need: 'clang gcc cc', pkg: 'build-base（Termux：pkg install clang）' },
  cpp: { name: 'C++', ext: 'cpp', run: (f) => `CXX=$(command -v clang++ || command -v g++) && $CXX -O2 -std=c++17 -o main ${f} && ./main`, need: 'clang++ g++', pkg: 'build-base（Termux：pkg install clang）' },
  bash: { name: 'Bash', ext: 'sh', run: (f) => `bash ${f} 2>&1 || sh ${f}`, need: 'sh', pkg: '' },
  go: { name: 'Go', ext: 'go', run: (f) => `go run ${f}`, need: 'go', pkg: 'go（Termux：pkg install golang）' },
  java: { name: 'Java', ext: 'java', run: (f) => `java ${f}`, need: 'java', pkg: 'openjdk17（Termux：pkg install openjdk-17）' },
  rust: { name: 'Rust', ext: 'rs', run: (f) => `rustc -O -o main ${f} && ./main`, need: 'rustc', pkg: 'rust' },
  php: { name: 'PHP', ext: 'php', run: (f) => `php ${f}`, need: 'php', pkg: 'php' },
  ruby: { name: 'Ruby', ext: 'rb', run: (f) => `ruby ${f}`, need: 'ruby', pkg: 'ruby' },
  lua: { name: 'Lua', ext: 'lua', run: (f) => `lua ${f} 2>/dev/null || lua5.4 ${f}`, need: 'lua lua5.4', pkg: 'lua5.4' },
  html: { name: 'HTML', ext: 'html', run: null }, css: { name: 'CSS', ext: 'css', run: null }, json: { name: 'JSON', ext: 'json', run: null }, sql: { name: 'SQL', ext: 'sql', run: null }, text: { name: '純文字', ext: 'txt', run: null },
};
const ALIAS = { js: 'javascript', node: 'javascript', py: 'python', python3: 'python', 'c++': 'cpp', cxx: 'cpp', cc: 'cpp', sh: 'bash', shell: 'bash', golang: 'go', rs: 'rust', rb: 'ruby', txt: 'text', htm: 'html' };
const lang = (l) => { const k = String(l || '').toLowerCase().trim(); return LANGS[k] ? k : ALIAS[k] || null; };
const byExt = (name) => { const e = String(name || '').split('.').pop().toLowerCase(); return Object.keys(LANGS).find((k) => LANGS[k].ext === e) || ALIAS[e] || null; };
const MAXF = 10, MAXC = 200 * 1024;
const SAMPLE = { name: 'main.py', lang: 'python', code: '# 範例：費氏數列\ndef fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nfor i in range(10):\n    print(i, fib(i))\n' };
const safeName = (n, l) => { let s = String(n || '').replace(/[\\/:*?"<>|\0]/g, '').replace(/^\.+/, '').trim().slice(0, 60); if (!s) s = 'main.' + LANGS[l || 'text'].ext; return s; };

class CodeState {
  constructor(ctx) { this.ctx = ctx; }
  get() { const s = this.ctx.store.db.code_state; return s && Array.isArray(s.files) && s.files.length ? { cur: 0, out: null, ...s } : { files: [{ ...SAMPLE }], cur: 0, out: null, ts: 0 }; }
  clean(s) {
    if (!s || !Array.isArray(s.files) || !s.files.length) throw new Error('至少要一個檔案');
    if (s.files.length > MAXF) throw new Error(`最多 ${MAXF} 個檔案`);
    const names = new Set(); const files = s.files.map((f) => { const l = lang(f.lang) || byExt(f.name) || 'text'; const name = safeName(f.name, l); if (names.has(name.toLowerCase())) throw new Error('檔名重複：' + name); names.add(name.toLowerCase()); const code = String(f.code ?? ''); if (Buffer.byteLength(code) > MAXC) throw new Error(`${name} 超過 200KB`); return { name, lang: l, code }; });
    const out = s.out && typeof s.out === 'object' ? { text: clip(String(s.out.text || ''), 20000), code: s.out.code ?? null, lang: String(s.out.lang || ''), name: String(s.out.name || ''), at: +s.out.at || Date.now(), where: String(s.out.where || '') } : null;
    return { files, cur: Math.max(0, Math.min(files.length - 1, +s.cur || 0)), out };
  }
  put(s, who = 'app') { const out = { ...this.clean(s), ts: Date.now(), by: who }; this.ctx.store.db.code_state = out; this.ctx.store.touch(); return out; }
  file(st, name) { if (name == null || name === '') return st.files[st.cur] || st.files[0]; const f = st.files.find((x) => x.name.toLowerCase() === String(name).toLowerCase()); if (!f) throw new Error(`沒有 ${name}（有：${st.files.map((x) => x.name).join('、')}）`); return f; }
  /** 給 AI 看的：每個檔案（加行號）＋上次執行結果 */
  describe(st = this.get(), { name, full = true } = {}) {
    const L = [`程式碼工具：${st.files.length} 個檔案（目前打開 ${st.files[st.cur].name}）`];
    const show = name ? [this.file(st, name)] : full ? st.files : [st.files[st.cur]];
    for (const f of show) { const lines = f.code.split('\n'); L.push('', `── ${f.name}（${LANGS[f.lang].name}，${lines.length} 行）──`, ...clip(lines.map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n'), 30000).split('\n')); }
    if (st.out) L.push('', `上次執行（${st.out.name}，${st.out.where || ''}，結束碼 ${st.out.code ?? '?'}）：`, clip(st.out.text || '(沒有輸出)', 4000));
    return L.join('\n');
  }
  /** AI 操作：file（檔名，沒有就新增）、lang、code（整個換掉）、replace（[{find, with}] 局部取代，find 要剛好出現一次）、insert（{line, text}）、open、rename、remove、reset */
  apply(op = {}) {
    let st = JSON.parse(JSON.stringify(this.get()));
    if (op.reset) st = { files: [{ ...SAMPLE }], cur: 0, out: null };
    if (op.remove) { const f = this.file(st, op.remove); if (st.files.length === 1) throw new Error('至少要留一個檔案'); st.files = st.files.filter((x) => x !== f); st.cur = 0; }
    let f = null;
    if (op.file || op.code != null || op.replace || op.insert || op.lang || op.rename) {
      const nm = op.file ? String(op.file) : null; f = nm ? st.files.find((x) => x.name.toLowerCase() === nm.toLowerCase()) : st.files[st.cur];
      if (!f) { if (st.files.length >= MAXF) throw new Error(`最多 ${MAXF} 個檔案`); const l = lang(op.lang) || byExt(nm) || 'text'; f = { name: safeName(nm, l), lang: l, code: '' }; st.files.push(f); }
      st.cur = st.files.indexOf(f);
      if (op.lang) { const l = lang(op.lang); if (!l) throw new Error('語言：' + Object.keys(LANGS).join('、')); f.lang = l; }
      if (op.rename) { const n = safeName(op.rename, f.lang); if (st.files.some((x) => x !== f && x.name.toLowerCase() === n.toLowerCase())) throw new Error('檔名重複'); f.name = n; const l = byExt(n); if (l && !op.lang) f.lang = l; }
      if (op.code != null) f.code = String(op.code);
      for (const r of [].concat(op.replace || [])) { const a = String(r.find ?? ''); if (!a) throw new Error('replace 要有 find'); const n = f.code.split(a).length - 1; if (n !== 1) throw new Error(`「${clip(a, 40)}」在 ${f.name} 出現 ${n} 次（要剛好 1 次；多給一點前後文）`); f.code = f.code.replace(a, () => String(r.with ?? '')); }
      if (op.insert) { const lines = f.code.split('\n'); const at = Math.max(0, Math.min(lines.length, Math.floor(op.insert.line != null && op.insert.line !== '' ? +op.insert.line : lines.length))); lines.splice(at, 0, ...String(op.insert.text ?? '').split('\n')); f.code = lines.join('\n'); }
    } else if (op.open) { const g = this.file(st, op.open); st.cur = st.files.indexOf(g); }
    return this.put(st, 'ai');
  }
  /** 送到內建 Linux／Termux 執行。stdin 選填；逾時預設 30 秒 */
  async run({ name, lang: l0, code, stdin = '', timeout_s = 30, save = true } = {}) {
    const st = this.get(); const f = code != null ? { name: safeName(name || 'main', lang(l0) || 'text'), lang: lang(l0) || byExt(name) || 'text', code: String(code) } : this.file(st, name);
    const L = LANGS[f.lang]; if (!L || !L.run) throw new Error(`${L ? L.name : f.lang} 不是可以直接執行的語言${f.lang === 'html' ? '（HTML 用「預覽」）' : ''}`);
    const T = this.ctx.termux; if (!T || !T.ready || !T.ready()) throw new Error('執行 ' + L.name + ' 需要 App 內建 Linux 或 Termux：到「瀏覽器」頁的「內建 Linux」卡片安裝（JavaScript 可以直接在 App 畫面裡執行，不需要 Linux）');
    if (Buffer.byteLength(f.code) > MAXC) throw new Error('程式太大（超過 200KB）');
    const file = /^[\w.-]+$/.test(f.name) && f.name.endsWith('.' + L.ext) ? f.name : (f.lang === 'java' ? 'Main.java' : 'main.' + L.ext);
    const dir = `$HOME/.la-code/${Date.now().toString(36)}`; const b64 = Buffer.from(f.code, 'utf8').toString('base64'); const inb = Buffer.from(String(stdin || ''), 'utf8').toString('base64');
    const cmd = `mkdir -p ${dir} && cd ${dir} && echo '${b64}' | base64 -d > ${file} && echo '${inb}' | base64 -d > .stdin && ( ${L.run(file)} ) < .stdin 2>&1; c=$?; cd / && rm -rf ${dir}; exit $c`;
    const t = Math.max(3, Math.min(120, +timeout_s || 30)); const r = await T.exec(cmd, { timeout_s: t });
    let text = String(r.out ?? '').replace(/\s+$/, ''); if (/command not found|not found: (python3|node|go|java|rustc|php|ruby|lua)|clang: not found|CC=$|: No such file or directory$/m.test(text) && r.code === 127) text += `\n\n（Linux 裡還沒有 ${L.name} 的執行環境：用 termux_exec 安裝 ${L.pkg || L.need}）`;
    const out = { text: clip(text || '(沒有輸出)', 20000), code: r.code ?? null, lang: f.lang, name: f.name, at: Date.now(), where: 'Linux', timedOut: !!r.timedOut };
    if (save) { const cur = this.get(); this.ctx.store.db.code_state = { ...cur, out, ts: Date.now() }; this.ctx.store.touch(); }
    this.ctx.store.audit('code', 'run', `${f.name}（${L.name}）`);
    return out;
  }
  /** 存到工作區 code/ 資料夾（AI 的檔案工具也看得到） */
  save({ name, dir = 'code' } = {}) {
    const st = this.get(); const list = name ? [this.file(st, name)] : st.files; const d = String(dir || 'code').replace(/\.\.+/g, '').replace(/^[/\\]+/, '') || 'code'; const saved = [];
    for (const f of list) { const rel = path.posix.join(d, f.name); this.ctx.fsx.write(rel, f.code, 'workspace', 'code-tool'); saved.push(rel); }
    return { saved, text: '已存到工作區：' + saved.join('、') };
  }
}
module.exports = { CodeState, LANGS, lang, byExt };
  return module.exports; })(req);
  out['norepeat'] = (function (require) { const module = { exports: {} }; const exports = module.exports;

/**
 * 26.11.3 pro7：不要一直重複同一句話（除非使用者特別要求）。回覆送出前處理：
 *  1. 同一則回覆裡，一模一樣（去掉標點空白後）的句子／行出現第二次以上 → 只留第一次
 *  2. 同一個詞或短句連續重複好幾次（「好的好的好的好的」「哈哈哈哈哈哈」）→ 最多留兩次
 *  3. 最近幾則回覆裡已經講過 2 次以上的「口頭禪」句子（例：「有需要隨時跟我說！」）→ 這次不再講
 *     （只刪短句，而且刪完還要有別的內容；內容性的句子、程式碼、表格、圖表、清單都不動）
 * 使用者說「重複／再說一次／念 3 遍／跟我念／抄寫／複誦／repeat」之類 → 完全不處理。
 */
const ASK = /重複|再(說|講|念|唸|講述|貼|傳|發)(一|1)?(次|遍)|(說|講|念|唸|寫|抄|印|輸出|print|echo).{0,6}\d+\s*(次|遍|行)|[一二三四五六七八九十兩百千]+\s*(次|遍)|跟我(念|唸|說)|複誦|抄寫|照(抄|念|唸)|原封不動|一字不漏|repeat|again|say it|copy (it|this)|loop|迴圈|洗版|刷屏|口號|咒語|繞口令|歌詞/i;
const norm = (s) => String(s).toLowerCase().replace(/[\s。，、！？!?,.;；:：~～…「」『』（）()【】\[\]"'`*_#>|-]+/g, '');
/** 句子切分：保留原本的標點與換行 */
function pieces(line) { return line.match(/[^。！？!?\n]+[。！？!?]*|\n/g) || [line]; }
function requested(userText) { return ASK.test(String(userText || '')); }
/** 連續重複的詞（2～12 字）出現 4 次以上 → 留 2 次 */
function collapseRuns(s) { return s.replace(/(.{2,12}?)(?:[，, ]?\1){3,}/g, (m, w) => (/^\d+$/.test(w) || /^[=\-*_.#~]+$/.test(w) ? m : w + w)).replace(/(.)\1{5,}/g, (m, c) => (/[=\-*_.#~\s\d]/.test(c) ? m : c.repeat(3))); }

function dedupe(text, { recent = [], user = '', max = 1 } = {}) {
  let t = String(text || ''); if (!t || requested(user)) return t;
  const lines = t.split('\n'); const seen = new Set(); const out = []; let fence = false; let removed = 0;
  // 最近回覆裡出現 2 次以上的短句（口頭禪）
  const habit = new Map(); for (const r of recent.slice(-4)) { const once = new Set(); for (const ln of String(r || '').split('\n')) for (const p of pieces(ln)) { const k = norm(p); if (k.length >= 4 && k.length <= 40 && !once.has(k)) { once.add(k); habit.set(k, (habit.get(k) || 0) + 1); } } }
  for (const ln of lines) {
    if (/^\s*```/.test(ln)) { fence = !fence; out.push(ln); continue; }
    if (fence || /^\s*\|/.test(ln) || /^\s*\[\[/.test(ln) || /^\s*$/.test(ln) || /^\s*(來源|資料來源)[:：]/.test(ln) || /^\s*[・•\-*]\s*https?:/.test(ln)) { out.push(ln); continue; }
    const isList = /^\s*([・•\-*+]|\d+[.、)]|[①-⑳])\s*/.test(ln);
    const kept = []; for (const p of pieces(collapseRuns(ln))) {
      const k = norm(p); if (k.length < 4) { kept.push(p); continue; }
      if (seen.has(k) && !isList) { removed++; continue; }   // 同一則回覆裡第二次出現
      if (!isList && k.length <= 40 && (habit.get(k) || 0) >= 2) { removed++; continue; }   // 最近一直在講的口頭禪
      seen.add(k); kept.push(p);
    }
    const joined = kept.join(''); if (joined.trim() || !ln.trim()) out.push(joined.replace(/\s+$/, '')); else removed++;
  }
  let r = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!norm(r)) return t.trim();   // 全部都被刪光（例如整則只有口頭禪）→ 不動，避免空白回覆
  void max; void removed; return r;
}
module.exports = { dedupe, requested, collapseRuns };
  return module.exports; })(req);
  LA.webServices = { ...out.logicstate, ...out.circuitstate, ...out.codestate, norepeat: out.norepeat };
})();
