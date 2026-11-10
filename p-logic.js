'use strict';
/*
 * 26.11.3 pro2 邏輯閘轉換器（技能卡進來）
 *  ・上面是一個設定好的電路：點閘可以換種類（AND／OR／NAND／NOR／XOR／XNOR／NOT）、改接哪個訊號；點輸入切 0／1，線會即時變色
 *  ・也可以直接輸入算式或最小項（A'B + BC、Σm(1,3,5)+d(7)、ΠM(0,4)），按「推算」換成那個電路
 *  ・下面自動算出：真值表、最簡 SOP、最簡 POS、只用 NAND、只用 NOR（每種都有邏輯圖）
 *  ・輸入 IC 編號（7400、7402、7408,7432,7404…）→ 告訴你要幾顆、每支腳接什麼
 */
(function () {
  const { esc } = LA; const $ = (s, r = document) => r.querySelector(s); const G = () => LA.logic;
  let ckt = null; let env = {}; let tab = 'sop'; let ics = ''; let lastSol = null; let showTable = true; let ts = 0; let saveT = null; let poll = null; let icmap = {}; let wsrc = 'ckt'; let arith = null;
  // 26.11.3 pro2：狀態存在後台（和 AI 共用同一份）：你改的 AI 看得到，AI 改的這裡會即時更新
  const apply = (st) => { ckt = st.ckt; env = st.env || {}; ics = st.ics || ''; tab = st.tab || 'sop'; icmap = st.icmap || {}; wsrc = st.wsrc || 'ckt'; arith = st.arith || null; ts = st.ts || 0; };
  const local = () => !!(LA.web && !(LA.link.client && LA.link.client.console));   // 26.11.3 pro5 網頁版的一般用戶：只在自己的瀏覽器裡算，不動主機的畫面
  const load = async () => { if (local()) { if (!ckt) ckt = G().preset(); return; } try { apply(await LA.api('/api/logic/state')); } catch { if (!ckt) ckt = G().preset(); } };
  const save = () => { if (local()) return; clearTimeout(saveT); saveT = setTimeout(async () => { try { const r = await LA.post('/api/logic/state', { ckt, env, ics, tab, icmap, wsrc, arith }); ts = r.ts; } catch (e) { LA.toast(e.message, true); } }, 300); };
  const MULTI = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR']; const SINGLE = ['NOT', 'BUF'];
  const downstream = (gid) => { const by = Object.fromEntries(ckt.gates.map((g) => [g.out, g])); const g0 = ckt.gates.find((g) => g.id === gid); const bad = new Set([g0.out]); let grew = true; while (grew) { grew = false; for (const g of ckt.gates) if (!bad.has(g.out) && g.ins.some((s) => bad.has(s))) { bad.add(g.out); grew = true; } } void by; return bad; };
  const sigLabel = (s) => { const g = ckt.gates.find((x) => x.out === s); return g ? `${g.type} 閘（${g.id.replace('g', '#')}）的輸出` : s; };

  function render(main) {
    const L = G(); let val = null, sol = null, err = '';
    try { val = L.simulate(ckt, env); sol = L.solve({ name: 'F', vars: ckt.inputs, minterms: L.circuitMinterms(ckt), dc: [] }); lastSol = sol; } catch (e) { err = e.message; }
    const forms = sol ? { sop: ['最簡 SOP', sol.sopStr, L.circuit(sol, 'sop')], pos: ['最簡 POS', sol.posStr, L.circuit(sol, 'pos')], nand: ['只用 NAND', sol.nandStr, L.circuit(sol, 'nand', 2)], nor: ['只用 NOR', sol.norStr, L.circuit(sol, 'nor', 2)] } : {};
    const cur = forms[tab];
    main.innerHTML = `<div class="card"><h3>${LA.icon('grid')} 邏輯閘轉換器 <small>點閘換種類、點輸入切 0／1</small></h3>
      <div class="row lg-ins">${ckt.inputs.map((v) => `<button class="lg-bit ${env[v] ? 'on' : ''}" data-bit="${esc(v)}">${esc(v)} = ${env[v] ? 1 : 0}</button>`).join('')}<button class="btn sm" id="lg-addv" ${ckt.inputs.length >= 6 ? 'disabled' : ''}>＋變數</button><button class="btn sm" id="lg-delv" ${ckt.inputs.length <= 1 ? 'disabled' : ''}>－變數</button></div>
      <div class="lg-canvas" id="lg-live">${err ? `<div class="hint err">${esc(err)}</div>` : L.svg(ckt, { values: val, clickable: true })}</div>
      <div class="row" style="margin-top:6px"><span class="pill ${val && val[ckt.output] ? 'on' : ''}">F = ${val ? val[ckt.output] : '?'}</span><span class="mute small grow">電路算式：${err ? '' : esc(L.circuitExpr(ckt))}</span></div>
      <div class="row" style="margin-top:8px"><button class="btn sm" id="lg-addg">＋加一個閘</button><label class="small mute">輸出 F 接：</label><select id="lg-outsel" style="width:auto">${ckt.gates.map((g) => `<option value="${esc(g.out)}" ${g.out === ckt.output ? 'selected' : ''}>${esc(sigLabel(g.out))}</option>`).join('')}</select><button class="btn sm" id="lg-reset">回到預設電路</button><button class="btn sm" id="lg-ai">${LA.icon('chat', 'sm')} 請 AI 解釋</button></div></div>
      <div class="card"><h3>輸入算式或最小項</h3><input id="lg-expr" placeholder="例：A'B + AB'、F(A,B,C)=Σm(1,3,5,7)、ΠM(0,4)+d(6)" autocapitalize="off" autocomplete="off" spellcheck="false">
        <div class="row" style="margin-top:8px"><button class="btn pri" id="lg-go">推算並換成這個電路</button><span class="mute small">NOT 可寫 A'、~A、!A；AND 可省略或寫 · * &amp;；OR 寫 +；XOR 寫 ⊕ 或 ^</span></div><div id="lg-err" class="hint err" hidden></div></div>
      ${sol ? `<div class="card"><h3>轉換結果 <small>${esc(sol.vars.join(','))}・Σm(${sol.minterms.join(',') || '—'})</small></h3>
        <div class="seg">${Object.entries(forms).map(([k, f]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${f[0]}</button>`).join('')}</div>
        <div class="lg-expr"><b>F = ${esc(cur[1])}</b><span class="mute small">　${cur[2].gates.length} 個閘${tab === 'nand' || tab === 'nor' ? '（2 輸入，含當反相器用的）' : ''}</span></div>
        <div class="lg-canvas">${L.svg(cur[2])}</div>
        <div class="row" style="margin-top:8px"><button class="btn sm" id="lg-tt">${showTable ? '收起真值表' : '真值表'}</button><button class="btn sm" id="lg-copy">${LA.icon('copy', 'sm')} 複製全部結果</button><button class="btn sm" id="lg-use">把這個形式放回上面編輯</button></div>
        </div>
      <div class="card"><h3>布林式・真值表・卡諾圖</h3>
        <div class="lg-expr">電路布林式：<b>F = ${esc(L.circuitExpr(ckt))}</b></div><div class="lg-expr">標準式：<b>F = Σm(${sol.minterms.join(',') || '—'})</b>　<span class="mute">＝ ΠM(${sol.table.filter((r) => r.f === 0).map((r) => r.i).join(',') || '—'})</span></div>
        <div class="lg-expr">最簡 SOP：<b>${esc(sol.sopStr)}</b>　最簡 POS：<b>${esc(sol.posStr)}</b></div>
        ${showTable ? `<h4>真值表</h4><div class="ctable"><table><thead><tr><th>#</th>${sol.vars.map((v) => `<th>${esc(v)}</th>`).join('')}<th>F</th></tr></thead><tbody>${sol.table.map((r) => `<tr class="${r.i === sol.vars.reduce((a, v, k) => a | ((env[v] ? 1 : 0) << (sol.vars.length - 1 - k)), 0) ? 'lg-now' : ''}"><td class="mute">${r.i}</td>${[...r.bits].map((b) => `<td>${b}</td>`).join('')}<td><b class="${r.f ? 'tc-green' : 'tc-gray'}">${r.f}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
        <h4>卡諾圖</h4>${kmapHtml(sol)}</div>
      ${boardCard(sol, cur)}
      <div class="card"><h3>我手上只有某幾顆 IC <small>自動換成做得出來的形式</small></h3><div class="row"><input id="lg-ic" class="grow" value="${esc(ics)}" placeholder="IC 編號，例：7400，或 7408,7432,7404、74HC02、CD4011"><button class="btn pri" id="lg-icgo">產生接線</button></div>
        <div class="mute small" style="margin-top:4px">支援：${Object.keys(L.IC).filter((k) => L.IC[k].pins).join('、')}（74LS／74HC／SN… 前後綴都可以）</div><div id="lg-wire"></div></div>` : ''}
      ${arithCard()}`;
    if (ics && sol) wire(main, true);
    enhance(main); bindZoom(main);
  }
  // ---------- 26.11.3 pro5：實際接線圖（每種閘選 IC）、加法器／減法器 ----------
  const HOWTO = '<div class="mute small">圖的看法：IC 缺口朝上、第 1 腳在左上角（逆時針數）。每條線一種顏色，同一條橫線上的圓點全部接在一起；左邊的方塊是輸入（接開關或訊號），右邊的圓圈是輸出（接 LED 要串 330Ω 電阻）。標「接地」的腳接 GND、標 +5V 的接電源。</div>';
  function wiringHtml(w) {
    const L = G(); const outs = Object.fromEntries((w.outputs || []).map((o) => [o.sig, o.name]));
    return `<div class="lg-expr" style="margin-top:10px"><b>用 ${w.chips.length} 顆 IC：</b>${w.chips.map((c) => `${c.ref}＝${c.ic}（${esc(c.name)}${c.total ? `，用 ${c.used}/${c.total} 組` : ''}）`).join('、')}</div>
      <div class="lg-canvas">${L.boardSvg(w.board)}</div>${HOWTO}
      <details class="lg-det"><summary>每支腳的接法（文字版）</summary>
        ${w.msi && w.msi.length ? `<h4>加法器 IC</h4><ul class="lg-list">${w.msi.map((t) => `<li>${esc(t.replace(/^・/, ''))}</li>`).join('')}</ul>` : ''}
        ${w.lines.length ? `<h4>每個閘</h4><ol class="lg-list">${w.lines.map((l) => `<li><b>${l.chip}</b>（${l.ic}）第 ${l.gate} 組 ${l.type}：${l.ins.map((p) => `腳 ${p.pin} ← ${esc(p.sig)}`).join('、')}　→　輸出腳 ${l.out.pin}${outs[l.out.sig] ? '＝<b>' + esc(outs[l.out.sig]) + '</b>' : '（' + esc(l.out.sig) + '）'}${l.extra ? `<div class="mute small">${esc(l.extra)}</div>` : ''}</li>`).join('')}</ol>` : ''}
        <h4>連線表（同一行的腳接在一起）</h4><div class="ctable"><table><thead><tr><th>線</th><th>接到</th></tr></thead><tbody>${w.board.nets.filter((n) => n.pins.length).map((n) => `<tr><td><b>${esc(n.label)}</b></td><td>${esc(n.pins.map((p) => `${p.ref}-${p.pin}`).join('、'))}</td></tr>`).join('')}</tbody></table></div>
        <h4>電源與沒用到的腳</h4><ul class="lg-list">${w.power.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>${w.note ? `<div class="hint">${esc(w.note)}</div>` : ''}
      <div class="row" style="margin-top:6px"><button class="btn sm" data-copyw="1">${LA.icon('copy', 'sm')} 複製接線</button></div>`;
  }
  const mapSelects = (types, counts) => types.map((t) => { const L = G(); const cur = icmap[t] || ''; return `<div class="row lg-map"><span class="small"><b>${t}</b>${counts[t] ? `<span class="mute">　${counts[t]} 個</span>` : ''}</span><select data-icmap="${t}" class="grow"><option value="">自動（${esc((L.DEFAULT_IC[t] || [])[0] || '')}…）</option>${L.icChoices(t).map((id) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${id}　${esc(L.IC[id].name)}${L.IC[id].type !== t ? '（輸入接在一起當 NOT）' : ''}</option>`).join('')}</select></div>`; }).join('');
  let lastW = null;
  function boardCard(sol, cur) {
    const L = G(); const tgt = wsrc === 'form' ? cur[2] : ckt; const counts = {}; for (const g of tgt.gates) if (g.type !== 'BUF') counts[g.type] = (counts[g.type] || 0) + 1; const types = Object.keys(counts);
    let inner; try { if (!types.length) throw new Error('這個電路不需要任何閘（輸出直接接輸入）'); lastW = L.wiringOf(tgt, icmap); inner = wiringHtml(lastW); } catch (e) { lastW = null; inner = `<div class="hint err">${esc(e.message)}</div>`; }
    return `<div class="card" id="lg-board"><h3>實際接線 <small>IC 怎麼接</small></h3>
      <div class="seg"><button class="${wsrc === 'ckt' ? 'on' : ''}" data-wsrc="ckt">照上面畫的電路</button><button class="${wsrc === 'form' ? 'on' : ''}" data-wsrc="form">照轉換結果（${esc(cur[0])}）</button></div>
      ${types.length ? `<h4>每種閘用哪顆 IC</h4>${mapSelects(types, counts)}` : ''}${inner}</div>`;
  }
  let lastAW = null;
  function arithCard() {
    const L = G(); const kinds = Object.entries(L.ARITH);
    const head = `<div class="row"><select id="ar-kind" class="grow"><option value="">（選一種）</option>${kinds.map(([k, v]) => `<option value="${k}" ${arith && arith.kind === k ? 'selected' : ''}>${['add', 'sub', 'addsub'].includes(k) ? 'N ' : ''}${v}</option>`).join('')}</select>${arith && ['add', 'sub', 'addsub'].includes(arith.kind) ? `<select id="ar-bits" style="width:auto">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${n === arith.bits ? 'selected' : ''}>${n} 位元</option>`).join('')}</select>` : ''}</div>`;
    if (!arith) return `<div class="card" id="lg-arith"><h3>加法器／減法器 <small>半加器、全加器、半減器、全減器、多位元</small></h3>${head}<div class="mute small" style="margin-top:6px">選了之後會顯示布林式、真值表、邏輯圖，還有實際用 IC 怎麼接（基本閘，或 74283／7483 這種 4 位元加法器 IC）。</div></div>`;
    let body = '';
    try {
      const ar = L.arith(arith.kind, { bits: arith.bits }); const multi = ar.multi; let ev;
      if (multi) {
        const max = (1 << ar.bits) - 1; ev = L.arithEval(ar, Math.min(arith.a, max), Math.min(arith.b, max), arith.x);
        body += `<div class="row" style="margin-top:8px"><label class="small">A</label><input id="ar-a" type="number" min="0" max="${max}" value="${ev.a}" style="width:76px"><label class="small">B</label><input id="ar-b" type="number" min="0" max="${max}" value="${ev.b}" style="width:76px">${ar.kind !== 'sub' ? `<button class="lg-bit ${arith.x ? 'on' : ''}" id="ar-x">${ar.kind === 'add' ? 'Cin' : 'M'} = ${arith.x ? 1 : 0}${ar.kind === 'addsub' ? (arith.x ? '（減）' : '（加）') : ''}</button>` : ''}<span class="mute small">0～${max}</span></div>
          <div class="lg-expr"><b>${esc(ev.text)}</b>${ev.signed ? `<div class="mute small">${esc(ev.signed)}</div>` : ''}</div><div class="lg-canvas">${L.arithBlockSvg(ar, ev)}</div>`;
      } else {
        ev = L.arithEval(ar, arith.env || {}); const t = L.arithTable(ar); const now = ar.inputs.map((v) => (arith.env || {})[v] ? 1 : 0).join('');
        body += `<div class="row lg-ins" style="margin-top:8px">${ar.inputs.map((v) => `<button class="lg-bit ${(arith.env || {})[v] ? 'on' : ''}" data-abit="${esc(v)}">${esc(v)} = ${(arith.env || {})[v] ? 1 : 0}</button>`).join('')}${ar.outputs.map((o) => `<span class="pill ${ev.outs[o.name] ? 'on' : ''}">${esc(o.name)} = ${ev.outs[o.name]}</span>`).join('')}</div>
          <div class="lg-canvas">${L.svg(ar.circuit, { values: ev.val })}</div>
          <h4>真值表</h4><div class="ctable"><table><thead><tr>${t.head.map((h, i) => `<th${i >= ar.inputs.length ? ' class="tc-green"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr class="${r.ins.join('') === now ? 'lg-now' : ''}">${r.ins.map((b) => `<td>${b}</td>`).join('')}${r.outs.map((b) => `<td><b class="${b ? 'tc-green' : 'tc-gray'}">${b}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      body += `<h4>布林式</h4><ul class="lg-list">${ar.exprs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul><div class="mute small">${esc(ar.note)}　閘級電路共 ${ar.circuit.gates.length} 個閘。</div>`;
      if (multi) body += `<details class="lg-det"><summary>每一級全加器裡面的電路</summary><div class="lg-canvas">${L.svg(L.arith('fa').circuit)}</div></details>`;
      const impl = multi ? arith.impl : 'gates'; const types = [...new Set(ar.circuit.gates.map((g) => g.type))]; const counts = {}; for (const g of ar.circuit.gates) counts[g.type] = (counts[g.type] || 0) + 1;
      body += `<h4>實際接線</h4>${multi ? `<div class="seg"><button class="${impl === 'msi' ? 'on' : ''}" data-aimpl="msi">用 4 位元加法器 IC</button><button class="${impl === 'gates' ? 'on' : ''}" data-aimpl="gates">用基本閘</button></div>` : ''}
        ${impl === 'msi' ? `<div class="row lg-map"><span class="small"><b>加法器 IC</b></span><select id="ar-ic" class="grow">${['74283', '7483', '4008'].map((id) => `<option value="${id}" ${id === arith.ic ? 'selected' : ''}>${id}　${esc(L.IC[id].name)}</option>`).join('')}</select></div>` : mapSelects(types, counts)}`;
      try { lastAW = L.arithWiring(ar, { impl, ic: arith.ic, map: icmap }); body += wiringHtml(lastAW).replace('data-copyw="1"', 'data-copyw="2"'); } catch (e) { lastAW = null; body += `<div class="hint err">${esc(e.message)}</div>`; }
    } catch (e) { body = `<div class="hint err">${esc(e.message)}</div>`; }
    return `<div class="card" id="lg-arith"><h3>加法器／減法器</h3>${head}${body}</div>`;
  }
  const { enhance, bindZoom } = LA.svgView;   // 26.11.3 pro7：縮放與下載（ui/svgview.js，電路工具也用同一套）
  const GC = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#c084fc', '#f472b6', '#22d3ee', '#a3e635'];
  /** 卡諾圖：每一格是 0／1，SOP 每一項用一種顏色標出圈到的格子 */
  function kmapHtml(sol) {
    const k = G().kmap(sol); if (!k) return '<div class="mute small">卡諾圖支援 2～5 個變數</div>';
    const now = sol.vars.reduce((a, v, i) => a | ((env[v] ? 1 : 0) << (sol.vars.length - 1 - i)), 0);
    return k.maps.map((mp) => `${mp.title ? `<div class="small mute">${esc(mp.title)}</div>` : ''}<div class="ctable"><table class="kmap"><thead><tr><th>${esc(mp.rowVars)}＼${esc(mp.colVars)}</th>${mp.cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${mp.rows.map((r, i) => `<tr><th>${r}</th>${mp.cells[i].map((c) => `<td class="${c.m === now ? 'lg-now' : ''}" title="m${c.m}"><b>${c.v}</b><small>m${c.m}</small>${c.v === 1 ? `<span class="kg">${c.groups.map((g) => `<i style="background:${GC[g % GC.length]}"></i>`).join('')}</span>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')
      + (k.groups.length ? `<div class="kleg">${k.groups.map((g, i) => `<span><i style="background:${GC[i % GC.length]}"></i>${esc(g)}</span>`).join('')}</div>` : '');
  }
  function wire(main, silent) {
    const L = G(); const box = $('#lg-wire', main); if (!box || !lastSol) return;
    try {
      const w = L.wiring(lastSol, ics); const formName = { nand: 'NAND 式', nor: 'NOR 式', sop: 'SOP（AND-OR）', pos: 'POS（OR-AND）', xor: 'XOR 串接', xnor: 'XNOR 串接' }[w.form];
      box.innerHTML = `<div class="lg-expr" style="margin-top:10px"><b>用 ${w.chips.length} 顆 IC：</b>${w.chips.map((c) => `${c.ref}＝${c.ic}（${esc(c.name)}，用 ${c.used}/${c.total} 組）`).join('、')}<div class="mute small">做法：${formName}</div></div>
        <div class="lg-canvas">${L.svg(w.circuit)}</div>
        <h4>每個閘的接法</h4><ol class="lg-list">${w.lines.map((l) => `<li><b>${l.chip}</b>（${l.ic}）第 ${l.gate} 組 ${l.type}：${l.ins.map((p) => `腳 ${p.pin} ← ${esc(p.sig)}`).join('、')}　→　輸出腳 ${l.out.pin}${l.out.sig === w.circuit.output ? '＝<b>F</b>' : '（' + esc(l.out.sig) + '）'}${l.extra ? `<div class="mute small">${esc(l.extra)}</div>` : ''}</li>`).join('')}</ol>
        <h4>連線表（同一行的腳接在一起）</h4><div class="ctable"><table><thead><tr><th>訊號</th><th>接到</th></tr></thead><tbody>${w.nets.map((n) => `<tr><td><b>${esc(n.sig)}</b></td><td>${esc(n.pins.join('、'))}</td></tr>`).join('')}</tbody></table></div>
        <h4>電源與沒用到的腳</h4><ul class="lg-list">${w.power.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        <h4>實際接線圖</h4><div class="lg-canvas">${L.boardSvg(w.board)}</div>${HOWTO}
        ${w.alternatives.filter((a) => a.chips).length ? `<div class="mute small">其他做法：${w.alternatives.filter((a) => a.chips).map((a) => `${a.form.toUpperCase()} 要 ${a.chips} 顆`).join('、')}</div>` : ''}`;
    } catch (e) { if (!silent || ics) box.innerHTML = `<div class="hint err">${esc(e.message)}</div>`; }
    enhance(main);
  }
  function gateMenu(main, gid) {
    const g = ckt.gates.find((x) => x.id === gid); if (!g) return; const bad = downstream(gid);
    const srcs = [...ckt.inputs, ...ckt.gates.filter((x) => !bad.has(x.out)).map((x) => x.out)];
    const types = g.ins.length === 1 ? SINGLE.concat(MULTI) : MULTI.concat(SINGLE);
    const m = LA.modal(`<h3 style="margin-top:0">改這個閘</h3><div class="lg-types">${types.map((t) => `<button class="btn ${t === g.type ? 'pri' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
      <label class="f">輸入</label>${g.ins.map((s, i) => `<div class="row"><span class="small mute">第 ${i + 1} 個</span><select data-in="${i}" class="grow">${srcs.map((x) => `<option value="${esc(x)}" ${x === s ? 'selected' : ''}>${esc(sigLabel(x))}</option>`).join('')}</select></div>`).join('')}
      <div class="row" style="margin-top:8px">${MULTI.includes(g.type) ? `<button class="btn sm" id="gm-add" ${g.ins.length >= 4 ? 'disabled' : ''}>＋輸入</button><button class="btn sm" id="gm-del" ${g.ins.length <= 2 ? 'disabled' : ''}>－輸入</button>` : ''}<span class="grow"></span><button class="btn sm bad" id="gm-rm" ${ckt.gates.length <= 1 ? 'disabled' : ''}>刪除這個閘</button><button class="btn pri" id="gm-ok">完成</button></div>`);
    const root = m || document;
    root.onclick = (e) => {
      const t = e.target.closest('[data-t]'); if (t) { const nt = t.dataset.t; if (SINGLE.includes(nt)) g.ins = g.ins.slice(0, 1); else if (g.ins.length < 2) g.ins = [g.ins[0], srcs.find((x) => x !== g.ins[0]) || g.ins[0]]; g.type = nt; save(); LA.closeModal(); render(main); return gateMenu(main, gid); }
      if (e.target.closest('#gm-add')) { g.ins.push(srcs[0]); save(); LA.closeModal(); render(main); return gateMenu(main, gid); }
      if (e.target.closest('#gm-del')) { g.ins.pop(); save(); LA.closeModal(); render(main); return gateMenu(main, gid); }
      if (e.target.closest('#gm-rm')) { const out = g.out; ckt.gates = ckt.gates.filter((x) => x.id !== gid); const rep = g.ins[0]; for (const x of ckt.gates) x.ins = x.ins.map((s) => (s === out ? rep : s)); if (ckt.output === out) ckt.output = ckt.gates.length ? ckt.gates[ckt.gates.length - 1].out : rep; save(); LA.closeModal(); return render(main); }
      if (e.target.closest('#gm-ok')) { LA.closeModal(); render(main); }
    };
    root.onchange = (e) => { const i = e.target.dataset.in; if (i != null) { g.ins[+i] = e.target.value; save(); render(main); } };
  }
  LA.register('logic', { name: '邏輯閘轉換器', title: '邏輯閘轉換器（SOP／POS／NAND／NOR／IC 接線）',
    leave() { clearInterval(poll); },
    async render(main) {
      main.dataset.dlname = '邏輯閘'; await load(); render(main);
      clearInterval(poll); poll = setInterval(async () => { if (LA.cur !== 'logic' || local()) return clearInterval(poll); if (document.querySelector('#modal:not([hidden])') || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && /^(lg-|ar-)/.test(document.activeElement.id || '') && (document.activeElement.value || document.activeElement.tagName === 'SELECT'))) return; try { const st = await LA.api('/api/logic/state'); if (st.ts > ts) { apply(st); render(main); if (st.by === 'ai') LA.toast('AI 更新了電路'); } } catch { /* ignore */ } }, 2500);
      main.onclick = LA.guard(async (e) => {
        const L = G(); const t = e.target;
        if (await LA.svgView.click(t)) return;
        const bit = t.closest('[data-bit]'); if (bit) { env[bit.dataset.bit] = env[bit.dataset.bit] ? 0 : 1; save(); return render(main); }
        const gt = t.closest('[data-gate]'); if (gt && t.closest('#lg-live')) return gateMenu(main, gt.dataset.gate);
        const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; save(); return render(main); }
        if (t.closest('#lg-addv')) { const nv = 'ABCDEFGH'.split('').find((v) => !ckt.inputs.includes(v)); ckt.inputs.push(nv); save(); return render(main); }
        if (t.closest('#lg-delv')) { const v = ckt.inputs[ckt.inputs.length - 1]; if (ckt.gates.some((g) => g.ins.includes(v))) return LA.toast(`變數 ${v} 還有接到閘，先把它改接別的訊號`, true); ckt.inputs.pop(); delete env[v]; save(); return render(main); }
        if (t.closest('#lg-addg')) { const k = Math.max(0, ...ckt.gates.map((g) => +g.id.slice(1) || 0)) + 1; const g = { id: 'g' + k, type: 'AND', ins: [ckt.output, ckt.inputs[0]], out: 'n' + k }; ckt.gates.push(g); ckt.output = g.out; save(); render(main); return gateMenu(main, g.id); }
        if (t.closest('#lg-reset')) { ckt = L.preset(); env = {}; save(); return render(main); }
        if (t.closest('#lg-ai')) { await LA.go('home'); return LA.chatSend('請先用 logic_state 看邏輯閘轉換器目前的電路，說明它在做什麼、最簡 SOP／POS、用 NAND 或 NOR 怎麼做，最後附上 [[開啟:邏輯閘轉換器]]'); }
        if (t.closest('#lg-go')) { const v = $('#lg-expr', main).value; const er = $('#lg-err', main); try { const s = L.solve(v); if (s.vars.length > 6) throw new Error('互動電路最多 6 個變數（文字結果可以到 8 個，請用 AI 的 logic_convert）'); ckt = L.circuit(s, 'sop', 4); if (!ckt.gates.length) ckt = { ...ckt, gates: [{ id: 'g1', type: 'BUF', ins: [ckt.output], out: 'n1' }], output: 'n1' }; env = {}; save(); render(main); LA.toast('已換成最簡 SOP 電路'); } catch (x) { er.hidden = false; er.textContent = x.message; } return; }
        if (t.closest('#lg-tt')) { showTable = !showTable; return render(main); }
        if (t.closest('#lg-use')) { const c = L.circuit(lastSol, tab, tab === 'nand' || tab === 'nor' ? 2 : 4); if (!c.gates.length) return LA.toast('這個結果不需要任何閘', true); ckt = c; save(); window.scrollTo(0, 0); return render(main); }
        if (t.closest('#lg-copy')) { const vars = lastSol.vars; LA.copy(L.report({ name: 'F', vars, minterms: lastSol.minterms, dc: [] }, ics || undefined)); return LA.toast('已複製'); }
        const ws = t.closest('[data-wsrc]'); if (ws) { wsrc = ws.dataset.wsrc; save(); return render(main); }
        const cw = t.closest('[data-copyw]'); if (cw) { const w = cw.dataset.copyw === '2' ? lastAW : lastW; if (w) { LA.copy(L.wiringText(w)); LA.toast('已複製接線'); } return; }
        const ab = t.closest('[data-abit]'); if (ab && arith) { arith.env = { ...(arith.env || {}) }; arith.env[ab.dataset.abit] = arith.env[ab.dataset.abit] ? 0 : 1; save(); return render(main); }
        const ai = t.closest('[data-aimpl]'); if (ai && arith) { arith.impl = ai.dataset.aimpl; save(); return render(main); }
        if (t.closest('#ar-x') && arith) { arith.x = arith.x ? 0 : 1; save(); return render(main); }
        if (t.closest('#lg-icgo')) { ics = $('#lg-ic', main).value.trim(); save(); return wire(main); }
      });
      main.onchange = (e) => {
        const t = e.target; const keepY = () => { const y = window.scrollY; render(main); window.scrollTo(0, y); };
        if (t.dataset && t.dataset.icmap) { if (t.value) icmap[t.dataset.icmap] = t.value; else delete icmap[t.dataset.icmap]; save(); return keepY(); }
        if (t.id === 'ar-kind') { arith = t.value ? { kind: t.value, bits: (arith && arith.bits) || 4, a: (arith && arith.a) || 5, b: (arith && arith.b) || 3, x: 0, env: {}, impl: (arith && arith.impl) || 'msi', ic: (arith && arith.ic) || '74283' } : null; save(); return keepY(); }
        if (!arith) return;
        if (t.id === 'ar-bits') { arith.bits = +t.value; save(); return keepY(); }
        if (t.id === 'ar-a' || t.id === 'ar-b') { const max = (1 << arith.bits) - 1; arith[t.id === 'ar-a' ? 'a' : 'b'] = Math.max(0, Math.min(max, Math.floor(+t.value || 0))); save(); return keepY(); }
        if (t.id === 'ar-ic') { arith.ic = t.value; save(); return keepY(); }
      };
      main.onkeydown = (e) => { if (e.key === 'Enter' && e.target.id === 'lg-expr') $('#lg-go', main).click(); if (e.key === 'Enter' && e.target.id === 'lg-ic') $('#lg-icgo', main).click(); };
    } });
})();
