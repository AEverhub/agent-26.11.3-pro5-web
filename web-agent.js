'use strict';
/*
 * 網頁版 AI 助理：用你自己的 Gemini API Key，直接從瀏覽器呼叫 Google（generativelanguage.googleapis.com）。
 *  ・Key 只存在這個瀏覽器（可選擇只記到關掉分頁為止），只送給 Google，不會出現在網址、紀錄或對話內容裡
 *  ・AI 可以操作同一個畫面：邏輯閘（logic_*）、電路（circuit_*）、程式碼（code_*），改完頁面會即時更新
 */
(function () {
  const { esc } = LA; const $ = (s, r = document) => r.querySelector(s);
  const API = 'https://generativelanguage.googleapis.com/v1beta';
  const K_KEY = 'tb_gemini_key', K_MODEL = 'tb_model', K_CHAT = 'tb_chat_v1', K_MODEL_MIGRATED = 'tb_model_migrated_35lite';
  const get = (k) => { try { return sessionStorage.getItem(k) || localStorage.getItem(k) || ''; } catch { return ''; } };
  const keyOf = () => get(K_KEY);
  const setKey = (v, remember) => { try { localStorage.removeItem(K_KEY); sessionStorage.removeItem(K_KEY); if (v) (remember ? localStorage : sessionStorage).setItem(K_KEY, v); } catch { /* 無痕模式 */ } };
  const model = () => get(K_MODEL) || 'gemini-3.5-flash-lite';
  // 將先前網頁版的舊預設模型自動升級；使用者自行選過其他模型則保留。
  try { if (!localStorage.getItem(K_MODEL_MIGRATED)) { localStorage.setItem(K_MODEL, 'gemini-3.5-flash-lite'); localStorage.setItem(K_MODEL_MIGRATED, '1'); } } catch { /* ignore */ }
  let chat = []; try { chat = JSON.parse(localStorage.getItem(K_CHAT) || '[]'); } catch { chat = []; }
  const saveChat = () => { chat = chat.slice(-80); try { localStorage.setItem(K_CHAT, JSON.stringify(chat)); } catch { /* ignore */ } };
  let busy = false; let abort = null; let steps = [];

  // ---------------- 工具（跟 App 的 AI 工具同名、同一套算法） ----------------
  const T = (type, description, extra = {}) => ({ type, description, ...extra });
  const S = (d) => T('STRING', d), N = (d) => T('NUMBER', d), B = (d) => T('BOOLEAN', d), ARR = (d) => T('ARRAY', d, { items: { type: 'STRING' } });
  const OBJ = (d, props) => T('OBJECT', d, { properties: props });
  const GATES = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'NOT'];
  const ctx = () => LA.tb.ctx;
  const NET = '零件清單（netlist）一行一個：名稱 節點… 值。節點 0＝地。R1 a b 1k｜C1 a 0 100u｜L1 a b 10m｜V1 vcc 0 9（直流電源，+ 在前）｜I1 a b 10m｜D1 a k（矽二極體；schottky；zener vz=5.1，齊納反接：D1 0 z zener）｜LED1 a 0 red（red/orange/yellow/green/blue/white/ir/uv）｜SW1 a b on/off｜POT1 a b w 10k pos=0.3（第三個節點是滑動端）｜LDR1 a 0（光敏電阻，env light=lux）｜NTC1 a 0 10k beta=3950（env temp=°C）｜LAMP1 a 0 v=6 w=0.5｜Q1 c b e beta=100（NPN）｜U1 in 0 out 7805（7812、7833；腳：輸入 地 輸出）｜OP1 inp inn out opamp vpos=12 vneg=-12｜U2 vcc out 0 555 r1=1k r2=10k c=10u｜U3 vcc out 0 lm35｜env light=300 temp=25。可以用「;」分隔寫在同一行。';
  const TOOLS = {
    logic_convert: { d: '邏輯電路化簡與轉換：輸入布林式（A\'B + BC、~A&B|C、A⊕B）或最小項（F(A,B,C)=Σm(1,3,5)+d(7)、ΠM(0,4)），回傳真值表、最簡 SOP／POS、只用 NAND／NOR 的式子、卡諾圖；給 ics（例：7400 或 7408,7432,7404）會算出要幾顆 IC、每支腳接什麼。結果照原樣整理給使用者，不要自己重算。', p: { expr: S('布林式或最小項'), ics: S('IC 編號（選填，逗號分開）') }, r: ['expr'],
      f: (a) => { const L = LA.logic; const out = L.report(String(a.expr || ''), a.ics ? String(a.ics) : undefined); const s = L.solve(String(a.expr || '')); const tt = s.vars.length <= 4 ? '\n\n真值表：\n| ' + s.vars.join(' | ') + ' | F |\n|' + s.vars.map(() => ':-:|').join('') + ':-:|\n' + s.table.map((r) => '| ' + [...r.bits].join(' | ') + ' | ' + r.f + ' |').join('\n') : ''; return out + tt + '\n\n卡諾圖：\n' + L.kmapText(s); } },
    logic_adder: { d: '加法器／減法器：kind＝ha 半加器｜fa 全加器｜hs 半減器｜fs 全減器｜add N 位元加法器｜sub N 位元減法器（2 的補數）｜addsub 加減法器（M=0 加、M=1 減）。回傳布林式、真值表、閘數；給 a、b 會代入算一次；impl：gates（基本閘 IC）｜msi（4 位元加法器 IC：74283｜7483｜4008），會列出每支腳接什麼。照原樣整理給使用者。', p: { kind: S('ha|fa|hs|fs|add|sub|addsub'), bits: N('位元數 1～8'), a: N('A（十進位）'), b: N('B（十進位）'), x: N('Cin 或 M（0／1）'), impl: S('gates|msi'), ic: S('74283|7483|4008') }, r: ['kind'],
      f: (a) => LA.logic.arithReport(String(a.kind || ''), { bits: a.bits, a: a.a, b: a.b, x: a.x, impl: a.impl, ic: a.ic }) },
    logic_state: { d: '讀「邏輯閘」頁目前的電路：每個閘、輸入 0／1、布林式、真值表、卡諾圖、最簡 SOP／POS、NAND／NOR、IC 接線。要操作之前先讀。', p: {}, r: [], f: () => ctx().logic.describe() },
    logic_set: { d: '操作「邏輯閘」頁（使用者看到的同一個畫面，會即時更新）。expr＝換成這個函數的電路（form：sop｜pos｜nand｜nor）；form＋rebuild＝切換形式；inputs＝設輸入；gate／add_gate／remove_gate／output／add_input／remove_input＝改電路；ic_map＝每種閘用哪顆 IC；wire_source＝接線照 ckt（畫的電路）或 form（轉換結果）；ics＝只有這幾顆 IC；arith＝打開加法器／減法器；reset。做完在回覆最後加 [[開啟:邏輯閘轉換器]]。',
      p: { expr: S('布林式或最小項'), form: S('sop|pos|nand|nor'), rebuild: B('連電路一起換'), ics: S('IC 編號'), ic_map: OBJ('每種閘用哪顆 IC，例 {"AND":"7408"}', Object.fromEntries(GATES.map((g) => [g, S(g + ' 用的 IC')]))), wire_source: S('ckt|form'),
        arith: OBJ('加法器／減法器，例 {"kind":"addsub","bits":4,"a":7,"b":2,"x":1,"impl":"msi"}', { kind: S('ha|fa|hs|fs|add|sub|addsub'), bits: N('1～8'), a: N('A'), b: N('B'), x: N('Cin／M'), impl: S('gates|msi'), ic: S('加法器 IC') }), close_arith: B('關掉加法器／減法器'),
        inputs: OBJ('設輸入 0／1，例 {"A":1,"B":0}', Object.fromEntries('ABCDEF'.split('').map((v) => [v, N(v)]))), gate: OBJ('改一個閘 {id, type, ins}', { id: S('閘編號，例 g1'), type: S('AND|OR|NAND|NOR|XOR|XNOR|NOT|BUF'), ins: ARR('輸入訊號') }), add_gate: OBJ('加一個閘 {type, ins}', { type: S('閘種類'), ins: ARR('輸入訊號') }),
        remove_gate: S('要刪的閘編號'), output: S('輸出接的訊號'), add_input: B('加一個變數'), remove_input: S('要刪的變數'), reset: B('回到預設電路') }, r: [],
      f: (a) => { const op = { ...a }; if (op.close_arith) { op.arith = null; } delete op.close_arith; ctx().logic.apply(op); return '已更新邏輯閘頁（畫面會同步）。目前狀態：\n' + ctx().logic.describe(); } },
    circuit_solve: { d: '電路計算（直流工作點＋時間模擬）：給零件清單，算出每個節點電壓、每個零件電壓／電流／功率、LED 亮不亮、電晶體狀態、穩壓 IC 有沒有在穩壓、運放有沒有飽和、哪些零件會燒掉；有電容／電感／555 時 tran=true 加上從 0 秒開始的時間模擬。' + NET + ' 結果照原樣整理給使用者，不要自己重算。', p: { netlist: S('零件清單'), tran: B('也做時間模擬'), t_end: N('時間模擬到幾秒（選填）') }, r: ['netlist'],
      f: (a) => { const C = LA.circuit; const r = C.parse(String(a.netlist || '')); return C.report({ parts: r.parts, env: { light: 300, temp: 25, ...r.env } }, { tran: a.tran ? (a.t_end ? { t_end: +a.t_end } : true) : false }); } },
    circuit_calc: { d: '電子計算機：kind＝ohm 歐姆定律（v,i,r,p 填兩個）｜led LED 限流電阻（vs, vf 或 color, if, n）｜divider 分壓（vin,r1,r2,vout 填三個）｜rc（r,c）｜t555（r1,r2,c；或 f,duty,c 反推）｜color 色碼（r→色碼，或 colors：棕 黑 紅 金→阻值）｜series 串並聯（list；kind2=c 電容）｜lc（l,c）｜battery（mah, ma）。數值可以寫 4.7k、100u、15mA。',
      p: { kind: S('ohm|led|divider|rc|t555|color|series|lc|battery'), v: S('電壓'), i: S('電流'), r: S('電阻'), p: S('功率'), vs: S('電源電壓'), vf: S('LED 順向電壓'), color: S('LED 顏色'), if: S('LED 電流'), n: N('LED 串幾顆'), vin: S('輸入電壓'), vout: S('輸出電壓'), r1: S('R1'), r2: S('R2'), c: S('電容'), l: S('電感'), f: S('頻率'), duty: S('工作週期'), colors: S('色碼'), list: S('數值清單'), kind2: S('series 用：r 電阻／c 電容'), mah: S('電池 mAh'), ma: S('耗電 mA') }, r: ['kind'],
      f: (a) => { const { kind, kind2, ...rest } = a; if (kind2) rest.kind = kind2; return LA.circuit.calc(String(kind || ''), rest).text; } },
    circuit_state: { d: '讀「電路」頁目前的電路：零件清單、每個節點電壓、每個零件的電壓電流功率、警告、時間模擬摘要。要操作之前先讀。', p: {}, r: [], f: () => ctx().circuit.describe() },
    circuit_set: { d: '操作「電路」頁（使用者看到的同一個畫面，會即時更新）。netlist＝整個電路換掉；preset＝範例（divider｜led｜rc｜night｜reg｜amp｜blink｜temp｜bridge｜zener｜rl）；add＝加零件（netlist 格式）；remove＝刪零件名稱；set＝改零件；env＝光線 lux／溫度 °C；title；reset。' + NET + ' 做完在回覆最後加 [[開啟:電路工具]]。',
      p: { netlist: S('整個電路'), preset: S('範例名稱'), add: S('要加的零件'), remove: S('要刪的零件名稱（空白分開）'), set: T('ARRAY', '改零件，例 [{"id":"R1","value":"2.2k"},{"id":"SW1","on":false},{"id":"POT1","pos":0.8}]', { items: OBJ('一個零件', { id: S('零件名稱'), value: S('新數值'), pos: N('可變電阻 0～1'), on: B('開關'), color: S('LED 顏色'), beta: N('β'), vz: S('齊納電壓'), r1: S('555 R1'), r2: S('555 R2'), c: S('555 C'), nodes: ARR('改接到哪些節點') }) }),
        env: OBJ('環境', { light: N('光線 lux'), temp: N('溫度 °C') }), title: S('標題'), reset: B('回到預設電路') }, r: [],
      f: (a) => { ctx().circuit.apply(a); return '已更新電路頁（畫面會同步）。\n' + ctx().circuit.describe(); } },
    code_state: { d: '讀「程式碼」頁目前的程式碼（含行號）與上次執行結果。file＝只看某個檔案。', p: { file: S('檔名（選填）') }, r: [], f: (a) => ctx().code.describe(undefined, { name: a.file }) },
    code_set: { d: '修改「程式碼」頁的程式碼（畫面會即時更新）。file＝檔名（沒有就新增）；lang＝javascript｜python｜c｜cpp｜bash｜go｜java｜rust｜php｜ruby｜lua｜html｜css｜json｜sql｜text；code＝整份換掉（新檔或要全改才用）；replace＝局部取代 [{find, with}]（find 要剛好出現一次；修 bug／小改用這個）；insert＝{line, text}；open＝切到某檔；rename；remove＝刪檔；reset。做完在回覆最後加 [[開啟:程式碼工具]]。',
      p: { file: S('檔名'), lang: S('語言'), code: S('整份程式碼'), replace: T('ARRAY', '局部取代', { items: OBJ('一處', { find: S('原本的片段'), with: S('換成') }) }), insert: OBJ('插入', { line: N('在第幾行後（0＝最前面）'), text: S('插入的內容') }), open: S('切到哪個檔'), rename: S('新檔名'), remove: S('要刪的檔'), reset: B('回到範例') }, r: [],
      f: (a) => { const st = ctx().code.apply(a); const f = st.files[st.cur]; return `已更新 ${f.name}（${f.code.split('\n').length} 行，畫面會同步）。`; } },
    code_run: { d: '在瀏覽器裡執行 JavaScript（「程式碼」頁的檔案，或直接給 code）：回傳 console.log 的輸出與結束碼，5 秒逾時。readline() 讀 stdin。網頁版不能執行其他語言（Python、C…）：那些請檢查邏輯或請使用者下載回電腦執行，不要假裝有執行過。', p: { file: S('檔名（選填）'), code: S('直接給 JavaScript（選填）'), stdin: S('標準輸入') }, r: [],
      f: async (a) => { const r = await LA.tb.runCode({ name: a.file, code: a.code, lang: a.code != null ? 'javascript' : undefined, stdin: a.stdin }); return `${r.name}（結束碼 ${r.code}${r.timedOut ? '，逾時' : ''}，${r.ms} ms）：\n${r.text}`; } },
    screen_state: { d: '看使用者現在畫面上顯示的文字（他問「這個畫面是什麼意思」「這裡怎麼用」時用）。', p: {}, r: [], f: () => `頁面：${LA.tb.screen.page || LA.cur}\n${LA.tb.screen.text || '（沒有內容）'}` },
    open_page: { d: '幫使用者切換到某個頁面：logic（邏輯閘）｜circuit（電路）｜code（程式碼）。', p: { page: S('logic|circuit|code') }, r: ['page'], f: (a) => { const p = String(a.page || ''); if (!['logic', 'circuit', 'code'].includes(p)) throw new Error('page 只能是 logic、circuit、code'); pendingOpen = p; return `回覆送出後會切到 ${p} 頁`; } },
  };
  let pendingOpen = null;
  const decl = () => [{ functionDeclarations: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.d, ...(Object.keys(t.p).length ? { parameters: { type: 'OBJECT', properties: t.p, required: t.r } } : {}) })) }];

  const SYS = () => `你是「電子與程式工具箱」網頁裡的 AI 助理，專精數位邏輯、電子電路、程式設計，也能回答一般問題。用繁體中文回答（使用者用別的語言就跟著換）。
現在時間：${new Date().toLocaleString('zh-TW', { hour12: false })}。使用者目前在「${{ home: 'AI 助理', logic: '邏輯閘', circuit: '電路', code: '程式碼' }[LA.lastPage] || 'AI 助理'}」頁。
這個網站有三個工具頁，你可以用工具直接操作，使用者畫面會即時更新：
- 邏輯閘轉換器（logic_convert、logic_adder、logic_state、logic_set）：化簡、SOP／POS／NAND／NOR、真值表、卡諾圖、IC 實際接線、加減法器。
- 電路工具（circuit_solve、circuit_calc、circuit_state、circuit_set）：算電壓、電流、電阻、功率、LED／電晶體／7805／運放／感測器／555、時間模擬、各種計算機。
- 程式碼工具（code_state、code_set、code_run）：讀、改程式碼；網頁版只能執行 JavaScript。
規則：
- 數字一律用工具算，照工具結果說，不要自己心算或編數字；工具報錯就照實說並修正後再試。
- 要改使用者畫面上的東西，先讀狀態（*_state）再改；程式小改用 code_set 的 replace，不要整份重寫。
- 改了哪個工具，就在回覆最後加 [[開啟:邏輯閘轉換器]]、[[開啟:電路工具]] 或 [[開啟:程式碼工具]]（會變成按鈕）。
- 回答精簡、直接；程式碼用 \`\`\` 區塊；表格用 Markdown。不知道就說不知道。
- 不要重複：同一句話在一則回覆裡只講一次，不要每則都用同一句開頭或結尾；使用者明確要你重複才重複。
- 安全：不協助製作武器、惡意程式或危險的電路（例如直接接市電的高壓實驗），可以說明安全做法。`;

  // ---------------- Gemini 呼叫 ----------------
  async function gemini(contents, signal) {
    const key = keyOf(); if (!key) throw new Error('還沒設定 Gemini API Key：到「設定」頁貼上');
    const body = { systemInstruction: { parts: [{ text: SYS() }] }, contents, tools: decl(), generationConfig: { temperature: 0.4 } };
    let r; try { r = await fetch(`${API}/models/${encodeURIComponent(model())}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal }); }
    catch (e) { if (e.name === 'AbortError') throw e; throw new Error('連不到 Google（網路問題或被擋）：' + e.message); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const m = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (r.status === 400 && /API key/i.test(m)) throw new Error('API Key 無效：請到「設定」頁確認貼的是 Gemini API Key（AIza 或 AQ. 開頭）');
      if (r.status === 403) throw new Error('這組 API Key 沒有權限使用這個模型，或 Generative Language API 沒有啟用：' + m);
      if (r.status === 404) throw new Error(`找不到模型「${model()}」：到「設定」頁重新選一個`);
      if (r.status === 429) throw new Error('這組 API Key 的用量到上限或請求太頻繁，請稍後再試（或到 Google AI Studio 查看額度）');
      throw new Error('Gemini 回傳錯誤：' + m); }
    const c = j.candidates && j.candidates[0]; if (!c || !c.content) { const why = (j.promptFeedback && j.promptFeedback.blockReason) || (c && c.finishReason) || '沒有內容'; throw new Error('模型沒有回覆（' + why + '）'); }
    return c.content;
  }
  async function agent(text) {
    const hist = chat.filter((m) => m.role === 'user' || m.role === 'model').slice(-16).map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
    const contents = [...hist, { role: 'user', parts: [{ text }] }]; steps = []; abort = new AbortController(); pendingOpen = null;
    for (let round = 0; round < 10; round++) {
      const content = await gemini(contents, abort.signal); contents.push(content);
      const calls = (content.parts || []).filter((p) => p.functionCall); const said = (content.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      if (!calls.length) return said;
      const resp = [];
      for (const p of calls) { const { name, args } = p.functionCall; const t = TOOLS[name]; let result;
        steps.push(name); paintBusy();
        try { if (!t) throw new Error('沒有這個工具：' + name); result = String(await t.f(args || {})); } catch (e) { result = '錯誤：' + e.message; }
        resp.push({ functionResponse: { name, response: { result: result.slice(0, 30000) } } }); }
      contents.push({ role: 'user', parts: resp });
    }
    return '（工具用太多次了，先停在這裡。可以換個方式再問一次。）';
  }

  // ---------------- 訊息顯示 ----------------
  const OPEN = { 邏輯閘轉換器: 'logic', 電路工具: 'circuit', 程式碼工具: 'code' };
  function render(text) {
    const parts = String(text || '').split(/```([\w+#.-]*)\n?([\s\S]*?)```/g); let h = '';
    for (let i = 0; i < parts.length; i += 3) {
      let t = parts[i].replace(/^#{1,6}\s+(.+)$/gm, '**$1**'); if (i > 0) t = t.replace(/^\n+/, ''); if (i + 2 < parts.length) t = t.replace(/\n+$/, ''); t = t.replace(/\n+$/, '');
      t = LA.richText(t).replace(/\[\[開啟:(邏輯閘轉換器|電路工具|程式碼工具)\]\]/g, (_, n) => `<button class="btn sm pri copen" data-go="${OPEN[n]}">${LA.icon({ logic: 'grid', circuit: 'circuit', code: 'code' }[OPEN[n]], 'sm')} 開啟${n}</button>`);
      h += t;
      if (i + 2 < parts.length) { const lang = (parts[i + 1] || '').toLowerCase(); const code = parts[i + 2].replace(/\n$/, ''); const L = { js: 'javascript', py: 'python', 'c++': 'cpp', sh: 'bash', shell: 'bash' }[lang] || lang || 'text';
        h += `<div class="wcode"><div class="wcode-h"><span>${esc(lang || 'code')}</span><button class="btn sm" data-cc="1">${LA.icon('copy', 'sm')} 複製</button><button class="btn sm" data-ced="${esc(L)}">${LA.icon('code', 'sm')} 放進程式碼工具</button></div><pre><code>${LA.codeHighlight ? LA.codeHighlight(code, L) : esc(code)}</code></pre><textarea hidden>${esc(code)}</textarea></div>`; }
    }
    return h;
  }
  const hasKey = () => !!keyOf();
  function paintBusy() { const b = $('#wc-busy'); if (b) b.innerHTML = `<span class="wdots"><i></i><i></i><i></i></span> ${steps.length ? '使用工具：' + esc([...new Set(steps)].join('、')) : '思考中'}`; }
  function paint(main) {
    const box = $('#wc-list', main); if (!box) return;
    box.innerHTML = (chat.length ? '' : `<div class="wempty">${LA.icon('spark')}<b>問我電子、邏輯、程式的問題</b><div class="mute small">我可以直接操作旁邊的三個工具頁</div><div class="wsug">${['把 A\'B + AB\' + BC 化簡，用 NAND 做，給我 IC 接線', '5V 點一顆藍光 LED 要串多大的電阻？', '做一個 9V 的 555 閃爍 LED，頻率 1Hz', '用 JavaScript 寫一個質數篩法並執行'].map((s) => `<button data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`) +
      chat.map((m) => `<div class="wmsg ${m.role === 'user' ? 'me' : m.role === 'error' ? 'bad' : 'ai'}"><div class="wbub">${m.role === 'user' ? esc(m.text).replace(/\n/g, '<br>') : render(m.text)}</div>${m.tools && m.tools.length ? `<div class="wtools">${LA.icon('tool', 'sm')} ${esc(m.tools.join('、'))}</div>` : ''}</div>`).join('') +
      (busy ? '<div class="wmsg ai"><div class="wbub" id="wc-busy"></div></div>' : '');
    if (busy) paintBusy(); box.scrollTop = box.scrollHeight; requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }
  async function send(main, text) {
    text = String(text || '').trim(); if (!text || busy) return;
    if (!hasKey()) { LA.toast('先到「設定」貼上 Gemini API Key', true); return LA.go('settings'); }
    chat.push({ role: 'user', text, at: Date.now() }); saveChat(); busy = true; steps = []; paintAll(main);
    try { let out = await agent(text); try { const recent = chat.filter((m) => m.role === 'model').slice(-4).map((m) => m.text); out = LA.webServices.norepeat.dedupe(out, { recent, user: text }); } catch { /* ignore */ } chat.push({ role: 'model', text: out || '（沒有內容）', tools: [...new Set(steps)], at: Date.now() }); }
    catch (e) { chat.push({ role: 'error', text: e.name === 'AbortError' ? '已停止。' : e.message, at: Date.now() }); }
    busy = false; abort = null; saveChat(); if (LA.cur === 'home') paintAll(main);
    if (pendingOpen) { const p = pendingOpen; pendingOpen = null; LA.toast('切到' + { logic: '邏輯閘', circuit: '電路', code: '程式碼' }[p] + '頁'); setTimeout(() => LA.go(p), 600); }
  }
  function paintAll(main) { paint(main); const go = $('#wc-send', main), st = $('#wc-stop', main); if (go) go.hidden = busy; if (st) st.hidden = !busy; }

  LA.register('home', { name: 'AI 助理', title: 'AI 助理',
    async render(main) {
      LA.lastPage = 'home';
      main.innerHTML = `<div class="wchat">${hasKey() ? '' : `<div class="card wkey">${LA.icon('key')} <div><b>要先設定 Gemini API Key</b><div class="mute small">用 Google 帳號到 Google AI Studio 申請，貼到「設定」頁。Key 只存在你的瀏覽器。</div></div><button class="btn pri" data-go="settings">去設定</button></div>`}
        <div id="wc-list" class="wlist"></div>
        <div class="wbar"><textarea id="wc-in" rows="1" placeholder="輸入訊息…" enterkeyhint="send"></textarea><button class="btn pri" id="wc-send" title="送出">${LA.icon('send')}</button><button class="btn" id="wc-stop" title="停止" hidden>${LA.icon('stop')}</button></div>
        <div class="wfoot mute small">${esc(model())}・<button class="linkbtn" id="wc-clear">清除對話</button></div></div>`;
      paintAll(main);
      const inp = $('#wc-in', main); const grow = () => { inp.style.height = 'auto'; inp.style.height = Math.min(160, inp.scrollHeight) + 'px'; };
      inp.oninput = grow; inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); const v = inp.value; inp.value = ''; grow(); send(main, v); } };
      if (LA._pending) { const p = LA._pending; LA._pending = null; send(main, p); }
      main.onclick = LA.guard(async (e) => {
        const t = e.target;
        if (t.closest('#wc-send')) { const v = inp.value; inp.value = ''; grow(); return send(main, v); }
        if (t.closest('#wc-stop')) { if (abort) abort.abort(); return; }
        if (t.closest('#wc-clear')) { if (!(await LA.confirm('清除所有對話紀錄？'))) return; chat = []; saveChat(); return paintAll(main); }
        const sg = t.closest('[data-sug]'); if (sg) return send(main, sg.dataset.sug);
        const g = t.closest('[data-go]'); if (g) return LA.go(g.dataset.go);
        const cc = t.closest('[data-cc]'); if (cc) return LA.copy(cc.closest('.wcode').querySelector('textarea').value);
        const ce = t.closest('[data-ced]'); if (ce) { const code = ce.closest('.wcode').querySelector('textarea').value; const lang = ce.dataset.ced; const ext = { javascript: 'js', python: 'py', c: 'c', cpp: 'cpp', bash: 'sh', go: 'go', java: 'java', rust: 'rs', php: 'php', ruby: 'rb', lua: 'lua', html: 'html', css: 'css', json: 'json', sql: 'sql' }[lang] || 'txt';
          const st = LA.tb.ctx.code.get(); let n = (lang === 'java' ? 'Main' : 'snippet') + '.' + ext; let k = 1; while (st.files.some((x) => x.name === n)) n = `snippet${++k}.${ext}`; if (st.files.length >= 10) throw new Error('程式碼工具最多 10 個檔案，先刪幾個'); LA.tb.ctx.code.put({ ...st, files: [...st.files, { name: n, lang: ext === 'txt' ? 'text' : lang, code }], cur: st.files.length }, 'app'); return LA.go('code'); }
      });
    },
  });
  /** 工具頁的「請 AI…」按鈕：切到對話頁並送出 */
  LA.chatSend = (text) => { LA._pending = text; if (LA.cur !== 'home') return LA.go('home'); const main = $('#page'); LA._pending = null; return send(main, text); };

  // ---------------- 設定頁 ----------------
  LA.register('settings', { name: '設定', title: '設定',
    async render(main) {
      LA.lastPage = 'settings'; const remembered = (() => { try { return !!localStorage.getItem(K_KEY); } catch { return false; } })();
      main.innerHTML = `<div class="card"><h3>${LA.icon('key')} Gemini API Key</h3>
        <div class="hint">到 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> 申請（用 Google 帳號登入，按「Create API key」）。用量與費用依你的 Google 帳號方案計算。</div>
        <label class="f">API Key</label><div class="row"><input id="st-key" type="password" autocomplete="off" spellcheck="false" placeholder="AQ.Ab… 或 AIza…" value="${esc(keyOf())}" class="grow"><button class="btn sm" id="st-eye">${LA.icon('eye', 'sm')}</button></div>
        <label class="row small" style="margin-top:8px;gap:6px"><input type="checkbox" id="st-rem" ${remembered || !keyOf() ? 'checked' : ''} style="width:auto"> 記在這台裝置（不勾＝關掉分頁就忘記，適合公用電腦）</label>
        <div class="row" style="margin-top:10px"><button class="btn pri" id="st-save">儲存並測試</button><button class="btn" id="st-del">清除 Key</button></div><div id="st-msg" class="hint"></div>
        <div class="hint small">Key 只存在這個瀏覽器，只會直接送到 Google 的 Gemini API，不經過其他伺服器、不會寫進對話紀錄或網址。</div></div>
        <div class="card"><h3>${LA.icon('brain')} 模型</h3><div class="row"><select id="st-model" class="grow"><option value="${esc(model())}">${esc(model())}</option></select><button class="btn sm" id="st-list">讀取可用模型</button></div>
        <div class="hint small">建議用 flash 系列（快、便宜）；pro 系列比較聰明但比較慢、額度比較少。</div></div>
        <div class="card"><h3>${LA.icon('folder')} 資料</h3><div class="hint">三個工具頁的內容與對話紀錄都存在這個瀏覽器（localStorage），換瀏覽器或清除網站資料就會不見。</div>
        <div class="row"><button class="btn" id="st-export">匯出備份</button><label class="btn" style="cursor:pointer">匯入備份<input type="file" id="st-import" accept=".json,application/json" hidden></label><button class="btn" id="st-wipe">清除所有工具資料</button></div></div>
        <div class="card"><h3>${LA.icon('help')} 關於</h3><div class="hint">電子與程式工具箱（網頁版）・邏輯閘轉換器、電路工具、程式碼工具與 Agent中控中心 App 26.11.3-pro7 使用同一套程式。</div></div>`;
      const msg = (t, bad) => { const m = $('#st-msg', main); m.textContent = t; m.className = 'hint' + (bad ? ' err' : ''); };
      const list = async () => { const key = keyOf(); if (!key) throw new Error('先儲存 API Key'); const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
        const ms = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/embedding|image|tts|audio|live|vision/i.test(m.name)).map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || '' }));
        const sel = $('#st-model', main); const cur = model(); sel.innerHTML = ms.map((m) => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.id)}${m.name ? '（' + esc(m.name) + '）' : ''}</option>`).join('') || `<option>${esc(cur)}</option>`;
        if (!ms.some((m) => m.id === cur) && ms.length) { const pick = ms.find((m) => /flash/.test(m.id) && !/lite|preview|exp/.test(m.id)) || ms[0]; sel.value = pick.id; try { localStorage.setItem(K_MODEL, pick.id); } catch { /* ignore */ } }
        return ms.length; };
      main.onclick = LA.guard(async (e) => {
        const t = e.target;
        if (t.closest('#st-eye')) { const i = $('#st-key', main); i.type = i.type === 'password' ? 'text' : 'password'; return; }
        if (t.closest('#st-save')) { const v = $('#st-key', main).value.trim(); if (!v) return msg('請貼上 API Key', true); if (!/^(?:AIza[\w-]{16,}|AQ\.[A-Za-z0-9._-]{12,})$/.test(v)) return msg('格式不像 Gemini API Key（可為 AIza… 或 AQ.Ab… 開頭）', true); setKey(v, $('#st-rem', main).checked); msg('測試中…'); try { const n = await list(); msg(`可以用了：找到 ${n} 個模型。`); } catch (er) { msg('已儲存，但測試失敗：' + er.message, true); } return; }
        if (t.closest('#st-del')) { setKey(''); $('#st-key', main).value = ''; return msg('已清除'); }
        if (t.closest('#st-list')) { try { const n = await list(); msg(`找到 ${n} 個模型`); } catch (er) { msg(er.message, true); } return; }
        if (t.closest('#st-export')) { const data = { app: 'toolbox', v: 1, at: Date.now(), db: LA.tb.db, chat }; await LA.saveBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'toolbox-backup.json'); return LA.toast('已下載備份（不含 API Key）'); }
        if (t.closest('#st-wipe')) { if (!(await LA.confirm('清除邏輯閘、電路、程式碼三個頁面的內容？（對話紀錄與 API Key 不動）'))) return; LA.tb.reset(); return LA.toast('已清除'); }
      });
      main.onchange = LA.guard(async (e) => {
        const t = e.target;
        if (t.id === 'st-model') { try { localStorage.setItem(K_MODEL, t.value); } catch { /* ignore */ } return LA.toast('模型：' + t.value); }
        if (t.id === 'st-import' && t.files && t.files[0]) { const j = JSON.parse(await t.files[0].text()); if (!j || j.app !== 'toolbox' || !j.db) throw new Error('不是工具箱的備份檔'); for (const k of ['logic_state', 'circuit_state', 'code_state']) if (j.db[k]) { const svc = { logic_state: LA.tb.ctx.logic, circuit_state: LA.tb.ctx.circuit, code_state: LA.tb.ctx.code }[k]; svc.put(j.db[k], 'app'); } if (Array.isArray(j.chat)) { chat = j.chat; saveChat(); } return LA.toast('已匯入'); }
      });
    },
  });
})();
