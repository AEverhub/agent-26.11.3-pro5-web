'use strict';
(function () {
  const PATHS = {
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 9-12h-7z"/>',
    circuit: '<path d="M2 12h3l2-5 3 10 3-10 3 10 2-5h4"/><circle cx="2.5" cy="12" r=".5"/><circle cx="21.5" cy="12" r=".5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0"/>',
    speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    reply: '<path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    group: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 4.8"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
    transfer: '<rect x="2" y="5" width="7" height="13" rx="1.5"/><rect x="15" y="6" width="7" height="13" rx="1.5"/><path d="M10.5 9.5h3.5m-1.5-2 2 2-2 2M13.5 14.5H10m1.5-2-2 2 2 2"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 19h16"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    megaphone: '<path d="m3 11 18-5v12L3 13zM3 11v2M7 14l1 6h3l-1-5"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.3a2 2 0 1 1-4.4 0v-.3a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.2 12a2 2 0 0 0 1.4-3.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 8.8 4a2 2 0 0 0 3.4-1.4v-.3a2 2 0 1 1 4.4 0v.3A2 2 0 0 0 20 4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 21.2 12a2 2 0 0 0-1.8 3Z"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L14 9V3M7 15h10"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    chart: '<path d="M4 19V5M4 19h17M8 16v-5M12 16V7M16 16v-3M20 16V4"/>',
    chat: '<path d="M20 15a4 4 0 0 1-4 4H8l-5 3 1.5-5.1A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4z"/>',
    shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.6 1.9c-.9.6-1.4 1-1.4 2.1M12 17h.01"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 6l2 2M13 9l2 2"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h0a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    plug: '<path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0zM12 17v5"/>',
    mask: '<path d="M4 5c3 1 13 1 16 0v6a8 8 0 0 1-16 0zM8.5 10.5h2M13.5 10.5h2M9 15c1.7 1.3 4.3 1.3 6 0"/>',
    send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    book: '<path d="M4 5a3 3 0 0 1 3-2h12v17H7a3 3 0 0 0-3 3zM4 5v18M7 7h8M7 11h8"/>'
  };

  // ---- 26.12 自製圖示（線條風格，24×24，跟隨文字顏色）：取代介面上所有表情符號 ----
  Object.assign(PATHS, {
    alert: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    next: '<path d="m9 6 6 6-6 6"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>',
    receipt: '<path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6M9 16h3"/>',
    pen: '<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
    food: '<path d="M4 11h16a8 8 0 0 1-16 0zM8 8c0-2 1-3 1-5M12 8c0-2 1-3 1-5M16 8c0-2 1-3 1-5"/>',
    hospital: '<path d="M4 21V5h16v16M9 21v-5h6v5M12 8v5M9.5 10.5h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
    mail: '<path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/>',
    doc: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
    table: '<path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14"/>',
    slides: '<path d="M3 5h18v11H3zM12 16v4M8 20h8"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>',
    lock: '<path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
    mic: '<path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3"/>',
    phone: '<path d="M8 2h8v20H8zM11 18h2"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    card: '<path d="M3 6h18v12H3zM3 10h18M7 15h4"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    board: '<path d="M4 4h16v16H4zM9 4v16M15 4v16M6 8h1M11 8h2M17 8h1M11 12h2"/>',
    calc: '<path d="M6 3h12v18H6zM8.5 6h7v3h-7zM9 13h.01M12 13h.01M15 13h.01M9 17h.01M12 17h.01M15 17h.01"/>',
    spider: '<circle cx="12" cy="12" r="3"/><path d="M12 9V5M9.5 10.5 6 8M14.5 10.5 18 8M9 12H4M15 12h5M9.5 13.5 6 17M14.5 13.5 18 17"/>',
    google: '<path d="M20 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.5a4 4 0 0 1-1.7 2.6M20 12.2A8 8 0 1 1 17.4 6.4L15 8.6a4.6 4.6 0 1 0 1.6 4.8"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>',
    eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
    pause: '<path d="M8 5v14M16 5v14"/>', stop: '<path d="M6 6h12v12H6z"/>', refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
    terminal: '<path d="M3 5h18v14H3zM7 10l3 2-3 2M12 15h5"/>',
    puzzle: '<path d="M10 4a2 2 0 0 1 4 0v2h4v4h-2a2 2 0 0 0 0 4h2v4h-4v-2a2 2 0 0 0-4 0v2H6v-4h2a2 2 0 0 0 0-4H6V6h4z"/>',
    linux: '<path d="M12 3c-2.5 0-3.5 2.2-3.5 4.5 0 2-1.5 3.5-2.5 5.5-1 2-1 4 0 5.5M12 3c2.5 0 3.5 2.2 3.5 4.5 0 2 1.5 3.5 2.5 5.5 1 2 1 4 0 5.5M7 19.5c1.5 1 3 1.5 5 1.5s3.5-.5 5-1.5M10.5 7.5h.01M13.5 7.5h.01M11 10h2"/>',
    lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7c-2.5 0-4-1.5-5.5-4L3 13.5a1.5 1.5 0 0 1 2.5-1.5L8 15"/>',
    save: '<path d="M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7"/>',
    tool: '<path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.5-1.5a4 4 0 0 0-5-5L13 5zM4 20l5-5"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1-3-5-3-5-1s5 1 5 1zM12 7c1-3 5-3 5-1s-5 1-5 1z"/>',
    car: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7.5 13h.01M16.5 13h.01"/>',
    home: '<path d="m3 11 9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6"/>',
    cart: '<path d="M3 4h2l2.5 11h11L21 7H6.2M9 20h.01M17 20h.01"/>',
    music: '<path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"/>',
    pill: '<path d="M8.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM5 10l7 7"/>',
  });
  /** 服務按鈕可用的圖示（編輯時讓使用者挑） */
  LA.TILE_ICONS = ['receipt', 'camera', 'qr', 'pen', 'food', 'hospital', 'sun', 'clock', 'calendar', 'chat', 'mail', 'doc', 'table', 'map', 'car', 'home', 'cart', 'card', 'gift', 'heart', 'pill', 'music', 'phone', 'bell', 'star', 'globe', 'search', 'bolt', 'spark', 'book', 'tool', 'users', 'circuit', 'code', 'calc', 'grid'];
  // 舊版存的表情符號圖示 → 自製圖示
  const EMOJI_TILE = { '🧾': 'receipt', '📷': 'camera', '🔳': 'qr', '✏️': 'pen', '✏': 'pen', '🍱': 'food', '🥪': 'food', '🏥': 'hospital', '☀️': 'sun', '☀': 'sun', '⏰': 'clock', '💬': 'chat', '✨': 'spark', '📅': 'calendar', '🛒': 'cart', '🚗': 'car', '🏠': 'home', '💊': 'pill', '🎁': 'gift' };
  LA.tileIcon = (v) => (PATHS[v] ? v : EMOJI_TILE[v] || EMOJI_TILE[String(v || '').replace(/️/g, '')] || 'spark');
  const aliases = { '⚡': 'bolt', '🧾': 'receipt', '🗂️': 'folder', '🗂': 'folder', '👥': 'users', '📢': 'megaphone', '⚙️': 'settings', '⚙': 'settings', '🧪': 'flask', '🔔': 'bell', '📊': 'chart', '💬': 'chat', '🛡️': 'shield', '🛡': 'shield', '🔑': 'key', '📖': 'book', '❔': 'help', '❓': 'help', '▶': 'play', '▶️': 'play', '📋': 'list', '📁': 'folder', '📄': 'doc', '☁️': 'cloud', '☁': 'cloud', '🔌': 'plug', '📣': 'megaphone', '🖥️': 'terminal', '🖥': 'terminal', '🤖': 'bolt', '📝': 'doc', '🔎': 'search', '🔍': 'search', '💾': 'save', '🩺': 'chart', '🛠️': 'tool', '🛠': 'tool', '👷': 'users', '🧩': 'puzzle', '⚠️': 'alert', '⚠': 'alert', 'ℹ️': 'help', 'ℹ': 'help', '📜': 'list', '🗒️': 'list', '🗒': 'list', '🔗': 'plug', '📤': 'upload', '⬆': 'upload', '⬆️': 'upload', '✅': 'check', '✓': 'check', '❌': 'x', '✕': 'x', '⏸': 'pause', '⏸️': 'pause', '■': 'stop', '↻': 'refresh', '🧠': 'brain', '🌐': 'globe', '📷': 'camera', '🔳': 'qr', '✨': 'spark', '☀️': 'sun', '☀': 'sun', '🎨': 'palette', '📦': 'box', '💳': 'card', '👑': 'crown', '🔐': 'lock', '🔒': 'lock', '➕': 'plus', '🎤': 'mic', '📱': 'phone', '🕐': 'clock', '⏰': 'clock', '🎭': 'mask', '🛟': 'lifebuoy', '🖐': 'hand', '🖐️': 'hand', '🐧': 'linux', '✏️': 'pen', '✏': 'pen', '✎': 'edit', '🍱': 'food', '🏥': 'hospital', '📅': 'calendar', '👁': 'eye', '👁️': 'eye', '📐': 'board', '🗃️': 'db', '🗃': 'db', '📚': 'book', '🆕': 'star', '📌': 'star', '🔄': 'refresh', '🗑️': 'trash', '🗑': 'trash', '📞': 'phone', '✉️': 'mail', '📧': 'mail', '🧮': 'calc', '🕷️': 'spider', '⭐': 'star', '🔥': 'bolt', '💡': 'spark', '🏠': 'home', '🚗': 'car', '🛒': 'cart', '🎁': 'gift', '💊': 'pill' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  LA.icon = (name, cls = '') => `<svg class="svg-icon ${esc(cls)}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || PATHS.help}</svg>`;
  /** 連接器等第三方服務：不用別人的商標，畫一個「字首徽章」 */
  LA.badge = (name, icon) => `<span class="badge-ic" style="--h:${[...String(name || '?')].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 360, 7)}">${icon && PATHS[icon] ? LA.icon(icon) : esc(String(name || '?').slice(0, 1).toUpperCase())}</span>`;
  // 介面文字裡的表情符號：認得的換成自製圖示，其他一律拿掉（對話內容 .cb 與輸入框不動）
  const EMO = /(?:\p{Extended_Pictographic}|[←-⇿⌀-⏿■-◿☀-➿⬀-⯿])️?(?:‍(?:\p{Extended_Pictographic})️?)*/gu;
  const KEEP = new Set(['→', '←', '↑', '↓', '↔', '·']);   // 一般排版用的箭頭保留
  const SKIP = /^(SCRIPT|STYLE|INPUT|TEXTAREA|PRE|CODE|SVG|svg|path)$/;
  LA.iconize = (root) => {
    if (!root) return; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; let n;
    while ((n = walker.nextNode())) { const pe = n.parentElement; if (!pe || SKIP.test(pe.tagName) || pe.closest('.cb,.no-iconize')) continue; EMO.lastIndex = 0; if (EMO.test(n.nodeValue)) nodes.push(n); }
    for (const node of nodes) {
      const frag = document.createDocumentFragment(); let last = 0; const text = node.nodeValue; EMO.lastIndex = 0; let m;
      while ((m = EMO.exec(text))) {
        if (KEEP.has(m[0])) continue;
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const ic = aliases[m[0]] || aliases[m[0].replace(/️/g, '')];
        if (ic) { const h = document.createElement('span'); h.className = 'inline-icon'; h.innerHTML = LA.icon(ic); frag.appendChild(h); }
        last = m.index + m[0].length;
      }
      if (last === 0) continue; if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last).replace(/^ (?=\S)/, ' ')));
      node.parentNode.replaceChild(frag, node);
    }
  };
  // 頁面局部更新（輪詢重畫、對話框）也要套用：觀察新加入的節點
  let pend = new Set(); let tm = null;
  const flush = () => { tm = null; const list = [...pend]; pend = new Set(); for (const el of list) if (el.isConnected) LA.iconize(el); };
  const obs = new MutationObserver((ms) => { for (const m of ms) for (const nd of m.addedNodes) { const el = nd.nodeType === 1 ? nd : nd.parentElement; if (el && !(el.closest && el.closest('.cb'))) pend.add(el); } if (pend.size && !tm) tm = requestAnimationFrame(flush); });
  const start = () => { for (const id of ['page', 'modal', 'crumb', 'top', 'toast']) { const el = document.getElementById(id); if (el) obs.observe(el, { childList: true, subtree: true, characterData: false }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
