'use strict';
const CampusNpcAccount = (() => {
  let ready = false, opening = null, pausedUntil = 0, reason = '';
  function note(status) {
    if (status === 403 || status === 429 || status === 503 || status === 401) {
      reason = status === 403 ? '在线对话已暂停' : status === 429 ? '在线对话暂时达到限额'
        : status === 401 ? '浏览器未能保持对话会话' : '在线对话暂时不可用';
      pausedUntil = Date.now() + 60000;
    }
  }
  async function startSession() {
    const response = await fetch('/api/npc-account/session', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) { note(response.status); throw new Error('NPC session unavailable'); }
    if (!Number.isSafeInteger((await response.json()).id)) throw new Error('Invalid NPC session');
    ready = true;
  }
  function ensureSession() {
    if (!opening) {
      const locks = navigator.locks;
      opening = (locks ? locks.request('bjtu-npc-session', startSession) : startSession())
        .finally(() => { opening = null; });
    }
    return opening;
  }
  async function request(url, options) {
    const wasReady = ready;
    if (!wasReady) await ensureSession();
    let response = await fetch(url, options);
    if (response.status === 401 && wasReady) {
      ready = false;
      await ensureSession();
      response = await fetch(url, options);
    }
    if (response.status === 401) ready = false;
    if (!response.ok) note(response.status);
    return response;
  }
  return { request, available: (interactive = false) => (interactive || ready) && Date.now() >= pausedUntil,
    localNotice: () => (Date.now() < pausedUntil && reason || '在线对话暂时不可用') + '，已使用本地台词。' };
})();
