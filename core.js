'use strict';
/* 共用工具：API 呼叫、DOM 小幫手、對話框、提示、複製、分頁路由 */
const LA = window.LA = { pages: {}, cur: null, timers: [], status: null, token: '' };

(function initToken() {
  const j = /[#&]join=([^&]+)/.exec(location.hash); if (j) { try { LA.pendingJoin = decodeURIComponent(j[1]); } catch { /* ignore */ } }   // 從連線連結打開 App
  const m = /[#&]t=([0-9a-f]+)/.exec(location.hash); if (m) { localStorage.setItem('la_token', m[1]); history.replaceState(null, '', location.pathname); }
  LA.token = localStorage.getItem('la_token') || '';
})();

// 26.11.3 聯機模式：對話相關的 API 改走本機轉送站 /api/link/c/…（再由後台帶 token 轉到主機），畫面拿不到聯機 token
LA.link = { mode: '' };
const LINK_RW = /^\/api\/(chat(\/|\?|$)|persona$|services(\/run)?(\?|$)|files\/(out|view)\/|me$|ngroups(\/|\?|$))/;
LA.rw = (path) => {
  if (LA.link.mode !== 'client') return path; const p = String(path).split('#')[0];
  if (LINK_RW.test(p)) return '/api/link/c' + path;
  // 26.11.3 Revise4：主機開放「操作端」給你（管理員＝完整、console_view＝只看監控）→ 其他管理 API 也轉到主機
  if (LA.link.client && LA.link.client.console && /^\/api\//.test(p) && !/^\/api\/(link|transfer|deploy|debug\/report)(\/|$)/.test(p)) return '/api/link/c/admin' + path;
  return path;
};
LA.api = async (path, opt = {}) => {
  path = LA.rw(path);
  const o = { method: opt.method || 'GET', headers: { authorization: 'Bearer ' + LA.token } };
  if (opt.body !== undefined) { if (opt.raw) o.body = opt.body; else { o.body = JSON.stringify(opt.body); o.headers['content-type'] = 'application/json'; } if (opt.method === undefined) o.method = 'POST'; }
  const r = await fetch(path, o); const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = text; }
  if (r.status === 401) { LA.toast('未授權：請從 App 重新開啟', true); throw new Error('未授權'); }
  if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status)); return j;
};
LA.post = (p, body) => LA.api(p, { method: 'POST', body: body || {} });
LA.del = (p) => LA.api(p, { method: 'DELETE' });
LA.download = async (path, name) => {
  path = LA.rw(path); const r = await fetch(path, { headers: { authorization: 'Bearer ' + LA.token } }); if (!r.ok) throw new Error('下載失敗'); const b = await r.blob();
  return LA.saveBlob(b, name);
};
/** 26.11.3 pro7：把瀏覽器裡產生的檔案（例如圖表、接線圖）存下來：Android App 交給原生存到「下載」，其他（網頁版、電腦）用一般下載 */
LA.saveBlob = async (b, name) => {
  if (window.AndroidBridge && AndroidBridge.saveFile) {            // Android WebView 不支援 blob 下載 → 交給原生存到「下載」資料夾
    const b64 = await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = bad; fr.readAsDataURL(b); });
    const res = AndroidBridge.saveFile(name, b.type, b64); if (String(res).startsWith('ERROR')) throw new Error(res); return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
};

const esc = LA.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
LA.$ = (s, r = document) => r.querySelector(s); LA.$$ = (s, r = document) => [...r.querySelectorAll(s)];
LA.fmtTime = (ts) => { if (!ts) return '—'; const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
LA.fmtBytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');
LA.fmtDur = (s) => (s >= 86400 ? Math.floor(s / 86400) + ' 天 ' : '') + (s >= 3600 ? Math.floor((s % 86400) / 3600) + ' 時 ' : '') + Math.floor((s % 3600) / 60) + ' 分';

let toastT; LA.toast = (msg, bad) => { const t = LA.$('#toast'); t.textContent = msg; t.className = bad ? 'err' : ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, bad ? 4500 : 2200); };
// 26.11.3：Android WebView 的剪貼簿 API 常被擋 → 先用原生（AndroidBridge.copyText），再試瀏覽器 API，最後用舊方法
LA.copy = async (text) => { text = String(text); if (window.AndroidBridge && AndroidBridge.copyText) { try { AndroidBridge.copyText(text); LA.toast('已複製'); return; } catch { /* 往下試 */ } } try { await navigator.clipboard.writeText(text); } catch { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch { /* ignore */ } a.remove(); } LA.toast('已複製'); };
LA.guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { LA.toast(e.message, true); } };

