'use strict';
/*
 * 26.11.3 pro7 程式碼工具（技能卡進來；和 AI 的 code_state／code_set／code_run 共用同一份）
 *  ・編輯器：行號、語法上色、Tab 縮排、Enter 自動縮排、好幾個檔案分頁
 *  ・執行：JavaScript 直接在 App 畫面裡跑（獨立的 Worker，碰不到 App 資料，5 秒逾時）；HTML 可以預覽；
 *          Python、C、C++、Bash、Go、Java、Rust、PHP、Ruby、Lua 送到 App 內建 Linux／Termux 跑（要先裝好）
 *  ・AI：解釋、找 bug 並修好、優化、加註解、寫測試、轉成別的語言（AI 直接改這個畫面裡的程式碼）
 *  ・存到工作區（AI 的檔案工具也看得到）、下載、從手機開檔案
 */
(function () {
  const { esc } = LA; const $ = (s, r = document) => r.querySelector(s);
  const LANGS = { javascript: ['JavaScript', 'js'], python: ['Python', 'py'], c: ['C', 'c'], cpp: ['C++', 'cpp'], bash: ['Bash', 'sh'], go: ['Go', 'go'], java: ['Java', 'java'], rust: ['Rust', 'rs'], php: ['PHP', 'php'], ruby: ['Ruby', 'rb'], lua: ['Lua', 'lua'], html: ['HTML', 'html'], css: ['CSS', 'css'], json: ['JSON', 'json'], sql: ['SQL', 'sql'], text: ['純文字', 'txt'] };
  const byExt = (n) => { const e = String(n || '').split('.').pop().toLowerCase(); return Object.keys(LANGS).find((k) => LANGS[k][1] === e) || ({ mjs: 'javascript', cjs: 'javascript', ts: 'javascript', h: 'c', hpp: 'cpp', cc: 'cpp', htm: 'html', md: 'text' }[e]) || null; };
  const SAMPLE = { name: 'main.py', lang: 'python', code: '# 範例：費氏數列\ndef fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nfor i in range(10):\n    print(i, fib(i))\n' };
  let st = null; let ts = 0; let saveT = null; let poll = null; let stdin = ''; let running = false; let preview = false; let conv = 'python';
  const local = () => !!(LA.web && !(LA.link.client && LA.link.client.console));
  const cur = () => st.files[st.cur] || st.files[0];
  const load = async () => { if (local()) { if (!st) st = { files: [{ ...SAMPLE }], cur: 0, out: null }; return; } try { const r = await LA.api('/api/code/state'); st = { files: r.files, cur: r.cur || 0, out: r.out || null }; ts = r.ts || 0; } catch { if (!st) st = { files: [{ ...SAMPLE }], cur: 0, out: null }; } };
  const save = (now) => { if (local()) return; clearTimeout(saveT); const go = async () => { try { const r = await LA.post('/api/code/state', st); ts = r.ts; } catch (e) { LA.toast(e.message, true); } }; if (now) return go(); saveT = setTimeout(go, 600); };

  // ---------- 語法上色（輕量：註解、字串、數字、關鍵字） ----------
  const KW = {
    javascript: 'async await break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield true false null undefined',
    python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self print range len',
    c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while include define printf scanf NULL',
    cpp: 'auto bool break case catch char class const constexpr continue default delete do double else enum explicit false float for friend if include inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename using virtual void while std cout cin endl vector string',
    bash: 'if then else elif fi for while do done case esac in function return local export echo exit read',
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil fmt',
    java: 'abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws try void while true false String System',
    rust: 'as async await break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while println',
    php: 'abstract and array as break case catch class const continue default do echo else elseif extends false final for foreach function if implements include interface new null or private protected public require return static switch throw true try use var while',
    ruby: 'begin break case class def do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true unless until when while yield puts require',
    lua: 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while print',
    sql: 'select from where and or not insert into values update set delete create table drop alter join left right inner outer on group by order having limit as distinct null is in like between primary key',
    css: '', json: 'true false null', html: '', text: '',
  };
  const kwSet = {}; for (const [k, v] of Object.entries(KW)) kwSet[k] = new Set(v.split(' ').filter(Boolean));
  function highlight(code, lang) {
    if (lang === 'text' || code.length > 120000) return esc(code);
    const hashC = ['python', 'bash', 'ruby'].includes(lang); const dashC = ['sql', 'lua'].includes(lang); const slashC = !hashC && !dashC && !['html', 'json'].includes(lang);
    let out = ''; let i = 0; const n = code.length; const kws = kwSet[lang] || new Set(); const ci = lang === 'sql';
    const span = (c, s) => `<span class="cd-${c}">${esc(s)}</span>`;
    while (i < n) {
      const ch = code[i], two = code.substr(i, 2);
      if (lang === 'html' && code.startsWith('<!--', i)) { const e = code.indexOf('-->', i + 4); const j = e < 0 ? n : e + 3; out += span('cm', code.slice(i, j)); i = j; continue; }
      if (lang === 'html' && ch === '<') { const m = /^<\/?[a-zA-Z][\w-]*/.exec(code.slice(i, i + 40)); if (m) { out += span('kw', m[0]); i += m[0].length; continue; } }
      if ((slashC && two === '//') || (hashC && ch === '#') || (dashC && two === '--')) { let j = code.indexOf('\n', i); if (j < 0) j = n; out += span('cm', code.slice(i, j)); i = j; continue; }
      if ((slashC || lang === 'css') && two === '/*') { const e = code.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; out += span('cm', code.slice(i, j)); i = j; continue; }
      if (lang === 'python' && (code.startsWith('"""', i) || code.startsWith("'''", i))) { const q = code.substr(i, 3); const e = code.indexOf(q, i + 3); const j = e < 0 ? n : e + 3; out += span('st', code.slice(i, j)); i = j; continue; }
      if (ch === '"' || ch === "'" || (ch === '`' && ['javascript', 'go'].includes(lang))) { let j = i + 1; while (j < n && code[j] !== ch) { if (code[j] === '\\') j++; if (code[j] === '\n' && ch !== '`') break; j++; } j = Math.min(n, j + 1); out += span('st', code.slice(i, j)); i = j; continue; }
      if (/[0-9]/.test(ch) && !/[\w$]/.test(code[i - 1] || '')) { const m = /^(0x[\da-fA-F_]+|\d[\d_]*(\.\d+)?([eE][-+]?\d+)?)/.exec(code.slice(i, i + 40)); out += span('nu', m[0]); i += m[0].length; continue; }
      if (/[A-Za-z_$@]/.test(ch)) { const m = /^[A-Za-z_$@][\w$]*/.exec(code.slice(i, i + 80)); const w = m[0]; const isK = kws.has(ci ? w.toLowerCase() : w); const isF = !isK && code[i + w.length] === '('; out += isK ? span('kw', w) : isF ? span('fn', w) : esc(w); i += w.length; continue; }
      out += esc(ch); i++;
    }
    return out;
  }

  // ---------- JavaScript 在 Worker 裡跑 ----------
  const WORKER = `self.onmessage=async(e)=>{const{code,stdin}=e.data;const lines=String(stdin||'').split('\\n');let li=0;const fmt=(v)=>{if(typeof v==='string')return v;try{return typeof v==='object'?JSON.stringify(v,null,1):String(v)}catch{return String(v)}};const out=(k)=>(...a)=>self.postMessage({k,t:a.map(fmt).join(' ')});
  self.console={log:out('log'),info:out('log'),warn:out('warn'),error:out('err'),table:out('log'),debug:out('log')};self.readline=()=>li<lines.length?lines[li++]:null;self.input=self.readline;self.prompt=self.readline;
  try{const AsyncF=Object.getPrototypeOf(async function(){}).constructor;const r=await new AsyncF(code)();if(r!==undefined)self.postMessage({k:'ret',t:fmt(r)});self.postMessage({k:'done',c:0})}catch(err){self.postMessage({k:'err',t:(err&&err.stack)||String(err)});self.postMessage({k:'done',c:1})}};`;
  function runJs(code, input, ms = 5000) {
    return new Promise((ok) => {
      let url; let w; const lines = []; const t0 = Date.now(); let size = 0;
      try { url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })); w = new Worker(url); } catch (e) { return ok({ text: '這個瀏覽器不能建立 Worker：' + e.message, code: 1 }); }
      const end = (c, extra) => { clearTimeout(tm); try { w.terminate(); } catch { /* ignore */ } URL.revokeObjectURL(url); if (extra) lines.push(extra); ok({ text: lines.join('\n') || '(沒有輸出)', code: c, ms: Date.now() - t0 }); };
      const tm = setTimeout(() => end(124, `[超過 ${ms / 1000} 秒，已停止（可能有無窮迴圈）]`), ms);
      w.onmessage = (e) => { const m = e.data; if (m.k === 'done') return end(m.c); size += (m.t || '').length; if (size > 200000) return end(1, '[輸出太多，已停止]'); lines.push(m.k === 'err' ? '錯誤：' + m.t : m.k === 'warn' ? '警告：' + m.t : m.k === 'ret' ? '→ ' + m.t : m.t); };
      w.onerror = (e) => { e.preventDefault(); end(1, '錯誤：' + (e.message || '語法錯誤')); };
      w.postMessage({ code, stdin: input });
    });
  }

  function render(main) {
    const f = cur(); const o = st.out; const remote = !local();
    const canRun = !['html', 'css', 'json', 'sql', 'text'].includes(f.lang); const lines = f.code.split('\n').length;
    main.innerHTML = `<div class="card"><h3>${LA.icon('code')} 程式碼工具 <small>${esc(LANGS[f.lang][0])}・${lines} 行</small></h3>
      <div class="cd-tabs">${st.files.map((x, i) => `<button class="${i === st.cur ? 'on' : ''}" data-file="${i}">${esc(x.name)}</button>`).join('')}<button data-newf="1" title="新增檔案">${LA.icon('plus', 'sm')}</button></div>
      <div class="row" style="margin-top:6px"><select id="cd-lang" style="width:auto">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === f.lang ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
        <button class="btn sm" id="cd-ren">改檔名</button><button class="btn sm" id="cd-del" ${st.files.length < 2 ? 'disabled' : ''}>刪除檔案</button><label class="btn sm" style="cursor:pointer">開啟檔案<input type="file" id="cd-open" hidden></label><span class="grow"></span>
        <button class="btn sm" id="cd-copy">${LA.icon('copy', 'sm')} 複製</button><button class="btn sm" id="cd-dl">${LA.icon('download', 'sm')} 下載</button>${remote ? `<button class="btn sm" id="cd-save">${LA.icon('download', 'sm')} 全部下載</button>` : ''}</div>
      <div class="cd-ed"><pre class="cd-ln" aria-hidden="true"></pre><div class="cd-wrap"><pre class="cd-hl" aria-hidden="true"></pre><textarea id="cd-src" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"></textarea></div></div>
      <div class="row" style="margin-top:8px">${canRun ? `<button class="btn pri" id="cd-run" ${running ? 'disabled' : ''}>${LA.icon('play', 'sm')} ${running ? '執行中…' : '執行'}</button>` : ''}${f.lang === 'html' ? `<button class="btn pri" id="cd-prev">${preview ? '關閉預覽' : '預覽'}</button>` : ''}
        <span class="mute small grow">${f.lang === 'javascript' ? '在 App 裡執行（碰不到 App 資料）；用 console.log 輸出，readline() 讀輸入' : canRun ? (remote ? '網頁版只能直接執行 JavaScript；其他語言可以請 AI 檢查或下載回電腦執行' : '網頁版只能在瀏覽器裡跑 JavaScript') : ''}</span></div>
      ${canRun ? `<details class="lg-det" ${stdin ? 'open' : ''}><summary>標準輸入（stdin）</summary><textarea id="cd-stdin" rows="3" spellcheck="false" class="mono" placeholder="程式讀取的輸入，一行一筆">${esc(stdin)}</textarea></details>` : ''}
      ${preview && f.lang === 'html' ? '<iframe class="cd-prev" sandbox="allow-scripts" id="cd-frame"></iframe>' : ''}
      ${o ? `<div class="cd-out-h"><b>輸出</b><span class="mute small">${esc(o.name || '')}・${esc(o.where || '')}・結束碼 ${o.code ?? '?'}${o.ms != null ? `・${o.ms} ms` : ''}</span><button class="btn sm" id="cd-clr">清除</button></div><pre class="cd-out ${o.code ? 'bad' : ''}">${esc(o.text || '')}</pre>` : ''}</div>
      <div class="card"><h3>${LA.icon('spark')} 請 AI 幫忙 <small>AI 會直接改上面的程式碼</small></h3><div class="row cd-ai">
        <button class="btn sm" data-ai="explain">解釋這段程式</button><button class="btn sm" data-ai="fix">找 bug 並修好</button><button class="btn sm" data-ai="opt">優化（更快、更好讀）</button><button class="btn sm" data-ai="cmt">加上註解</button><button class="btn sm" data-ai="test">寫測試</button>
        <span class="row" style="gap:4px"><button class="btn sm" data-ai="conv">轉成</button><select id="cd-conv" style="width:auto">${Object.entries(LANGS).filter(([k]) => !['text', 'json', 'css', 'html', 'sql'].includes(k)).map(([k, v]) => `<option value="${k}" ${k === conv ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></span></div>
        <div class="row" style="margin-top:8px"><input id="cd-ask" class="grow" placeholder="或直接說要改什麼，例：加一個讀檔功能、改成用遞迴"><button class="btn pri" id="cd-askgo">送出</button></div></div>`;
    const ta = $('#cd-src', main); ta.value = f.code; paint(main); syncScroll(main);
    if (preview && f.lang === 'html') $('#cd-frame', main).srcdoc = f.code;
  }
  function paint(main) {
    const f = cur(); const ta = $('#cd-src', main); const hl = $('.cd-hl', main); const ln = $('.cd-ln', main); if (!ta) return;
    hl.innerHTML = highlight(ta.value, f.lang) + '\n'; const n = ta.value.split('\n').length; ln.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
  }
  function syncScroll(main) { const ta = $('#cd-src', main); const hl = $('.cd-hl', main); const ln = $('.cd-ln', main); if (!ta) return; hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; ln.scrollTop = ta.scrollTop; }
  const AI = {
    explain: '用白話逐段解釋這段程式在做什麼（先講整體目的，再講重點的地方），不用改程式碼',
    fix: '找出這段程式的 bug 或潛在問題（含邊界情況），用 code_set 的 replace 局部修好，再說明改了什麼、為什麼',
    opt: '在不改變行為的前提下優化這段程式（效率、可讀性），用 code_set 修改，再說明改了哪些地方',
    cmt: '幫這段程式加上清楚的中文註解（不要改邏輯），用 code_set 修改',
    test: '幫這段程式寫測試（另開一個測試檔，用 code_set 的 file 新增），並說明怎麼執行',
  };
  async function ask(main, what) {
    const f = cur(); save(true); const extra = what === 'conv' ? `把 ${f.name} 轉成 ${LANGS[conv][0]}，用 code_set 新增一個檔案（副檔名 .${LANGS[conv][1]}），保持同樣的功能，最後說明兩種語言寫法的主要差異` : AI[what] || what;
    await LA.go('home'); return LA.chatSend(`請先用 code_state 讀程式碼工具裡的 ${f.name}${st.out ? '（還有上次執行的輸出）' : ''}，然後${extra}。最後附上 [[開啟:程式碼工具]]`, `程式碼工具：${what === 'conv' ? '轉成 ' + LANGS[conv][0] : ({ explain: '解釋', fix: '找 bug 並修好', opt: '優化', cmt: '加註解', test: '寫測試' }[what] || what)}（${f.name}）`);
  }
  async function run(main) {
    const f = cur(); running = true; render(main); let r;
    try {
      if (f.lang === 'javascript') { r = await runJs(f.code, stdin); r = { ...r, name: f.name, lang: f.lang, where: 'App 內', at: Date.now() }; }
      else if (local()) r = { text: '網頁版只能在瀏覽器裡執行 JavaScript；其他語言要在主機的 App 上執行（或請 AI 幫你跑）。', code: 1, name: f.name, where: '網頁版' };
      else { save(true); r = await LA.post('/api/code/run', { name: f.name, stdin, timeout_s: 30 }); }
    } catch (e) { r = { text: e.message, code: 1, name: f.name, where: '' }; }
    running = false; st.out = r; save(); render(main);
    const o = $('.cd-out', main); if (o) o.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const newName = (lang) => { const ext = LANGS[lang][1]; let k = 1; let n = (lang === 'java' ? 'Main' : 'main') + '.' + ext; while (st.files.some((x) => x.name.toLowerCase() === n.toLowerCase())) n = `file${++k}.${ext}`; return n; };

  LA.register('code', { name: '程式碼工具', title: '程式碼工具（編輯、執行、AI 解釋與修改）',
    leave() { clearInterval(poll); if (st) save(true); },
    async render(main) {
      main.dataset.dlname = '程式碼'; await load(); render(main);
      clearInterval(poll); poll = setInterval(async () => { if (LA.cur !== 'code' || local()) return clearInterval(poll); const a = document.activeElement; if (running || (a && a.id === 'cd-src')) return; try { const r = await LA.api('/api/code/state'); if (r.ts > ts) { const was = cur().name; st = { files: r.files, cur: r.cur || 0, out: r.out || null }; ts = r.ts; const y = window.scrollY; render(main); window.scrollTo(0, y); if (r.by === 'ai') LA.toast(`AI 更新了 ${st.files[st.cur].name}${was !== st.files[st.cur].name ? '' : ''}`); } } catch { /* ignore */ } }, 2500);
      main.onclick = LA.guard(async (e) => {
        const t = e.target; const f = cur();
        const fb = t.closest('[data-file]'); if (fb) { st.cur = +fb.dataset.file; preview = false; save(); return render(main); }
        if (t.closest('[data-newf]')) { const lang = f.lang === 'text' ? 'python' : f.lang; const name = await LA.ask('新檔名', newName(lang)); if (!name || !String(name).trim()) return; if (st.files.length >= 10) return LA.toast('最多 10 個檔案', true); if (st.files.some((x) => x.name.toLowerCase() === name.trim().toLowerCase())) return LA.toast('檔名重複', true); st.files.push({ name: name.trim(), lang: byExt(name) || lang, code: '' }); st.cur = st.files.length - 1; save(); return render(main); }
        if (t.closest('#cd-ren')) { const name = await LA.ask('新檔名', f.name); if (!name || !String(name).trim()) return; if (st.files.some((x) => x !== f && x.name.toLowerCase() === name.trim().toLowerCase())) return LA.toast('檔名重複', true); f.name = name.trim().replace(/[\\/:*?"<>|]/g, ''); const l = byExt(f.name); if (l) f.lang = l; save(); return render(main); }
        if (t.closest('#cd-del')) { if (st.files.length < 2) return; if (!(await LA.confirm(`刪除 ${f.name}？`))) return; st.files.splice(st.cur, 1); st.cur = 0; save(); return render(main); }
        if (t.closest('#cd-copy')) return LA.copy(f.code);
        if (t.closest('#cd-dl')) { await LA.saveBlob(new Blob([f.code], { type: 'text/plain;charset=utf-8' }), f.name); return LA.toast('已下載 ' + f.name); }
        if (t.closest('#cd-save')) { save(true); const r = await LA.post('/api/code/save', {}); return LA.toast(r.text); }
        if (t.closest('#cd-run')) return run(main);
        if (t.closest('#cd-prev')) { preview = !preview; return render(main); }
        if (t.closest('#cd-clr')) { st.out = null; save(); return render(main); }
        const ab = t.closest('[data-ai]'); if (ab) return ask(main, ab.dataset.ai);
        if (t.closest('#cd-askgo')) { const q = $('#cd-ask', main).value.trim(); if (!q) return; return ask(main, q + '（直接用 code_set 改程式碼，局部修改用 replace）'); }
      });
      main.onchange = LA.guard(async (e) => {
        const t = e.target; const f = cur();
        if (t.id === 'cd-lang') { f.lang = t.value; const ext = LANGS[f.lang][1]; if (!byExt(f.name) || byExt(f.name) !== f.lang) { const base = f.name.replace(/\.[^.]*$/, '') || 'main'; const n = base + '.' + ext; if (!st.files.some((x) => x !== f && x.name === n)) f.name = n; } save(); return render(main); }
        if (t.id === 'cd-conv') { conv = t.value; return; }
        if (t.id === 'cd-open' && t.files && t.files[0]) { const file = t.files[0]; if (file.size > 200 * 1024) return LA.toast('檔案超過 200KB', true); const text = await file.text(); const name = file.name.replace(/[\\/:*?"<>|]/g, ''); const ex = st.files.find((x) => x.name.toLowerCase() === name.toLowerCase()); if (ex) { ex.code = text; st.cur = st.files.indexOf(ex); } else { if (st.files.length >= 10) return LA.toast('最多 10 個檔案', true); st.files.push({ name, lang: byExt(name) || 'text', code: text }); st.cur = st.files.length - 1; } save(); return render(main); }
      });
      main.oninput = (e) => {
        const t = e.target;
        if (t.id === 'cd-src') { cur().code = t.value; paint(main); syncScroll(main); save(); if (preview && cur().lang === 'html') { clearTimeout(main._pv); main._pv = setTimeout(() => { const fr = $('#cd-frame', main); if (fr) fr.srcdoc = cur().code; }, 500); } }
        if (t.id === 'cd-stdin') stdin = t.value;
      };
      main.addEventListener('scroll', (e) => { if (e.target && e.target.id === 'cd-src') syncScroll(main); }, true);
      main.onkeydown = (e) => {
        const ta = e.target; if (ta.id !== 'cd-src') { if (ta.id === 'cd-ask' && e.key === 'Enter') { e.preventDefault(); $('#cd-askgo', main).click(); } return; }
        const ind = ['python', 'java', 'c', 'cpp', 'rust', 'php'].includes(cur().lang) ? '    ' : '  ';
        const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
        const put = (text, a, b, cs, ce) => { ta.setRangeText(text, a, b, 'end'); if (cs != null) ta.setSelectionRange(cs, ce); ta.dispatchEvent(new Event('input', { bubbles: true })); };
        if (e.key === 'Tab') { e.preventDefault(); const ls = v.lastIndexOf('\n', s - 1) + 1;
          if (s !== en && v.slice(s, en).includes('\n')) { const block = v.slice(ls, en); const nb = e.shiftKey ? block.replace(new RegExp('^' + ind.replace(/ /g, ' ?'), 'gm'), '') : block.replace(/^/gm, ind); put(nb, ls, en, ls, ls + nb.length); }
          else if (e.shiftKey) { const m = new RegExp('^ {1,' + ind.length + '}').exec(v.slice(ls)); if (m) put('', ls, ls + m[0].length, s - m[0].length, s - m[0].length); } else put(ind, s, en); return; }
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const ls = v.lastIndexOf('\n', s - 1) + 1; const line = v.slice(ls, s); let lead = (/^[ \t]*/.exec(line) || [''])[0]; if (/[:{[(]\s*$/.test(line)) lead += ind; const close = /^[}\])]/.test(v.slice(en)); if (close && /[{[(]\s*$/.test(line)) { const base = (/^[ \t]*/.exec(line) || [''])[0]; put('\n' + lead + '\n' + base, s, en, s + 1 + lead.length, s + 1 + lead.length); } else put('\n' + lead, s, en); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); const b = $('#cd-run', main); if (b) b.click(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); LA.toast('已儲存'); }
      };
    },
  });
  LA.codeHighlight = highlight; LA.codeRunJs = runJs;
})();
