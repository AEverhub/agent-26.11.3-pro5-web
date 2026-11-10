'use strict';
/*
 * 26.11.3 pro7 電路工具（瀏覽器是 LA.circuit，Node 是 require('ui/circuit.js')；App 畫面與 AI 工具用同一份算法）
 *
 * 電路＝零件清單（netlist），每個零件接在幾個「節點」上，節點 0（或 GND）是接地。
 *   R 電阻、C 電容、L 電感、V 直流電壓源、I 直流電流源、D 二極體（一般／蕭特基／齊納）、LED、SW 開關、POT 可變電阻（3 腳）、
 *   LDR 光敏電阻、NTC 熱敏電阻、LAMP 燈泡、Q NPN 電晶體、U＝IC：7805／7812／7833 穩壓、OPAMP 運算放大器、LM35 溫度感測器、555 計時器
 * 算法：修正節點分析法（MNA，SPICE 的核心）；二極體、LED、電晶體用牛頓法反覆逼近；穩壓 IC、運放、555 依狀態切換再解一次。
 *   dc(ckt)：每個節點的電壓、每個零件的電壓／電流／功率、警告（LED 電流太大、電阻功率超過額定、穩壓 IC 壓差不足、運放飽和、電晶體狀態）
 *   tran(ckt, {t_end})：從 0 秒開始（電容沒充電、電源同時接上）的時間模擬，電容充放電、電感、555 方波都算得出來
 *   calc(kind, …)：歐姆定律、LED 限流電阻、分壓、RC、555、色碼、串並聯、LC 共振、電池續航
 *   svg(ckt, result)：自動排版的電路圖（電壓標在節點上、電流標在零件旁）
 */