LA.modal = (html, onMount) => { const m = LA.$('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; m.onclick = (e) => { if (e.target === m) LA.closeModal(); }; if (onMount) onMount(m.firstChild); return m.firstChild; };
LA.closeModal = () => { const m = LA.$('#modal'); m.hidden = true; m.innerHTML = ''; };
LA.ask = (title, value = '', opt = {}) => new Promise((res) => {
  const s = LA.modal(`<h3 style="margin-top:0">${esc(title)}</h3>${opt.hint ? `<div class="hint">${esc(opt.hint)}</div>` : ''}${opt.multiline ? `<textarea id="ask">${esc(value)}</textarea>` : `<input id="ask" type="${opt.type || 'text'}" value="${esc(value)}">`}<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="no">取消</button><button class="btn pri" id="ok">確定</button></div>`);
  const i = LA.$('#ask', s); i.focus(); LA.$('#no', s).onclick = () => { LA.closeModal(); res(null); }; LA.$('#ok', s).onclick = () => { const v = i.value; LA.closeModal(); res(v); };
});
LA.confirm = (text) => new Promise((res) => { const s = LA.modal(`<p style="margin-top:0">${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn" id="no">取消</button><button class="btn pri" id="ok">確定</button></div>`); LA.$('#no', s).onclick = () => { LA.closeModal(); res(false); }; LA.$('#ok', s).onclick = () => { LA.closeModal(); res(true); }; });

/** 設定表單：依欄位規格產生，儲存時只送有改的欄位（機密欄位留白＝不變） */
LA.fieldHTML = (f, settings) => {
  const get = (k) => k.split('.').reduce((o, x) => (o == null ? undefined : o[x]), settings); let v = get(f.key); const id = 'f_' + f.key.replace(/\./g, '_');
  if (f.type === 'toggle') return `<label class="chk"><input type="checkbox" data-key="${f.key}" data-type="toggle" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
  let inp;
  if (f.type === 'select') inp = `<select data-key="${f.key}" data-type="text">${f.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else if (f.type === 'textarea' || f.type === 'json') { if (f.type === 'json') v = JSON.stringify(v ?? [], null, 1); inp = `<textarea data-key="${f.key}" data-type="${f.type}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>${esc(v ?? '')}</textarea>`; }
  else if (f.type === 'list') inp = `<input data-key="${f.key}" data-type="list" value="${esc((v || []).join(', '))}" placeholder="${esc(f.ph || '用逗號分隔')}">`;
  else { const secret = f.type === 'password'; const isSet = secret && /^••••/.test(String(v || ''));
    // 26.11.3：機密欄位不再把「••••已設定」當成欄位內容（手機上看不到點點後面，貼上 token 會變成「••••已設定MTEx…」→ 讀不到）。改成空白＋提示，留空＝不變
    inp = `<input id="${id}" data-key="${f.key}" data-type="${f.type === 'number' ? 'number' : 'text'}" ${secret ? 'data-secret="1" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false"' : `type="${f.type || 'text'}"`} value="${secret ? '' : esc(v ?? '')}" placeholder="${esc(isSet ? '已設定（留空＝不變；要換就直接貼上新的）' : (f.ph || ''))}">${isSet ? '<span class="small ok-t">已設定</span>' : ''}`; }
  return `<label class="f">${esc(f.label)}</label>${inp}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}`;
};
LA.collect = (root) => {
  const items = [];
  for (const el of LA.$$('[data-key]', root)) {
    const t = el.dataset.type; let v;
    if (t === 'toggle') v = el.checked; else if (t === 'number') v = el.value === '' ? 0 : Number(el.value); else if (t === 'list') v = el.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    else if (t === 'json') { try { v = JSON.parse(el.value || '[]'); } catch { throw new Error('JSON 格式錯誤：' + el.dataset.key); } } else v = el.value;
    items.push({ key: el.dataset.key, value: v });
  } return items;
};

/** 頁面路由 */
LA.register = (id, def) => { LA.pages[id] = def; };
/** 子頁面 → 所屬的底部分頁（子頁面顯示返回列，底部導覽維持在「更多」） */
LA.PARENT = { groups: 'more', link: 'dev', transfer: 'more', services: 'home', models: 'more', auto: 'services', files: 'more', persona: 'more', connect: 'more', ledger: 'more', users: 'more', broadcast: 'more', settings: 'more', dev: 'more' }; LA.PARENT_NAME = { more: '更多', services: '服務選單', home: '對話' };
LA.go = async (id) => {
  for (const t of LA.timers) clearInterval(t); LA.timers = []; if (LA._es) { LA._es.close(); LA._es = null; } if (LA.cur && LA.pages[LA.cur] && LA.pages[LA.cur].leave) LA.pages[LA.cur].leave();
  LA.cur = id; const p = LA.pages[id]; const main = LA.$('#page'); main.innerHTML = '<div class="mute" style="padding:30px;text-align:center">載入中…</div>';
  const parent = LA.PARENT[id] || id; LA.$$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.id === parent)); location.hash = '';
  const crumb = LA.$('#crumb'); if (crumb) { if (LA.PARENT[id]) { crumb.hidden = false; crumb.innerHTML = `<button class="back" id="crumb-back">${LA.icon('back')}${esc(LA.PARENT_NAME[LA.PARENT[id]] || '返回')}</button><b>${esc(p.name || p.title)}</b>`; LA.$('#crumb-back').onclick = () => LA.go(LA.PARENT[id]); } else { crumb.hidden = true; crumb.innerHTML = ''; } }
  try { await p.render(main); if (LA.iconize) LA.iconize(main); } catch (e) { main.innerHTML = `<div class="card err">載入失敗：${esc(e.message)}</div>`; }
  LA.report(); window.scrollTo(0, 0);
};
LA.every = (ms, fn) => { LA.timers.push(setInterval(() => fn().catch(() => {}), ms)); };
/** 回報「現在畫面」給後台，AI 才能回答「我這個畫面是什麼意思」 */
LA.report = () => { clearTimeout(LA._rt); LA._rt = setTimeout(() => { try { const txt = LA.$('#page').innerText.replace(/\n{3,}/g, '\n\n').slice(0, 3500); LA.post('/api/ui/state', { page: (LA.pages[LA.cur] || {}).title || LA.cur, data: { visible_text: txt } }).catch(() => {}); } catch { /* ignore */ } }, 1200); };
LA.statusPill = (st) => {
  const p = LA.$('#pill'); const running = st.supervisor.running; const bad = st.supervisor.services.some((s) => ['failed', 'gave_up', 'error'].includes(s.state));
  p.className = 'pill ' + (!running ? 'off' : bad ? 'warn' : 'on'); p.textContent = !running ? '已停止' : bad ? '部分異常' : '運作中';
  const b = LA.$('#badge'); const n = st.notifications_unread; b.hidden = !n; b.textContent = n > 99 ? '99+' : n; LA.$('#ver').textContent = 'v' + st.version;
  const ap = LA.$('#tabs [data-id=ops] i'); if (ap) { ap.hidden = !st.approvals_pending; ap.textContent = st.approvals_pending; }
};
LA.refreshStatus = async () => { LA.status = await LA.api('/api/status'); LA.statusPill(LA.status); return LA.status; };

// 任何地方（含彈出視窗）的 data-copy 按鈕都能複製；頁面自己處理過的不重複
document.addEventListener('click', (e) => { const c = e.target.closest && e.target.closest('[data-copy]'); if (!c || e._copied) return; if (c.closest('#modal')) { e._copied = true; LA.copy(c.dataset.copy); } });

/**
 * 26.11.3 Revise4：訊息內容 → 安全的 HTML：數學公式（LaTeX，用內建 KaTeX 排版）＋網址變成可點的連結。
 * 支援 $…$、$$…$$、\(…\)、\[…\]；價格「$5 和 $6」不會被誤認為公式。
 */
// 26.11.3 pro2.1：圖表的十字線與數值框（滑過或點一下）
document.addEventListener('pointermove', (e) => { const s = e.target.closest && e.target.closest('.cchart-svg'); if (s && LA.chart) LA.chart.hover(s, e.clientX); });
document.addEventListener('pointerdown', (e) => { const s = e.target.closest && e.target.closest('.cchart-svg'); document.querySelectorAll('.cchart-svg .chov').forEach((g) => { if (!s || !s.contains(g)) g.style.display = 'none'; }); if (s && LA.chart) LA.chart.hover(s, e.clientX); });
document.addEventListener('pointerout', (e) => { const s = e.target.closest && e.target.closest('.cchart-svg'); if (s && e.pointerType === 'mouse' && !s.contains(e.relatedTarget)) { const g = s.querySelector('.chov'); if (g) g.style.display = 'none'; } });
LA.MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d)/g;
LA.URL_RE = /https?:\/\/[^\s<>"'）)\]】」，。]+/g;
/**
 * 對話泡泡的文字：網址變連結、LaTeX 排版、**粗體**；26.11.3 Revise7：Markdown 表格畫成真的表格（不會顯示 |---| 原始格式）
 */
// 26.11.3 pro2：AI 可以用彩色字：{紅|文字}、{green|文字}（App 會上色；LINE／Discord／TG 只留文字）
LA.COLORS = { 紅: 'red', red: 'red', 橙: 'orange', 橘: 'orange', orange: 'orange', 黃: 'yellow', yellow: 'yellow', 綠: 'green', green: 'green', 藍: 'blue', blue: 'blue', 紫: 'purple', purple: 'purple', 粉: 'pink', pink: 'pink', 灰: 'gray', gray: 'gray' };
LA.COLOR_RE = /\{(紅|橙|橘|黃|綠|藍|紫|粉|灰|red|orange|yellow|green|blue|purple|pink|gray)\|([^{}\n]{1,300}?)\}/g;
LA.richInline = (text) => {
  const s = String(text ?? ''); const linkify = (t) => LA.esc(t).replace(/https?:\/\/[^\s<>"'）)\]】」，。&]+(?:&amp;[^\s<>"'）)\]】」，。&]+)*/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>').replace(LA.COLOR_RE, (_, c, t) => `<span class="tc tc-${LA.COLORS[c]}">${t}</span>`).replace(/\[\[開啟[:：](邏輯閘轉換器|電路工具|程式碼工具|會議監聽|手機代理|瀏覽器|語音包)\]\]/g, (_, n) => `<button class="btn sm pri copen" data-go="${{ 邏輯閘轉換器: 'logic', 電路工具: 'circuit', 程式碼工具: 'code', 會議監聽: 'meeting', 手機代理: 'phone', 瀏覽器: 'browser', 語音包: 'more' }[n]}">開啟${n}</button>`);   // 26.11.3 pro2：AI 回覆裡的「開啟…」按鈕
  if (!window.katex) return linkify(s); let out = ''; let last = 0;
  for (const m of s.matchAll(LA.MATH_RE)) {
    const tex = m[1] ?? m[2] ?? m[3] ?? m[4]; const display = m[1] !== undefined || m[2] !== undefined;
    out += linkify(s.slice(last, m.index)); last = m.index + m[0].length;
    try { out += katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' }); } catch { out += LA.esc(m[0]); }
  }
  return out + linkify(s.slice(last));
};
const TBL_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const splitCells = (t) => { const out = []; let cur = '', depth = 0; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (ch === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; } if (ch === '{') depth++; else if (ch === '}' && depth) depth--; if (ch === '|' && !depth) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((c) => c.trim()); };   // 彩色字 {紅|…} 裡的 | 不算分欄
const tblCells = (line) => { let t = String(line).trim(); if (t.startsWith('|')) t = t.slice(1); if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1); return splitCells(t); };
LA.richText = (text) => {
  // 26.11.3 pro2.1：```chart 區塊畫成圖表（格式不對就照原文顯示）
  const charts = []; if (LA.chart) text = LA.chart.replaceBlocks(text, (spec) => { charts.push(spec); return `\n\u0000C${charts.length - 1}\u0000\n`; });
  if (charts.length) return LA.richText0(text).replace(/\u0000C(\d+)\u0000/g, (_, i) => LA.chart.html(charts[+i])).replace(/(<br>|\n)*(<div class="cchart">)/g, '$2').replace(/(<\/div>)(<br>|\n)+/g, '$1');
  return LA.richText0(text);
};
LA.richText0 = (text) => {
  const lines = String(text ?? '').split('\n'); const out = []; let buf = [];
  const flush = () => { if (buf.length) { out.push(LA.richInline(buf.join('\n'))); buf = []; } };
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('|') && i + 1 < lines.length && TBL_SEP.test(lines[i + 1]) && tblCells(lines[i]).length >= 2) {
      const head = tblCells(lines[i]); const al = tblCells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
      const rows = []; let j = i + 2; while (j < lines.length && lines[j].includes('|') && lines[j].trim()) { rows.push(tblCells(lines[j])); j++; }
      const td = (tag, c, k) => `<${tag}${al[k] ? ` style="text-align:${al[k]}"` : ''}>${LA.richInline(c)}</${tag}>`;
      if (buf.length && buf[buf.length - 1] === '') buf.pop(); flush();
      out.push(`<div class="ctable"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => td('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      i = j - 1; if (i + 1 < lines.length && lines[i + 1] === '') i++; continue;
    }
    buf.push(lines[i]);
  }
  flush(); return out.join('\n');
};
