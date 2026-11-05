(function (root) {
  'use strict';
  const h = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function render(view) {
    const name=h(view.profile.name),identity=h(view.profile.identity||'同年级同学');
    const choices = view.choices.map(choice => {
      const attributes = Object.entries(choice.attributes || {}).filter(([name]) => /^data-[a-z-]+$/.test(name)).map(([name, value]) => name + '="' + h(value) + '"').join(' ');
      return '<button type="button" class="vn-choice' + (choice.selected ? ' is-selected' : '') + '" ' + attributes + (choice.disabled ? ' disabled' : '') + '><span>' + h(choice.label) + '</span>' + (choice.note ? '<small>' + h(choice.note) + '</small>' : '') + '</button>';
    }).join('');
    const chat = view.chat ? '<form id="zhouChatForm" class="vn-chat-form"><label class="vn-sr-only" for="zhouChatInput">和' + name + '说句话</label><input id="zhouChatInput" name="message" maxlength="240" autocomplete="off" placeholder="想聊什么，直接说吧……" value="' + h(view.draft || '') + '"' + (view.busy ? ' disabled' : '') + '><button type="submit"' + (view.busy ? ' disabled' : '') + '>' + (view.busy ? '正在回复…' : '发送') + '</button></form>' : '';
    const messages = [...(view.messages || [])];
    if (view.chat && view.speech && messages.at(-1)?.content !== view.speech) {
      messages.push({ role: 'assistant', content: view.speech, key: 'current:' + view.speech });
    }
    if (view.pendingText) messages.push({ role: 'user', content: view.pendingText, key: 'pending:' + view.pendingText });
    const messageRows = messages.map(item => item.role === 'event'
      ? '<li class="vn-chat-event">' + h(item.content) + '</li>'
      : '<li class="vn-message is-' + (item.role === 'user' ? 'user' : 'assistant') + '"><b>' + (item.role === 'user' ? '你' : name) + '</b><p>' + h(item.content) + '</p></li>').join('');
    const conversation = view.chat ? '<div id="vnConversation" class="vn-conversation" role="log" aria-label="你与' + name + '的完整对话" aria-live="polite" aria-atomic="false" tabindex="0" data-npc-id="' + h(view.profile.id) + '" data-last-key="' + h(messages.at(-1)?.key || '') + '"><ol>' + messageRows + '</ol>' + (view.waiting ? '<p class="vn-chat-waiting">' + name + '正在回复…</p>' : '') + '</div>' : '<p class="vn-speech">' + h(view.speech) + '</p>';
    const chatHistory = view.historyOpen ? '<section class="vn-dossier vn-chat-history" aria-label="你与' + name + '的对话记录"><h3>你们说过的话</h3><ol>' + (view.messages || []).map(item => '<li><b>' + (item.role === 'user' ? '你' : name) + '</b><p>' + h(item.content) + '</p></li>').join('') + '</ol><button type="button" data-vn-ui="history">收起对话</button></section>' : '';
    const abilities = view.abilities || view.profile.abilities;
    const abilityRow = abilities ? '<dt>学业能力</dt><dd>' + h(abilities.academic) + ' / 100</dd><dt>社交能力</dt><dd>' + h(abilities.social) + ' / 100</dd><dt>运动能力</dt><dd>' + h(abilities.sport) + ' / 100</dd>' : '';
    const dossier = view.profileOpen ? '<section class="vn-dossier" aria-label="' + name + '的人物资料"><h3>' + name + ' · ' + identity + '</h3><p>' + h(view.profile.description) + '</p><dl>' + abilityRow + '<dt>喜欢</dt><dd>' + h(view.profile.preference) + '</dd><dt>擅长</dt><dd>' + h(view.profile.strength) + '</dd><dt>最近的目标</dt><dd>' + h(view.goal) + '</dd><dt>现在的状态</dt><dd>' + h(view.status) + '</dd></dl><h3>你们的共同经历</h3><ul>' + view.memories.map(memory => '<li>' + h(memory) + '</li>').join('') + '</ul><button type="button" data-vn-ui="profile">收起资料</button></section>' : '';
    return '<div class="vn-scene' + (view.chat ? ' has-chat' : '') + '"><img class="vn-background" src="' + h(view.profile.background) + '" alt="午后校园的图书馆与林荫路"><div class="vn-shade"></div><header class="vn-header"><div class="vn-location"><span>北交人生 · 校园日常</span><b>' + h(view.location) + '</b></div><div class="vn-toolbar">' + (view.met ? '<button type="button" data-vn-ui="profile">人物与经历</button>' : '') + '<button type="button" data-vn-ui="history">回看</button><button type="button" data-vn-ui="save">保存</button>' + (view.canClose ? '<button type="button" data-vn-ui="close">结束对话</button>' : '') + '</div></header><div class="vn-character"><img src="' + h(view.profile.portrait) + '" alt="' + name + ' · ' + identity + '"></div><div class="vn-relationship"><span>' + h(view.stage) + '</span>' + (view.met ? '<b>相识度 ' + view.familiarity + ' / 100</b><small>' + h(view.status) + '</small>' : '<small>一段新的相识</small>') + '</div>' + dossier + chatHistory + '<aside class="vn-choices" aria-label="回应' + name + '"><div class="vn-choices-label">' + h(view.choiceTitle || '你想怎么回应？') + '</div>' + choices + '</aside><section class="vn-dialogue' + (view.chat ? ' is-chat' : '') + '" aria-label="' + name + '的对话"><div class="vn-speaker"><strong>' + name + '</strong><span>' + identity + '</span>' + (view.chat ? '<small class="vn-chat-hint">上翻查看前文</small>' : '') + '</div>' + conversation + chat + '<p class="vn-context" role="status">' + h(view.detail || '可以自由聊天，也可以选择右侧回应。') + '</p></section></div>';
  }
  const api = { render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusCharacterScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
