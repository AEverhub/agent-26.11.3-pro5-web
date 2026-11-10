'use strict';
/*
 * 26.11.3 pro2.1 訊息裡的圖表（App 對話泡泡畫成 SVG；LINE／Discord／TG 變成一段文字摘要）
 * AI 在回覆裡寫：
 *   ```chart
 *   {"type":"line","title":"台積電 2330 近一個月收盤價","unit":"元","x":["11/01","11/04",…],"series":[{"name":"收盤","data":[1010,1025,…]}]}
 *   ```
 * type：line（折線，預設）｜bar（長條）。最多 6 條線、每條 400 點；null＝那一天沒資料。
 * 瀏覽器是 LA.chart，Node 是 require('ui/chart.js')（平台摘要、AI 工具檢查格式都用同一份）。
 * 顏色：深色背景用的分類色（依序固定，不輪替；已用色盲模擬檢查過相鄰配對）。
 */
(function (root, factory) { const C = factory(); if (typeof module === 'object' && module.exports) module.exports = C; else { root.LA = root.LA || {}; root.LA.chart = C; } })(typeof window !== 'undefined' ? window : globalThis, function () {
  const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
  const BLOCK_RE = /```chart[ \t]*\n([\s\S]*?)\n?```/g;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(+v) ? +v : null);

  /** 檢查並整理成固定格式；格式不對就丟錯（App 會改成顯示原文） */
  function parse(src) {
    const j = typeof src === 'string' ? JSON.parse(src) : src; if (!j || typeof j !== 'object') throw new Error('圖表要是 JSON 物件');
    const type = j.type === 'bar' ? 'bar' : 'line';
    let series = Array.isArray(j.series) ? j.series : Array.isArray(j.data) ? [{ name: j.name || '', data: j.data }] : null; if (!series || !series.length) throw new Error('圖表要有 series（或 data）');
    series = series.slice(0, 6).map((s, i) => ({ name: String((s && s.name) || (series.length > 1 ? `第 ${i + 1} 組` : '')).slice(0, 30), data: (Array.isArray(s && s.data) ? s.data : []).slice(0, 400).map(num) }));
    const n = Math.max(...series.map((s) => s.data.length)); if (!n) throw new Error('圖表沒有數字');
    if (!series.some((s) => s.data.some((v) => v !== null))) throw new Error('圖表沒有數字');
    const x = (Array.isArray(j.x) ? j.x : []).slice(0, n).map((v) => String(v ?? '').slice(0, 16)); while (x.length < n) x.push(String(x.length + 1));
    return { type, title: String(j.title || '').slice(0, 80), unit: String(j.unit || '').slice(0, 10), x, series, source: String(j.source || '').slice(0, 120) };
  }
  const fmt = (v) => { if (v === null || v === undefined) return '—'; const a = Math.abs(v); const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4; return (+v.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d }); };
  /** 漂亮的刻度（1、2、5 × 10^n） */
  function ticks(lo, hi, want = 4) {
    if (lo === hi) { const p = Math.abs(lo) * 0.05 || 1; lo -= p; hi += p; }
    const raw = (hi - lo) / want; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const a = Math.floor(lo / step) * step; const b = Math.ceil(hi / step) * step; const out = []; for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(10)); return out;
  }
  /** 畫成 SVG（寬 360、高 220 的比例，跟著泡泡縮放） */
  function svg(spec) {
    const W = 360, H = 220, multi = spec.series.length > 1; const L = 46, R = 14, T = multi ? 40 : 18, B = 30; const pw = W - L - R, ph = H - T - B; const n = spec.x.length;
    const all = spec.series.flatMap((s) => s.data).filter((v) => v !== null); let lo = Math.min(...all), hi = Math.max(...all); if (spec.type === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    const tk = ticks(lo, hi); lo = tk[0]; hi = tk[tk.length - 1];
    const X = (i) => (spec.type === 'bar' ? L + ((i + 0.5) * pw) / n : L + (n === 1 ? pw / 2 : (i * pw) / (n - 1))); const Y = (v) => T + ph - ((v - lo) / (hi - lo || 1)) * ph;
    let g = '';
    for (const v of tk) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="cg"/><text x="${L - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ct">${esc(fmt(v))}</text>`;
    const every = Math.max(1, Math.ceil(n / (spec.type === 'bar' ? 7 : 5))); for (let i = 0; i < n; i += every) g += `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="ct">${esc(spec.x[i])}</text>`;
    if (spec.type === 'line' && (n - 1) % every) g += `<text x="${X(n - 1).toFixed(1)}" y="${H - 10}" text-anchor="end" class="ct">${esc(spec.x[n - 1])}</text>`;
    let marks = '';
    if (spec.type === 'bar') {
      const k = spec.series.length; const slot = pw / n; const bw = Math.max(2, Math.min(28, (slot - 2) / k - 2)); const y0 = Y(Math.max(lo, Math.min(0, hi)));
      spec.series.forEach((s, si) => s.data.forEach((v, i) => { if (v === null) return; const x = X(i) - (k * (bw + 2)) / 2 + si * (bw + 2) + 1; const y = Math.min(Y(v), y0); const h = Math.max(1, Math.abs(Y(v) - y0)); const r = Math.min(4, bw / 2, h);
        marks += v >= 0 ? `<path d="M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)},${y.toFixed(1)} ${(x + bw).toFixed(1)},${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z" fill="${COLORS[si]}"/>`
          : `<path d="M${x.toFixed(1)},${y.toFixed(1)}V${(y + h - r).toFixed(1)}Q${x.toFixed(1)},${(y + h).toFixed(1)} ${(x + r).toFixed(1)},${(y + h).toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)},${(y + h).toFixed(1)} ${(x + bw).toFixed(1)},${(y + h - r).toFixed(1)}V${y.toFixed(1)}Z" fill="${COLORS[si]}"/>`; }));
      if (lo < 0) marks += `<line x1="${L}" x2="${W - R}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" class="cz"/>`;
    } else {
      spec.series.forEach((s, si) => {
        let d = ''; let pen = false; s.data.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
        if (!multi) { const idx = s.data.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0); if (idx.length > 1 && idx.length === idx[idx.length - 1] - idx[0] + 1) marks += `<path d="${d}L${X(idx[idx.length - 1]).toFixed(1)},${(T + ph).toFixed(1)}L${X(idx[0]).toFixed(1)},${(T + ph).toFixed(1)}Z" fill="${COLORS[si]}" opacity=".14"/>`; }
        marks += `<path d="${d}" fill="none" stroke="${COLORS[si]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (n === 1 || s.data.filter((v) => v !== null).length < 3) s.data.forEach((v, i) => { if (v !== null) marks += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" fill="${COLORS[si]}" class="cring"/>`; });
      });
      // 最後一個值：標點＋數字（只標最後一個，不是每個點都標）
      spec.series.forEach((s, si) => { let i = s.data.length - 1; while (i >= 0 && s.data[i] === null) i--; if (i < 0) return; const x = X(i), y = Y(s.data[i]);
        marks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${COLORS[si]}" class="cring"/>`; if (si < 3) marks += `<text x="${(x - 6).toFixed(1)}" y="${(y - 8 - si * 12).toFixed(1)}" text-anchor="end" class="cv">${esc(fmt(s.data[i]))}</text>`; });
    }
    const legend = multi ? spec.series.map((s, i) => `<g transform="translate(${L + (i % 3) * 104},${10 + Math.floor(i / 3) * 14})"><rect width="10" height="3" y="3.5" rx="1.5" fill="${COLORS[i]}"/><text x="14" y="9" class="cl">${esc(s.name.slice(0, 12))}</text></g>`).join('') : '';
    const data = esc(JSON.stringify({ t: spec.type, x: spec.x, s: spec.series.map((s) => ({ n: s.name, d: s.data })), u: spec.unit, L, R, T, B, W, H, n }));
    return `<svg viewBox="0 0 ${W} ${H}" class="cchart-svg" role="img" aria-label="${esc(spec.title || '圖表')}" data-c="${data}">${legend}${g}${marks}<g class="chov" style="display:none"><line class="chl" y1="${T}" y2="${T + ph}"/><g class="chdots"></g><g class="chtip"><rect rx="6" class="chbox"/><text class="chtx"></text></g></g><rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent" class="chit"/></svg>`;
  }
  /** 整張卡片：標題＋圖＋「看數據」表格 */
  function html(spec) {
    const rows = spec.x.map((x, i) => `<tr><td>${esc(x)}</td>${spec.series.map((s) => `<td>${esc(fmt(s.data[i]))}</td>`).join('')}</tr>`).join('');
    return `<div class="cchart">${spec.title ? `<div class="cchart-t">${esc(spec.title)}${spec.unit ? `<small>（${esc(spec.unit)}）</small>` : ''}</div>` : ''}${svg(spec)}<details class="cchart-d"><summary>看數據</summary><div class="ctable"><table><thead><tr><th></th>${spec.series.map((s) => `<th>${esc(s.name || '數值')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>${spec.source ? `<div class="cchart-s">資料來源：${esc(spec.source)}</div>` : ''}</div>`;
  }
  /** 聊天平台用的文字摘要 */
  function summary(spec) {
    const u = spec.unit ? ' ' + spec.unit : ''; const lines = [`【${spec.title || '圖表'}】`];
    for (const s of spec.series) {
      const pts = s.data.map((v, i) => [v, i]).filter(([v]) => v !== null); if (!pts.length) continue; const first = pts[0], last = pts[pts.length - 1]; const max = pts.reduce((a, b) => (b[0] > a[0] ? b : a)); const min = pts.reduce((a, b) => (b[0] < a[0] ? b : a));
      const ch = first[0] ? ((last[0] - first[0]) / Math.abs(first[0])) * 100 : null;
      lines.push(`${s.name ? s.name + '：' : ''}最新 ${fmt(last[0])}${u}（${spec.x[last[1]]}）${ch !== null && pts.length > 1 ? `，期間 ${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%` : ''}；最高 ${fmt(max[0])}${u}（${spec.x[max[1]]}）、最低 ${fmt(min[0])}${u}（${spec.x[min[1]]}），共 ${pts.length} 筆`);
    }
    if (spec.source) lines.push('資料來源：' + spec.source); lines.push('（到 App 可以看圖表）'); return lines.join('\n');
  }
  /** 把文字裡的 ```chart 區塊換掉：fn(spec) 回傳替代內容；格式不對的保留原文 */
  function replaceBlocks(text, fn) { return String(text ?? '').replace(BLOCK_RE, (m, body) => { try { return fn(parse(body)); } catch { return m; } }); }
  /** 產生一個 chart 區塊（工具用） */
  const block = (spec) => '```chart\n' + JSON.stringify(spec) + '\n```';
  /** 點太多時平均抽樣（保留第一點與最後一點） */
  function downsample(x, cols, max = 60) { const n = x.length; if (n <= max) return { x, cols }; const idx = []; for (let k = 0; k < max; k++) idx.push(Math.round((k * (n - 1)) / (max - 1))); return { x: idx.map((i) => x[i]), cols: cols.map((c) => idx.map((i) => c[i])) }; }
  /** 滑過／點圖表：十字線＋數值框（App 用；delegated，一個監聽處理所有圖表） */
  function hover(svgEl, clientX) {
    let c; try { c = JSON.parse(svgEl.getAttribute('data-c')); } catch { return; } const r = svgEl.getBoundingClientRect(); if (!r.width) return; const vx = ((clientX - r.left) / r.width) * c.W; const pw = c.W - c.L - c.R;
    const i = Math.max(0, Math.min(c.n - 1, c.t === 'bar' ? Math.floor(((vx - c.L) / pw) * c.n) : Math.round(((vx - c.L) / pw) * (c.n - 1)))); const X = c.t === 'bar' ? c.L + ((i + 0.5) * pw) / c.n : c.L + (c.n === 1 ? pw / 2 : (i * pw) / (c.n - 1));
    const ov = svgEl.querySelector('.chov'); if (!ov) return; ov.style.display = ''; const ln = ov.querySelector('.chl'); ln.setAttribute('x1', X); ln.setAttribute('x2', X);
    const tx = ov.querySelector('.chtx'); const rows = [c.x[i], ...c.s.map((s) => `${s.n ? s.n + ' ' : ''}${fmt(s.d[i])}${c.u ? ' ' + c.u : ''}`)];
    tx.innerHTML = rows.map((t, k) => `<tspan x="0" dy="${k ? 13 : 0}"${k ? '' : ' class="chx"'}>${esc(t)}</tspan>`).join('');
    const w = Math.max(...rows.map((t) => String(t).length)) * 7.2 + 14; const h = rows.length * 13 + 8; const left = X + w + 8 > c.W - 2 ? X - w - 8 : X + 8;
    const box = ov.querySelector('.chbox'); box.setAttribute('x', -7); box.setAttribute('y', -13); box.setAttribute('width', w); box.setAttribute('height', h); ov.querySelector('.chtip').setAttribute('transform', `translate(${left + 7},${c.T + 14})`);
  }
  return { parse, svg, html, summary, replaceBlocks, block, downsample, hover, fmt, ticks, COLORS, BLOCK_RE };
});
