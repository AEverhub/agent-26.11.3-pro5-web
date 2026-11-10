'use strict';
/*
 * 26.11.3 pro7：工具頁的圖（邏輯閘、電路…）共用的「縮放＋下載」
 *   LA.svgView.enhance(容器)：把容器裡每個 .lg-canvas 加上工具列（－／＋／符合寬度／1:1／PNG／白底／SVG）
 *   LA.svgView.bindZoom(容器)：兩指捏合、Ctrl＋滾輪縮放（只綁一次）
 *   LA.svgView.click(被點的元素)：處理工具列按鈕，有處理回傳 true
 *   重畫畫面後縮放比例會保留（依「卡片 id＋第幾張圖」記住）
 */
(function () {
  const esc = (s) => LA.esc(s);
  // ---------- 26.11.3 pro7：每張圖都能縮放（按鈕、兩指捏、Ctrl＋滾輪）與下載（PNG 深色／白底、SVG） ----------
  const zoom = {};   // 每張圖的縮放比例（重畫畫面後保留）
  const ZK = (el, i) => (el.closest('[id]') || {}).id + ':' + i;
  const TOOL = (k) => `<div class="lg-zbar" data-zk="${esc(k)}"><button class="btn sm" data-z="-" aria-label="縮小">－</button><span class="lg-zv">100%</span><button class="btn sm" data-z="+" aria-label="放大">＋</button><button class="btn sm" data-z="fit">符合寬度</button><button class="btn sm" data-z="1">1:1</button><span class="grow"></span><button class="btn sm" data-zdl="png">${LA.icon('download', 'sm')} PNG</button><button class="btn sm" data-zdl="pngw">白底</button><button class="btn sm" data-zdl="svg">SVG</button></div>`;
  function enhance(main) {
    main.querySelectorAll('.lg-canvas').forEach((cv, i) => {
      const svg = cv.querySelector('svg'); if (!svg) return; const k = cv.dataset.zk || ZK(cv, i); cv.dataset.zk = k;
      if (!(cv.previousElementSibling && cv.previousElementSibling.classList.contains('lg-zbar'))) cv.insertAdjacentHTML('beforebegin', TOOL(k)); else if (svg.dataset.w) return;   // 只換了圖（拉桿即時重算）：保留工具列，套用原本的縮放
      svg.dataset.w = svg.getAttribute('width'); svg.dataset.h = svg.getAttribute('height'); setZoom(cv, zoom[k] || 1, false);
    });
  }
  function setZoom(cv, z, remember = true, cx = null) {
    const svg = cv.querySelector('svg'); if (!svg) return; z = Math.max(0.25, Math.min(4, Math.round(z * 100) / 100)); const w = +svg.dataset.w, h = +svg.dataset.h; if (!w) return;
    const old = zoom[cv.dataset.zk] || 1; const px = cx == null ? cv.clientWidth / 2 : cx; const sx = (cv.scrollLeft + px) / old;
    svg.setAttribute('width', Math.round(w * z)); svg.setAttribute('height', Math.round(h * z)); if (remember || !zoom[cv.dataset.zk]) zoom[cv.dataset.zk] = z;
    cv.scrollLeft = Math.max(0, sx * z - px); const bar = cv.previousElementSibling; if (bar && bar.classList.contains('lg-zbar')) bar.querySelector('.lg-zv').textContent = Math.round(z * 100) + '%';
  }
  const fitZoom = (cv) => { const svg = cv.querySelector('svg'); return Math.min(4, (cv.clientWidth - 14) / (+svg.dataset.w || 1)); };
  /** 匯出：把 CSS 變數換成實際顏色（白底版換成適合列印的顏色），加上背景 */
  function exportSvg(cv, light) {
    const svg = cv.querySelector('svg'); const cs = getComputedStyle(cv); const LIGHT = { '--lg-fill': '#ffffff', '--lg-stroke': '#1f2937', '--lg-text': '#111827', '--lg-wire': '#475569', '--lg-on': '#059669', '--lg-off': '#9ca3af', '--ac': '#2563eb', '--ck-part': '#111827' };
    let s = new XMLSerializer().serializeToString(svg).replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (m, n, fb) => (light && LIGHT[n]) || cs.getPropertyValue(n).trim() || (fb || '').trim() || '#888');
    if (light) s = s.replace(/#f5f5f5/gi, '#334155').replace(/#eab308/gi, '#a16207').replace(/#84cc16/gi, '#4d7c0f').replace(/#06b6d4/gi, '#0e7490').replace(/fill:#94a3b8/g, 'fill:#475569').replace(/fill:#64748b/g, 'fill:#6b7280').replace(/#fbbf24/gi, '#b45309').replace(/#34d399/gi, '#047857').replace(/#c4b5fd/gi, '#6d28d9').replace(/#f8fafc/gi, '#64748b');
    const w = +svg.dataset.w, h = +svg.dataset.h; s = s.replace(/<svg([^>]*?) width="[\d.]+" height="[\d.]+"/, `<svg$1 width="${w}" height="${h}"`);
    if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    return { text: s.replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="${light ? '#ffffff' : '#07070a'}"/>`), w, h };
  }
  async function download(cv, kind) {
    const h3 = cv.closest('.card') && cv.closest('.card').querySelector('h3'); const title = h3 ? [...h3.childNodes].filter((n) => n.nodeType === 3 || (n.tagName !== 'SMALL' && n.tagName !== 'svg' && !(n.classList && n.classList.contains('inline-icon')))).map((n) => n.textContent).join('').trim() || '圖' : '圖';
    const pre = (cv.closest('[data-dlname]') || {}).dataset ? (cv.closest('[data-dlname]') || { dataset: {} }).dataset.dlname || '圖' : '圖';
    const base = (pre + '-' + title.replace(/\s+/g, '').replace(/[\\/:*?"<>|]/g, '').slice(0, 20) + '-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')).replace(/-+/g, '-');
    const ex = exportSvg(cv, kind === 'pngw');
    if (kind === 'svg') { await LA.saveBlob(new Blob([ex.text], { type: 'image/svg+xml' }), base + '.svg'); return LA.toast('已下載 ' + base + '.svg'); }
    const scale = Math.max(1, Math.min(3, 6000 / Math.max(ex.w, ex.h))); const img = new Image(); img.decoding = 'sync';
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('圖片轉換失敗')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ex.text); });
    const c = document.createElement('canvas'); c.width = Math.round(ex.w * scale); c.height = Math.round(ex.h * scale); const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png')); if (!blob) throw new Error('圖片轉換失敗'); const name = base + (kind === 'pngw' ? '-白底' : '') + '.png'; await LA.saveBlob(blob, name); LA.toast('已下載 ' + name);
  }
  // 兩指捏合縮放、Ctrl／⌘＋滾輪縮放（一般滾動照常捲動）
  const pts = new Map(); let pinch = null;
  function bindZoom(main) {
    main.addEventListener('pointerdown', (e) => { const cv = e.target.closest && e.target.closest('.lg-canvas'); if (!cv || e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY, cv }); if (pts.size === 2) { const [a, b] = [...pts.values()]; if (a.cv === b.cv) { const r = cv.getBoundingClientRect(); pinch = { cv, d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom[cv.dataset.zk] || 1, cx: (a.x + b.x) / 2 - r.left }; } } });
    main.addEventListener('pointermove', (e) => { if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId); p.x = e.clientX; p.y = e.clientY; if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch.d > 10) setZoom(pinch.cv, pinch.z * d / pinch.d, true, pinch.cx); e.preventDefault(); } }, { passive: false });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; }; main.addEventListener('pointerup', up); main.addEventListener('pointercancel', up);
    main.addEventListener('wheel', (e) => { const cv = e.target.closest && e.target.closest('.lg-canvas'); if (!cv || !(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const r = cv.getBoundingClientRect(); setZoom(cv, (zoom[cv.dataset.zk] || 1) * (e.deltaY < 0 ? 1.12 : 1 / 1.12), true, e.clientX - r.left); }, { passive: false });
  }
  async function click(t) {
    const zb = t.closest && t.closest('[data-z]'); if (zb && zb.closest('.lg-zbar')) { const cv = zb.closest('.lg-zbar').nextElementSibling; const z = zoom[cv.dataset.zk] || 1; const v = zb.dataset.z; setZoom(cv, v === '+' ? z * 1.25 : v === '-' ? z / 1.25 : v === 'fit' ? fitZoom(cv) : 1); return true; }
    const zd = t.closest && t.closest('[data-zdl]'); if (zd) { const cv = zd.closest('.lg-zbar').nextElementSibling; zd.disabled = true; try { await download(cv, zd.dataset.zdl); } finally { zd.disabled = false; } return true; }
    return false;
  }
  const bindOnce = (main) => { if (main._zb) return; main._zb = true; bindZoom(main); };
  LA.svgView = { enhance, bindZoom: bindOnce, click, setZoom, exportSvg, zoom };
})();
