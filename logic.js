'use strict';
/*
 * 26.11.3 pro2 邏輯閘轉換器（App 頁面與 AI 工具共用；瀏覽器是 LA.logic，Node 是 require('ui/logic.js')）
 *  ・解析：布林式（A'B + BC、~A&B|C、A⊕B、(A+B)(C+D)…）、最小項 Σm(1,3,5)+d(7)、最大項 ΠM(0,2)
 *  ・真值表、Quine–McCluskey（含 don't care）求最簡 SOP／POS
 *  ・轉成只用 NAND（由 SOP）或只用 NOR（由 POS）的電路，可限制每個閘的輸入數（配合 IC）
 *  ・畫邏輯圖（SVG），可以帶模擬值（線變色）
 *  ・IC 接線：7400／7402／7404／7408／7432／7486／7410／7411／7427／7420／7421／7430／74266、CMOS 4011／4001／4069／4081／4071／4070…
 */
(function (root, factory) { const L = factory(); if (typeof module === 'object' && module.exports) module.exports = L; else { root.LA = root.LA || {}; root.LA.logic = L; } })(typeof window !== 'undefined' ? window : globalThis, function () {
  // ======================= 解析 =======================
  const OPS = { and: ['·', '*', '&', '∧', '⋅', '×'], or: ['+', '|', '∨'], xor: ['^', '⊕'], notPre: ['~', '!', '¬'], notPost: ["'", '’', '′'] };
  function tokenize(s, varList) {
    const t = []; let i = 0; s = String(s);
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '(' || c === ')') { t.push({ k: c }); i++; continue; }
      if (OPS.and.includes(c)) { t.push({ k: 'and' }); i++; continue; }
      if (OPS.or.includes(c)) { t.push({ k: 'or' }); i++; continue; }
      if (OPS.xor.includes(c)) { t.push({ k: 'xor' }); i++; continue; }
      if (OPS.notPre.includes(c)) { t.push({ k: 'not' }); i++; continue; }
      if (OPS.notPost.includes(c)) { t.push({ k: 'post' }); i++; continue; }
      if (c === '0' || c === '1') { t.push({ k: 'const', v: +c }); i++; continue; }
      if (/[A-Za-z_]/.test(c)) {
        let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; const w = s.slice(i, j); const W = w.toUpperCase();
        if (['AND', 'OR', 'XOR', 'NOT'].includes(W) && (w === W || w === w.toLowerCase())) { t.push({ k: W === 'NOT' ? 'not' : W.toLowerCase() }); i = j; continue; }
        if (varList && varList.length) {   // 有宣告變數：用最長的符合
          let k = i; while (k < j) { const hit = varList.filter((v) => s.startsWith(v, k)).sort((a, b) => b.length - a.length)[0]; if (!hit) throw new Error(`不認得的變數「${s.slice(k, j)}」`); t.push({ k: 'var', v: hit }); k += hit.length; }
        } else for (const ch of w) { if (!/[A-Za-z]/.test(ch)) throw new Error(`變數名稱「${w}」看不懂：沒有先宣告變數時，每個變數用一個英文字母（例 F(A,B,Cin)= 可以宣告多字母變數）`); t.push({ k: 'var', v: ch.toUpperCase() }); }
        i = j; continue;
      }
      throw new Error(`看不懂的符號「${c}」`);
    }
    return t;
  }
  function parseExpr(src, varList) {
    const t = tokenize(src, varList); let p = 0; const peek = () => t[p];
    const atomStart = (x) => x && (x.k === 'var' || x.k === 'const' || x.k === '(' || x.k === 'not');
    function primary() {
      const x = t[p]; if (!x) throw new Error('算式不完整');
      let n;
      if (x.k === 'not') { p++; n = { op: 'not', a: primary() }; }
      else if (x.k === '(') { p++; n = orE(); if (!t[p] || t[p].k !== ')') throw new Error('括號沒有配對'); p++; }
      else if (x.k === 'var') { p++; n = { op: 'var', v: x.v }; }
      else if (x.k === 'const') { p++; n = { op: 'const', v: x.v }; }
      else throw new Error('算式格式不對');
      while (peek() && peek().k === 'post') { p++; n = { op: 'not', a: n }; }
      return n;
    }
    function andE() { let n = primary(); while (peek() && (peek().k === 'and' || atomStart(peek()))) { if (peek().k === 'and') p++; n = { op: 'and', a: n, b: primary() }; } return n; }
    function xorE() { let n = andE(); while (peek() && peek().k === 'xor') { p++; n = { op: 'xor', a: n, b: andE() }; } return n; }
    function orE() { let n = xorE(); while (peek() && peek().k === 'or') { p++; n = { op: 'or', a: n, b: xorE() }; } return n; }
    const ast = orE(); if (p < t.length) throw new Error('算式後面有多餘的東西'); return ast;
  }
  const varsOf = (n, s = new Set()) => { if (n.op === 'var') s.add(n.v); if (n.a) varsOf(n.a, s); if (n.b) varsOf(n.b, s); return s; };
  const evalAst = (n, env) => { switch (n.op) { case 'var': return env[n.v] ? 1 : 0; case 'const': return n.v; case 'not': return 1 - evalAst(n.a, env); case 'and': return evalAst(n.a, env) & evalAst(n.b, env); case 'or': return evalAst(n.a, env) | evalAst(n.b, env); case 'xor': return evalAst(n.a, env) ^ evalAst(n.b, env); default: return 0; } };
  const nums = (s) => String(s || '').split(/[,，\s]+/).filter(Boolean).map((x) => { const v = Number(x); if (!Number.isInteger(v) || v < 0) throw new Error(`「${x}」不是編號`); return v; });
  /**
   * 解析使用者輸入 → { vars, minterms, dc, name }
   *   F(A,B,C) = A'B + C ｜ A'B + C ｜ Σm(1,3,5)+d(7) ｜ F(A,B,C,D)=Σm(0,2,8) ｜ ΠM(0,4)
   */
  function parse(input) {
    let s = String(input || '').trim().replace(/[＝]/g, '=').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[，]/g, ',').replace(/[＋]/g, '+'); if (!s) throw new Error('請輸入布林式或最小項');
    let name = 'F', vars = null; const h = /^([A-Za-z]\w*)\s*\(([^)]*)\)\s*=\s*/.exec(s);
    if (h) { name = h[1]; vars = h[2].split(/[,\s]+/).filter(Boolean); s = s.slice(h[0].length); } else { const h2 = /^([A-Za-z]\w*)\s*=\s*/.exec(s); if (h2) { name = h2[1]; s = s.slice(h2[0].length); } }
    const mm = /^(?:Σ|∑|sum|m)\s*m?\s*\(([^)]*)\)\s*(?:\+\s*(?:Σ|∑)?\s*d\s*\(([^)]*)\))?\s*$/i.exec(s); const MM = /^(?:Π|∏|prod|M)\s*M?\s*\(([^)]*)\)\s*(?:[+·*]?\s*(?:Π|∏)?\s*[dD]\s*\(([^)]*)\))?\s*$/.exec(s);
    if (mm || MM) {
      const list = nums((mm || MM)[1]); const dc = nums((mm || MM)[2]); const mx = Math.max(0, ...list, ...dc);
      if (!vars) { let n = 1; while ((1 << n) <= mx) n++; n = Math.max(n, 2); vars = 'ABCDEFGH'.slice(0, n).split(''); }
      const N = 1 << vars.length; if (vars.length > 8) throw new Error('最多 8 個變數'); if (mx >= N) throw new Error(`${vars.length} 個變數最大編號是 ${N - 1}`);
      const minterms = mm ? list : [...Array(N).keys()].filter((i) => !list.includes(i) && !dc.includes(i));
      return { name, vars, minterms: [...new Set(minterms)].filter((x) => !dc.includes(x)).sort((a, b) => a - b), dc: [...new Set(dc)].sort((a, b) => a - b) };
    }
    const ast = parseExpr(s, vars); if (!vars) vars = [...varsOf(ast)].sort(); if (!vars.length) vars = ['A'];
    if (vars.length > 8) throw new Error('最多 8 個變數');
    return { name, vars, minterms: truth(vars, (env) => evalAst(ast, env)), dc: [], ast };
  }
  /** 依 env 計算 → 回傳值為 1 的最小項編號（變數順序：第一個是最高位） */
  function truth(vars, f) { const out = []; const n = vars.length; for (let i = 0; i < 1 << n; i++) { const env = {}; vars.forEach((v, k) => { env[v] = (i >> (n - 1 - k)) & 1; }); if (f(env)) out.push(i); } return out; }

  // ======================= Quine–McCluskey =======================
  /** 回傳最簡的乘積項清單（每項是長度 n 的字串，'1'／'0'／'-'） */
  function minimize(n, ones, dc = []) {
    const N = 1 << n; if (!ones.length) return []; if (ones.length + dc.length === N) return ['-'.repeat(n)];
    const bin = (x) => x.toString(2).padStart(n, '0');
    let cur = [...new Set([...ones, ...dc])].map((m) => ({ p: bin(m), cov: [m] })); const primes = [];
    while (cur.length) {
      const next = new Map(); const used = new Set();
      for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
        const a = cur[i].p, b = cur[j].p; let diff = -1, ok = true; for (let k = 0; k < n; k++) if (a[k] !== b[k]) { if (a[k] === '-' || b[k] === '-' || diff >= 0) { ok = false; break; } diff = k; }
        if (!ok || diff < 0) continue; const p = a.slice(0, diff) + '-' + a.slice(diff + 1); used.add(i); used.add(j);
        if (!next.has(p)) next.set(p, { p, cov: [...new Set([...cur[i].cov, ...cur[j].cov])] });
      }
      cur.forEach((x, i) => { if (!used.has(i) && !primes.some((q) => q.p === x.p)) primes.push(x); }); cur = [...next.values()];
    }
    // 涵蓋：先挑必要主項，剩下用 Petrick（小規模精確），太大就貪婪
    const need = new Set(ones); const chosen = []; const lits = (p) => [...p].filter((c) => c !== '-').length;
    let changed = true;
    while (changed) { changed = false; for (const m of need) { const c = primes.filter((q) => q.cov.includes(m)); if (c.length === 1) { const q = c[0]; if (!chosen.includes(q)) chosen.push(q); q.cov.forEach((x) => need.delete(x)); changed = true; break; } } }
    if (need.size) {
      const cand = primes.filter((q) => !chosen.includes(q) && q.cov.some((m) => need.has(m)));
      if (cand.length <= 20) {   // Petrick：所有組合裡挑項數最少、字面最少的
        let best = null; const L = cand.length;
        for (let mask = 1; mask < 1 << L; mask++) {
          const pick = cand.filter((_, i) => mask & (1 << i)); if (best && pick.length > best.length) continue;
          if (![...need].every((m) => pick.some((q) => q.cov.includes(m)))) continue;
          const cost = pick.reduce((a, q) => a + lits(q.p), 0);
          if (!best || pick.length < best.length || (pick.length === best.length && cost < best.cost)) best = Object.assign(pick, { cost });
        }
        chosen.push(...best);
      } else { while (need.size) { cand.sort((a, b) => b.cov.filter((m) => need.has(m)).length - a.cov.filter((m) => need.has(m)).length || lits(a.p) - lits(b.p)); const q = cand.shift(); chosen.push(q); q.cov.forEach((x) => need.delete(x)); } }
    }
    return chosen.map((q) => q.p).sort();
  }
  const termSop = (p, vars) => { const l = [...p].map((c, i) => (c === '1' ? vars[i] : c === '0' ? vars[i] + "'" : '')).filter(Boolean); return l.length ? l.join('') : '1'; };
  const termPos = (p, vars) => { const l = [...p].map((c, i) => (c === '0' ? vars[i] : c === '1' ? vars[i] + "'" : '')).filter(Boolean); return l.length > 1 ? '(' + l.join(' + ') + ')' : l[0] || '0'; };
  const joinSop = (terms, vars) => (!terms.length ? '0' : terms.map((p) => termSop(p, vars)).join(' + '));
  const joinPos = (terms, vars) => (!terms.length ? '1' : terms.map((p) => termPos(p, vars)).join(''));

  /** 完整推算：最簡 SOP、最簡 POS、NAND 式、NOR 式 */
  function solve(input) {
    const f = typeof input === 'string' ? parse(input) : input; const { vars } = f; const n = vars.length; const N = 1 << n;
    const sop = minimize(n, f.minterms, f.dc); const zeros = [...Array(N).keys()].filter((i) => !f.minterms.includes(i) && !f.dc.includes(i)); const posImp = minimize(n, zeros, f.dc);
    const sopStr = joinSop(sop, vars); const posStr = joinPos(posImp, vars);
    const lit = (v, neg) => (neg ? v + "'" : v);
    // NAND 式：F = ((T1)'(T2)')'；NOR 式：F = ((S1)' + (S2)')'
    const nandTerm = (p) => { const l = [...p].map((c, i) => (c === '-' ? null : lit(vars[i], c === '0'))).filter(Boolean); return l.length === 1 ? (l[0].endsWith("'") ? l[0].slice(0, -1) : l[0] + "'") : '(' + l.join('·') + ")'"; };
    const norTerm = (p) => { const l = [...p].map((c, i) => (c === '-' ? null : lit(vars[i], c === '1'))).filter(Boolean); return l.length === 1 ? (l[0].endsWith("'") ? l[0].slice(0, -1) : l[0] + "'") : '(' + l.join(' + ') + ")'"; };
    const one = (p) => [...p].filter((c) => c !== '-').length === 1; const litOf = (p, negOn) => { const i = [...p].findIndex((c) => c !== '-'); return { v: vars[i], neg: p[i] === negOn }; };
    const nandStr = !sop.length ? '0' : sop.length === 1 && sop[0] === '-'.repeat(n) ? '1' : sop.length === 1 && one(sop[0]) ? (litOf(sop[0], '0').neg ? `(${litOf(sop[0], '0').v}·${litOf(sop[0], '0').v})'` : litOf(sop[0], '0').v) : sop.length === 1 ? `((${termSop(sop[0], vars).replace(/(\w'?)(?=\w)/g, '$1·')})')'` : `(${sop.map(nandTerm).join('·')})'`;
    const norStr = !posImp.length ? '1' : posImp.length === 1 && posImp[0] === '-'.repeat(n) ? '0' : posImp.length === 1 && one(posImp[0]) ? (litOf(posImp[0], '1').neg ? `(${litOf(posImp[0], '1').v} + ${litOf(posImp[0], '1').v})'` : litOf(posImp[0], '1').v) : posImp.length === 1 ? `((${termPos(posImp[0], vars).replace(/^\(|\)$/g, '')})')'` : `(${posImp.map(norTerm).join(' + ')})'`;
    return { ...f, sop, pos: posImp, sopStr, posStr, nandStr, norStr, table: [...Array(N).keys()].map((i) => ({ i, bits: i.toString(2).padStart(n, '0'), f: f.dc.includes(i) ? 'X' : f.minterms.includes(i) ? 1 : 0 })) };
  }

  // ======================= 電路（netlist）=======================
  // { inputs:[名稱], gates:[{id, type:'AND'|'OR'|'NOT'|'NAND'|'NOR'|'XOR'|'XNOR'|'BUF', ins:[訊號], out:'n1'}], output:'訊號' }
  function builder(inputs) {
    const g = []; let k = 0; const add = (type, ins) => { const out = 'n' + (++k); g.push({ id: 'g' + k, type, ins, out }); return out; };
    return { inputs, gates: g, add, done: (out) => ({ inputs, gates: g, output: out }) };
  }
  /** 多輸入閘拆成最多 k 個輸入（配合 IC）：AND/OR 用樹狀；NAND/NOR 先做出 AND/OR 再反相 */
  function wide(b, type, ins, k) {
    if (ins.length <= k || k <= 1) return b.add(type, ins);
    const chunks = []; for (let i = 0; i < ins.length; i += k) chunks.push(ins.slice(i, i + k));
    if (type === 'AND' || type === 'OR') return wide(b, type, chunks.map((c) => (c.length === 1 ? c[0] : b.add(type, c))), k);
    // NAND(x1…xn)＝NAND(AND(第1組), AND(第2組)…)；AND(組)＝NAND(t, t)，t＝NAND(組)。NOR 同理（OR(組)＝NOR(t, t)）
    const parts = chunks.map((c) => { if (c.length === 1) return c[0]; const t = b.add(type, c); return b.add(type, [t, t]); });
    return wide(b, type, parts, k);
  }
  /** 依形式建電路：sop（AND-OR-NOT）、pos（OR-AND-NOT）、nand（全 NAND）、nor（全 NOR）；k＝每閘最多輸入數 */
  function circuit(sol, form = 'sop', k = 8) {
    const { vars, sop, pos } = sol; const n = vars.length; const b = builder(vars.slice()); const all = '-'.repeat(n);
    const constOut = (v) => b.done(v ? '1' : '0');
    if (form === 'sop' || form === 'nand') {
      if (!sop.length) return constOut(0); if (sop.includes(all)) return constOut(1);
      const inv = {}; const neg = (v) => inv[v] || (inv[v] = form === 'nand' ? b.add('NAND', [v, v]) : b.add('NOT', [v]));
      const lits = (p) => [...p].map((c, i) => (c === '-' ? null : c === '1' ? vars[i] : neg(vars[i]))).filter(Boolean);
      if (form === 'sop') { const terms = sop.map((p) => { const l = lits(p); return l.length === 1 ? l[0] : wide(b, 'AND', l, k); }); return b.done(terms.length === 1 ? terms[0] : wide(b, 'OR', terms, k)); }
      if (sop.length === 1 && [...sop[0]].filter((c) => c !== '-').length === 1) { const i = [...sop[0]].findIndex((c) => c !== '-'); return b.done(sop[0][i] === '1' ? vars[i] : neg(vars[i])); }   // 只有一個變數：直接接線（或一個反相）
      // NAND-NAND：每項 NAND(字面)；單一字面的項要反相；最後 NAND(各項)
      const firsts = sop.map((p) => { const l = [...p].map((c, i) => (c === '-' ? null : { v: vars[i], neg: c === '0' })).filter(Boolean); if (l.length === 1) return l[0].neg ? l[0].v : neg(l[0].v); return wide(b, 'NAND', l.map((x) => (x.neg ? neg(x.v) : x.v)), k); });
      if (firsts.length === 1) { const s = firsts[0]; return b.done(b.add('NAND', [s, s])); }
      return b.done(wide(b, 'NAND', firsts, k));
    }
    if (!pos.length) return constOut(1); if (pos.includes(all)) return constOut(0);
    const inv = {}; const neg = (v) => inv[v] || (inv[v] = form === 'nor' ? b.add('NOR', [v, v]) : b.add('NOT', [v]));
    if (form === 'pos') { const sums = pos.map((p) => { const l = [...p].map((c, i) => (c === '-' ? null : c === '0' ? vars[i] : neg(vars[i]))).filter(Boolean); return l.length === 1 ? l[0] : wide(b, 'OR', l, k); }); return b.done(sums.length === 1 ? sums[0] : wide(b, 'AND', sums, k)); }
    if (pos.length === 1 && [...pos[0]].filter((c) => c !== '-').length === 1) { const i = [...pos[0]].findIndex((c) => c !== '-'); return b.done(pos[0][i] === '0' ? vars[i] : neg(vars[i])); }
    const firsts = pos.map((p) => { const l = [...p].map((c, i) => (c === '-' ? null : { v: vars[i], neg: c === '1' })).filter(Boolean); if (l.length === 1) return l[0].neg ? l[0].v : neg(l[0].v); return wide(b, 'NOR', l.map((x) => (x.neg ? neg(x.v) : x.v)), k); });
    if (firsts.length === 1) { const s = firsts[0]; return b.done(b.add('NOR', [s, s])); }
    return b.done(wide(b, 'NOR', firsts, k));
  }
  const GATE = { AND: (a) => a.every(Boolean), OR: (a) => a.some(Boolean), NAND: (a) => !a.every(Boolean), NOR: (a) => !a.some(Boolean), XOR: (a) => a.reduce((x, y) => x ^ y, 0) === 1, XNOR: (a) => a.reduce((x, y) => x ^ y, 0) === 0, NOT: (a) => !a[0], BUF: (a) => !!a[0] };
  /** 模擬：回傳每個訊號的值 */
  function simulate(c, env) {
    const val = { 0: 0, 1: 1, ...Object.fromEntries(c.inputs.map((v) => [v, env[v] ? 1 : 0])) }; const pending = c.gates.slice(); let guard = 0;
    while (pending.length && guard++ < 1000) { for (let i = 0; i < pending.length; i++) { const g = pending[i]; if (g.ins.every((s) => s in val)) { val[g.out] = GATE[g.type](g.ins.map((s) => val[s])) ? 1 : 0; pending.splice(i, 1); i--; } } }
    if (pending.length) throw new Error('電路有迴圈或接到不存在的訊號'); return val;
  }
  const circuitMinterms = (c) => truth(c.inputs, (env) => simulate(c, env)[c.output]);
  /** 電路 → 算式（顯示用） */
  function circuitExpr(c) {
    const by = Object.fromEntries(c.gates.map((g) => [g.out, g])); const memo = {};
    const ex = (s, top) => { if (!by[s]) return s; if (memo[s]) return memo[s]; const g = by[s]; const a = g.ins.map((x) => ex(x));
      const wrap = (t) => (top ? t : '(' + t + ')'); let r;
      switch (g.type) { case 'NOT': r = /^[A-Za-z0-9]+$/.test(a[0]) ? a[0] + "'" : '(' + a[0] + ")'"; break; case 'BUF': r = a[0]; break; case 'AND': r = a.join('·'); break; case 'OR': r = wrap(a.join(' + ')); break; case 'XOR': r = wrap(a.join(' ⊕ ')); break;
        case 'NAND': r = '(' + a.join('·') + ")'"; break; case 'NOR': r = '(' + a.join(' + ') + ")'"; break; case 'XNOR': r = '(' + a.join(' ⊕ ') + ")'"; break; default: r = s; }
      return (memo[s] = r); };
    return ex(c.output, true);
  }

  // ======================= 畫圖（SVG）=======================
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function gateShape(type, w, h) {
    const bub = /^(NAND|NOR|NOT|XNOR)$/.test(type); const bw = bub ? w - 8 : w; let d;
    if (type === 'AND' || type === 'NAND') d = `M0,0 H${bw / 2} A${bw / 2},${h / 2} 0 0 1 ${bw / 2},${h} H0 Z`;
    else if (type === 'NOT' || type === 'BUF') d = `M0,0 L${bw},${h / 2} L0,${h} Z`;
    else d = `M0,0 Q${bw * 0.3},${h / 2} 0,${h} Q${bw * 0.7},${h} ${bw},${h / 2} Q${bw * 0.7},0 0,0 Z`;
    let extra = ''; if (type === 'XOR' || type === 'XNOR') extra = `<path d="M-6,0 Q${bw * 0.3 - 6},${h / 2} -6,${h}" fill="none"/>`;
    if (bub) extra += `<circle cx="${bw + 4}" cy="${h / 2}" r="4"/>`;
    return `<path d="${d}"/>${extra}`;
  }
  /**
   * 畫電路。opts: { values（模擬值）, clickable（閘可點）, title }
   * 版面：輸入在左；每個閘依「離輸入多遠」排欄；同欄依輸入位置排上下
   */
  function svg(c, opts = {}) {
    const by = Object.fromEntries(c.gates.map((g) => [g.out, g])); const depth = {}; const D = (s) => { if (!by[s]) return 0; if (depth[s] != null) return depth[s]; depth[s] = 0; return (depth[s] = 1 + Math.max(...by[s].ins.map(D))); };
    c.gates.forEach((g) => D(g.out)); const maxD = Math.max(0, ...c.gates.map((g) => depth[g.out]));
    // 欄位改成「離輸出多遠」靠右對齊：同一層的閘排在一起，線不會穿過別的閘（只有接不到輸出的閘才照輸入深度）
    const cons = {}; c.gates.forEach((g) => g.ins.forEach((s0) => { (cons[s0] = cons[s0] || []).push(g.out); }));
    const hgt = {}; const Hh = (s0) => { if (hgt[s0] != null) return hgt[s0]; hgt[s0] = 0; const cs = cons[s0] || []; return (hgt[s0] = cs.length ? 1 + Math.max(...cs.map(Hh)) : 0); };
    // 26.11.3 pro5：支援多個輸出（加法器的 S、Cout…）
    const outs = c.outputs && c.outputs.length ? c.outputs : [{ name: opts.name || 'F', sig: c.output }]; const outSet = new Set(outs.map((o) => o.sig));
    if (outs.some((o) => by[o.sig])) { c.gates.forEach((g) => Hh(g.out)); const top = Math.min(...outs.filter((o) => by[o.sig]).map((o) => Hh(o.sig))); c.gates.forEach((g) => { const reach = (s0, seen = new Set()) => outSet.has(s0) || (!seen.has(s0) && (seen.add(s0), (cons[s0] || []).some((x) => reach(x, seen)))); if (reach(g.out)) depth[g.out] = Math.max(1, maxD - (hgt[g.out] - top)); }); }
    const GW = 60, X0 = 70; const inY = {}; c.inputs.forEach((v, i) => { inY[v] = 30 + i * 44; });
    const pos = {}; const cols = []; for (let d = 1; d <= maxD; d++) cols[d] = c.gates.filter((g) => depth[g.out] === d);
    // 每一欄前面留「走線道」：同一欄裡每個來源訊號一條直線道，不同訊號的直線不會疊在一起
    const lanes = []; const colX = []; for (let d = 1; d <= maxD; d++) { lanes[d] = [...new Set(cols[d].flatMap((g) => g.ins))]; colX[d] = (d === 1 ? X0 : colX[d - 1] + GW + 14) + 12 + lanes[d].length * 7; }
    const gh = (g) => Math.max(36, g.ins.length * 16 + 8); let H = 30 + c.inputs.length * 44;
    const yOf = (s) => (pos[s] ? pos[s].y + pos[s].h / 2 : inY[s] != null ? inY[s] : 0);
    for (let d = 1; d <= maxD; d++) {
      const list = cols[d].map((g) => ({ g, want: g.ins.reduce((a, s) => a + yOf(s), 0) / g.ins.length })).sort((a, b) => a.want - b.want); let y = 10;
      for (const it of list) { const h = gh(it.g); const top = Math.max(y, it.want - h / 2); pos[it.g.out] = { x: colX[d], y: top, h, g: it.g, d }; y = top + h + 18; }
      H = Math.max(H, y + 10);
    }
    const W = (maxD ? colX[maxD] + GW : X0) + 70; const V = opts.values || null;
    for (let d = 1; d <= maxD; d++) lanes[d].sort((a, b2) => yOf(b2) - yOf(a)); const col = (s) => (!V ? 'var(--lg-wire,#8aa0c0)' : V[s] ? 'var(--lg-on,#22c55e)' : 'var(--lg-off,#555b66)');
    let wires = '', bodies = '', labels = '';
    // 輸入
    const usedIn = new Set(c.gates.flatMap((g) => g.ins)); (c.outputs || []).forEach((o) => usedIn.add(o.sig)); usedIn.add(c.output);
    for (const v of c.inputs) { const y = inY[v]; labels += `<text x="8" y="${y + 5}" class="lg-in"${usedIn.has(v) ? '' : ' opacity=".45"'}>${esc(v)}${V ? `=${V[v]}` : ''}</text><circle cx="${X0 - 14}" cy="${y}" r="3" fill="${col(v)}"/>${usedIn.has(v) ? '' : `<text x="${X0 - 4}" y="${y + 4}" class="lg-t" opacity=".55">沒用到</text>`}`; }
    const src = (s) => (pos[s] ? { x: pos[s].x + GW + (/^(NAND|NOR|NOT|XNOR)$/.test(pos[s].g.type) ? 0 : 0), y: pos[s].y + pos[s].h / 2 } : s === '0' || s === '1' ? { x: X0 - 14, y: 12 } : { x: X0 - 14, y: inY[s] });
    // 26.11.3 pro7：同一個訊號在同一欄分給好幾個輸入時，分岔點畫圓點（看得出是「接在一起」而不是交叉）；同一個訊號跨好幾欄時，在出發的地方也畫
    const use = {}; for (const p of Object.values(pos)) for (const s of p.g.ins) { const k = p.d + '|' + s; use[k] = (use[k] || 0) + 1; }
    const colsOf = {}; for (const p of Object.values(pos)) for (const s of p.g.ins) (colsOf[s] = colsOf[s] || new Set()).add(p.d);
    let dots = ''; const dotAt = new Set(); const dot = (x, y, s) => { const k = Math.round(x) + ',' + Math.round(y); if (dotAt.has(k)) return; dotAt.add(k); dots += `<circle cx="${x}" cy="${y}" r="3" fill="${col(s)}"/>`; };
    for (const p of Object.values(pos)) {
      const g = p.g; const n = g.ins.length;
      g.ins.forEach((s, i) => { const a = src(s); const ty = p.y + (p.h * (i + 1)) / (n + 1); const mid = p.x - 10 - lanes[p.d].indexOf(s) * 7; wires += `<path d="M${a.x},${a.y} H${mid} V${ty} H${p.x + (g.type === 'XOR' || g.type === 'XNOR' ? -4 : 2)}" stroke="${col(s)}"/>`;
        if (use[p.d + '|' + s] > 1) { dot(mid, ty, s); } if (colsOf[s] && colsOf[s].size > 1 && Math.min(...colsOf[s]) !== p.d) dot(mid, a.y, s); });
      bodies += `<g transform="translate(${p.x},${p.y})" class="lg-g${opts.clickable ? ' lg-click' : ''}" data-gate="${esc(g.id)}" stroke="var(--lg-stroke,#cfd8e6)" fill="var(--lg-fill,#1b2232)">${gateShape(g.type, GW, p.h)}<text x="${GW / 2 - 6}" y="${p.h / 2 + 4}" class="lg-t" text-anchor="middle" stroke="none">${g.type}</text></g>`;
    }
    const ox = W - 46; const usedY = [];
    for (const ot of outs) { const o = src(ot.sig); let ly = o.y; while (usedY.some((u) => Math.abs(u - ly) < 14)) ly += 14; usedY.push(ly);
      wires += `<path d="M${o.x},${o.y} H${ox - 8} V${ly} H${ox}" stroke="${col(ot.sig)}"/>`; labels += `<text x="${ox + 4}" y="${ly + 5}" class="lg-out">${esc(ot.name)}${V ? '=' + V[ot.sig] : ''}</text>`; }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="lg-svg" viewBox="0 0 ${W + 30} ${Math.max(H, 60)}" width="${W + 30}" height="${Math.max(H, 60)}"><style>.lg-svg path{fill:none;stroke-width:2}.lg-svg .lg-g path,.lg-svg .lg-g circle{stroke-width:2}.lg-svg .lg-g path{fill:var(--lg-fill,#1b2232)}.lg-in,.lg-out{font:600 14px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.lg-t{font:600 9px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.lg-click{cursor:pointer}</style><g>${wires}</g>${dots}${bodies}${labels}</svg>`;
  }

  // ======================= IC =======================
  // pins：每個閘 [輸入…, 輸出]；power：[VCC, GND]
  const DIP14 = { power: [14, 7] };
  const Q2 = [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]];   // 7400／7408／7432／7486 型
  const IC = {
    '7400': { type: 'NAND', k: 2, name: '四組 2 輸入 NAND', pins: Q2 }, '7408': { type: 'AND', k: 2, name: '四組 2 輸入 AND', pins: Q2 }, '7432': { type: 'OR', k: 2, name: '四組 2 輸入 OR', pins: Q2 }, '7486': { type: 'XOR', k: 2, name: '四組 2 輸入 XOR', pins: Q2 },
    '7402': { type: 'NOR', k: 2, name: '四組 2 輸入 NOR', pins: [[2, 3, 1], [5, 6, 4], [8, 9, 10], [11, 12, 13]] },
    '7404': { type: 'NOT', k: 1, name: '六組反相器', pins: [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]] },
    '7410': { type: 'NAND', k: 3, name: '三組 3 輸入 NAND', pins: [[1, 2, 13, 12], [3, 4, 5, 6], [9, 10, 11, 8]] }, '7411': { type: 'AND', k: 3, name: '三組 3 輸入 AND', pins: [[1, 2, 13, 12], [3, 4, 5, 6], [9, 10, 11, 8]] },
    '7427': { type: 'NOR', k: 3, name: '三組 3 輸入 NOR', pins: [[1, 2, 13, 12], [3, 4, 5, 6], [9, 10, 11, 8]] },
    '7420': { type: 'NAND', k: 4, name: '兩組 4 輸入 NAND', pins: [[1, 2, 4, 5, 6], [9, 10, 12, 13, 8]], nc: [3, 11] }, '7421': { type: 'AND', k: 4, name: '兩組 4 輸入 AND', pins: [[1, 2, 4, 5, 6], [9, 10, 12, 13, 8]], nc: [3, 11] },
    '7430': { type: 'NAND', k: 8, name: '一組 8 輸入 NAND', pins: [[1, 2, 3, 4, 5, 6, 11, 12, 8]], nc: [9, 10, 13] },
    '74266': { type: 'XNOR', k: 2, name: '四組 2 輸入 XNOR（開集極，輸出要接提升電阻）', pins: [[1, 2, 3], [5, 6, 4], [8, 9, 10], [12, 13, 11]], oc: true },
    // CMOS 4000 系列（電源腳叫 VDD／VSS）
    '4011': { type: 'NAND', k: 2, name: 'CMOS 四組 2 輸入 NAND', pins: [[1, 2, 3], [5, 6, 4], [8, 9, 10], [12, 13, 11]], cmos: true }, '4001': { type: 'NOR', k: 2, name: 'CMOS 四組 2 輸入 NOR', pins: [[1, 2, 3], [5, 6, 4], [8, 9, 10], [12, 13, 11]], cmos: true },
    '4081': { type: 'AND', k: 2, name: 'CMOS 四組 2 輸入 AND', pins: [[1, 2, 3], [5, 6, 4], [8, 9, 10], [12, 13, 11]], cmos: true }, '4071': { type: 'OR', k: 2, name: 'CMOS 四組 2 輸入 OR', pins: [[1, 2, 3], [5, 6, 4], [8, 9, 10], [12, 13, 11]], cmos: true },
    '4070': { type: 'XOR', k: 2, name: 'CMOS 四組 2 輸入 XOR', pins: [[1, 2, 3], [5, 6, 4], [8, 9, 10], [12, 13, 11]], cmos: true }, '4069': { type: 'NOT', k: 1, name: 'CMOS 六組反相器', pins: [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]], cmos: true },
  };
  /** 「74LS00」「SN74HC08N」「CD4011B」→ 標準編號 */
  function icId(raw) {
    const s = String(raw || '').toUpperCase().replace(/\s+/g, '');
    let m = /(?:^|[A-Z])(?:74|54)[A-Z]{0,4}(\d{2,3})/.exec(s); if (m && IC['74' + m[1]]) return '74' + m[1];
    m = /(40\d{2})/.exec(s); if (m && IC[m[1]]) return m[1];
    m = /^(\d{2,3})$/.exec(s); if (m && IC['74' + m[1]]) return '74' + m[1];
    return null;
  }
  /**
   * IC 接線：ics＝['7400'] 或 ['7408','7432','7404']。
   * 依 IC 決定用哪種形式：只有 NAND → NAND 式；只有 NOR → NOR 式；AND+OR(+NOT) → SOP；也會試 POS，挑用 IC 最少的
   */
  function wiring(sol, icsRaw) {
    const ids = [...new Set((Array.isArray(icsRaw) ? icsRaw : String(icsRaw || '').split(/[,，\s、]+/)).filter(Boolean).map((x) => { const id = icId(x); if (!id) throw new Error(`不認得的 IC「${x}」。支援：${Object.keys(IC).join('、')}（74LS／74HC 開頭也可以）`); return id; }))];
    if (!ids.length) throw new Error('請輸入 IC 編號，例如 7400');
    const byType = {}; for (const id of ids) (byType[IC[id].type] = byType[IC[id].type] || []).push(id);
    const kOf = (t) => Math.max(...(byType[t] || []).map((id) => IC[id].k), 0);
    const tries = []; const types = Object.keys(byType);
    if (byType.NAND) tries.push(['nand', kOf('NAND')]); if (byType.NOR) tries.push(['nor', kOf('NOR')]);
    if (byType.AND || byType.OR) { tries.push(['sop', Math.max(kOf('AND'), kOf('OR'), 2)]); tries.push(['pos', Math.max(kOf('AND'), kOf('OR'), 2)]); }
    // XOR／XNOR IC：函數剛好是「互斥或鏈」（A⊕B⊕C… 或它的反相）就直接串起來
    for (const t of ['XOR', 'XNOR']) if (byType[t] && sol.vars.length >= 2) {
      const b = builder(sol.vars.slice()); let acc = sol.vars[0]; for (const v of sol.vars.slice(1)) acc = b.add(t, [acc, v]); const c = b.done(acc);
      const mt = circuitMinterms(c); if (mt.length === sol.minterms.length && mt.every((x, i) => x === sol.minterms[i])) tries.unshift([t.toLowerCase(), 2, c]);
    }
    if (!tries.length) throw new Error(`只用 ${types.join('、')} 沒辦法組出這個電路：請加 NAND（7400）或 NOR（7402），或 AND（7408）＋OR（7432）＋NOT（7404）`);
    const plans = [];
    for (const [form, k, pre] of tries) {
      const c = pre || circuit(sol, form, k); const need = {}; for (const g of c.gates) need[g.type] = (need[g.type] || []).concat(g);
      const miss = Object.keys(need).filter((t) => !byType[t]);
      // AND/OR 的 NOT 可以用 NAND/NOR 代替（輸入接在一起）
      if (miss.includes('NOT') && !byType.NOT && (byType.NAND || byType.NOR)) { const sub = byType.NAND ? 'NAND' : 'NOR'; for (const g of need.NOT) { g.type = sub; g.ins = [g.ins[0], g.ins[0]]; } need[sub] = (need[sub] || []).concat(need.NOT); delete need.NOT; miss.splice(miss.indexOf('NOT'), 1); }
      if (miss.length) { plans.push({ form, err: `還需要 ${miss.map((t) => t + '（' + ({ NOT: '7404', AND: '7408', OR: '7432', NAND: '7400', NOR: '7402', XOR: '7486' }[t] || '') + '）').join('、')}` }); continue; }
      const chips = []; let ok = true;
      for (const [t, gs] of Object.entries(need)) {
        const sorted = gs.slice().sort((a, b) => b.ins.length - a.ins.length);
        for (const g of sorted) {
          let slot = null; for (const ch of chips) if (ch.type === t && IC[ch.ic].k >= g.ins.length) { const free = ch.used.findIndex((u) => !u); if (free >= 0) { slot = [ch, free]; break; } }
          if (!slot) { const ic = (byType[t] || []).filter((id) => IC[id].k >= g.ins.length).sort((a, b) => IC[a].k - IC[b].k)[0]; if (!ic) { ok = false; break; } const ch = { ref: 'U' + (chips.length + 1), ic, type: t, used: IC[ic].pins.map(() => null) }; chips.push(ch); slot = [ch, 0]; }
          slot[0].used[slot[1]] = g; g.chip = slot[0].ref; g.slot = slot[1];
        }
        if (!ok) break;
      }
      if (!ok) { plans.push({ form, err: '輸入數超過 IC 的閘' }); continue; }
      plans.push({ form, circuit: c, chips });
    }
    const good = plans.filter((p) => p.chips).sort((a, b) => a.chips.length - b.chips.length || a.circuit.gates.length - b.circuit.gates.length);
    if (!good.length) throw new Error('用這些 IC 組不出來：' + plans.map((p) => p.err).join('；'));
    const best = good[0]; const c = best.circuit;
    return { form: best.form, ...finish(best.chips, c, [{ name: sol.name || 'F', sig: c.output }]), alternatives: plans.filter((p) => p !== best).map((p) => ({ form: p.form, chips: p.chips ? p.chips.length : null, err: p.err || '' })) };
  }
  /** 把「閘已經分配到 IC」的結果整理成：每個閘的接法、連線表、電源說明、整塊接線圖用的 board */
  function finish(chipsRaw, c, outputs) {
    const outName = Object.fromEntries(outputs.map((o) => [o.sig, o.name]));
    // 每個訊號接到哪些腳
    const pinOf = {}; const conn = (sig, txt) => { (pinOf[sig] = pinOf[sig] || []).push(txt); };
    const lines = []; const best = { chips: chipsRaw };
    for (const ch of best.chips) {
      const spec = IC[ch.ic];
      ch.used.forEach((g, i) => {
        const pins = spec.pins[i]; const inPins = pins.slice(0, -1), outPin = pins[pins.length - 1];
        if (!g) { ch.unusedNote = (ch.unusedNote || []).concat(`閘${i + 1}（腳 ${inPins.join('、')}）`); return; }
        const ins = inPins.map((p, j) => [p, g.ins[j] != null ? g.ins[j] : g.ins[g.ins.length - 1]]);
        ins.forEach(([p, s]) => conn(s, `${ch.ref}-${p}`)); conn(g.out, `${ch.ref}-${outPin}(輸出)`);
        lines.push({ chip: ch.ref, ic: ch.ic, gate: i + 1, type: ch.type, ins: ins.map(([p, s]) => ({ pin: p, sig: s })), out: { pin: outPin, sig: g.out }, extra: inPins.length > g.ins.length ? '多出來的輸入和最後一個輸入接在一起' : '' });
      });
    }
    const label = (s) => (outName[s] ? outName[s] + '（輸出）' : s);
    const nets = Object.entries(pinOf).map(([sig, list]) => ({ sig: label(sig), pins: list }));
    const power = best.chips.map((ch) => { const sp = IC[ch.ic]; return `${ch.ref}（${ch.ic}）：腳 14 接 ${sp.cmos ? 'VDD（3～15V）' : '+5V'}、腳 7 接 ${sp.cmos ? 'VSS（地）' : 'GND'}${sp.oc ? '；輸出各接一顆 1kΩ～4.7kΩ 提升電阻到 +5V' : ''}${ch.unusedNote ? `；沒用到的 ${ch.unusedNote.join('、')} 輸入接 GND${sp.cmos ? '（CMOS 不可空接）' : '（TTL 建議不要空接）'}` : ''}${sp.nc ? `；腳 ${sp.nc.join('、')} 不用接（NC）` : ''}` });
    const board = mkBoard(best.chips.map(gatePins), c.inputs, outputs);
    return { circuit: c, outputs, chips: best.chips.map((ch) => ({ ref: ch.ref, ic: ch.ic, name: IC[ch.ic].name, used: ch.used.filter(Boolean).length, total: ch.used.length })), lines, nets, power, board };
  }
  /** IC 腳位圖（DIP-14），每支腳標上接的訊號 */
  function icSvg(w, ref) {
    const ch = w.chips.find((x) => x.ref === ref); const spec = IC[ch.ic]; const sig = {};
    for (const l of w.lines.filter((x) => x.chip === ref)) { l.ins.forEach((p) => { sig[p.pin] = p.sig; }); sig[l.out.pin] = '→' + (l.out.sig === w.circuit.output ? 'F' : l.out.sig); }
    sig[14] = spec.cmos ? 'VDD' : '+5V'; sig[7] = spec.cmos ? 'VSS' : 'GND'; (spec.nc || []).forEach((p) => { sig[p] = 'NC'; });
    const W = 300, H = 7 * 26 + 30; let s = `<rect x="90" y="10" width="120" height="${H - 20}" rx="8" fill="var(--lg-fill,#1b2232)" stroke="var(--lg-stroke,#cfd8e6)" stroke-width="2"/><path d="M140,10 A10,10 0 0 0 160,10" fill="none" stroke="var(--lg-stroke,#cfd8e6)" stroke-width="2"/><text x="150" y="${H / 2}" text-anchor="middle" class="lg-in">${ch.ref}</text><text x="150" y="${H / 2 + 18}" text-anchor="middle" class="lg-t">${ch.ic}</text>`;
    for (let i = 1; i <= 7; i++) { const y = 10 + i * 26; s += `<line x1="76" y1="${y}" x2="90" y2="${y}" stroke="var(--lg-stroke,#cfd8e6)" stroke-width="2"/><text x="96" y="${y + 4}" class="lg-t">${i}</text><text x="70" y="${y + 4}" text-anchor="end" class="lg-pin">${esc(sig[i] || '')}</text>`; }
    for (let i = 8; i <= 14; i++) { const y = 10 + (15 - i) * 26; s += `<line x1="210" y1="${y}" x2="224" y2="${y}" stroke="var(--lg-stroke,#cfd8e6)" stroke-width="2"/><text x="204" y="${y + 4}" text-anchor="end" class="lg-t">${i}</text><text x="230" y="${y + 4}" class="lg-pin">${esc(sig[i] || '')}</text>`; }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="lg-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><style>.lg-in{font:700 14px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.lg-t{font:600 10px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.lg-pin{font:600 11px system-ui,sans-serif;fill:var(--lg-on,#22c55e)}</style>${s}</svg>`;
  }
  // ======================= 26.11.3 pro5：實際接線圖、每種閘指定 IC、加法器／減法器 =======================
  // 4 位元加法器 IC（16 腳）。map：A／B／S 由低位到高位的腳、C0＝進位輸入、C4＝進位輸出
  Object.assign(IC, {
    '74283': { type: 'ADD4', n: 16, vcc: 16, gnd: 8, name: '4 位元二進位全加器（快速進位）', map: { A: [5, 3, 14, 12], B: [6, 2, 15, 11], S: [4, 1, 13, 10], C0: 7, C4: 9 } },
    '7483': { type: 'ADD4', n: 16, vcc: 5, gnd: 12, name: '4 位元二進位全加器（電源腳在 5、12，不是角落）', map: { A: [10, 8, 3, 1], B: [11, 7, 4, 16], S: [9, 6, 2, 15], C0: 13, C4: 14 } },
    '4008': { type: 'ADD4', n: 16, vcc: 16, gnd: 8, cmos: true, name: 'CMOS 4 位元全加器', map: { A: [7, 5, 3, 1], B: [6, 4, 2, 15], S: [10, 11, 12, 13], C0: 9, C4: 14 } },
  });
  const DEFAULT_IC = { AND: ['7408', '7411', '7421'], OR: ['7432'], NOT: ['7404'], NAND: ['7400', '7410', '7420', '7430'], NOR: ['7402', '7427'], XOR: ['7486'], XNOR: ['74266'] };
  /** 這種閘可以選哪些 IC（NOT 也可以用 2 輸入 NAND／NOR 把輸入接在一起當反相器） */
  function icChoices(type) {
    const own = Object.keys(IC).filter((id) => IC[id].type === type); if (type !== 'NOT') return own;
    return own.concat(Object.keys(IC).filter((id) => (IC[id].type === 'NAND' || IC[id].type === 'NOR') && IC[id].k === 2));
  }
  /** 一顆「裝了閘」的 IC → 每支腳接什麼。role：in／out／tie0（沒用到的輸入接地）／nc */
  function gatePins(ch) {
    const sp = IC[ch.ic]; const pins = {};
    ch.used.forEach((g, i) => { const pp = sp.pins[i]; const inP = pp.slice(0, -1), outP = pp[pp.length - 1];
      if (!g) { inP.forEach((p) => { pins[p] = { sig: '0', role: 'tie0' }; }); pins[outP] = { sig: '', role: 'nc' }; return; }
      inP.forEach((p, j) => { pins[p] = { sig: g.ins[j] != null ? g.ins[j] : g.ins[g.ins.length - 1], role: 'in' }; }); pins[outP] = { sig: g.out, role: 'out' }; });
    (sp.nc || []).forEach((p) => { pins[p] = { sig: '', role: 'nc' }; });
    return { ref: ch.ref, ic: ch.ic, name: sp.name, n: sp.n || 14, vcc: sp.vcc || 14, gnd: sp.gnd || 7, cmos: !!sp.cmos, oc: !!sp.oc, pins };
  }
  /** 整塊板子：IC（每支腳接什麼）＋每條線（net）接到哪些腳。kind：in（輸入）／out（輸出）／wire（IC 之間） */
  function mkBoard(chips, inputs, outputs) {
    const outName = Object.fromEntries(outputs.map((o) => [o.sig, o.name])); const nets = new Map();
    for (const ch of chips) for (const [p, x] of Object.entries(ch.pins)) {
      if (x.role !== 'in' && x.role !== 'out') continue; if (x.sig === '0' || x.sig === '1') continue;
      if (!nets.has(x.sig)) nets.set(x.sig, { sig: x.sig, pins: [], src: null }); const n = nets.get(x.sig); n.pins.push({ ref: ch.ref, pin: +p, role: x.role }); if (x.role === 'out') n.src = `${ch.ref}.${p}`;
    }
    for (const v of inputs) if (!nets.has(v)) nets.set(v, { sig: v, pins: [], src: null });
    const list = [...nets.values()].map((n) => ({ ...n, kind: inputs.includes(n.sig) ? 'in' : outName[n.sig] ? 'out' : 'wire', label: inputs.includes(n.sig) ? n.sig : outName[n.sig] || (n.src ? n.src.replace('.', ' 腳 ') + ' 的輸出' : n.sig) }));
    const order = { in: 0, wire: 1, out: 2 }; const rank = (n) => (n.kind === 'in' ? inputs.indexOf(n.sig) : n.kind === 'out' ? outputs.findIndex((o) => o.sig === n.sig) : 0); list.sort((a, b) => order[a.kind] - order[b.kind] || rank(a) - rank(b));
    return { chips, nets: list.filter((n) => n.pins.length || n.kind === 'in'), inputs, outputs };
  }
  const WIRE = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#84cc16', '#f5f5f5'];
  /**
   * 實際接線圖：所有 IC 照麵包板上的樣子排一排（缺口朝上、第 1 腳在左上），每條線一種顏色，
   * 同一條橫線上的腳全部接在一起（圓點＝接點）。+5V／GND 與沒用到的輸入直接標在腳旁邊。
   */
  function boardSvg(bd) {
    const PITCH = 22, BW = 128, LANE = 7, TRK = 13; const chips = bd.chips; const nets = bd.nets;
    const rows = (ch) => ch.n / 2; const laneW = (ch) => rows(ch) * LANE + 12;
    let x = 64; const geo = {};
    for (const ch of chips) { const lw = laneW(ch); geo[ch.ref] = { x: x + lw, y: 0, h: rows(ch) * PITCH + 10, lw }; x += lw * 2 + BW + 26; }
    const W = Math.max(x + 70, 320);
    // 26.11.3 pro7 佈線優化：每條線先算出左右範圍，再「疊軌」——範圍不重疊的線共用同一條橫線；短的線放在最靠近 IC 的軌道（直線短、交叉少），跨很遠的線放上面
    const laneX = (ch, p) => { const g = geo[ch.ref]; const r = rows(ch); const left = p <= r; const row = left ? p : ch.n + 1 - p; return left ? g.x - 8 - row * LANE : g.x + BW + 8 + row * LANE; };
    const byRef0 = Object.fromEntries(chips.map((c) => [c.ref, c]));
    for (const n of nets) { const xs = n.pins.map((p) => laneX(byRef0[p.ref], p.pin)); n.x1 = n.kind === 'in' ? 46 : Math.min(...xs); n.x2 = n.kind === 'out' ? W - 60 : Math.max(...xs, n.kind === 'in' ? 46 : -Infinity); }
    const tracks = []; const GAP = 12;
    // 先放 IC 之間的線（短的先），再放輸出、輸入；輸入／輸出各自倒過來放，讓 A、B、C…（和第一個輸出）在最上面，左右兩邊的端子順序才好對
    const rank = (n) => (n.kind === 'in' ? -bd.inputs.indexOf(n.sig) : n.kind === 'out' ? -bd.outputs.findIndex((o) => o.sig === n.sig) : 0);
    const order = nets.slice().sort((a, b) => (a.kind === 'in') - (b.kind === 'in') || (a.kind === 'out') - (b.kind === 'out') || (a.kind === 'wire' ? (a.x2 - a.x1) - (b.x2 - b.x1) || a.x1 - b.x1 : rank(a) - rank(b)));
    for (const n of order) { let t = tracks.findIndex((occ) => occ.every(([s, e]) => n.x2 + GAP < s || n.x1 - GAP > e)); if (t < 0) { t = tracks.length; tracks.push([]); } tracks[t].push([n.x1, n.x2]); n.track = t; }
    const topY = 34 + tracks.length * TRK + 16; for (const ch of chips) geo[ch.ref].y = topY;
    const H = topY + Math.max(...chips.map((c) => geo[c.ref].h)) + 46;
    const pinPos = (ch, p) => { const g = geo[ch.ref]; const r = rows(ch); const left = p <= r; const row = left ? p : ch.n + 1 - p; return { left, row, x: left ? g.x : g.x + BW, y: g.y + 5 + (row - 0.5) * PITCH, lane: left ? g.x - 8 - row * LANE : g.x + BW + 8 + row * LANE }; };
    const byRef = Object.fromEntries(chips.map((c) => [c.ref, c])); const netOf = {}; nets.forEach((n, i) => { n.y = 34 + (tracks.length - 1 - n.track) * TRK; n.color = WIRE[i % WIRE.length]; n.pins.forEach((p) => { netOf[p.ref + ':' + p.pin] = n; }); });
    let wires = '', dots = '', body = '', labels = '';
    for (const n of nets) {
      let x1 = n.x1, x2 = n.x2;
      if (n.kind === 'in') { x1 = 46; labels += `<rect x="6" y="${n.y - 6}" width="34" height="12" rx="3" class="bd-term"/><text x="23" y="${n.y + 3.5}" text-anchor="middle" class="bd-tl">${esc(n.label)}</text>`; if (!n.pins.length) x2 = 46; }
      if (n.kind === 'out') { x2 = W - 60; labels += `<circle cx="${W - 52}" cy="${n.y}" r="5" class="bd-led" stroke="${n.color}"/><text x="${W - 42}" y="${n.y + 3.5}" class="bd-tl">${esc(n.label)}</text>`; }
      if (x2 > x1) wires += `<path d="M${x1},${n.y} H${x2}" stroke="${n.color}"/>`;
      for (const p of n.pins) { const q = pinPos(byRef[p.ref], p.pin); wires += `<path d="M${q.x},${q.y} H${q.lane} V${n.y}" stroke="${n.color}"/>`; dots += `<circle cx="${q.lane}" cy="${n.y}" r="2.6" fill="${n.color}"/>`; }
    }
    for (const ch of chips) {
      const g = geo[ch.ref]; body += `<rect x="${g.x}" y="${g.y}" width="${BW}" height="${g.h}" rx="7" class="bd-ic"/><path d="M${g.x + BW / 2 - 9},${g.y} A9,9 0 0 0 ${g.x + BW / 2 + 9},${g.y}" class="bd-notch"/><text x="${g.x + BW / 2}" y="${g.y + g.h + 15}" text-anchor="middle" class="bd-ref">${esc(ch.ref)}　${esc(ch.ic)}</text><text x="${g.x + BW / 2}" y="${g.y + g.h + 28}" text-anchor="middle" class="bd-sub">${esc(String(ch.name).replace(/（.*$/, ''))}</text>`;
      for (let p = 1; p <= ch.n; p++) {
        const q = pinPos(ch, p); const x0 = ch.pins[p]; const n = netOf[ch.ref + ':' + p]; const pw = p === ch.vcc ? (ch.cmos ? 'VDD' : '+5V') : p === ch.gnd ? (ch.cmos ? 'VSS' : 'GND') : null;
        let txt = '', cls = 'bd-pl';
        if (pw) { txt = pw; cls = p === ch.vcc ? 'bd-pl bd-vcc' : 'bd-pl bd-gnd'; }
        else if (!x0 || x0.role === 'nc') { txt = x0 && x0.sig === '' && x0.role === 'nc' ? '不接' : ''; cls = 'bd-pl bd-nc'; }
        else if (x0.role === 'tie0' || x0.sig === '0') { txt = '接地'; cls = 'bd-pl bd-gnd'; }
        else if (x0.sig === '1') { txt = ch.cmos ? '接 VDD' : '接 +5V'; cls = 'bd-pl bd-vcc'; }
        else if (n) txt = x0.role === 'out' ? (n.kind === 'out' ? '→ ' + n.label : '輸出') : n.kind === 'in' ? n.label : n.kind === 'out' ? n.label : '← ' + (n.src || '').replace('.', '-');
        body += `<text x="${q.left ? g.x + 5 : g.x + BW - 5}" y="${q.y + 3.5}" text-anchor="${q.left ? 'start' : 'end'}" class="bd-pn">${p}</text><text x="${q.left ? g.x + 20 : g.x + BW - 20}" y="${q.y + 3.5}" text-anchor="${q.left ? 'start' : 'end'}" class="${cls}"${n ? ` fill="${n.color}"` : ''}>${esc(txt)}</text>`;
        if (!n) { const sx = q.left ? q.x - 9 : q.x + 9; if (pw || (x0 && (x0.role === 'tie0' || x0.sig === '0' || x0.sig === '1'))) { const hi = p === ch.vcc || (x0 && x0.sig === '1'); wires += `<path d="M${q.x},${q.y} H${sx}" class="${hi ? 'bd-wv' : 'bd-wg'}"/>`; body += hi ? `<circle cx="${sx}" cy="${q.y}" r="3" class="bd-vdot"/>` : `<path d="M${sx},${q.y - 5} V${q.y + 5} M${sx + (q.left ? -3 : 3)},${q.y - 3} V${q.y + 3}" class="bd-gsym"/>`; } }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="lg-svg bd-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><style>.bd-svg path{fill:none;stroke-width:2;stroke-linejoin:round}.bd-ic{fill:var(--lg-fill,#1b2232);stroke:var(--lg-stroke,#cfd8e6);stroke-width:2}.bd-svg .bd-notch{stroke:var(--lg-stroke,#cfd8e6)}.bd-pn{font:700 9px system-ui,sans-serif;fill:var(--lg-stroke,#cfd8e6)}.bd-pl{font:600 9.5px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.bd-vcc{fill:#f87171}.bd-gnd{fill:#94a3b8}.bd-nc{fill:#64748b}.bd-ref{font:700 12px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.bd-sub{font:500 9px system-ui,sans-serif;fill:#94a3b8}.bd-tl{font:700 10px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.bd-term{fill:var(--lg-fill,#1b2232);stroke:var(--lg-stroke,#cfd8e6)}.bd-led{fill:var(--lg-fill,#1b2232);stroke-width:2}.bd-svg .bd-wv{stroke:#f87171}.bd-svg .bd-wg{stroke:#94a3b8}.bd-vdot{fill:#f87171}.bd-svg .bd-gsym{stroke:#94a3b8}</style><g>${wires}</g>${dots}${body}${labels}</svg>`;
  }
  /** 把閘依序放進 IC：pick(gate) 回傳要用的 IC 編號 */
  function allocGates(gates, pick, startRef = 1) {
    const chips = [];
    for (const g of gates) {
      const ic = pick(g); const sp = IC[ic]; if (!sp || !sp.pins) throw new Error(`${ic} 不是邏輯閘 IC`);
      if (g.ins.length > sp.k) throw new Error(`${g.type} 有 ${g.ins.length} 個輸入，${ic} 每組只有 ${sp.k} 個`);
      let ch = chips.find((c) => c.ic === ic && c.used.some((u) => !u)); if (!ch) { ch = { ref: 'U' + (startRef + chips.length), ic, type: sp.type, used: sp.pins.map(() => null) }; chips.push(ch); }
      const i = ch.used.findIndex((u) => !u); ch.used[i] = g; g.chip = ch.ref; g.slot = i;
    }
    return chips;
  }
  /**
   * 照「你畫的電路」接線：每種閘用哪顆 IC 由 map 指定（例：{AND:'7408', OR:'7432', NOT:'7400'}），沒指定的用最常見的。
   * 輸入比 IC 多的閘會自動拆成幾級；BUF 就是一條線；NOT 用 NAND／NOR 時兩個輸入接在一起。支援多個輸出（c.outputs）。
   */
  function wiringOf(c0, map = {}, opts = {}) {
    const outputs = (c0.outputs && c0.outputs.length ? c0.outputs : [{ name: opts.name || 'F', sig: c0.output }]).map((o) => ({ ...o }));
    const chosen = {}; const icFor = (type, nIn) => {
      const want = map[type] ? icId(map[type]) : null; if (map[type] && !want) throw new Error(`不認得的 IC「${map[type]}」`);
      if (want) { if (!icChoices(type).includes(want)) throw new Error(`${want}（${IC[want].name}）不能當 ${type} 用；${type} 可以選：${icChoices(type).join('、')}`); return want; }
      const list = DEFAULT_IC[type] || []; return list.find((id) => IC[id].k >= nIn) || list[list.length - 1];
    };
    // 1) BUF＝直接連線；2) 輸入太多的閘拆開
    const alias = {}; const res = (s) => { while (alias[s] != null) s = alias[s]; return s; }; let k = Math.max(0, ...c0.gates.map((g) => +String(g.out).replace(/\D/g, '') || 0));
    const out = []; const add = (type, ins) => { const o = 'n' + (++k); out.push({ id: 'g' + k, type, ins, out: o }); return o; };
    for (const g0 of c0.gates) {
      const ins = g0.ins.map(res); if (g0.type === 'BUF') { alias[g0.out] = ins[0]; continue; }
      const ic = icFor(g0.type, ins.length); if (!ic) throw new Error(`沒有 ${g0.type} 的 IC 可用`); chosen[g0.type] = ic; const sp = IC[ic];
      if (g0.type === 'NOT') { out.push({ id: g0.id, type: sp.type, ins: sp.type === 'NOT' ? [ins[0]] : [ins[0], ins[0]], out: g0.out, as: 'NOT' }); continue; }
      if (ins.length <= sp.k) { out.push({ id: g0.id, type: g0.type, ins, out: g0.out }); continue; }
      const kk = sp.k; let cur = ins.slice();
      if (g0.type === 'AND' || g0.type === 'OR' || g0.type === 'XOR') { while (cur.length > kk) { const nx = []; for (let i = 0; i < cur.length; i += kk) { const part = cur.slice(i, i + kk); nx.push(part.length === 1 ? part[0] : add(g0.type, part)); } cur = nx; } out.push({ id: g0.id, type: g0.type, ins: cur, out: g0.out }); }
      else if (g0.type === 'NAND' || g0.type === 'NOR') { while (cur.length > kk) { const nx = []; for (let i = 0; i < cur.length; i += kk) { const part = cur.slice(i, i + kk); if (part.length === 1) nx.push(part[0]); else { const t = add(g0.type, part); nx.push(add(g0.type, [t, t])); } } cur = nx; } out.push({ id: g0.id, type: g0.type, ins: cur, out: g0.out }); }
      else { let acc = cur[0]; for (let i = 1; i < cur.length - 1; i++) acc = add('XNOR', [acc, cur[i]]); const last = cur[cur.length - 1]; if (cur.length % 2 === 0) out.push({ id: g0.id, type: 'XNOR', ins: [acc, last], out: g0.out }); else { const t = add('XNOR', [acc, last]); out.push({ id: g0.id, type: 'XNOR', ins: [t, '0'], out: g0.out }); } }   // XNOR 串接：奇數個輸入最後再反相一次（另一腳接地）
    }
    for (const o of outputs) o.sig = res(o.sig);
    const c = { inputs: c0.inputs.slice(), gates: out, output: res(c0.output), outputs };
    if (!out.length) throw new Error('這個電路不需要任何閘（輸出直接接輸入）');
    const chips = allocGates(out, (g) => (g.as === 'NOT' ? chosen.NOT : chosen[g.type] || icFor(g.type, g.ins.length)));
    return { ...finish(chips, c, outputs), chosen, form: 'as-drawn' };
  }
  /** 接線的文字版（給 AI、複製用） */
  function wiringText(w) {
    const outs = Object.fromEntries((w.outputs || []).map((o) => [o.sig, o.name]));
    return [`用 ${w.chips.length} 顆 IC：${w.chips.map((c) => `${c.ref}＝${c.ic}（${c.name}${c.total ? `，用 ${c.used}/${c.total} 組` : ''}）`).join('、')}`,
      ...(w.lines || []).map((l) => `・${l.chip}（${l.ic}）第 ${l.gate} 組 ${l.type}：${l.ins.map((p) => `腳${p.pin}←${p.sig}`).join('、')} → 腳${l.out.pin}${outs[l.out.sig] ? '＝' + outs[l.out.sig] + '（輸出）' : '（' + l.out.sig + '）'}${l.extra ? '（' + l.extra + '）' : ''}`),
      ...(w.msi || []), '連線（同一行的腳接在一起）：', ...w.board.nets.filter((n) => n.pins.length).map((n) => `・${n.label}：${n.pins.map((p) => `${p.ref}-${p.pin}`).join('、')}`), '電源：' + w.power.join('；')].join('\n');
  }

  // ---------------- 加法器／減法器 ----------------
  const ARITH = { ha: '半加器', fa: '全加器', hs: '半減器', fs: '全減器', add: '位元加法器', sub: '位元減法器', addsub: '位元加減法器' };
  /**
   * 建出加法器／減法器的閘級電路（多個輸出）。kind：ha｜fa｜hs｜fs｜add｜sub｜addsub；bits：1～8（後三種）
   * add：A + B + Cin；sub：A − B（2 的補數：A + B' + 1）；addsub：M=0 加、M=1 減（B 先和 M 做 XOR，M 也接進位輸入）
   */
  function arith(kind, o = {}) {
    if (!ARITH[kind]) throw new Error('種類：' + Object.entries(ARITH).map(([k2, v]) => `${k2}＝${v}`).join('、'));
    const n = Math.max(1, Math.min(8, Math.floor(+o.bits || 4))); const b = builder([]); const X = (a, c) => b.add('XOR', [a, c]), A2 = (a, c) => b.add('AND', [a, c]), O2 = (a, c) => b.add('OR', [a, c]), N1 = (a) => b.add('NOT', [a]);
    const fa = (a, bb, ci) => { const x = X(a, bb); return { s: X(x, ci), co: O2(A2(a, bb), A2(x, ci)) }; };
    let inputs, outputs, exprs, note;
    if (kind === 'ha') { inputs = ['A', 'B']; outputs = [{ name: 'S', sig: X('A', 'B') }, { name: 'C', sig: A2('A', 'B') }]; exprs = ['S = A ⊕ B（和）', 'C = A·B（進位）']; note = '兩個 1 位元相加，沒有進位輸入。'; }
    else if (kind === 'fa') { inputs = ['A', 'B', 'Cin']; const r = fa('A', 'B', 'Cin'); outputs = [{ name: 'S', sig: r.s }, { name: 'Cout', sig: r.co }]; exprs = ['S = A ⊕ B ⊕ Cin（和）', 'Cout = A·B + Cin·(A ⊕ B)（進位）']; note = '兩個半加器加一個 OR：第一個半加器算 A+B，第二個再加上 Cin。'; }
    else if (kind === 'hs') { inputs = ['A', 'B']; outputs = [{ name: 'D', sig: X('A', 'B') }, { name: 'Bout', sig: A2(N1('A'), 'B') }]; exprs = ['D = A ⊕ B（差）', "Bout = A'·B（借位）"]; note = '算 A − B，沒有借位輸入。'; }
    else if (kind === 'fs') { inputs = ['A', 'B', 'Bin']; const x = X('A', 'B'); const d = X(x, 'Bin'); outputs = [{ name: 'D', sig: d }, { name: 'Bout', sig: O2(A2(N1('A'), 'B'), A2(N1(x), 'Bin')) }]; exprs = ['D = A ⊕ B ⊕ Bin（差）', "Bout = A'·B + (A ⊕ B)'·Bin（借位）"]; note = '算 A − B − Bin。'; }
    else {
      const As = Array.from({ length: n }, (_, i) => 'A' + i), Bs = Array.from({ length: n }, (_, i) => 'B' + i); inputs = [...As.slice().reverse(), ...Bs.slice().reverse(), ...(kind === 'add' ? ['Cin'] : kind === 'addsub' ? ['M'] : [])];
      let c = kind === 'add' ? 'Cin' : kind === 'sub' ? '1' : 'M'; let prev = c; outputs = [];
      for (let i = 0; i < n; i++) { const bi = kind === 'add' ? Bs[i] : kind === 'sub' ? N1(Bs[i]) : X(Bs[i], 'M'); const r = fa(As[i], bi, c); outputs.push({ name: (kind === 'add' ? 'S' : kind === 'sub' ? 'D' : 'R') + i, sig: r.s }); prev = c; c = r.co; }
      outputs.reverse(); outputs.unshift({ name: 'C' + n, sig: c }); if (kind === 'addsub' && n > 1) outputs.push({ name: 'V', sig: X(c, prev) });
      exprs = kind === 'add' ? ['Sᵢ = Aᵢ ⊕ Bᵢ ⊕ Cᵢ', 'Cᵢ₊₁ = Aᵢ·Bᵢ + Cᵢ·(Aᵢ ⊕ Bᵢ)，C₀ = Cin', `${n} 個全加器串接（漣波進位）：每一級的進位輸出接下一級的進位輸入`]
        : kind === 'sub' ? ["A − B = A + B' + 1（2 的補數）", "每個 Bᵢ 先反相，最低位的進位輸入接 1", `C${n} = 1 表示 A ≥ B（沒有借位）；C${n} = 0 表示 A < B，結果是負數的 2 補數`]
          : ['Bᵢ* = Bᵢ ⊕ M，C₀ = M', 'M = 0：R = A + B；M = 1：R = A − B（A + B\' + 1）', `C${n}：加法時＝進位；減法時 1 表示沒借位`, ...(n > 1 ? [`V = C${n} ⊕ C${n - 1}（有號數溢位）`] : [])];
      note = kind === 'add' ? '漣波進位加法器。' : kind === 'sub' ? '用加法器做減法。' : '一個控制線 M 切換加／減。';
    }
    const c = { inputs, gates: b.gates, output: outputs[0].sig, outputs }; const multi = kind === 'add' || kind === 'sub' || kind === 'addsub';
    return { kind, bits: multi ? n : 1, title: multi ? `${n} ${ARITH[kind]}` : ARITH[kind], circuit: c, inputs, outputs, exprs, note, multi };
  }
  /** 多位元：代入數字算一次（a、b 是十進位；x＝Cin 或 M）。單位元：env＝{A:1,B:0,…} */
  function arithEval(ar, a = 0, bv = 0, x = 0) {
    const env = {}; const n = ar.bits;
    if (ar.multi) { const mask = (1 << n) - 1; a = (+a || 0) & mask; bv = (+bv || 0) & mask; for (let i = 0; i < n; i++) { env['A' + i] = (a >> i) & 1; env['B' + i] = (bv >> i) & 1; } env.Cin = +x ? 1 : 0; env.M = +x ? 1 : 0; }
    else Object.assign(env, a && typeof a === 'object' ? a : {});
    const val = simulate(ar.circuit, env); const outs = Object.fromEntries(ar.outputs.map((o2) => [o2.name, val[o2.sig]]));
    if (!ar.multi) return { env, outs, val };
    const res = ar.outputs.filter((o2) => /^[SDR]\d+$/.test(o2.name)).reduce((s, o2) => s | (val[o2.sig] << +o2.name.slice(1)), 0); const cn = outs['C' + n]; const bin = (v) => v.toString(2).padStart(n, '0');
    const sub = ar.kind === 'sub' || (ar.kind === 'addsub' && +x); const signed = (v) => (v & (1 << (n - 1)) ? v - (1 << n) : v);
    const text = sub ? `${a} − ${bv} = ${cn ? res : res - (1 << n)}（${bin(a)} − ${bin(bv)} = ${bin(res)}，C${n}=${cn}：${cn ? '沒有借位' : '有借位，結果是負數的 2 補數'}）`
      : `${a} + ${bv}${ar.kind === 'add' && +x ? ' + 1' : ''} = ${res + (cn << n)}（${bin(a)} + ${bin(bv)} = ${cn ? '1 ' : ''}${bin(res)}，C${n}=${cn}${cn ? '：有進位' : ''}）`;
    return { env, outs, val, a, b: bv, result: res, carry: cn, text, overflow: outs.V, signed: n > 1 && ar.kind === 'addsub' ? `當成有號數：${signed(a)} ${sub ? '−' : '+'} ${signed(bv)} = ${signed(res)}${outs.V != null ? (outs.V ? '（溢位，結果不對）' : '') : ''}` : '' };
  }
  /** 多位元加減法器的方塊圖：每一位元一個全加器（最低位在右邊），進位由右往左傳；ev＝arithEval 的結果（有的話標出每條線的 0／1） */
  function arithBlockSvg(ar, ev) {
    if (!ar.multi) return ''; const n = ar.bits; const BW = 74, GAP = 34, X0 = 78, Y0 = 62, BH = 46; const W = X0 + n * (BW + GAP) + 40, H = 170; const v = ev ? ev.env : null; const kind = ar.kind; const R = kind === 'add' ? 'S' : kind === 'sub' ? 'D' : 'R';
    const on = (b) => (b == null ? 'var(--lg-wire,#8aa0c0)' : b ? 'var(--lg-on,#22c55e)' : 'var(--lg-off,#555b66)'); const val = (name) => (ev ? (name in ev.outs ? ev.outs[name] : v[name]) : null);
    // 每一級的進位：重新模擬一次拿內部進位（只為了上色）
    const carries = []; if (ev) { let c = kind === 'add' ? v.Cin : kind === 'sub' ? 1 : v.M; for (let i = 0; i < n; i++) { carries.push(c); const a = v['A' + i]; const b = kind === 'add' ? v['B' + i] : kind === 'sub' ? 1 - v['B' + i] : v['B' + i] ^ v.M; c = (a & b) | (c & (a ^ b)); } carries.push(c); }
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = X0 + (n - 1 - i) * (BW + GAP); const ax = x + 20, bx = x + BW - 20; const a = val('A' + i), b = val('B' + i), r = val(R + i);
      s += `<rect x="${x}" y="${Y0}" width="${BW}" height="${BH}" rx="6" class="ab-box"/><text x="${x + BW / 2}" y="${Y0 + 20}" text-anchor="middle" class="lg-in">FA</text><text x="${x + BW / 2}" y="${Y0 + 36}" text-anchor="middle" class="lg-t">全加器 ${i}</text>`;
      s += `<path d="M${ax},${Y0 - 34} V${Y0}" stroke="${on(a)}"/><text x="${ax}" y="${Y0 - 38}" text-anchor="middle" class="lg-t">A${i}${a != null ? '=' + a : ''}</text>`;
      s += `<path d="M${bx},${Y0 - 34} V${Y0}" stroke="${on(b)}"/><text x="${bx}" y="${Y0 - 38}" text-anchor="middle" class="lg-t">B${i}${b != null ? '=' + b : ''}</text>`;
      if (kind !== 'add') s += `<rect x="${bx - 18}" y="${Y0 - 24}" width="36" height="13" rx="3" class="ab-box"/><text x="${bx}" y="${Y0 - 14.5}" text-anchor="middle" class="lg-t">${kind === 'sub' ? 'NOT' : 'XOR M'}</text>`;
      s += `<path d="M${x + BW / 2},${Y0 + BH} V${Y0 + BH + 26}" stroke="${on(r)}"/><text x="${x + BW / 2}" y="${Y0 + BH + 40}" text-anchor="middle" class="lg-in">${R}${i}${r != null ? '=' + r : ''}</text>`;
      const ci = ev ? carries[i] : null; const cy = Y0 + BH / 2; s += `<path d="M${x + BW + GAP},${cy} H${x + BW + 5} m5,-4 l-5,4 l5,4" stroke="${on(ci)}"/>`;
      if (i === 0) s += `<text x="${x + BW + GAP + 3}" y="${cy + 4}" class="lg-t">${kind === 'add' ? 'Cin' : kind === 'sub' ? '1' : 'M'}${ci != null ? '=' + ci : ''}</text>`; else s += `<text x="${x + BW + GAP / 2}" y="${cy - 6}" text-anchor="middle" class="lg-t">C${i}${ci != null ? '=' + ci : ''}</text>`;
    }
    const cn = ev ? carries[n] : null; s += `<path d="M${X0},${Y0 + BH / 2} H${X0 - 20} m5,-4 l-5,4 l5,4" stroke="${on(cn)}"/><text x="${X0 - 24}" y="${Y0 + BH / 2 + 4}" text-anchor="end" class="lg-in">C${n}${cn != null ? '=' + cn : ''}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="lg-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><style>.lg-svg path{fill:none;stroke-width:2}.ab-box{fill:var(--lg-fill,#1b2232);stroke:var(--lg-stroke,#cfd8e6);stroke-width:2}.lg-in{font:600 13px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}.lg-t{font:600 9px system-ui,sans-serif;fill:var(--lg-text,#e6edf7)}</style>${s}</svg>`;
  }
  /** 單位元加減法器的真值表 */
  function arithTable(ar) {
    if (ar.multi) return null; const rows = []; const n = ar.inputs.length;
    for (let i = 0; i < 1 << n; i++) { const env = {}; ar.inputs.forEach((v, k2) => { env[v] = (i >> (n - 1 - k2)) & 1; }); const r = arithEval(ar, env); rows.push({ ins: ar.inputs.map((v) => env[v]), outs: ar.outputs.map((o2) => r.outs[o2.name]) }); }
    return { head: [...ar.inputs, ...ar.outputs.map((o2) => o2.name)], rows };
  }
  /**
   * 加減法器的 IC 接線。impl：gates＝用基本閘（map 指定每種閘的 IC）；msi＝用 4 位元加法器 IC（ic：74283｜7483｜4008），
   * 減法器另外用 7404 把 B 反相、加減法器用 7486 做「B ⊕ M」。只有多位元才能用 msi。
   */
  function arithWiring(ar, o = {}) {
    if ((o.impl || 'gates') !== 'msi') return { impl: 'gates', ...wiringOf(ar.circuit, o.map || {}) };
    if (!ar.multi) throw new Error('半加器／全加器／半減器／全減器只有 1 位元，用基本閘接（4 位元加法器 IC 是給多位元用的）');
    const id = icId(o.ic || '74283'); if (!id || IC[id].type !== 'ADD4') throw new Error('加法器 IC 可以選：74283、7483、4008');
    const sp = IC[id]; const n = ar.bits; const kind = ar.kind; const nAdd = Math.ceil(n / 4); const R = kind === 'add' ? 'S' : kind === 'sub' ? 'D' : 'R';
    // B 那一邊要先處理的閘
    const pre = []; const bsig = (i) => (kind === 'add' ? 'B' + i : 'b' + i);
    if (kind === 'sub') for (let i = 0; i < n; i++) pre.push({ id: 'i' + i, type: 'NOT', ins: ['B' + i], out: 'b' + i });
    if (kind === 'addsub') for (let i = 0; i < n; i++) pre.push({ id: 'x' + i, type: 'XOR', ins: ['B' + i, 'M'], out: 'b' + i });
    const gateChips = pre.length ? allocGates(pre, (g) => (g.type === 'NOT' ? (sp.cmos ? '4069' : '7404') : sp.cmos ? '4070' : '7486'), nAdd + 1) : [];
    const chips = []; const msi = []; const outputs = [];
    for (let j = 0; j < nAdd; j++) {
      const pins = {}; const ref = 'U' + (j + 1); const part = [];
      for (let q = 0; q < 4; q++) { const i = j * 4 + q; const on = i < n;
        pins[sp.map.A[q]] = on ? { sig: 'A' + i, role: 'in' } : { sig: '0', role: 'tie0' }; pins[sp.map.B[q]] = on ? { sig: bsig(i), role: 'in' } : { sig: '0', role: 'tie0' };
        pins[sp.map.S[q]] = on ? { sig: R + i, role: 'out' } : { sig: '', role: 'nc' }; if (on) { outputs.push({ name: R + i, sig: R + i }); part.push(`A${i}→腳${sp.map.A[q]}、${kind === 'add' ? 'B' + i : kind === 'sub' ? "B" + i + "'" : 'B' + i + '⊕M'}→腳${sp.map.B[q]}、${R}${i}←腳${sp.map.S[q]}`); } }
      const cin = j === 0 ? (kind === 'add' ? 'Cin' : kind === 'sub' ? '1' : 'M') : 'c' + j * 4; const last = j === nAdd - 1; const exact = n % 4 === 0 || !last;
      pins[sp.map.C0] = { sig: cin, role: 'in' }; const cout = last ? 'C' + n : 'c' + (j + 1) * 4;
      // 最後一顆沒用滿 4 位元時：沒用到的位元 A=B=0，進位會出現在「下一個和」的腳，不是 C4
      if (last && !exact) { const q = n % 4; pins[sp.map.S[q]] = { sig: cout, role: 'out' }; pins[sp.map.C4] = { sig: '', role: 'nc' }; part.push(`C${n}←腳${sp.map.S[q]}（沒用到的位元 A、B 接地，進位會從下一個和的腳出來）`); }
      else { pins[sp.map.C4] = { sig: cout, role: 'out' }; part.push(`${last ? 'C' + n : '進位到下一顆'}←腳${sp.map.C4}`); }
      part.unshift(`${j === 0 ? (kind === 'add' ? 'Cin' : kind === 'sub' ? '+5V（固定 1）' : 'M') : '上一顆的進位'}→腳${sp.map.C0}`);
      chips.push({ ref, ic: id, name: sp.name, n: 16, vcc: sp.vcc, gnd: sp.gnd, cmos: !!sp.cmos, pins }); msi.push(`・${ref}（${id}）第 ${j * 4}～${Math.min(n, j * 4 + 4) - 1} 位元：${part.join('、')}`);
    }
    outputs.reverse(); outputs.unshift({ name: 'C' + n, sig: 'C' + n });
    const gp = gateChips.map(gatePins); const all = chips.concat(gp); const inputs = ar.inputs.slice();
    const lines = []; for (const ch of gateChips) ch.used.forEach((g, i) => { if (!g) return; const pp = IC[ch.ic].pins[i]; lines.push({ chip: ch.ref, ic: ch.ic, gate: i + 1, type: ch.type, ins: pp.slice(0, -1).map((p, k2) => ({ pin: p, sig: g.ins[k2] })), out: { pin: pp[pp.length - 1], sig: g.out }, extra: '' }); });
    const power = all.map((ch) => `${ch.ref}（${ch.ic}）：腳 ${ch.vcc} 接 ${ch.cmos ? 'VDD（3～15V）' : '+5V'}、腳 ${ch.gnd} 接 ${ch.cmos ? 'VSS（地）' : 'GND'}${Object.values(ch.pins).some((x) => x.role === 'tie0') ? '；標「接地」的輸入腳接 GND（不要空接）' : ''}`);
    const board = mkBoard(all, inputs, outputs);
    return { impl: 'msi', adder: id, chips: all.map((ch) => ({ ref: ch.ref, ic: ch.ic, name: ch.name, used: 0, total: 0 })), lines, msi, power, board, outputs, note: kind === 'addsub' && n > 1 ? `溢位 V 要用到 C${n - 1}，${id} 內部的進位拿不到；要 V 請改用基本閘接法，或用有號數自己判斷（兩個同號的數相加結果變號就是溢位）。` : '' };
  }
  /** 加減法器的文字報告（給 AI） */
  function arithReport(kind, o = {}) {
    const ar = arith(kind, o); const L2 = [`${ar.title}：${ar.note}`, `輸入：${ar.inputs.join('、')}；輸出：${ar.outputs.map((x) => x.name).join('、')}`, ...ar.exprs.map((e) => '・' + e), `閘級電路共 ${ar.circuit.gates.length} 個閘（${Object.entries(ar.circuit.gates.reduce((m, g) => { m[g.type] = (m[g.type] || 0) + 1; return m; }, {})).map(([t, c]) => `${t}×${c}`).join('、')}）`];
    const t = arithTable(ar); if (t) L2.push('', '真值表：', `| ${t.head.join(' | ')} |`, `|${t.head.map(() => ':-:|').join('')}`, ...t.rows.map((r) => `| ${[...r.ins, ...r.outs].join(' | ')} |`));
    if (ar.multi && (o.a != null || o.b != null)) { const r = arithEval(ar, o.a, o.b, o.x); L2.push('', '代入：' + r.text, ...(r.signed ? [r.signed] : [])); }
    if (o.impl || o.ic || o.map) { const w = arithWiring(ar, { impl: o.impl || (o.ic ? 'msi' : 'gates'), ic: o.ic, map: o.map }); L2.push('', w.impl === 'msi' ? `IC 接線（用 ${w.adder}）：` : 'IC 接線（用基本閘）：', wiringText(w), ...(w.note ? [w.note] : [])); }
    return L2.join('\n');
  }
  // ======================= 卡諾圖 =======================
  const GRAY = { 1: ['0', '1'], 2: ['00', '01', '11', '10'] };
  /** 2～4 個變數一張；5 個變數兩張（第一個變數＝0／1）；6 個以上不畫。groups＝SOP 每一項涵蓋到的格子 */
  function kmap(sol) {
    const vars = sol.vars; const n = vars.length; if (n < 2 || n > 5) return null;
    const val = (m) => (sol.dc.includes(m) ? 'X' : sol.minterms.includes(m) ? 1 : 0);
    const cover = (m) => sol.sop.map((p, gi) => ([...p].every((c, i) => c === '-' || c === String((m >> (n - 1 - i)) & 1)) ? gi : -1)).filter((x) => x >= 0);
    const one = (fixed, sub) => {   // sub：這張圖用的變數（在 vars 裡的位置）
      const k = sub.length; const rb = Math.floor(k / 2), cb = k - rb; const rv = sub.slice(0, rb), cv = sub.slice(rb);
      const rows = GRAY[rb], cols = GRAY[cb]; const cells = rows.map((r) => cols.map((c) => { const bits = Array(n).fill('0'); Object.entries(fixed).forEach(([i, b]) => { bits[i] = b; }); rv.forEach((vi, j) => { bits[vi] = r[j]; }); cv.forEach((vi, j) => { bits[vi] = c[j]; }); const m = parseInt(bits.join(''), 2); return { m, v: val(m), groups: cover(m) }; }));
      return { title: Object.keys(fixed).length ? Object.entries(fixed).map(([i, b]) => `${vars[i]}=${b}`).join('，') : '', rowVars: rv.map((i) => vars[i]).join(''), colVars: cv.map((i) => vars[i]).join(''), rows, cols, cells };
    };
    const idx = vars.map((_, i) => i);
    return { maps: n <= 4 ? [one({}, idx)] : [one({ 0: '0' }, idx.slice(1)), one({ 0: '1' }, idx.slice(1))], groups: sol.sop.map((p) => termSop(p, vars)) };
  }
  /** 卡諾圖的文字版（Markdown 表格，App 會畫成表格） */
  function kmapText(sol) {
    const k = kmap(sol); if (!k) return '（卡諾圖支援 2～5 個變數）';
    const tag = (gs) => (gs.length ? '[' + gs.map((g) => String.fromCharCode(97 + g)).join('') + ']' : '');
    const out = k.maps.map((mp) => `${mp.title ? mp.title + '：\n' : ''}| ${mp.rowVars}＼${mp.colVars} | ${mp.cols.join(' | ')} |\n|:-:|${mp.cols.map(() => ':-:|').join('')}\n${mp.rows.map((r, i) => `| ${r} | ${mp.cells[i].map((c) => `${c.v}${c.v === 1 ? tag(c.groups) : ''}`).join(' | ')} |`).join('\n')}`).join('\n\n');
    return out + (k.groups.length ? '\n\n圈法（SOP 每一項）：' + k.groups.map((g, i) => `${String.fromCharCode(97 + i)}＝${g}`).join('、') : '');
  }
  /** 真值表文字版 */
  const tableText = (sol) => `| ${sol.vars.join(' | ')} | ${sol.name || 'F'} |\n|${sol.vars.map(() => ':-:|').join('')}:-:|\n` + sol.table.map((r) => `| ${[...r.bits].join(' | ')} | ${r.f} |`).join('\n');
  /** 給 AI 工具與複製用的文字報告 */
  function report(input, ics) {
    const s = solve(input); const L = [`${s.name}(${s.vars.join(',')}) = Σm(${s.minterms.join(',')})${s.dc.length ? ' + d(' + s.dc.join(',') + ')' : ''}`, `最簡 SOP：${s.name} = ${s.sopStr}`, `最簡 POS：${s.name} = ${s.posStr}`, `只用 NAND（由 SOP）：${s.name} = ${s.nandStr}（共 ${circuit(s, 'nand').gates.length} 個 NAND，含當反相器用的）`, `只用 NOR（由 POS）：${s.name} = ${s.norStr}（共 ${circuit(s, 'nor').gates.length} 個 NOR，含當反相器用的）`];
    if (ics) { const w = wiring(s, ics); L.push('', `用 ${w.chips.map((c) => `${c.ref}=${c.ic}`).join('、')}（${{ nand: 'NAND 式', nor: 'NOR 式', sop: 'SOP', pos: 'POS', xor: 'XOR 串接', xnor: 'XNOR 串接' }[w.form]}）：`); for (const l of w.lines) L.push(`・${l.chip}（${l.ic}）閘${l.gate} ${l.type}：${l.ins.map((p) => `腳${p.pin}←${p.sig}`).join('、')} → 腳${l.out.pin}＝${l.out.sig === w.circuit.output ? s.name + '（輸出）' : l.out.sig}${l.extra ? '（' + l.extra + '）' : ''}`); L.push('電源：' + w.power.join('；')); }
    return L.join('\n');
  }
  /** 預設的互動電路：F = (A·B) + C'（閘的種類都可以點了改） */
  const preset = () => ({ inputs: ['A', 'B', 'C'], gates: [{ id: 'g1', type: 'AND', ins: ['A', 'B'], out: 'n1' }, { id: 'g2', type: 'NOT', ins: ['C'], out: 'n2' }, { id: 'g3', type: 'OR', ins: ['n1', 'n2'], out: 'n3' }], output: 'n3' });
  return { kmap, kmapText, tableText, parse, parseExpr, solve, minimize, truth, circuit, simulate, circuitMinterms, circuitExpr, svg, icSvg, wiring, icId, IC, report, preset, GATE, wiringOf, wiringText, boardSvg, icChoices, DEFAULT_IC, arith, arithEval, arithTable, arithWiring, arithReport, arithBlockSvg, ARITH };
});
