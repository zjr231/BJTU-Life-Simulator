(function (root) {
  'use strict';
  const prefix = 'bjtu-life:playthrough:';
  function newId() {
    return Array.from(root.crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  }

  // Pending requests live outside the three local save slots and survive page reloads.
  function openQueue(indexedDB) {
    let opening;
    function open() {
      if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('bjtu-playthrough-outbox', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('uploads', { autoIncrement: true });
        request.onerror = () => { opening = null; reject(request.error); };
        request.onsuccess = () => resolve(request.result);
      });
      return opening;
    }
    async function transaction(mode, operation) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('uploads', mode);
        const request = operation(tx.objectStore('uploads'));
        let result;
        request.onsuccess = () => {
          const value = request.result;
          result = value && typeof value === 'object' && 'key' in value ? { key: value.key, body: value.value } : value;
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    }
    return {
      put: body => transaction('readwrite', store => store.add(body)),
      first: () => transaction('readonly', store => store.openCursor()),
      remove: key => transaction('readwrite', store => store.delete(key))
    };
  }

  function createClient({ storage, queue, post, retry, onFeedback = () => {} }) {
    const flags = new Map(), memory = [];
    let sending = null, again = false, retryTimer = false;
    function read(key) {
      if (flags.has(key)) return flags.get(key);
      try { return storage?.getItem(prefix + key); } catch { return undefined; }
    }
    function write(key, value) {
      try {
        if (storage) { storage.setItem(prefix + key, value); flags.delete(key); return; }
      } catch {}
      flags.set(key, value);
    }
    function feedbackStatus(runId) { return read('feedback:' + runId); }
    function setFeedback(runId, value) { write('feedback:' + runId, value); onFeedback(runId, value); }
    function legacyId(state) {
      const key = 'legacy:' + JSON.stringify([state.rng.seed, state.nickname]);
      let id = read(key);
      if (!/^[a-f0-9]{32}$/.test(id || '')) { id = newId(); write(key, id); }
      return id;
    }
    async function first() {
      if (memory.length) return { body: memory[0], inMemory: true };
      return queue?.first();
    }
    function retryLater() {
      if (!retryTimer) {
        retryTimer = true;
        retry(() => { retryTimer = false; flush(); }, 60000);
      }
    }
    async function drain() {
      let item;
      while ((item = await first())) {
        let res;
        try { res = await post(item.body); } catch {}
        const rejected = res && [400, 413].includes(res.status);
        if (!res?.ok && !rejected) { retryLater(); return; }
        if (res?.ok) {
          try { if ((await res.json()).ok !== true) { retryLater(); return; } }
          catch { retryLater(); return; }
        }
        const data = JSON.parse(item.body);
        if (data.feedback) setFeedback(data.runId, rejected ? 'error' : 'sent');
        else if (data.kind === 'ending' && !rejected) write('ending:' + data.runId, endingKey(data.state));
        if (item.inMemory) memory.shift();
        else await queue.remove(item.key);
      }
    }
    function flush() {
      if (sending) { again = true; return sending; }
      sending = drain().catch(retryLater).finally(() => {
        sending = null;
        if (again) { again = false; flush(); }
      });
      return sending;
    }
    async function enqueue(payload) {
      const body = JSON.stringify(payload);
      let persisted = false;
      try {
        if (queue) { await queue.put(body); persisted = true; }
      } catch {}
      if (!persisted) memory.push(body);
      if (payload.feedback) {
        if (persisted) setFeedback(payload.runId, 'queued');
        else { flags.set('feedback:' + payload.runId, 'temporary'); onFeedback(payload.runId, 'temporary'); }
      }
      flush();
    }
    function endingKey(state) { return JSON.stringify([state.revision, state.result.direction, state.history.at(-1)?.commandId]); }
    let currentEnding = '';
    function capture(runId, state, kind, slot, savedAt = Date.now(), feedback) {
      if (kind === 'ending' && !feedback) {
        const marker = endingKey(state);
        if (currentEnding === runId + marker || read('ending:' + runId) === marker) return;
        currentEnding = runId + marker;
      }
      return enqueue({ runId, kind, slot, savedAt, state, ...(feedback ? { feedback } : {}) });
    }
    return { newId, legacyId, capture, flush, feedbackStatus, skip: id => setFeedback(id, 'skipped') };
  }

  const api = { newId, createClient, openQueue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusPlaythrough = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
