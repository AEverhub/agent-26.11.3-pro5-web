'use strict';
/*
 * 網頁版工具箱：沒有後台主機，所有資料存在這個瀏覽器（localStorage）。
 * 這支檔案把頁面原本呼叫的 /api/... 接到瀏覽器裡的服務（跟 App 後台是同一份程式：logicstate／circuitstate／codestate），
 * 所以邏輯閘、電路、程式碼三個頁面不用改，AI 改了狀態，頁面一樣會即時更新。
 */
(function () {
  const KEY = 'tb_db_v1';
  let db = {}; try { db = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { db = {}; }
  let saveT = null;
  const store = { db, touch() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { LA.toast('瀏覽器空間不夠，存不了：' + e.message, true); } }, 200); }, audit() {} };
  const ctx = { store, termux: null, fsx: null };
  const S = LA.webServices;   // services.js 產生
  ctx.logic = new S.LogicState(ctx); ctx.circuit = new S.CircuitState(ctx); ctx.code = new S.CodeState(ctx);
  LA.tb = { ctx, db, screen: { page: '', text: '' }, reset() { for (const k of Object.keys(db)) delete db[k]; store.touch(); } };

  LA.web = false; LA.link = { mode: '' };   // 頁面當作「單機」模式：有共用狀態、會同步 AI 的修改
  const downloadAll = async (name) => { const st = ctx.code.get(); const list = name ? [ctx.code.file(st, name)] : st.files; for (const f of list) { await LA.saveBlob(new Blob([f.code], { type: 'text/plain;charset=utf-8' }), f.name); await new Promise((r) => setTimeout(r, 250)); } return { saved: list.map((f) => f.name), text: `已下載 ${list.map((f) => f.name).join('、')}` }; };
  LA.tb.downloadAll = downloadAll;
  /** 只在網頁版：JavaScript 在 Worker 裡跑；其他語言沒有地方可以執行 */
  LA.tb.runCode = async ({ name, code, lang, stdin = '' } = {}) => {
    const st = ctx.code.get(); const f = code != null ? { name: name || 'main.js', lang: lang || 'javascript', code: String(code) } : ctx.code.file(st, name);
    if (f.lang !== 'javascript') throw new Error(`網頁版只能直接執行 JavaScript（${f.name} 是 ${f.lang}）。其他語言可以請 AI 解釋、檢查，或下載回自己電腦執行。`);
    const r = await LA.codeRunJs(f.code, stdin); const out = { text: r.text, code: r.code, ms: r.ms, lang: 'javascript', name: f.name, at: Date.now(), where: '瀏覽器', timedOut: r.code === 124 };
    if (code == null) { const cur = ctx.code.get(); db.code_state = { ...cur, out, ts: Date.now() }; store.touch(); }
    return out;
  };
  const route = async (method, p, body) => {
    const svc = { '/api/logic/state': ctx.logic, '/api/circuit/state': ctx.circuit, '/api/code/state': ctx.code }[p];
    if (svc) return method === 'GET' ? svc.get() : svc.put(body || {}, 'app');
    if (p === '/api/code/run') return LA.tb.runCode({ name: body && body.name, stdin: body && body.stdin });
    if (p === '/api/code/save') return downloadAll(body && body.name);
    if (p === '/api/ui/state') { LA.tb.screen = { page: (body && body.page) || '', text: (body && body.data && body.data.visible_text) || '' }; return {}; }
    return {};
  };
  LA.api = async (path, opt = {}) => { const p = String(path).split('?')[0]; const method = opt.method || (opt.body !== undefined ? 'POST' : 'GET'); const r = await route(method, p, opt.body); return r && typeof r === 'object' ? JSON.parse(JSON.stringify(r)) : r; };
  LA.post = (p, body) => LA.api(p, { method: 'POST', body: body || {} });
})();
