'use strict';
(function () {
  const TABS = [['home', 'chat', 'AI 助理'], ['logic', 'grid', '邏輯閘'], ['circuit', 'circuit', '電路'], ['code', 'code', '程式碼'], ['settings', 'settings', '設定']];
  const nav = LA.$('#tabs');
  nav.innerHTML = TABS.map(([id, ic, n]) => `<button data-id="${id}"><span>${LA.icon(ic)}</span>${n}</button>`).join('');
  nav.onclick = (e) => { const b = e.target.closest('button'); if (b) LA.go(b.dataset.id); };
  LA.PARENT = {};
  const go0 = LA.go; LA.go = async (id) => { if (!LA.pages[id]) id = 'home'; LA.lastPage = id; try { sessionStorage.setItem('tb_page', id); } catch { /* ignore */ } await go0(id); if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id); };
  // 其他頁面（例如工具裡的「開啟」按鈕）
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.copen[data-go]'); if (b && !b.closest('#page .wchat')) { e.preventDefault(); LA.go(b.dataset.go); } });
  new MutationObserver(() => LA.report()).observe(LA.$('#page'), { childList: true, subtree: true });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== LA.cur && LA.pages[h]) LA.go(h); });
  const first = location.hash.slice(1) || (() => { try { return sessionStorage.getItem('tb_page'); } catch { return ''; } })() || 'home';
  LA.go(LA.pages[first] ? first : 'home');
})();