(function (root, factory) { const C = factory(); if (typeof module === 'object' && module.exports) module.exports = C; else { root.LA = root.LA || {}; root.LA.circuit = C; } })(typeof window !== 'undefined' ? window : globalThis, function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VT = 0.025852;   // 室溫熱電壓
  const GMIN = 1e-12;
  const GND = (n) => n === '0' || /^gnd$/i.test(n);
  // ---------------- 數值與單位 ----------------
  const SI = { T: 1e12, G: 1e9, M: 1e6, meg: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
  /** "4.7k"、"100u"、"10mA"、"2k2"、"1M" → 數字 */
  function num(v) {
    if (typeof v === 'number') return v; let s = String(v ?? '').trim().replace(/\s+/g, '');
    s = s.replace(/(ohms?|歐姆|歐|Ω|Ω)$/i, '');
    if (/\d(meg|[TGMkKmuµμnpf])?(V|A|F|H|W|Hz|s)$/.test(s)) s = s.replace(/(V|A|F|H|W|Hz|s)$/, '');
    let m = /^([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)(meg|MEG|[TGMkKmuµμnpf])?$/.exec(s);
    if (m) return parseFloat(m[1]) * (m[2] ? SI[m[2].toUpperCase() === 'MEG' ? 'meg' : m[2]] : 1);
    m = /^(\d+)(meg|[TGMkKmuµμnpf])(\d+)$/.exec(s); if (m) return parseFloat(m[1] + '.' + m[3]) * SI[m[2]];
    const f = Number(s); if (!s || !Number.isFinite(f)) throw new Error(`看不懂的數值「${v}」`); return f;
  }
  /** 數字 → 「4.7 k」這種工程格式 */
  function fmt(v, unit = '', digits = 3) {
    if (v == null || !Number.isFinite(v)) return '—'; if (v === 0) return '0 ' + unit;
    const a = Math.abs(v); const P = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']]; const p = P.find(([k]) => a >= k * 0.9995) || P[P.length - 1];
    let x = v / p[0]; x = +x.toPrecision(digits); return `${x} ${p[1]}${unit}`.trim();
  }
  // ---------------- 零件庫 ----------------
  const LEDC = { red: [1.9, '紅'], orange: [2.0, '橙'], yellow: [2.05, '黃'], green: [2.2, '綠'], blue: [3.0, '藍'], white: [3.1, '白'], ir: [1.25, '紅外線'], uv: [3.3, '紫外線'] };
  const TYPES = {
    R: { name: '電阻', pins: 2, unit: 'Ω', def: 1000 }, C: { name: '電容', pins: 2, unit: 'F', def: 1e-4 }, L: { name: '電感', pins: 2, unit: 'H', def: 0.01 },
    V: { name: '直流電壓源', pins: 2, unit: 'V', def: 5 }, I: { name: '直流電流源', pins: 2, unit: 'A', def: 0.01 },
    D: { name: '二極體', pins: 2, unit: '', def: 0 }, LED: { name: 'LED', pins: 2, unit: '', def: 0 }, SW: { name: '開關', pins: 2, unit: '', def: 0 },
    POT: { name: '可變電阻', pins: 3, unit: 'Ω', def: 10000 }, LDR: { name: '光敏電阻', pins: 2, unit: '', def: 0 }, NTC: { name: '熱敏電阻（NTC）', pins: 2, unit: 'Ω', def: 10000 },
    LAMP: { name: '燈泡', pins: 2, unit: '', def: 0 }, Q: { name: 'NPN 電晶體', pins: 3, unit: '', def: 0 },
    U7805: { name: '7805 穩壓 IC', pins: 3, unit: '', def: 0 }, OPAMP: { name: '運算放大器', pins: 3, unit: '', def: 0 }, LM35: { name: 'LM35 溫度感測器', pins: 3, unit: '', def: 0 }, NE555: { name: '555 計時器（無穩態）', pins: 3, unit: '', def: 0 },
  };
  const PINS = { POT: ['a', 'b', '滑動端'], Q: ['C 集極', 'B 基極', 'E 射極'], U7805: ['IN 輸入', 'GND', 'OUT 輸出'], OPAMP: ['+ 輸入', '− 輸入', '輸出'], LM35: ['+Vs', 'OUT 輸出', 'GND'], NE555: ['VCC（腳 8、4）', 'OUT（腳 3）', 'GND（腳 1）'] };
  const pinNames = (t) => PINS[t] || (t === 'V' || t === 'C' ? ['＋', '－'] : t === 'D' || t === 'LED' ? ['陽極 A', '陰極 K'] : t === 'I' ? ['電流流出', '電流流入'] : ['a', 'b']);
  /** 零件說明（一行） */
  function describe(p) {
    const t = p.type; const o = p;
    if (t === 'R') return fmt(o.v, 'Ω'); if (t === 'C') return fmt(o.v, 'F'); if (t === 'L') return fmt(o.v, 'H'); if (t === 'V') return fmt(o.v, 'V'); if (t === 'I') return fmt(o.v, 'A');
    if (t === 'D') return o.model === 'zener' ? `齊納 ${o.vz || 5.1}V` : o.model === 'schottky' ? '蕭特基' : '矽二極體'; if (t === 'LED') return `${(LEDC[o.color] || LEDC.red)[1]}光 LED`;
    if (t === 'SW') return o.on ? '開關：接通' : '開關：斷開'; if (t === 'POT') return `${fmt(o.v, 'Ω')}，轉到 ${Math.round((o.pos ?? 0.5) * 100)}%`; if (t === 'LDR') return '光越強電阻越小'; if (t === 'NTC') return `${fmt(o.v, 'Ω')}（25°C）`;
    if (t === 'LAMP') return `${o.rv || 6}V ${o.rw || 0.5}W`; if (t === 'Q') return `NPN β=${o.beta || 100}`; if (t === 'U7805') return `${o.vout || 5}V 穩壓`; if (t === 'OPAMP') return `電源 ${o.vpos ?? 12}／${o.vneg ?? -12}V`;
    if (t === 'LM35') return '10 mV/°C'; if (t === 'NE555') return `R1 ${fmt(o.r1 || 1000, 'Ω')}、R2 ${fmt(o.r2 || 10000, 'Ω')}、C ${fmt(o.c || 1e-5, 'F')}`; return '';
  }
  // ---------------- 文字格式（netlist） ----------------
  const PREFIX = [['LED', 'LED'], ['LDR', 'LDR'], ['NTC', 'NTC'], ['POT', 'POT'], ['LAMP', 'LAMP'], ['SW', 'SW'], ['OP', 'OPAMP'], ['IC', 'U'], ['R', 'R'], ['C', 'C'], ['L', 'L'], ['V', 'V'], ['I', 'I'], ['D', 'D'], ['Q', 'Q'], ['U', 'U'], ['S', 'SW']];
  /**
   * 一行一個零件：名稱 節點… 值 參數=值
   *   R1 vcc a 1k ｜ V1 vcc 0 9 ｜ C1 a 0 100u ｜ LED1 a 0 red ｜ D1 a b zener vz=5.1 ｜ SW1 a b on ｜ POT1 a b w 10k pos=0.3
   *   LDR1 a 0 ｜ NTC1 a 0 10k ｜ Q1 c b e beta=150 ｜ U1 in 0 out 7805 ｜ OP1 p n out vpos=12 vneg=-12 ｜ U2 vcc out 0 555 r1=1k r2=10k c=10u ｜ U3 vs out 0 LM35
   *   「#」或「//」後面是註解；也可以用「;」把好幾個零件寫在同一行
   */
  function parse(text) {
    const parts = []; const env = {};
    for (let line of String(text || '').split(/\n|;/)) {
      line = line.replace(/(#|\/\/).*$/, '').trim(); if (!line) continue;
      let m = /^\.?(env|環境)\s+(.+)$/i.exec(line); if (m) { for (const kv of m[2].split(/\s+/)) { const [k, v] = kv.split('='); if (k && v != null) env[k.toLowerCase()] = parseFloat(v); } continue; }
      const tok = line.split(/\s+/); const name = tok[0]; const kv = {}; const pos = [];
      for (const t of tok.slice(1)) { const e = /^([a-zA-Z_][\w]*)=(.+)$/.exec(t); if (e) kv[e[1].toLowerCase()] = e[2]; else pos.push(t); }
      const pre = PREFIX.find(([p]) => name.toUpperCase().startsWith(p)); if (!pre) throw new Error(`第一個字要是零件名稱（R1、C1、V1、LED1、U1…）：「${line}」`);
      let type = pre[1]; let p;
      if (type === 'U') { const model = (pos.find((x) => /^(7805|7812|7833|78\d\d|lm35|555|ne555|opamp|lm358|lm741|741|358)$/i.test(x)) || '').toLowerCase(); if (!model) throw new Error(`${name}：要寫是哪一顆 IC（7805、7812、LM35、555、OPAMP）`); pos.splice(pos.findIndex((x) => x.toLowerCase() === model), 1);
        type = /^78/.test(model) ? 'U7805' : model === 'lm35' ? 'LM35' : /555/.test(model) ? 'NE555' : 'OPAMP'; if (type === 'U7805') kv.vout = kv.vout || (model === '7812' ? 12 : model === '7833' ? 3.3 : +model.slice(2) || 5); }
      const np = TYPES[type].pins; if (pos.length < np) throw new Error(`${name}：${TYPES[type].name} 要接 ${np} 個節點（${pinNames(type).join('、')}）`);
      p = { id: name, type, n: pos.slice(0, np).map(String) }; const rest = pos.slice(np);
      if (['R', 'C', 'L', 'V', 'I', 'POT', 'NTC'].includes(type)) p.v = rest.length ? num(rest.shift()) : TYPES[type].def;
      if (type === 'LED') p.color = (rest.find((x) => LEDC[x.toLowerCase()]) || kv.color || 'red').toLowerCase();
      if (type === 'D') { const md = rest.find((x) => /^(zener|schottky|si|1n4148|1n4007)$/i.test(x)); p.model = /zener/i.test(md || kv.model || '') ? 'zener' : /schottky/i.test(md || kv.model || '') ? 'schottky' : 'si'; if (p.model === 'zener') p.vz = num(kv.vz || rest.find((x) => /^\d/.test(x)) || 5.1); }
      if (type === 'SW') p.on = !/^(off|open|斷|關)$/i.test(rest[0] || kv.state || 'on');
      if (type === 'POT') p.pos = Math.max(0, Math.min(1, kv.pos != null ? parseFloat(kv.pos) : rest.length ? parseFloat(rest[0]) : 0.5));
      if (type === 'NTC') p.beta = kv.beta ? +kv.beta : 3950; if (type === 'Q') p.beta = kv.beta ? +kv.beta : 100;
      if (type === 'LAMP') { p.rv = kv.v ? num(kv.v) : rest[0] ? num(rest[0]) : 6; p.rw = kv.w ? num(kv.w) : rest[1] ? num(rest[1]) : 0.5; }
      if (type === 'U7805') p.vout = num(kv.vout || 5); if (type === 'OPAMP') { p.vpos = kv.vpos != null ? num(kv.vpos) : 12; p.vneg = kv.vneg != null ? num(kv.vneg) : -12; }
      if (type === 'NE555') { p.r1 = num(kv.r1 || '1k'); p.r2 = num(kv.r2 || '10k'); p.c = num(kv.c || '10u'); }
      if (kv.w && type === 'R') p.w = num(kv.w); if (kv.imax && type === 'LED') p.imax = num(kv.imax);
      if (parts.some((x) => x.id.toLowerCase() === p.id.toLowerCase())) throw new Error(`零件名稱重複：${p.id}`); parts.push(p);
    }
    return { parts, env };
  }
  const vstr = (v, u = '') => { const s = fmt(v, '').replace(' ', ''); return s + u; };
  /** 電路 → 文字 */
  function format(ckt) {
    const L = (ckt.parts || []).map((p) => { const n = p.n.join(' '); const t = p.type;
      if (['R', 'C', 'L', 'V', 'I', 'NTC'].includes(t)) return `${p.id} ${n} ${vstr(p.v)}${t === 'NTC' && p.beta !== 3950 ? ' beta=' + p.beta : ''}${t === 'R' && p.w ? ' w=' + p.w : ''}`;
      if (t === 'LED') return `${p.id} ${n} ${p.color || 'red'}`; if (t === 'D') return `${p.id} ${n} ${p.model || 'si'}${p.model === 'zener' ? ' vz=' + (p.vz || 5.1) : ''}`; if (t === 'SW') return `${p.id} ${n} ${p.on ? 'on' : 'off'}`;
      if (t === 'POT') return `${p.id} ${n} ${vstr(p.v)} pos=${+(p.pos ?? 0.5).toFixed(3)}`; if (t === 'LDR') return `${p.id} ${n}`; if (t === 'LAMP') return `${p.id} ${n} v=${p.rv || 6} w=${p.rw || 0.5}`; if (t === 'Q') return `${p.id} ${n} beta=${p.beta || 100}`;
      if (t === 'U7805') return `${p.id} ${n} ${p.vout === 12 ? '7812' : p.vout === 3.3 ? '7833' : '7805'}${[5, 12, 3.3].includes(p.vout || 5) ? '' : ' vout=' + p.vout}`; if (t === 'OPAMP') return `${p.id} ${n} opamp vpos=${p.vpos ?? 12} vneg=${p.vneg ?? -12}`;
      if (t === 'LM35') return `${p.id} ${n} lm35`; if (t === 'NE555') return `${p.id} ${n} 555 r1=${vstr(p.r1)} r2=${vstr(p.r2)} c=${vstr(p.c)}`; return `${p.id} ${n}`; });
    const e = ckt.env || {}; const ev = Object.entries(e).filter(([, v]) => v != null && v !== ''); if (ev.length) L.push('env ' + ev.map(([k, v]) => `${k}=${v}`).join(' '));
    return L.join('\n');
  }
  // ---------------- 求解（MNA） ----------------
  function gauss(A, b) {
    const n = b.length; for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-30) throw new Error('電路有問題：有節點沒有接好（浮接），或電壓源直接短路／兩個電壓源並聯');
      if (piv !== c) { [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]]; }
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    const x = new Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x;
  }
  /** 二極體電流與導數：指數到 1A 為止，之後用串聯電阻 rs 的直線（電壓源直接接 LED 時算出「很大但合理」的電流，不會變成天文數字） */
  function diodeI(P, vd) { const nvt = P.n * VT; const vcap = nvt * Math.log(1 / P.is + 1); let id, gd;
    if (vd <= vcap) { const e = Math.exp(Math.min(vd / nvt, 80)); id = P.is * (e - 1); gd = (P.is / nvt) * e + GMIN; } else { id = P.is * (Math.exp(vcap / nvt) - 1) + (vd - vcap) / P.rs; gd = 1 / P.rs; }
    if (P.vz && vd < 0) { const x = (-vd - P.vz) / (VT * 1.2); const xc = 30; if (x <= xc) { const e = Math.exp(x); id -= P.is * 1e3 * e; gd += (P.is * 1e3 / (VT * 1.2)) * e; } else { const e = Math.exp(xc); const g = (P.is * 1e3 / (VT * 1.2)) * e; id -= P.is * 1e3 * e + g * (-vd - P.vz - xc * VT * 1.2); gd += g; } }
    return [id, gd]; }
  /** SPICE 的 pnjlim：二極體／接面電壓每次牛頓迭代不要一下跳太多 */
  function pnjlim(vnew, vold, vt, is) { const vcrit = vt * Math.log(vt / (Math.SQRT2 * is)); if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) { if (vold > 0) { const arg = 1 + (vnew - vold) / vt; vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit; } else vnew = vt * Math.log(Math.max(vnew / vt, 1e-30)); } return vnew; }
  const ldrR = (lux) => { const l = Math.max(0.01, +lux || 0); return Math.min(1e7, Math.max(80, 20000 * Math.pow(l / 10, -0.7))); };   // 約 10 lux 時 20kΩ、500 lux 約 1.3kΩ、全暗約 1MΩ 以上
  const ntcR = (p, T) => p.v * Math.exp((p.beta || 3950) * (1 / (273.15 + (T ?? 25)) - 1 / 298.15));
  function diodeParams(p) {
    if (p.type === 'LED') { const vf = (LEDC[p.color] || LEDC.red)[0]; const n = 2; return { n, is: 0.02 / Math.exp(vf / (n * VT)), rs: 2 }; }
    if (p.model === 'schottky') return { n: 1.05, is: 1e-6, rs: 0.05 }; return { n: 1.9, is: 2.52e-9, rs: 0.1, vz: p.model === 'zener' ? p.vz || 5.1 : null };
  }
  /** 依目前的節點電壓，回傳一個 555 在時間 t（秒）時的輸出狀態 */
  const t555 = (p, t) => { const th = 0.693 * (p.r1 + p.r2) * p.c, tl = 0.693 * p.r2 * p.c; if (t == null) return 1; if (t < 1.1 * p.r1 * p.c * 0 + th) return t < th ? 1 : 0; const per = th + tl; const ph = (t - th) % per; return ph < tl ? 0 : 1; };
  /**
   * 解一次（直流，或時間模擬的某一步）。opts.tran：{dt, prev}（電容電壓、電感電流的上一步）、opts.t：時間
   */
  function solve(ckt, opts = {}) {
    const parts = (ckt.parts || []).filter((p) => TYPES[p.type]); const env = { light: 300, temp: 25, ...(ckt.env || {}) }; if (!parts.length) throw new Error('還沒有零件');
    const names = []; const idx = {}; const node = (n) => { n = String(n); if (GND(n)) return -1; if (idx[n] == null) { idx[n] = names.length; names.push(n); } return idx[n]; };
    for (const p of parts) p.n.forEach(node); if (!names.length) throw new Error('所有零件都接在地（0）上，沒有東西可以算');
    if (!parts.some((p) => p.n.some(GND))) throw new Error('電路要有一個接地點：把電源的負極接到節點 0（GND）');
    // 需要額外電流未知數的零件
    const br = []; for (const p of parts) if (['V', 'L', 'U7805', 'OPAMP', 'LM35', 'NE555'].includes(p.type) || (p.type === 'SW' && p.on)) br.push(p.id);
    const N = names.length, M = br.length, S = N + M; const bi = (id) => N + br.indexOf(id);
    const mode = opts.mode || {}; let V = opts.guess && opts.guess.length === S ? opts.guess.slice() : new Array(S).fill(0);
    const vn = (x, n) => { const i = node(n); return i < 0 ? 0 : x[i]; };
    let iter = 0, ok = false; const tr = opts.tran;
    for (; iter < 200; iter++) {
      const A = Array.from({ length: S }, () => new Array(S).fill(0)); const b = new Array(S).fill(0);
      const G = (a, c, g) => { const i = node(a), j = node(c); if (i >= 0) A[i][i] += g; if (j >= 0) A[j][j] += g; if (i >= 0 && j >= 0) { A[i][j] -= g; A[j][i] -= g; } };
      const Isrc = (a, c, cur) => { const i = node(a), j = node(c); if (i >= 0) b[i] -= cur; if (j >= 0) b[j] += cur; };   // 電流 cur 從 a 經零件流到 c
      const Vsrc = (id, p, n, val) => { const k = bi(id), i = node(p), j = node(n); if (i >= 0) { A[i][k] += 1; A[k][i] += 1; } if (j >= 0) { A[j][k] -= 1; A[k][j] -= 1; } b[k] += val; };
      // 「受控輸出」：輸出腳 o 對參考腳 r 的電壓＝val，電流從供電腳 s 來（穩壓 IC、LM35、555）
      const Vout = (id, o, r, s, val) => { const k = bi(id), io = node(o), ir = node(r), is = node(s); if (io >= 0) { A[io][k] -= 1; A[k][io] += 1; } if (ir >= 0) A[k][ir] -= 1; if (is >= 0) A[is][k] += 1; b[k] += val; };
      for (let i = 0; i < N; i++) A[i][i] += GMIN; let limited = false;
      for (const p of parts) {
        const [a, c, d] = p.n;
        if (p.type === 'R') G(a, c, 1 / Math.max(1e-6, p.v));
        else if (p.type === 'LAMP') G(a, c, (p.rw || 0.5) / Math.pow(p.rv || 6, 2));
        else if (p.type === 'LDR') G(a, c, 1 / ldrR(env.light));
        else if (p.type === 'NTC') G(a, c, 1 / ntcR(p, env.temp));
        else if (p.type === 'POT') { const R = Math.max(1, p.v); const x = Math.max(0.001, Math.min(0.999, p.pos ?? 0.5)); G(a, d, 1 / (R * x)); G(d, c, 1 / (R * (1 - x))); }
        else if (p.type === 'SW') { if (p.on) Vsrc(p.id, a, c, 0); }
        else if (p.type === 'C') { if (tr) { const g = p.v / tr.dt; G(a, c, g); Isrc(a, c, -g * ((tr.prev.vc || {})[p.id] || 0)); } }
        else if (p.type === 'L') { const k = bi(p.id); const i = node(a), j = node(c); if (i >= 0) { A[i][k] += 1; A[k][i] += 1; } if (j >= 0) { A[j][k] -= 1; A[k][j] -= 1; } if (tr) { A[k][k] -= p.v / tr.dt; b[k] -= (p.v / tr.dt) * ((tr.prev.il || {})[p.id] || 0); } }
        else if (p.type === 'V') Vsrc(p.id, a, c, p.v);
        else if (p.type === 'I') Isrc(a, c, p.v);
        else if (p.type === 'D' || p.type === 'LED') {
          const P = diodeParams(p); const nvt = P.n * VT; let vd = vn(V, a) - vn(V, c); const vd0 = vd; vd = pnjlim(vd, p._vd ?? 0, nvt, P.is); if (P.vz && vd < -P.vz * 0.8 && p._vd != null) vd = Math.max(vd, p._vd - 0.3); if (Math.abs(vd - vd0) > 1e-9) limited = true; p._vd = vd;
          const [id, gd] = diodeI(P, vd); G(a, c, gd); Isrc(a, c, id - gd * vd);
        }
        else if (p.type === 'Q') {   // Ebers-Moll（NPN），用接面電壓線性化（SPICE 的 pnjlim 限制每步變化，避免發散）
          const [cn, bn, en] = p.n; const beta = p.beta || 100; const aF = beta / (beta + 1), aR = 0.5, IES = 1e-14, ICS = IES * aF / aR;
          let vbe = vn(V, bn) - vn(V, en), vbc = vn(V, bn) - vn(V, cn); const be0 = vbe, bc0 = vbc; vbe = pnjlim(vbe, p._vbe ?? 0, VT, IES); vbc = pnjlim(vbc, p._vbc ?? 0, VT, ICS); if (Math.abs(vbe - be0) > 1e-9 || Math.abs(vbc - bc0) > 1e-9) limited = true; p._vbe = vbe; p._vbc = vbc;
          const ef = Math.exp(Math.min(vbe / VT, 80)), er = Math.exp(Math.min(vbc / VT, 80)); const Ief = IES * (ef - 1), Icr = ICS * (er - 1);
          const Ic = aF * Ief - Icr, Ie = Ief - aR * Icr; const gf = IES * ef / VT, gr = ICS * er / VT;
          // 流進各腳的電流（對 vbe、vbc 的偏微分）：C：Ic；B：Ie−Ic；E：−Ie
          const J = [[cn, aF * gf, -gr, Ic], [bn, gf - aF * gf, -aR * gr + gr, Ie - Ic], [en, -gf, aR * gr, -Ie]];
          for (const [nd, dbe, dbc, I0] of J) { const r = node(nd); if (r < 0) continue; const ib_ = node(bn), ie_ = node(en), ic_ = node(cn);
            if (ib_ >= 0) A[r][ib_] += dbe + dbc; if (ie_ >= 0) A[r][ie_] -= dbe; if (ic_ >= 0) A[r][ic_] -= dbc; b[r] -= I0 - dbe * vbe - dbc * vbc; }
          for (const [x, y] of [[bn, en], [bn, cn], [cn, en]]) G(x, y, GMIN * 10);
        }
        else if (p.type === 'U7805') { const st = mode[p.id] || 'reg'; const vo = p.vout || 5; if (st === 'reg') Vout(p.id, d, c, a, vo); else { const k = bi(p.id), io = node(d), ii = node(a); if (io >= 0) { A[io][k] -= 1; A[k][io] += 1; } if (ii >= 0) { A[ii][k] += 1; A[k][ii] -= 1; } b[k] += -2; } }
        else if (p.type === 'LM35') Vout(p.id, c, d, a, (vn(V, a) - vn(V, d) >= 4 ? 0.01 * (env.temp ?? 25) : 0));
        else if (p.type === 'NE555') { const hi = t555(p, opts.t) === 1; const vcc = Math.max(0, vn(V, a) - vn(V, d)); Vout(p.id, c, d, hi ? a : d, hi ? Math.max(0, vcc - 1.7) : 0.1); }
        else if (p.type === 'OPAMP') { const st = mode[p.id] || 'lin'; const k = bi(p.id), io = node(d), ip = node(a), im = node(c); if (io >= 0) { A[io][k] -= 1; A[k][io] += 1; }
          if (st === 'lin') { const Ag = 2e5; if (ip >= 0) A[k][ip] -= Ag; if (im >= 0) A[k][im] += Ag; } else b[k] += st === 'hi' ? (p.vpos ?? 12) - 1.5 : (p.vneg ?? -12) + 1.5; }
      }
      let x; x = gauss(A, b);
      let dmax = 0; for (let i = 0; i < N; i++) dmax = Math.max(dmax, Math.abs(x[i] - V[i])); V = x;
      if (dmax < 1e-7 && iter > 0 && !limited) { ok = true; break; }
    }
    // 狀態切換（穩壓 IC 壓差、運放飽和）：不對就換狀態重解
    let changed = false; const nm = { ...mode };
    for (const p of parts) {
      if (p.type === 'U7805') { const vin = vn(V, p.n[0]) - vn(V, p.n[1]); const want = vin >= (p.vout || 5) + 2 ? 'reg' : 'drop'; if ((mode[p.id] || 'reg') !== want) { nm[p.id] = want; changed = true; } }
      if (p.type === 'OPAMP') { const vo = vn(V, p.n[2]); const hiR = (p.vpos ?? 12) - 1.5, loR = (p.vneg ?? -12) + 1.5; const st = mode[p.id] || 'lin'; const vd = vn(V, p.n[0]) - vn(V, p.n[1]);
        let want = st; if (st === 'lin') want = vo > hiR + 1e-6 ? 'hi' : vo < loR - 1e-6 ? 'lo' : 'lin'; else if (st === 'hi' && vd < 0) want = 'lin'; else if (st === 'lo' && vd > 0) want = 'lin'; if (want !== st) { nm[p.id] = want; changed = true; } }
    }
    if (changed && (opts.depth || 0) < 8) return solve(ckt, { ...opts, mode: nm, guess: V, depth: (opts.depth || 0) + 1 });
    for (const p of parts) { delete p._vd; delete p._vbe; delete p._vbc; }
    return { names, V, br, N, ok, iter, mode, env, parts, vn: (n) => vn(V, n), ib: (id) => V[bi(id)] };
  }
  /** 直流工作點：節點電壓、零件電壓／電流／功率、警告 */
  function dc(ckt, opts = {}) {
    const r = solve(ckt, opts); const env = r.env; const out = { nodes: {}, parts: [], warnings: [], converged: r.ok, iterations: r.iter };
    for (const n of r.names) out.nodes[n] = r.V[r.names.indexOf(n)];
    for (const p of r.parts) {
      const v = (k) => r.vn(p.n[k]); const vab = v(0) - v(1); let I = null, P = null, extra = '', note = '';
      const t = p.type;
      if (t === 'R') { I = vab / p.v; P = vab * I; const w = p.w || 0.25; if (Math.abs(P) > w) out.warnings.push(`${p.id} 消耗 ${fmt(Math.abs(P), 'W')}，超過額定 ${fmt(w, 'W')}，會發燙燒掉：換更大功率的電阻或加大阻值`); }
      else if (t === 'LAMP') { I = vab * (p.rw || 0.5) / Math.pow(p.rv || 6, 2); P = vab * I; note = Math.abs(vab) > (p.rv || 6) * 1.15 ? '電壓太高，會燒掉' : Math.abs(vab) < (p.rv || 6) * 0.5 ? '偏暗' : '亮'; }
      else if (t === 'LDR') { const R = ldrR(env.light); I = vab / R; P = vab * I; extra = `目前電阻 ${fmt(R, 'Ω')}（光線 ${env.light} lux）`; }
      else if (t === 'NTC') { const R = ntcR(p, env.temp); I = vab / R; P = vab * I; extra = `目前電阻 ${fmt(R, 'Ω')}（${env.temp}°C）`; }
      else if (t === 'POT') { const R = p.v, x = Math.max(0.001, Math.min(0.999, p.pos ?? 0.5)); const i1 = (v(0) - v(2)) / (R * x), i2 = (v(2) - v(1)) / (R * (1 - x)); I = i1; P = (v(0) - v(2)) * i1 + (v(2) - v(1)) * i2; extra = `滑動端 ${fmt(v(2), 'V')}`; }
      else if (t === 'C') { I = 0; extra = `充滿後兩端 ${fmt(vab, 'V')}、儲存電荷 ${fmt(Math.abs(p.v * vab), 'C')}、能量 ${fmt(0.5 * p.v * vab * vab, 'J')}`; if (Math.abs(vab) > (p.vmax || 1e9)) out.warnings.push(`${p.id} 電壓超過耐壓`); }
      else if (t === 'L') { I = r.ib(p.id); extra = `儲存能量 ${fmt(0.5 * p.v * I * I, 'J')}`; }
      else if (t === 'SW') { I = p.on ? r.ib(p.id) : 0; P = 0; }
      else if (t === 'V') { I = -r.ib(p.id); P = p.v * I; extra = I >= 0 ? `提供 ${fmt(P, 'W')}` : `被充電 ${fmt(-P, 'W')}`; }
      else if (t === 'I') { I = p.v; P = -vab * p.v; extra = `兩端 ${fmt(vab, 'V')}`; }
      else if (t === 'D' || t === 'LED') { const D = diodeParams(p); I = diodeI(D, vab)[0]; P = vab * I;
        if (t === 'LED') { const imax = p.imax || 0.03; note = I > imax ? '太亮，會燒掉' : I > 0.002 ? '亮' : I > 0.0002 ? '微亮' : '不亮'; if (I > imax) out.warnings.push(`${p.id} 電流 ${fmt(I, 'A')} 超過 ${fmt(imax, 'A')}，會燒掉：串一個限流電阻（用「LED 限流電阻」計算機算）`); if (vab < -5) out.warnings.push(`${p.id} 接反了而且反向電壓 ${fmt(-vab, 'V')}，超過一般 LED 的 5V 耐壓`); }
        else if (D.vz && vab < -D.vz * 0.9) note = '齊納穩壓中'; else note = I > 1e-4 ? '導通' : '截止'; }
      else if (t === 'Q') { const vbe = v(1) - v(2), vce = v(0) - v(2); const ib = null; void ib; const s = solveQ(p, r); I = s.ic; P = vce * s.ic + vbe * s.ib; note = vbe < 0.5 ? '截止（不導通）' : vce < 0.25 ? '飽和（當開關：完全導通）' : '放大區'; extra = `Ib ${fmt(s.ib, 'A')}、Ic ${fmt(s.ic, 'A')}、Vbe ${fmt(vbe, 'V')}、Vce ${fmt(vce, 'V')}`; if (P > (p.pmax || 0.5)) out.warnings.push(`${p.id} 消耗 ${fmt(P, 'W')}，超過 ${fmt(p.pmax || 0.5, 'W')}，會過熱`); }
      else if (t === 'U7805') { const io = r.ib(p.id); I = io; const vin = v(0) - v(1); P = (vin - (r.vn(p.n[2]) - v(1))) * io; extra = `輸出 ${fmt(r.vn(p.n[2]) - v(1), 'V')}、電流 ${fmt(io, 'A')}、IC 本身發熱 ${fmt(P, 'W')}`; note = r.mode[p.id] === 'drop' ? '輸入電壓不夠，沒在穩壓' : '穩壓中'; if (r.mode[p.id] === 'drop') out.warnings.push(`${p.id}：輸入只有 ${fmt(vin, 'V')}，至少要 ${fmt((p.vout || 5) + 2, 'V')} 才能穩定輸出 ${p.vout || 5}V`); if (P > 1) out.warnings.push(`${p.id} 發熱 ${fmt(P, 'W')}，要加散熱片`); if (io > 1) out.warnings.push(`${p.id} 輸出 ${fmt(io, 'A')} 超過 1A`); }
      else if (t === 'OPAMP') { I = r.ib(p.id); const st = r.mode[p.id] || 'lin'; note = st === 'lin' ? '線性放大' : st === 'hi' ? '飽和在正電源' : '飽和在負電源'; extra = `輸出 ${fmt(r.vn(p.n[2]), 'V')}、+/− 輸入差 ${fmt(v(0) - v(1), 'V')}`; if (st !== 'lin') out.warnings.push(`${p.id} 輸出飽和（${note}）：增益太大或輸入太大，輸出被電源電壓限制住`); }
      else if (t === 'LM35') { I = r.ib(p.id); extra = `${env.temp}°C → 輸出 ${fmt(r.vn(p.n[1]) - r.vn(p.n[2]), 'V')}`; if (v(0) - r.vn(p.n[2]) < 4) out.warnings.push(`${p.id}：電源至少要 4V`); }
      else if (t === 'NE555') { const f = 1.44 / ((p.r1 + 2 * p.r2) * p.c); const duty = (p.r1 + p.r2) / (p.r1 + 2 * p.r2); I = r.ib(p.id); extra = `頻率 ${fmt(f, 'Hz')}、週期 ${fmt(1 / f, 's')}、高電位 ${Math.round(duty * 100)}%（直流分析時顯示輸出為高電位的瞬間；要看方波用「時間模擬」）`; }
      out.parts.push({ id: p.id, type: t, name: TYPES[t].name, desc: describe(p), v: vab, i: I, p: P, note, extra });
    }
    // 電源提供的總功率
    out.power = out.parts.filter((x) => x.type === 'V').reduce((s, x) => s + (x.p || 0), 0);
    if (!r.ok) out.warnings.push('數值沒有完全收斂，結果可能不準（電路可能太極端：例如沒有限流的 LED、電晶體直接接電源）');
    return out;
  }
  function solveQ(p, r) { const vbe = r.vn(p.n[1]) - r.vn(p.n[2]), vbc = r.vn(p.n[1]) - r.vn(p.n[0]); const beta = p.beta || 100; const aF = beta / (beta + 1), aR = 0.5, IES = 1e-14, ICS = IES * aF / aR; const Ief = IES * (Math.exp(Math.min(vbe / VT, 80)) - 1), Icr = ICS * (Math.exp(Math.min(vbc / VT, 80)) - 1); const ic = aF * Ief - Icr, ie = Ief - aR * Icr; return { ic, ib: ie - ic, ie }; }
  /** 時間模擬：從 0 開始（電容沒充電、電感沒電流、電源同時接上）。回傳每個時間點的節點電壓與電容電壓 */
  function tran(ckt, o = {}) {
    const parts = ckt.parts || []; const caps = parts.filter((p) => p.type === 'C'), inds = parts.filter((p) => p.type === 'L'), t5 = parts.filter((p) => p.type === 'NE555');
    let T = +o.t_end || 0; if (!T) { if (t5.length) T = 4 * Math.max(...t5.map((p) => 0.693 * (p.r1 + 2 * p.r2) * p.c)); else { const Rs = parts.filter((p) => p.type === 'R').map((p) => p.v); const Rm = Rs.length ? Math.max(...Rs) : 1000; T = caps.length ? 5 * Rm * Math.max(...caps.map((p) => p.v)) : inds.length ? 5 * Math.max(...inds.map((p) => p.v)) / Math.max(1, Math.min(...(Rs.length ? Rs : [1]))) : 1; } }
    T = Math.max(1e-7, Math.min(3600, T)); const steps = Math.max(50, Math.min(2000, +o.steps || 400)); const dt = T / steps;
    const prev = { vc: Object.fromEntries(caps.map((p) => [p.id, 0])), il: Object.fromEntries(inds.map((p) => [p.id, 0])) }; const out = { t: [], nodes: {}, vc: {}, il: {}, t_end: T, dt };
    let guess = null; let mode = {};
    for (let k = 0; k <= steps; k++) {
      const t = k * dt; const r = solve(ckt, { tran: { dt, prev }, t, guess, mode }); guess = r.V; mode = r.mode; out.t.push(t);
      for (const n of r.names) (out.nodes[n] = out.nodes[n] || []).push(r.V[r.names.indexOf(n)]);
      for (const p of caps) { prev.vc[p.id] = r.vn(p.n[0]) - r.vn(p.n[1]); (out.vc[p.id] = out.vc[p.id] || []).push(prev.vc[p.id]); }
      for (const p of inds) { prev.il[p.id] = r.ib(p.id); (out.il[p.id] = out.il[p.id] || []).push(prev.il[p.id]); }
    }
    return out;
  }
  /** 時間模擬 → 圖表規格（給 LA.chart） */
  function tranChart(ckt, tr, pick = null) {
    const same = new Set((ckt.parts || []).filter((p) => p.type === 'C' && (GND(p.n[1]) || GND(p.n[0]))).map((p) => (GND(p.n[1]) ? p.n[0] : p.n[1])));   // 電容一端接地：那個節點的電壓就是電容電壓，不重複畫
    const flat = (a) => a.every((v) => Math.abs(v - a[0]) < 1e-6);   // 一直不變的（例如電源）放最後
    const nodes = Object.keys(tr.nodes).filter((n) => !same.has(n)).sort((x, y) => flat(tr.nodes[x]) - flat(tr.nodes[y]));
    const keys = pick && pick.length ? pick : [...Object.keys(tr.vc).map((k) => 'vc:' + k), ...nodes.slice(0, Math.max(1, 4 - Object.keys(tr.vc).length))].slice(0, 5);
    const step = Math.max(1, Math.floor(tr.t.length / 120)); const idx = tr.t.map((_, i) => i).filter((i) => i % step === 0 || i === tr.t.length - 1);
    const u = tr.t_end >= 1 ? [1, 's'] : tr.t_end >= 1e-3 ? [1e3, 'ms'] : [1e6, 'µs'];
    return { type: 'line', title: `時間模擬（0～${fmt(tr.t_end, 's')}）`, unit: 'V', x: idx.map((i) => +(tr.t[i] * u[0]).toPrecision(3) + u[1]), series: keys.map((k) => { const [kind, id] = k.includes(':') ? k.split(':') : ['n', k]; const arr = kind === 'vc' ? tr.vc[id] : tr.nodes[id]; return { name: kind === 'vc' ? `${id} 電壓` : `節點 ${id}`, data: idx.map((i) => (arr ? +arr[i].toPrecision(4) : null)) }; }), source: '電路工具時間模擬（後向尤拉法）' };
  }
  // ---------------- 計算機 ----------------
  const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]; const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
  /** 最接近的標準電阻值（up＝往上取，例如限流電阻要選大一點的比較安全） */
  function stdR(r, series = E12, up = false) { if (!(r > 0)) return null; const d = Math.pow(10, Math.floor(Math.log10(r))); let best = null; for (const k of [-1, 0, 1]) for (const e of series) { const v = +(e * d * Math.pow(10, k)).toPrecision(3); if (up && v < r * 0.999) continue; if (!best || Math.abs(Math.log(v / r)) < Math.abs(Math.log(best / r))) best = v; } return best; }
  const COLORS = ['黑', '棕', '紅', '橙', '黃', '綠', '藍', '紫', '灰', '白']; const TOL = { 棕: '±1%', 紅: '±2%', 金: '±5%', 銀: '±10%', 綠: '±0.5%', 藍: '±0.25%' };
  function colorCode(r) { if (!(r > 0)) throw new Error('阻值要大於 0'); let e = Math.floor(Math.log10(r)) - 1; let d = Math.round(r / Math.pow(10, e)); if (d >= 100) { d = Math.round(d / 10); e++; } const bands = [COLORS[Math.floor(d / 10)], COLORS[d % 10], e >= 0 ? COLORS[e] : e === -1 ? '金' : '銀']; return bands; }
  function fromColors(list) { const a = list.map((c) => String(c).replace(/色$/, '')); const di = (c) => { const i = COLORS.indexOf(c); if (i < 0) throw new Error(`不認得的顏色「${c}」（${COLORS.join('、')}、金、銀）`); return i; }; const n = a.length >= 5 ? 3 : 2; let v = 0; for (let i = 0; i < n; i++) v = v * 10 + di(a[i]); const m = a[n] === '金' ? -1 : a[n] === '銀' ? -2 : di(a[n]); return { r: v * Math.pow(10, m), tol: TOL[a[n + 1]] || (a[n + 1] ? '' : '±20%') }; }
  const CALC = {
    ohm: { name: '歐姆定律', f: ['v', 'i', 'r', 'p'], help: '填其中任兩個（電壓 V、電流 A、電阻 Ω、功率 W）' },
    led: { name: 'LED 限流電阻', f: ['vs', 'vf', 'if', 'color', 'n'], help: '電源電壓、LED 順向電壓（或顏色）、想要的電流（預設 15mA）、串幾顆（預設 1）' },
    divider: { name: '分壓電路', f: ['vin', 'r1', 'r2', 'vout'], help: 'Vin 經 R1、R2 到地，Vout 在中間；填三個算第四個' },
    rc: { name: 'RC 時間常數／濾波', f: ['r', 'c'], help: '電阻、電容' },
    t555: { name: '555 閃爍頻率', f: ['r1', 'r2', 'c', 'f', 'duty'], help: 'R1、R2、C 算頻率；或給 f、duty、C 反推 R1、R2' },
    color: { name: '電阻色碼', f: ['r', 'colors'], help: '阻值 → 色碼，或色碼（例：棕 黑 紅 金）→ 阻值' },
    series: { name: '串聯／並聯', f: ['list', 'kind'], help: '幾個值（例：1k 2.2k 4.7k）；kind：r（電阻，預設）或 c（電容）' },
    lc: { name: 'LC 共振頻率', f: ['l', 'c'], help: '電感、電容' },
    battery: { name: '電池續航', f: ['mah', 'ma'], help: '電池容量 mAh、平均耗電 mA（以 80% 可用容量估）' },
  };
  function calc(kind, a = {}) {
    const g = (k) => (a[k] == null || a[k] === '' ? null : num(a[k])); const L = [];
    if (kind === 'ohm') { let v = g('v'), i = g('i'), r = g('r'), p = g('p'); const n = [v, i, r, p].filter((x) => x != null).length; if (n < 2) throw new Error('至少要填兩個');
      if (v != null && i != null) { r = v / i; p = v * i; } else if (v != null && r != null) { i = v / r; p = v * i; } else if (v != null && p != null) { i = p / v; r = v / i; } else if (i != null && r != null) { v = i * r; p = v * i; } else if (i != null && p != null) { v = p / i; r = v / i; } else { v = Math.sqrt(p * r); i = v / r; }
      return { v, i, r, p, text: `V = ${fmt(v, 'V')}、I = ${fmt(i, 'A')}、R = ${fmt(r, 'Ω')}、P = ${fmt(p, 'W')}\n（V = I × R，P = V × I = I²R = V²/R）` }; }
    if (kind === 'led') { const vs = g('vs'); if (vs == null) throw new Error('要填電源電壓'); const color = String(a.color || '').toLowerCase(); const vf = g('vf') ?? (LEDC[color] || LEDC[{ 紅: 'red', 綠: 'green', 藍: 'blue', 白: 'white', 黃: 'yellow', 橙: 'orange' }[a.color]] || LEDC.red)[0]; const If = g('if') ?? 0.015; const n = Math.max(1, Math.floor(g('n') || 1));
      const drop = vs - vf * n; if (drop <= 0) throw new Error(`電源 ${fmt(vs, 'V')} 不夠點亮 ${n} 顆 ${fmt(vf, 'V')} 的 LED（至少要 ${fmt(vf * n, 'V')} 以上）`); const R = drop / If; const Rs = stdR(R, E12, true); const Ia = drop / Rs; const P = Ia * Ia * Rs;
      return { r: R, std: Rs, i: Ia, p: P, text: `R = (Vs − ${n > 1 ? n + '×' : ''}Vf) ÷ I = (${fmt(vs, 'V')} − ${fmt(vf * n, 'V')}) ÷ ${fmt(If, 'A')} = ${fmt(R, 'Ω')}\n選標準值 ${fmt(Rs, 'Ω')}（色碼：${colorCode(Rs).join(' ')} 金）→ 實際電流 ${fmt(Ia, 'A')}、電阻消耗 ${fmt(P, 'W')}${P > 0.2 ? '（超過 1/4W，要用 1/2W 以上的電阻）' : '（1/4W 電阻就夠）'}` }; }
    if (kind === 'divider') { let vin = g('vin'), r1 = g('r1'), r2 = g('r2'), vo = g('vout');
      if (vin != null && r1 != null && r2 != null) { vo = vin * r2 / (r1 + r2); return { vout: vo, text: `Vout = Vin × R2 ÷ (R1 + R2) = ${fmt(vin, 'V')} × ${fmt(r2, 'Ω')} ÷ ${fmt(r1 + r2, 'Ω')} = ${fmt(vo, 'V')}\n流過的電流 ${fmt(vin / (r1 + r2), 'A')}（接上負載後 Vout 會變低：負載要比 R2 大 10 倍以上才準）` }; }
      if (vin != null && vo != null && r2 != null) { if (vo >= vin) throw new Error('Vout 要比 Vin 小'); r1 = r2 * (vin - vo) / vo; return { r1, text: `R1 = R2 × (Vin − Vout) ÷ Vout = ${fmt(r1, 'Ω')}（最接近的標準值 ${fmt(stdR(r1, E24), 'Ω')}）` }; }
      if (vin != null && vo != null && r1 != null) { if (vo >= vin) throw new Error('Vout 要比 Vin 小'); r2 = r1 * vo / (vin - vo); return { r2, text: `R2 = R1 × Vout ÷ (Vin − Vout) = ${fmt(r2, 'Ω')}（最接近的標準值 ${fmt(stdR(r2, E24), 'Ω')}）` }; }
      throw new Error('要填 Vin、R1、R2 其中三個（或 Vin、Vout 加一個電阻）'); }
    if (kind === 'rc') { const r = g('r'), c = g('c'); if (r == null || c == null) throw new Error('要填電阻和電容'); const tau = r * c; return { tau, fc: 1 / (2 * Math.PI * tau), text: `時間常數 τ = R × C = ${fmt(tau, 's')}\n充到 63%：${fmt(tau, 's')}；充到 95%：${fmt(3 * tau, 's')}；幾乎充滿（99%）：${fmt(5 * tau, 's')}\n當濾波器的截止頻率 fc = 1 ÷ (2πRC) = ${fmt(1 / (2 * Math.PI * tau), 'Hz')}` }; }
    if (kind === 't555') { const c = g('c'); let r1 = g('r1'), r2 = g('r2'); const f0 = g('f'), du = a.duty != null && a.duty !== '' ? +String(a.duty).replace('%', '') / (String(a.duty).includes('%') || +a.duty > 1 ? 100 : 1) : null;
      if (c == null) throw new Error('要填電容');
      if (r1 == null && f0 != null) { const d = du ?? 0.6; if (d <= 0.5 || d >= 1) throw new Error('基本無穩態接法的工作週期要在 50%～100% 之間'); const tot = 1.44 / (f0 * c); r2 = tot * (1 - d) / 1; r1 = tot - 2 * r2; if (r1 <= 0) throw new Error('算出來的 R1 不合理，請調整工作週期或電容'); }
      if (r1 == null || r2 == null) throw new Error('要填 R1、R2（或 f 和工作週期）'); const th = 0.693 * (r1 + r2) * c, tl = 0.693 * r2 * c, f = 1 / (th + tl);
      return { r1, r2, f, duty: th / (th + tl), text: `${f0 != null ? `R1 ≈ ${fmt(r1, 'Ω')}（標準值 ${fmt(stdR(r1, E24), 'Ω')}）、R2 ≈ ${fmt(r2, 'Ω')}（標準值 ${fmt(stdR(r2, E24), 'Ω')}）\n` : ''}頻率 f = 1.44 ÷ ((R1 + 2R2) × C) = ${fmt(f, 'Hz')}（週期 ${fmt(1 / f, 's')}）\n高電位 ${fmt(th, 's')}、低電位 ${fmt(tl, 's')}，工作週期 ${Math.round((th / (th + tl)) * 100)}%\n接法：腳 8、4 接 VCC；腳 1 接地；R1 接在 VCC 與腳 7；R2 接在腳 7 與腳 6、2；C 接在腳 6、2 與地；腳 5 接 0.01µF 到地；輸出在腳 3` }; }
    if (kind === 'color') { if (a.colors) { const cl = Array.isArray(a.colors) ? a.colors : String(a.colors).split(/[\s,，、]+/).filter(Boolean); const r = fromColors(cl); return { r: r.r, text: `${cl.join(' ')} = ${fmt(r.r, 'Ω')} ${r.tol}` }; } const r = g('r'); if (r == null) throw new Error('要填阻值或色碼'); const b = colorCode(r); return { colors: b, text: `${fmt(r, 'Ω')} 的四環色碼：${b.join(' ')} 金（±5%）${stdR(r, E24) !== +r.toPrecision(3) ? `\n注意：${fmt(r, 'Ω')} 不是標準值，最接近的是 ${fmt(stdR(r, E24), 'Ω')}` : ''}` }; }
    if (kind === 'series') { const list = (Array.isArray(a.list) ? a.list : String(a.list || '').split(/[\s,，、]+/)).filter(Boolean).map(num); if (list.length < 2) throw new Error('至少要兩個值'); const isC = /^c/i.test(a.kind || ''); const u = isC ? 'F' : 'Ω'; const sum = list.reduce((x, y) => x + y, 0); const par = 1 / list.reduce((x, y) => x + 1 / y, 0);
      return { series: isC ? par : sum, parallel: isC ? sum : par, text: isC ? `電容串聯：${fmt(par, u)}（1/C = 1/C1 + 1/C2 + …）\n電容並聯：${fmt(sum, u)}（相加）` : `電阻串聯：${fmt(sum, u)}（相加）\n電阻並聯：${fmt(par, u)}（1/R = 1/R1 + 1/R2 + …）` }; }
    if (kind === 'lc') { const l = g('l'), c = g('c'); if (l == null || c == null) throw new Error('要填電感和電容'); const f = 1 / (2 * Math.PI * Math.sqrt(l * c)); return { f, text: `共振頻率 f₀ = 1 ÷ (2π√(LC)) = ${fmt(f, 'Hz')}\n特性阻抗 √(L/C) = ${fmt(Math.sqrt(l / c), 'Ω')}` }; }
    if (kind === 'battery') { const mah = g('mah'), ma = g('ma'); if (mah == null || ma == null) throw new Error('要填電池容量（mAh）和耗電（mA）'); const h = (mah * 0.8) / ma; return { hours: h, text: `大約 ${h >= 48 ? (h / 24).toFixed(1) + ' 天' : h.toFixed(1) + ' 小時'}（${mah} mAh × 80% ÷ ${ma} mA）` }; }
    throw new Error('計算種類：' + Object.entries(CALC).map(([k, v]) => `${k}＝${v.name}`).join('、'));
  }
  // ---------------- 預設電路 ----------------
  const PRESETS = {
    divider: { name: '分壓電路', text: 'V1 vin 0 9\nR1 vin out 10k\nR2 out 0 4.7k' },
    led: { name: 'LED 加限流電阻', text: 'V1 vcc 0 5\nR1 vcc a 220\nLED1 a 0 red' },
    rc: { name: 'RC 充電', text: 'V1 vcc 0 5\nSW1 vcc a on\nR1 a b 10k\nC1 b 0 100u' },
    night: { name: '光控夜燈（光敏電阻＋電晶體）', text: 'V1 vcc 0 5\nR1 vcc s 10k\nLDR1 s 0\nR2 s b 4.7k\nQ1 c b 0 beta=150\nR3 vcc d 220\nLED1 d c white\nenv light=5' },
    reg: { name: '7805 穩壓電源', text: 'V1 vin 0 12\nU1 vin 0 vout 7805\nR1 vout a 330\nLED1 a 0 green\nR2 vout 0 1k' },
    amp: { name: '非反相放大器（增益 11）', text: 'V1 inp 0 0.5\nOP1 inp n out opamp vpos=12 vneg=-12\nR1 n 0 1k\nR2 n out 10k\nR3 out 0 10k' },
    blink: { name: '555 閃爍 LED', text: 'V1 vcc 0 9\nU1 vcc q 0 555 r1=1k r2=47k c=10u\nR1 q a 470\nLED1 a 0 red' },
    temp: { name: 'LM35 溫度感測', text: 'V1 vcc 0 5\nU1 vcc out 0 lm35\nR1 out 0 100k\nenv temp=30' },
    bridge: { name: '惠斯登電橋（熱敏電阻）', text: 'V1 vcc 0 5\nR1 vcc a 10k\nR2 a 0 10k\nR3 vcc b 10k\nNTC1 b 0 10k\nenv temp=35' },
    zener: { name: '齊納穩壓', text: 'V1 vin 0 12\nR1 vin z 470\nD1 0 z zener vz=5.1\nR2 z 0 2.2k' },
    rl: { name: 'RL 電路（電感電流慢慢上升）', text: 'V1 vcc 0 5\nR1 vcc a 220\nL1 a 0 100m' },
  };
  const preset = (k) => { const p = PRESETS[k] || PRESETS.led; const r = parse(p.text); return { title: p.name, parts: r.parts, env: { light: 300, temp: 25, ...r.env } }; };
  // ---------------- 電路圖 ----------------
  const COL = { V: '#f87171', wire: '#8aa0c0' };
  /** 零件符號（水平、長 60，從 x=-30 到 30，y=0）。回傳 SVG 片段 */
  function sym(p, on) {
    const t = p.type; const s = 'stroke="currentColor" fill="none" stroke-width="2"';
    const lead = (a, b) => `<path d="M-30,0 H${a} M${b},0 H30" ${s}/>`;
    if (t === 'R' || t === 'LAMP' && false) return `${lead(-18, 18)}<path d="M-18,0 l3,-7 l6,14 l6,-14 l6,14 l6,-14 l6,14 l3,-7" ${s}/>`;
    if (t === 'LDR') return `${lead(-16, 16)}<rect x="-16" y="-7" width="32" height="14" rx="2" ${s}/><path d="M-20,-22 l8,10 m-3,0 h3 v-3 M-8,-24 l8,10 m-3,0 h3 v-3" ${s} stroke-width="1.5"/>`;
    if (t === 'NTC') return `${lead(-16, 16)}<rect x="-16" y="-7" width="32" height="14" rx="2" ${s}/><path d="M-20,12 L18,-12 h6" ${s} stroke-width="1.5"/><text x="-26" y="-10" class="ck-sm">t°</text>`;
    if (t === 'POT') return `${lead(-18, 18)}<path d="M-18,0 l3,-7 l6,14 l6,-14 l6,14 l6,-14 l6,14 l3,-7" ${s}/><path d="M0,22 V9 m-4,4 l4,-4 l4,4" ${s}/>`;
    if (t === 'C') return `${lead(-4, 4)}<path d="M-4,-12 V12 M4,-12 V12" ${s} stroke-width="2.5"/>`;
    if (t === 'L') return `${lead(-20, 20)}<path d="M-20,0 a5,5 0 0 1 10,0 a5,5 0 0 1 10,0 a5,5 0 0 1 10,0 a5,5 0 0 1 10,0" ${s}/>`;
    if (t === 'V') return `${lead(-13, 13)}<circle r="13" ${s}/><text x="-8" y="-3" class="ck-pm">+</text><text x="4" y="-3" class="ck-pm">−</text>`;
    if (t === 'I') return `${lead(-13, 13)}<circle r="13" ${s}/><path d="M-7,0 H7 m-4,-4 l4,4 l-4,4" ${s}/>`;
    if (t === 'D' || t === 'LED') return `${lead(-9, 9)}<path d="M-9,-9 V9 L9,0 Z" ${s} ${on ? 'fill="currentColor" fill-opacity=".35"' : ''}/><path d="M9,-9 V9${p.model === 'zener' ? ' l4,3 M9,-9 l-4,-3' : ''}" ${s}/>${t === 'LED' ? `<path d="M2,-12 l7,-9 m-4,0 h4 v4 M8,-10 l7,-9 m-4,0 h4 v4" ${s} stroke-width="1.5"/>` : ''}`;
    if (t === 'SW') return `${lead(-14, 14)}<circle cx="-14" cy="0" r="2.5" fill="currentColor"/><circle cx="14" cy="0" r="2.5" fill="currentColor"/><path d="M-14,0 L${p.on ? '14,0' : '12,-12'}" ${s}/>`;
    if (t === 'LAMP') return `${lead(-12, 12)}<circle r="12" ${s} ${on ? 'fill="#fde68a" fill-opacity=".35"' : ''}/><path d="M-8,-8 L8,8 M8,-8 L-8,8" ${s} stroke-width="1.5"/>`;
    return lead(-20, 20) + `<rect x="-20" y="-12" width="40" height="24" rx="3" ${s}/>`;
  }
  /**
   * 自動排版：每個節點是一條直的「匯流線」，由電源正極往外排成一欄一欄；
   * 兩端都不是地的零件畫成橫的（接在兩條匯流線之間），一端接地的畫成直的（往下接到底部的地線）；
   * 3 腳零件（IC、電晶體、可變電阻）畫成方塊，第三支腳用「節點名稱標籤」連（同名的點就是接在一起）。
   */
  function svg(ckt, res = null, opt = {}) {
    const parts = (ckt.parts || []).filter((p) => TYPES[p.type]); if (!parts.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><text x="10" y="35" fill="#9aa">還沒有零件</text></svg>';
    // 節點排列：從第一個電壓源的正極開始 BFS
    const nodes = []; const seen = new Set(); const adj = {}; for (const p of parts) for (const a of p.n) for (const b of p.n) if (a !== b && !GND(a) && !GND(b)) (adj[a] = adj[a] || new Set()).add(b);
    const src = parts.find((p) => p.type === 'V' && !GND(p.n[0])); const start = src ? src.n[0] : (parts.flatMap((p) => p.n).find((n) => !GND(n)));
    const bfs = (s) => { const q = [s]; seen.add(s); while (q.length) { const x = q.shift(); nodes.push(x); for (const y of adj[x] || []) if (!seen.has(y)) { seen.add(y); q.push(y); } } };
    if (start) bfs(start); for (const p of parts) for (const n of p.n) if (!GND(n) && !seen.has(n)) bfs(n);
    const CW = 150, X0 = 70, SHW = 130; const isG = (n) => GND(n);
    const ioOf = (p) => { const [x, y, z] = p.n; return p.type === 'U7805' || p.type === 'OPAMP' || p.type === 'Q' ? [x, z, y] : [x, y, z]; };
    // 先數每個節點有幾個接地的零件（直的），那一欄就留多寬，標籤才不會疊在一起
    const cnt = {}; for (const p of parts) { if (p.n.length === 2) { const [a, b] = p.n; if (isG(a) !== isG(b)) { const n = isG(a) ? b : a; cnt[n] = (cnt[n] || 0) + 1; } else if (a === b && !isG(a)) cnt[a] = (cnt[a] || 0) + 1; } else { let [a, b] = ioOf(p); if (isG(a) && !isG(b)) [a, b] = [b, a]; if (isG(b) || a === b) cnt[a] = (cnt[a] || 0) + 1; } }
    const xs = {}; let xc = X0; for (const n of nodes) { xs[n] = xc; xc += CW + Math.max(0, (cnt[n] || 0) - 1) * SHW; } const colX = (n) => xs[n];
    // 零件分類
    const series = [], shunt = [], blocks = [];
    for (const p of parts) {
      if (p.n.length === 3) { blocks.push(p); continue; } const [a, b] = p.n;
      if (isG(a) && isG(b)) continue; if (isG(a) || isG(b)) shunt.push({ p, node: isG(a) ? b : a, flip: isG(a) }); else if (a === b) shunt.push({ p, node: a, short: true }); else series.push({ p, a, b, x1: Math.min(colX(a), colX(b)), x2: Math.max(colX(a), colX(b)), rev: colX(a) > colX(b) });
    }
    // 3 腳的放法：穩壓 IC／LM35／555＝IN（或 VCC）到 OUT 橫放、GND 往下；運放＝+ 輸入到輸出橫放、− 輸入用標籤；電晶體＝C 到 E；可變電阻＝a 到 b、滑動端用標籤
    const blk = blocks.map((p) => { const io = ioOf(p); return { p, a: io[0], b: io[1], third: io[2] }; });
    for (const B of blk) { if (isG(B.a) && !isG(B.b)) [B.a, B.b] = [B.b, B.a]; B.vert = isG(B.b); if (!B.vert) { B.x1 = Math.min(colX(B.a), colX(B.b)); B.x2 = Math.max(colX(B.a), colX(B.b)); B.rev = colX(B.a) > colX(B.b); if (B.a === B.b) B.vert = true; } }
    // 橫的零件分層（範圍不重疊的放同一層）
    const rowsOcc = []; const horiz = [...series, ...blk.filter((B) => !B.vert)].sort((u, v) => (u.x2 - u.x1) - (v.x2 - v.x1));
    for (const h of horiz) { if (h.x1 === h.x2) { h.x2 = h.x1 + 1; } let r = rowsOcc.findIndex((occ) => occ.every(([s, e]) => h.x2 <= s + 2 || h.x1 >= e - 2)); if (r < 0) { r = rowsOcc.length; rowsOcc.push([]); } rowsOcc[r].push([h.x1, h.x2]); h.row = r; }
    const RH = 86, top = 50; const rowY = (r) => top + 26 + (rowsOcc.length - 1 - r) * RH; const busTop = top + 10; const shY = top + Math.max(1, rowsOcc.length) * RH + 20;
    // 接地的零件（直的）：同一個節點有好幾個 → 往右錯開
    const shuntBy = {}; for (const s of [...shunt, ...blk.filter((B) => B.vert)]) { const n = s.node || s.a; (shuntBy[n] = shuntBy[n] || []).push(s); }
    for (const n of Object.keys(shuntBy)) shuntBy[n].forEach((s, i) => { s.x = colX(n) + i * SHW; });
    const gY = shY + 110; const W = Math.max(xc + 60, 320); const H = gY + 40;
    // 零件本體放在「兩欄之間的空隙」：跨好幾欄時挑中間那個空隙，不會壓在別的節點線上
    const gapX = (h) => { const inner = nodes.map(colX).filter((x) => x > h.x1 + 1 && x < h.x2 - 1).sort((a, b) => a - b); const pts = [h.x1, ...inner, h.x2]; const g = Math.floor((pts.length - 2) / 2); return (pts[g] + pts[g + 1]) / 2; };
    const R = res || null; const V = (n) => (R && !isG(n) && R.nodes[n] != null ? R.nodes[n] : isG(n) ? 0 : null); const PI = (id) => (R ? R.parts.find((x) => x.id === id) : null);
    let wires = '', body = '', labels = ''; const tag = (x, y, n, anchor = 'start') => `<g class="ck-tag"><rect x="${anchor === 'start' ? x : x - 6 - n.length * 7.2}" y="${y - 9}" width="${n.length * 7.2 + 6}" height="16" rx="8"/><text x="${anchor === 'start' ? x + 3 : x - 3}" y="${y + 3.5}" text-anchor="${anchor}" class="ck-tagt">${esc(n)}</text></g>`;
    // 節點匯流線
    for (const n of nodes) {
      const x = colX(n); const ys = [...horiz.filter((h) => h.a === n || h.b === n).map((h) => rowY(h.row)), ...(shuntBy[n] ? [shY] : [])]; if (!ys.length) ys.push(shY);
      const y1 = Math.min(...ys), y2 = Math.max(...ys); wires += `<path d="M${x},${y1} V${y2}" class="ck-w"/>`;
      if (shuntBy[n] && shuntBy[n].length > 1) wires += `<path d="M${x},${shY} H${shuntBy[n][shuntBy[n].length - 1].x}" class="ck-w"/>`;
      const v = V(n); labels += `<text x="${x}" y="${y1 - 20}" text-anchor="middle" class="ck-node">${esc(n)}</text>${v != null ? `<text x="${x}" y="${y1 - 7}" text-anchor="middle" class="ck-volt">${esc(fmt(v, 'V'))}</text>` : ''}<circle cx="${x}" cy="${y1}" r="3" class="ck-dot"/>`;
      for (const y of ys) if (y !== y1) body += `<circle cx="${x}" cy="${y}" r="3" class="ck-dot"/>`;
    }
    const partLabel = (p, x, y, anchor = 'middle', dy = -22) => { const r = PI(p.id); const cur = r && r.i != null && p.type !== 'C' ? fmt(Math.abs(r.i) < 1e-9 ? 0 : Math.abs(r.i), 'A') : ''; return `<text x="${x}" y="${y + dy}" text-anchor="${anchor}" class="ck-id">${esc(p.id)}　${esc(describe(p))}</text>${cur || (r && r.note) ? `<text x="${x}" y="${y + dy + 13}" text-anchor="${anchor}" class="ck-cur">${esc([cur, r && r.note].filter(Boolean).join('　'))}</text>` : ''}`; };
    const lit = (p) => { const r = PI(p.id); return r && (p.type === 'LED' ? r.i > 0.0002 : p.type === 'LAMP' ? Math.abs(r.v) > (p.rv || 6) * 0.5 : false); };
    const ledColor = (p) => ({ red: '#f87171', orange: '#fb923c', yellow: '#facc15', green: '#4ade80', blue: '#60a5fa', white: '#f8fafc', ir: '#a78bfa', uv: '#c084fc' }[p.color] || '#f87171');
    // 橫的零件
    for (const h of horiz.filter((x) => !x.p.n || x.p.n.length === 2)) {
      const p = h.p; const y = rowY(h.row); const k = Math.max(1, Math.round((h.x2 - h.x1) / CW)); const cx = gapX(h); const flip = p.type === 'V' ? colX(p.n[0]) > colX(p.n[1]) : p.type === 'D' || p.type === 'LED' || p.type === 'I' ? colX(p.n[0]) > colX(p.n[1]) : false;
      wires += `<path d="M${h.x1},${y} H${cx - 30} M${cx + 30},${y} H${h.x2}" class="ck-w"/>`;
      body += `<g transform="translate(${cx},${y})${flip ? ' scale(-1,1)' : ''}" class="ck-p" style="color:${p.type === 'LED' ? ledColor(p) : p.type === 'V' ? COL.V : 'var(--ck-part,#dbe4f3)'}" data-part="${esc(p.id)}">${sym(p, lit(p))}</g>`; labels += partLabel(p, cx, y);
    }
    // 直的零件（往下接地）
    for (const n of Object.keys(shuntBy)) for (const s of shuntBy[n]) {
      const p = s.p; const x = s.x; const y1 = shY, y2 = gY; const cy = (y1 + y2) / 2; const three = p.n.length === 3;
      if (three) { wires += `<path d="M${x},${y1} V${cy - 26} M${x},${cy + 26} V${y2}" class="ck-w"/>`; body += blockSvg(s, x, cy, true); labels += partLabel(p, x + 30, cy, 'start', -6); continue; }
      const up = s.flip ? p.n[1] : p.n[0]; void up; const pointUp = p.type === 'V' ? GND(p.n[0]) : (p.type === 'D' || p.type === 'LED' || p.type === 'I') ? GND(p.n[0]) : false;
      wires += `<path d="M${x},${y1} V${cy - 30} M${x},${cy + 30} V${y2}" class="ck-w"/>`;
      body += `<g transform="translate(${x},${cy}) rotate(${pointUp ? -90 : 90})" class="ck-p" style="color:${p.type === 'LED' ? ledColor(p) : p.type === 'V' ? COL.V : 'var(--ck-part,#dbe4f3)'}" data-part="${esc(p.id)}">${sym(p, lit(p))}</g>`; labels += partLabel(p, x + 22, cy, 'start', -4);
    }
    // 3 腳零件
    function blockSvg(B, cx, cy, vertical) {
      const p = B.p; const lab = { U7805: [`${p.vout || 5}V`, 'IN', 'OUT', 'GND'], LM35: ['LM35', '+Vs', 'OUT', 'GND'], NE555: ['555', 'VCC', 'OUT', 'GND'], OPAMP: ['', '+', 'OUT', '−'], Q: ['NPN', 'C', 'E', 'B'], POT: ['', 'a', 'b', 'W'] }[p.type] || ['IC', '1', '2', '3'];
      const third = B.third; let g = '';
      if (p.type === 'OPAMP') g += `<path d="M${cx - 26},${cy - 26} L${cx + 26},${cy} L${cx - 26},${cy + 26} Z" class="ck-blk"/><text x="${cx - 20}" y="${cy - 8}" class="ck-pin">+</text><text x="${cx - 20}" y="${cy + 16}" class="ck-pin">−</text>`;
      else if (p.type === 'Q') g += `<circle cx="${cx}" cy="${cy}" r="20" class="ck-blk"/><path d="M${cx - 6},${cy - 12} V${cy + 12} M${cx - 6},${cy - 5} L${cx + 10},${cy - 16} M${cx - 6},${cy + 5} L${cx + 10},${cy + 16} m-7,-1 l7,1 l-2,-7" class="ck-sym"/>`;
      else if (p.type === 'POT') g += `<g transform="translate(${cx},${cy})${vertical ? ' rotate(90)' : ''}" class="ck-p" style="color:var(--ck-part,#dbe4f3)">${sym(p)}</g>`;
      else g += `<rect x="${cx - 28}" y="${cy - 22}" width="56" height="44" rx="5" class="ck-blk"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" class="ck-bt">${esc(lab[0])}</text>`;
      // 第三支腳
      if (third != null) { const tx = vertical ? cx - 30 : cx; const ty = vertical ? cy : cy + 26; const tx2 = vertical ? cx - 54 : cx; const ty2 = vertical ? cy : cy + 48;
        if (GND(third) && !vertical) g += `<path d="M${cx},${cy + 22} V${gY}" class="ck-w"/>`;
        else { g += `<path d="M${tx},${ty} ${vertical ? 'H' : 'V'}${vertical ? tx2 : ty2}" class="ck-w"/>`; g += tag(tx2 - 4, ty2, `${lab[3]}→${GND(third) ? 'GND' : third}`, 'end'); } }
      return `<g data-part="${esc(p.id)}" class="ck-p">${g}</g>`;
    }
    for (const B of blk.filter((x) => !x.vert)) { const y = rowY(B.row); const cx = gapX(B); wires += `<path d="M${B.x1},${y} H${cx - 28} M${cx + 28},${y} H${B.x2}" class="ck-w"/>`; body += blockSvg(B, cx, y, false); labels += partLabel(B.p, cx - 6, y, 'end', 38); }
    // 地線
    const gx1 = Math.min(X0, ...Object.values(shuntBy).flat().map((s) => s.x)), gx2 = Math.max(X0, ...Object.values(shuntBy).flat().map((s) => s.x), ...blk.filter((B) => !B.vert && GND(B.third)).map((B) => (B.x1 + B.x2) / 2));
    const anyG = parts.some((p) => p.n.some(GND)); if (anyG) { wires += `<path d="M${gx1},${gY} H${gx2}" class="ck-w"/><path d="M${gx1},${gY} V${gY + 10} M${gx1 - 12},${gY + 10} H${gx1 + 12} M${gx1 - 8},${gY + 15} H${gx1 + 8} M${gx1 - 4},${gY + 20} H${gx1 + 4}" class="ck-w"/>`; labels += `<text x="${gx1 + 18}" y="${gY + 18}" class="ck-node">GND 0 V</text>`; }
    const title = opt.title ? `<text x="10" y="20" class="ck-title">${esc(opt.title)}</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" class="lg-svg ck-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><style>.ck-w{fill:none;stroke:var(--lg-wire,#8aa0c0);stroke-width:2}.ck-dot{fill:var(--lg-wire,#8aa0c0)}.ck-node{font:700 12px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.ck-volt{font:700 11px system-ui,sans-serif;fill:#fbbf24}.ck-id{font:600 10.5px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.ck-cur{font:600 10px system-ui,sans-serif;fill:#34d399}.ck-pm{font:700 10px system-ui,sans-serif;fill:currentColor}.ck-sm{font:600 9px system-ui,sans-serif;fill:currentColor}.ck-blk{fill:var(--lg-fill,#1b2232);stroke:var(--lg-stroke,#cfd8e6);stroke-width:2}.ck-sym{fill:none;stroke:var(--lg-stroke,#cfd8e6);stroke-width:2}.ck-bt{font:700 12px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.ck-pin{font:700 12px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.ck-tag rect{fill:var(--lg-fill,#1b2232);stroke:#a78bfa}.ck-tagt{font:600 10px system-ui,sans-serif;fill:#c4b5fd}.ck-title{font:700 13px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.ck-p{cursor:pointer}</style>${title}<g>${wires}</g>${body}${labels}</svg>`;
  }
  // ---------------- 文字報告（給 AI） ----------------
  function report(ckt, o = {}) {
    const r = dc(ckt); const L = [`電路：${ckt.title || '（未命名）'}（${(ckt.parts || []).length} 個零件）`, '零件清單：', format(ckt), '', '節點電壓（對地）：', ...Object.entries(r.nodes).map(([n, v]) => `・${n}：${fmt(v, 'V')}`), '', '零件：'];
    for (const p of r.parts) L.push(`・${p.id}（${p.name}，${p.desc}）：電壓 ${fmt(p.v, 'V')}${p.i != null ? `、電流 ${fmt(p.i, 'A')}` : ''}${p.p != null ? `、功率 ${fmt(Math.abs(p.p), 'W')}` : ''}${p.note ? `、${p.note}` : ''}${p.extra ? `（${p.extra}）` : ''}`);
    L.push('', `電源總共提供 ${fmt(r.power, 'W')}`); if (r.warnings.length) L.push('', '注意：', ...r.warnings.map((w) => '・' + w));
    const env = { light: 300, temp: 25, ...(ckt.env || {}) }; if ((ckt.parts || []).some((p) => p.type === 'LDR')) L.push(`（光線 ${env.light} lux）`); if ((ckt.parts || []).some((p) => ['NTC', 'LM35'].includes(p.type))) L.push(`（溫度 ${env.temp}°C）`);
    if (o.tran && (ckt.parts || []).some((p) => ['C', 'L', 'NE555'].includes(p.type))) { const tr = tran(ckt, o.tran === true ? {} : o.tran); L.push('', `時間模擬 0～${fmt(tr.t_end, 's')}：`); for (const [id, arr] of Object.entries(tr.vc)) { const i63 = arr.findIndex((v) => Math.abs(v) >= Math.abs(arr[arr.length - 1]) * 0.632); L.push(`・${id} 電壓：${fmt(arr[0], 'V')} → ${fmt(arr[arr.length - 1], 'V')}${i63 > 0 ? `（到 63% 約 ${fmt(tr.t[i63], 's')}）` : ''}`); } for (const [id, arr] of Object.entries(tr.il)) L.push(`・${id} 電流：${fmt(arr[0], 'A')} → ${fmt(arr[arr.length - 1], 'A')}`); }
    return L.join('\n');
  }
  return { parse, format, num, fmt, solve, dc, tran, tranChart, calc, CALC, stdR, colorCode, fromColors, PRESETS, preset, svg, report, TYPES, pinNames, describe, LEDC, ldrR, ntcR };
});
