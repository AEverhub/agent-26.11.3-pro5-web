'use strict';
/*
 * 26.11.3 pro7 電路工具（技能卡進來；和 AI 的 circuit_state／circuit_set 共用同一份）
 *  ・上面是電路圖：每個節點標電壓（黃）、每個零件標電流與狀態（綠）；圖可以縮放、下載 PNG／SVG
 *  ・開關點一下切換、可變電阻／光線／溫度拉桿即時重算
 *  ・零件表可以直接改數值、刪零件；下面可以加零件或直接改文字格式（netlist）
 *  ・有電容／電感／555 時可以跑「時間模擬」看充放電、方波
 *  ・計算機：歐姆定律、LED 限流電阻、分壓、RC、555、色碼、串並聯、LC、電池續航
 */
(function () {
  const { esc } = LA; const $ = (s, r = document) => r.querySelector(s); const C = () => LA.circuit;
  let ck = null; let ts = 0; let saveT = null; let poll = null; let tr = null; let calcKind = 'led'; let calcIn = {}; let calcOut = ''; let sel = ''; let showText = false;
  const local = () => !!(LA.web && !(LA.link.client && LA.link.client.console));
  const apply = (st) => { ck = { title: st.title || '', parts: st.parts || [], env: { light: 300, temp: 25, ...(st.env || {}) } }; ts = st.ts || 0; tr = null; };
  const load = async () => { if (local()) { if (!ck) apply(C().preset('led')); return; } try { apply(await LA.api('/api/circuit/state')); } catch { if (!ck) apply(C().preset('led')); } };
  const save = () => { if (local()) return; clearTimeout(saveT); saveT = setTimeout(async () => { try { const r = await LA.post('/api/circuit/state', ck); ts = r.ts; } catch (e) { LA.toast(e.message, true); } }, 300); };
  const F = (v, u) => C().fmt(v, u);
  const VALUED = ['R', 'C', 'L', 'V', 'I', 'POT', 'NTC'];
  const unitOf = (t) => ({ R: 'Ω', POT: 'Ω', NTC: 'Ω', C: 'F', L: 'H', V: 'V', I: 'A' }[t] || '');
  const ADDABLE = [['R', 'R 電阻', '1k'], ['C', 'C 電容', '100u'], ['L', 'L 電感', '10m'], ['V', 'V 直流電源', '5'], ['I', 'I 電流源', '10m'], ['LED', 'LED', 'red'], ['D', 'D 二極體', 'si'], ['SW', 'SW 開關', 'on'], ['POT', 'POT 可變電阻（3 腳）', '10k'], ['LDR', 'LDR 光敏電阻', ''], ['NTC', 'NTC 熱敏電阻', '10k'], ['LAMP', 'LAMP 燈泡', 'v=6 w=0.5'], ['Q', 'Q NPN 電晶體（3 腳）', 'beta=100'], ['U7805', '7805 穩壓 IC（3 腳）', '7805'], ['OPAMP', '運算放大器（3 腳）', 'opamp'], ['LM35', 'LM35 溫度感測器（3 腳）', 'lm35'], ['NE555', '555 計時器（3 腳）', '555 r1=1k r2=10k c=10u']];
  const PFX = { U7805: 'U', OPAMP: 'OP', LM35: 'U', NE555: 'U' };
  const nextId = (t) => { const p = PFX[t] || t; let k = 1; while (ck.parts.some((x) => x.id.toLowerCase() === (p + k).toLowerCase())) k++; return p + k; };

  function solve() { try { return { r: C().dc(ck) }; } catch (e) { return { err: e.message }; } }
  function render(main) {
    const L = C(); const { r, err } = ck.parts.length ? solve() : { err: '還沒有零件：從下面加零件，或選一個範例' };
    const has = (t) => ck.parts.some((p) => p.type === t); const dyn = has('C') || has('L') || has('NE555');
    const pr = (id) => (r ? r.parts.find((x) => x.id === id) : null);
    main.innerHTML = `<div class="card"><h3>${LA.icon('circuit')} 電路工具 <small>算電壓、電流、功率；點開關切換</small></h3>
      <div class="row"><select id="ck-preset" style="width:auto"><option value="">載入範例電路…</option>${Object.entries(L.PRESETS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select><input id="ck-title" class="grow" value="${esc(ck.title)}" placeholder="電路名稱（選填）" maxlength="60"></div>
      <div class="lg-canvas" id="ck-live">${ck.parts.length ? L.svg(ck, r || null, { title: ck.title }) : ''}</div>
      ${err ? `<div class="hint err">${esc(err)}</div>` : ''}
      ${r && r.warnings.length ? `<div class="ck-warn">${r.warnings.map((w) => `<div>${LA.icon('alert', 'sm')} ${esc(w)}</div>`).join('')}</div>` : ''}
      ${r ? `<div class="row" style="margin-top:6px"><span class="pill">電源提供 ${esc(F(r.power, 'W'))}</span>${Object.entries(r.nodes).map(([n, v]) => `<span class="pill">${esc(n)}：${esc(F(v, 'V'))}</span>`).join('')}</div>` : ''}
      ${controls()}
      <div class="row" style="margin-top:10px"><button class="btn sm" id="ck-ai">${LA.icon('spark', 'sm')} 請 AI 解說這個電路</button><button class="btn sm" id="ck-copy">${LA.icon('copy', 'sm')} 複製結果</button><button class="btn sm" id="ck-reset">清空</button></div></div>
      <div class="card"><h3>零件 <small>改數值會立刻重算；點電路圖上的零件會跳到這裡</small></h3><div class="ctable"><table class="ck-tbl"><thead><tr><th>零件</th><th>接在</th><th>數值</th><th>電壓</th><th>電流</th><th>功率</th><th>狀態</th><th></th></tr></thead><tbody>
        ${ck.parts.map((p) => { const x = pr(p.id); const pins = L.pinNames(p.type); return `<tr class="${p.id === sel ? 'sel' : ''}" data-row="${esc(p.id)}"><td><b>${esc(p.id)}</b><div class="mute small">${esc(L.TYPES[p.type].name)}</div></td>
          <td class="small">${p.n.map((n, i) => `<div><span class="mute">${esc(pins[i])}</span> <input class="ck-node" data-node="${esc(p.id)}:${i}" value="${esc(n)}" maxlength="12"></div>`).join('')}</td>
          <td>${VALUED.includes(p.type) ? `<input class="ck-val" data-val="${esc(p.id)}" value="${esc(F(p.v, '').replace(' ', ''))}" inputmode="decimal"><span class="mute small">${unitOf(p.type)}</span>` : p.type === 'LED' ? `<select data-color="${esc(p.id)}">${Object.entries(L.LEDC).map(([k, v]) => `<option value="${k}" ${k === p.color ? 'selected' : ''}>${v[1]}（${v[0]}V）</option>`).join('')}</select>` : p.type === 'SW' ? `<button class="btn sm ${p.on ? 'pri' : ''}" data-sw="${esc(p.id)}">${p.on ? '接通' : '斷開'}</button>` : `<span class="small">${esc(L.describe(p))}</span>`}</td>
          <td>${x ? esc(F(x.v, 'V')) : '—'}</td><td>${x && x.i != null ? esc(F(Math.abs(x.i) < 1e-9 ? 0 : x.i, 'A')) : '—'}</td><td>${x && x.p != null ? esc(F(Math.abs(x.p) < 1e-12 ? 0 : Math.abs(x.p), 'W')) : '—'}</td>
          <td class="small">${x ? esc([x.note, x.extra].filter(Boolean).join('；')) : ''}</td><td><button class="btn sm" data-del="${esc(p.id)}" title="刪除">${LA.icon('trash', 'sm')}</button></td></tr>`; }).join('')}
      </tbody></table></div>
      <h4>加零件</h4><div class="row"><select id="ck-addt" style="width:auto">${ADDABLE.map(([t, n]) => `<option value="${t}">${esc(n)}</option>`).join('')}</select><input id="ck-addn" class="grow" placeholder="接在哪些節點（空白分開，0＝地），例：vcc a" autocapitalize="off" spellcheck="false"><input id="ck-addv" style="width:9em" placeholder="數值，例：220、10k、100u" autocapitalize="off" spellcheck="false"><button class="btn pri" id="ck-add">加入</button></div>
      <div class="mute small" id="ck-addhint"></div>
      <div class="row" style="margin-top:10px"><button class="btn sm" id="ck-txt">${showText ? '收起文字格式' : '用文字編輯（netlist）'}</button></div>
      ${showText ? `<textarea id="ck-net" rows="8" spellcheck="false" autocapitalize="off" class="mono">${esc(L.format(ck))}</textarea><div class="row" style="margin-top:6px"><button class="btn pri" id="ck-netgo">套用</button><span class="mute small grow">一行一個零件：名稱 節點… 數值。例：R1 vcc a 220、LED1 a 0 green、U1 in 0 out 7805、Q1 c b e beta=150、env light=50 temp=30</span></div>` : ''}</div>
      ${dyn ? `<div class="card"><h3>時間模擬 <small>從 0 秒開始（電容沒充電、電源同時接上）</small></h3><div class="row"><label class="small mute">模擬到</label><input id="ck-tend" style="width:8em" placeholder="自動" autocapitalize="off"><span class="mute small">秒（例：5、20m）</span><button class="btn pri" id="ck-tran">開始模擬</button></div><div id="ck-tranout">${tr ? tranHtml() : ''}</div></div>` : ''}
      ${calcCard()}`;
    LA.svgView.enhance(main); LA.svgView.bindZoom(main);
  }
  function controls() {
    const L = C(); const out = []; const has = (t) => ck.parts.some((p) => p.type === t);
    for (const p of ck.parts.filter((x) => x.type === 'SW')) out.push(`<button class="lg-bit ${p.on ? 'on' : ''}" data-sw="${esc(p.id)}">${esc(p.id)}：${p.on ? '接通' : '斷開'}</button>`);
    for (const p of ck.parts.filter((x) => x.type === 'POT')) out.push(`<label class="ck-sl">${esc(p.id)} 轉到 <b>${Math.round((p.pos ?? 0.5) * 100)}%</b><input type="range" min="0" max="100" value="${Math.round((p.pos ?? 0.5) * 100)}" data-pot="${esc(p.id)}"></label>`);
    if (has('LDR')) { const lx = ck.env.light ?? 300; out.push(`<label class="ck-sl">光線 <b>${lx} lux</b>（光敏電阻 ${esc(F(L.ldrR(lx), 'Ω'))}）<input type="range" min="0" max="100" value="${Math.round(Math.log10(Math.max(1, lx)) * 25)}" data-env="light"></label>`); }
    if (has('NTC') || has('LM35')) { const t = ck.env.temp ?? 25; out.push(`<label class="ck-sl">溫度 <b>${t}°C</b><input type="range" min="-20" max="120" value="${t}" data-env="temp"></label>`); }
    return out.length ? `<div class="ck-ctl">${out.join('')}</div>` : '';
  }
  function tranHtml() { try { const spec = LA.chart.parse(C().tranChart(ck, tr)); return LA.chart.html(spec); } catch (e) { return `<div class="hint err">${esc(e.message)}</div>`; } }
  function calcCard() {
    const L = C(); const def = L.CALC[calcKind]; const LAB = { v: '電壓 V', i: '電流 A', r: '電阻 Ω', p: '功率 W', vs: '電源電壓', vf: 'LED 順向電壓（選填）', color: 'LED 顏色（red／green／blue／white…）', if: 'LED 電流（預設 15m）', n: '串幾顆（預設 1）', vin: 'Vin', r1: 'R1', r2: 'R2', vout: 'Vout', c: '電容 F', l: '電感 H', f: '頻率 Hz', duty: '工作週期（例：60%）', colors: '色碼（例：棕 黑 紅 金）', list: '數值（空白分開，例：1k 2.2k 4.7k）', kind: '種類（r 電阻／c 電容）', mah: '電池容量 mAh', ma: '平均耗電 mA' };
    return `<div class="card"><h3>${LA.icon('calc')} 計算機</h3><div class="seg ck-seg">${Object.entries(L.CALC).map(([k, v]) => `<button class="${k === calcKind ? 'on' : ''}" data-calc="${k}">${esc(v.name)}</button>`).join('')}</div>
      <div class="mute small" style="margin:6px 0">${esc(def.help)}</div><div class="ck-cgrid">${def.f.map((k) => `<label class="small">${esc(LAB[k] || k)}<input data-cin="${k}" value="${esc(calcIn[k] ?? '')}" autocapitalize="off" spellcheck="false"></label>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="ck-calc">計算</button><span class="mute small">數值可以寫 4.7k、100u、15mA、2k2</span></div>${calcOut ? `<pre class="ck-out">${esc(calcOut)}</pre>` : ''}</div>`;
  }
  const keepY = (main) => { const y = window.scrollY; render(main); window.scrollTo(0, y); };
  const commit = (main) => { save(); tr = null; keepY(main); };

  LA.register('circuit', { name: '電路工具', title: '電路工具（電壓、電流、電阻、功率、IC、感測器）',
    leave() { clearInterval(poll); },
    async render(main) {
      main.dataset.dlname = '電路'; await load(); render(main);
      clearInterval(poll); poll = setInterval(async () => { if (LA.cur !== 'circuit' || local()) return clearInterval(poll); const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && main.contains(a)) return; try { const st = await LA.api('/api/circuit/state'); if (st.ts > ts) { apply(st); keepY(main); if (st.by === 'ai') LA.toast('AI 更新了電路'); } } catch { /* ignore */ } }, 2500);
      main.onclick = LA.guard(async (e) => {
        const L = C(); const t = e.target;
        if (await LA.svgView.click(t)) return;
        const sw = t.closest('[data-sw]'); if (sw) { const p = ck.parts.find((x) => x.id === sw.dataset.sw); p.on = !p.on; return commit(main); }
        const pp = t.closest('[data-part]'); if (pp && t.closest('#ck-live')) { sel = pp.dataset.part; const p = ck.parts.find((x) => x.id === sel); if (p && p.type === 'SW') { p.on = !p.on; return commit(main); } keepY(main); const row = main.querySelector(`[data-row="${CSS.escape(sel)}"]`); if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
        const del = t.closest('[data-del]'); if (del) { ck.parts = ck.parts.filter((x) => x.id !== del.dataset.del); return commit(main); }
        if (t.closest('#ck-add')) {
          const ty = $('#ck-addt', main).value; const nodes = $('#ck-addn', main).value.trim().split(/[\s,，]+/).filter(Boolean); const need = L.TYPES[ty].pins;
          if (nodes.length !== need) return LA.toast(`${L.TYPES[ty].name} 要接 ${need} 個節點：${L.pinNames(ty).join('、')}`, true);
          const v = $('#ck-addv', main).value.trim() || (ADDABLE.find((x) => x[0] === ty) || [])[2] || '';
          const one = L.parse(`${nextId(ty)} ${nodes.join(' ')} ${ty === 'U7805' && !/78\d\d/.test(v) ? '7805 ' + v : ty === 'OPAMP' && !/opamp/i.test(v) ? 'opamp ' + v : ty === 'LM35' && !/lm35/i.test(v) ? 'lm35' : ty === 'NE555' && !/555/.test(v) ? '555 ' + v : v}`).parts[0];
          ck.parts.push(one); const bak = JSON.stringify(ck); try { C().dc(ck); } catch (er) { LA.toast('已加入，但現在解不出來：' + er.message, true); } void bak; sel = one.id; return commit(main);
        }
        if (t.closest('#ck-txt')) { showText = !showText; return keepY(main); }
        if (t.closest('#ck-netgo')) { const r = L.parse($('#ck-net', main).value); ck.parts = r.parts; ck.env = { ...ck.env, ...r.env }; return commit(main); }
        if (t.closest('#ck-reset')) { ck = { title: '', parts: [], env: { light: 300, temp: 25 } }; return commit(main); }
        if (t.closest('#ck-tran')) { const te = $('#ck-tend', main).value.trim(); const o = te ? { t_end: L.num(te) } : {}; const btn = t.closest('#ck-tran'); btn.disabled = true; btn.textContent = '計算中…'; await new Promise((r) => setTimeout(r, 20)); try { tr = L.tran(ck, o); } finally { btn.disabled = false; } return keepY(main); }
        const ck2 = t.closest('[data-calc]'); if (ck2) { calcKind = ck2.dataset.calc; calcOut = ''; return keepY(main); }
        if (t.closest('#ck-calc')) { main.querySelectorAll('[data-cin]').forEach((i) => { calcIn[i.dataset.cin] = i.value.trim(); }); const args = Object.fromEntries(Object.entries(calcIn).filter(([k, v]) => v !== '' && L.CALC[calcKind].f.includes(k))); try { calcOut = L.calc(calcKind, args).text; } catch (er) { calcOut = '　' + er.message; } return keepY(main); }
        if (t.closest('#ck-copy')) { try { LA.copy(L.report(ck)); } catch (er) { LA.toast(er.message, true); } return; }
        if (t.closest('#ck-ai')) { await LA.go('home'); return LA.chatSend('請先用 circuit_state 看電路工具目前的電路，用白話說明它在做什麼、每個零件的電壓電流是否合理、有沒有會燒掉或可以改進的地方，最後附上 [[開啟:電路工具]]'); }
      });
      main.onchange = (e) => {
        const L = C(); const t = e.target;
        if (t.id === 'ck-preset' && t.value) { const p = L.preset(t.value); ck = { title: p.title, parts: p.parts, env: p.env }; sel = ''; return commit(main); }
        if (t.id === 'ck-title') { ck.title = t.value.trim(); return save(); }
        if (t.id === 'ck-addt') { const a = ADDABLE.find((x) => x[0] === t.value); $('#ck-addv', main).value = a ? a[2] : ''; $('#ck-addhint', main).textContent = `接腳順序：${L.pinNames(t.value).join('、')}`; return; }
        if (t.dataset.val) { const p = ck.parts.find((x) => x.id === t.dataset.val); try { p.v = L.num(t.value); if (!(p.v > 0) && p.type !== 'V' && p.type !== 'I') throw new Error('數值要大於 0'); } catch (er) { LA.toast(er.message, true); } return commit(main); }
        if (t.dataset.node) { const [id, i] = t.dataset.node.split(':'); const p = ck.parts.find((x) => x.id === id); const v = t.value.trim().replace(/\s+/g, '_'); if (v) p.n[+i] = /^gnd$/i.test(v) ? '0' : v; return commit(main); }
        if (t.dataset.color) { const p = ck.parts.find((x) => x.id === t.dataset.color); p.color = t.value; return commit(main); }
        if (t.dataset.pot || t.dataset.env) return commit(main);
      };
      main.oninput = (e) => {
        const t = e.target; if (!t.dataset) return;
        if (t.dataset.pot) { const p = ck.parts.find((x) => x.id === t.dataset.pot); p.pos = +t.value / 100; live(main); }
        if (t.dataset.env === 'light') { const v = Math.round(Math.pow(10, +t.value / 25)); ck.env.light = +t.value === 0 ? 0 : v; live(main); }
        if (t.dataset.env === 'temp') { ck.env.temp = +t.value; live(main); }
      };
    },
  });
  // 拉桿拖動時只換電路圖和數字（不整頁重畫，拉桿才不會斷掉）
  let liveT = null;
  function live(main) { clearTimeout(liveT); liveT = setTimeout(() => { const L = C(); const { r, err } = solve(); const cv = $('#ck-live', main); if (cv) { cv.innerHTML = L.svg(ck, r || null, { title: ck.title }); LA.svgView.enhance(main); }
    main.querySelectorAll('.ck-sl').forEach((lb) => { const i = lb.querySelector('input'); const b = lb.querySelector('b'); if (!i || !b) return; if (i.dataset.pot) b.textContent = i.value + '%'; if (i.dataset.env === 'light') b.textContent = (ck.env.light) + ' lux'; if (i.dataset.env === 'temp') b.textContent = ck.env.temp + '°C'; });
    if (err) LA.toast(err, true); }, 40); }
})();
