'use strict';
const CampusNpcAccount = (() => {
  const key = 'bjtu-life:npc-account-id';
  const $ = id => document.getElementById(id);
  const dialog = $('npcAccountDialog');
  let id = 0, pausedUntil = 0, reason = '', busy = false;
  try { id = Number(localStorage.getItem(key)) || 0; } catch {}
  function remember(value) {
    id = value; reason = ''; pausedUntil = 0;
    try { if (id) localStorage.setItem(key, String(id)); else localStorage.removeItem(key); } catch {}
  }
  window.addEventListener('storage', e => {
    if (e.key === key || e.key === null) { id = Number(e.newValue) || 0; reason = ''; pausedUntil = 0; render(); }
  });
  function render() {
    $('npcAccountForm').hidden = !!id;
    $('npcLogout').hidden = !id;
    $('npcAccountStatus').textContent = id ? '在线账号 #' + id + (reason ? ' · ' + reason : '') : '登录后可使用在线对话。游客可以使用本地台词。';
  }
  function noteStatus(status) {
    if (status === 401) remember(0);
    else if (status === 403 || status === 429) {
      reason = status === 403 ? '在线对话已暂停' : '在线对话额度已用完';
      pausedUntil = Date.now() + 60000;
    }
  }
  async function request(url, options) {
    const account = id;
    const response = await fetch(url, options);
    if (id === account) {
      if (response.ok && Date.now() >= pausedUntil) reason = '';
      else noteStatus(response.status);
    }
    return response;
  }
  async function accountAction(action) {
    if (busy) return;
    busy = true;
    const form = $('npcAccountForm'), notice = $('npcAccountNotice');
    const buttons = Array.from(dialog.querySelectorAll('button'));
    buttons.forEach(button => { button.disabled = true; });
    notice.textContent = '正在连接…';
    try {
      const method = action === 'session' ? 'GET' : 'POST';
      const response = await fetch('/api/npc-account/' + action, { method, credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.timeout(8000), ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'login' ? { code: $('npcLoginCode').value.trim() } : {}) } : {}) });
      const data = await response.json();
      if (!response.ok) {
        if (action === 'session') noteStatus(response.status);
        throw new Error(data.error || '账号服务暂时不可用');
      }
      remember(action === 'logout' ? 0 : data.id);
      form.reset();
      notice.textContent = action === 'register' ? '请保存登录码，换设备或退出后用它登录。' : action === 'logout' ? '已退出在线账号。' : '在线账号已连接。';
      $('npcIssuedCode').textContent = data.code || '';
    } catch (e) {
      notice.textContent = e instanceof SyntaxError || e.name === 'TypeError' || e.name === 'TimeoutError' ? '暂时连不上账号服务，可以继续本地游玩。' : e.message;
    } finally {
      busy = false; buttons.forEach(button => { button.disabled = false; }); render();
    }
  }
  function open() {
    if (dialog.open) return;
    $('npcIssuedCode').textContent = '';
    $('npcAccountNotice').textContent = '';
    render(); dialog.showModal();
    if (id) accountAction('session');
  }
  $('npcAccountForm').addEventListener('submit', event => { event.preventDefault(); accountAction('login'); });
  $('npcRegister').addEventListener('click', () => accountAction('register'));
  $('npcLogout').addEventListener('click', () => accountAction('logout'));
  $('npcAccountClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { $('npcIssuedCode').textContent = ''; $('npcAccountForm').reset(); });
  $('startNpcAccount').addEventListener('click', open);
  $('settingsNpcAccount').addEventListener('click', open);
  return { open, request, available: () => !!id && Date.now() >= pausedUntil,
    localNotice: () => !id ? '当前使用本地台词。可在「在线账号」登录。' : reason ? reason + '，已使用本地台词。' : '暂时连不上在线对话，已使用本地台词。' };
})();
