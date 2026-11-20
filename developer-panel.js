(function (root) {
  'use strict';
  function install(adapter) {
    const dev = root.CampusDeveloperTools, game = root.CampusGame;
    const panel = document.querySelector('#developerPanel');
    if (!dev || !panel) return null;
    const body = panel.querySelector('[data-dev-body]'), notice = panel.querySelector('[data-dev-notice]');
    const badge = document.querySelector('#developerBadge');
    const recorder = dev.createRecorder(), store = dev.createStore(adapter.storage);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const button = (action, label, value = '') => '<button type="button" data-dev-action="' + action + '" data-value="' + escape(value) + '">' + escape(label) + '</button>';
    const options = (rows, selected) => rows.map(([id, label]) => '<option value="' + escape(id) + '"' + (String(id) === String(selected) ? ' selected' : '') + '>' + escape(label) + '</option>').join('');
    const checks = rows => '<ul class="dev-checks">' + rows.map(row => '<li class="' + (row.met === null ? 'dev-info' : row.met ? 'dev-pass' : 'dev-gap') + '">' + (row.met === null ? '· ' : row.met ? '✓ ' : '缺少：') + escape(row.label) + '</li>').join('') + '</ul>';
    const openSections = new Set();
    const details = (label, content, key = '') => '<details class="dev-details"' + (key ? ' data-dev-section="' + key + '"' + (openSections.has(key) ? ' open' : '') : '') + '><summary>' + escape(label) + '</summary>' + content + '</details>';
    const help = text => details('操作说明', '<p class="dev-help">' + escape(text) + '</p>');
    const conditionDetails = (rows, label = '条件') => {
      const missing = rows.filter(row => row.met === false).length;
      return details(label + (missing ? ' · 缺少 ' + missing + ' 项' : ' · 已满足'), checks(rows));
    };
    let tab = 0, selectedEvent = Object.keys(game.EVENTS)[0], eventSearch = '', selectedPerson = 'zhouNing', selectedEnding = 'ordinary', selectedTestSlot = 1, selectedGrowth = Object.keys(game.GROWTH_NODES)[0];
    let selectedEconomyAction = dev.ECONOMY_ACTIONS[0], selectedAnimal = Object.keys(game.ANIMALS)[0], memoryQuery = '';
    let previousFocus = null, busy = false, memoryJob = null;
    function tell(message, bad = false) { notice.textContent = message; notice.classList.toggle('dev-error', bad); }
    function mark() {
      badge.hidden = !recorder.active;
      panel.querySelector('[data-dev-mode]').textContent = recorder.active ? '测试副本' : '未修改';
      panel.querySelector('[data-dev-mode]').title = recorder.active ? '当前使用独立测试存档' : '首次操作时自动建立隔离测试副本';
      panel.querySelector('[data-dev-action="exit"]').disabled = !recorder.active;
      panel.querySelector('[data-dev-action="exit"]').hidden = !recorder.active;
    }
    function enter() {
      if (recorder.active) return;
      recorder.begin(adapter.capture());
      adapter.testing(true, store);
      const state = adapter.state();
      adapter.replace(state ? dev.clone(state) : dev.semester(null, 1).state);
      mark();
    }
    function mutate(label, operation, reveal = false, after) {
      if (busy) return;
      busy = true;
      try {
        enter();
        const before = dev.clone(adapter.state());
        const result = operation(before);
        if (!result?.ok) {
          recorder.record(label, before, before, result?.reason || '操作未完成');
          tell(result?.reason || '操作未完成', true);
        } else {
          adapter.replace(result.state);
          recorder.record(label, before, result.state);
          tell(label + ' · 已完成');
          render();
          if (reveal) close();
          if (after) after(result.state);
        }
      } catch (error) {
        recorder.record(label, adapter.state(), adapter.state(), error.message);
        tell('操作失败：' + error.message, true);
      } finally { busy = false; }
    }
    function cancelMemory() {
      if (!memoryJob) return;
      memoryJob.controller?.abort(); clearTimeout(memoryJob.timer); memoryJob = null; busy = false;
      panel.removeAttribute('aria-busy');
    }
    async function updateMemory(kind) {
      if (busy) return;
      enter(); busy = true;
      const source = adapter.state(), before = dev.clone(source);
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const job = { controller, timer: controller ? setTimeout(() => controller.abort(), 8000) : null };
      memoryJob = job; panel.setAttribute('aria-busy', 'true');
      const label = kind === 'summary' ? '更新对话摘要' : '触发人物反思';
      tell(label + ' · 正在请求');
      try {
        const result = await dev.refreshMemory(before, selectedPerson, kind, { relay: game.AI_CHAT.relay, fetchFn: typeof fetch === 'function' ? fetch : null, signal: controller?.signal });
        if (memoryJob !== job || adapter.state() !== source) return;
        recorder.record(label, before, result.ok ? result.state : before, result.reason || '');
        if (result.ok) { adapter.replace(result.state); render(); }
        tell(result.ok ? label + ' · 已完成' : result.reason, !result.ok);
      } catch (error) {
        if (memoryJob === job) { recorder.record(label, before, before, error.message); tell(error.message, true); }
      } finally {
        clearTimeout(job.timer);
        if (memoryJob === job) { memoryJob = null; busy = false; panel.removeAttribute('aria-busy'); }
      }
    }
    function economyMarkup(state) {
      const flow = game.economySummary(state), action = game.getAction(state, selectedEconomyAction), allowed = game.availability(state, selectedEconomyAction);
      const grant = game.currentGrant(state);
      const budget = '<form data-dev-form="budget"><div class="dev-fields dev-budget-fields">' + Object.entries(game.BUDGET_DIMENSIONS).map(([key, dimension]) => '<label>' + escape(dimension.title) + '<select name="' + key + '">' + options(dimension.tiers.filter(tier => !tier.legacy).map(tier => [tier.id, tier.label + ' · ' + tier.cost + ' 元']), grant?.budget?.[key] || game.DEFAULT_BUDGET[key]) + '</select></label>').join('') + '</div><button type="submit">重建预算场景</button></form><p class="dev-help">重建本学期开局，按当前余额及预算差额结算；当前学期的行动、人物和动物进度重置。</p>';
      const actionTest = '<label>收入 / 消费<select id="devEconomyAction">' + options(dev.ECONOMY_ACTIONS.map(id => [id, game.ACTIONS[id].title]), selectedEconomyAction) + '</select></label><p class="dev-help">' + escape(allowed.ok ? '可执行' : allowed.reason) + ' · 收入 ' + (action.income || 0) + ' 元 · 支出 ' + (action.money || 0) + ' 元</p><div class="dev-buttons">' + button('economyRun', '按规则执行') + button('economyPrepare', '构造前置场景') + '</div><p class="dev-help">构造场景会重建到开放学期，并补齐成绩、经历与资源。</p>';
      return details('预算与收入测试', '<p>本学期收入 ' + flow.earned + ' 元 · 消费 ' + flow.spent + ' 元 · 待还 ' + flow.debt + ' 元 · ' + escape(game.economyTag(state).label) + '</p><div class="dev-grid"><section>' + budget + '</section><section>' + actionTest + '</section></div>', 'economy');
    }
    function animalMarkup(state) {
      const profile = game.ANIMALS[selectedAnimal], window = game.animalCalmWindow(state, selectedAnimal);
      return details('校园动物', '<form data-dev-form="animal"><div class="dev-person-fields"><label>动物<select id="devAnimal">' + options(Object.entries(game.ANIMALS).map(([id, value]) => [id, value.label]), selectedAnimal) + '</select></label><label>熟悉次数<input name="visits" type="number" min="0" max="2000" step="1" required value="' + (state.animalVisits?.[selectedAnimal] || 0) + '"></label></div><div class="dev-buttons"><button type="submit">设置次数</button>' + button('animalOpen', '打开互动') + button('animalCalm', '抚摸成功') + button('animalStartled', '受惊结果') + button('animalFeed', '喂食') + '</div></form><p class="dev-help">平静窗口 ' + window.start + '～' + window.end + ' 毫秒 · 喂食 ' + profile.price + ' 元。打开互动会替换当前待办；结果测试按游戏规则结算。</p>', 'animals');
    }
    function memoryResults(state) {
      const info = dev.memoryStatus(state, selectedPerson, memoryQuery);
      return '<p>核心档案：' + escape(info.saved?.core?.text || '暂无') + '</p><p>最近反思：' + escape(info.saved?.lastReflection?.text || '暂无') + '</p><p>对话摘要：' + escape(info.summary?.text || '暂无') + '</p><p class="dev-help">历史记忆 ' + info.derived + ' 条 · 摘要' + (info.summaryReady ? '可更新' : '需六轮新对话') + ' · 反思' + (info.reflectionReady ? '可触发' : '尚不满足条件或本学期已尝试') + '</p>' + (info.retrieved.length ? '<ul class="dev-memory-list">' + info.retrieved.map(item => '<li>' + escape(item.text) + ' <small>相关度 ' + item.score.toFixed(2) + '</small></li>').join('') + '</ul>' : '<p class="dev-help">暂无相关经历</p>');
    }
    function memoryMarkup(state) {
      return details(game.npcCast.profile(selectedPerson).name + ' · 长期记忆', '<label>检索话题<input id="devMemoryQuery" value="' + escape(memoryQuery) + '" placeholder="例如：约定、展示、篮球"></label><div id="devMemoryResults">' + memoryResults(state) + '</div><div class="dev-buttons">' + button('memorySummary', '更新对话摘要') + button('memoryReflection', '触发反思') + button('memoryReset', '清除摘要与反思') + '</div><p class="dev-help">更新使用当前在线服务；关闭面板可取消。清除后仍会从真实历史检索共同经历。</p>', 'memory');
    }
    function resourceMarkup(state) {
      const fields = rows => '<div class="dev-fields">' + rows.map(([key, [label, max]]) => '<label>' + label + '<input name="' + key + '" type="number" min="0" max="' + max + '" step="' + (['money','time','energy'].includes(key) ? '1' : 'any') + '" required value="' + state[key] + '"></label>').join('') + '</div>';
      const rows = Object.entries(dev.FIELDS);
      return '<form data-dev-form="resources">' + fields(rows.slice(0, 6)) + details('更多属性', fields(rows.slice(6))) + '<div class="dev-buttons dev-resource-actions"><button type="submit" class="dev-primary">应用修改</button>' + button('energy', '恢复精力') + button('sick', '设为生病') + button('resources', '补足资源') + '</div></form>' + help('补足资源会将金钱提升至至少 10000、时间设为 12、精力设为 100、体能提升至至少 50。行动条件仍按游戏规则检查。');
    }
    function progressMarkup(state) {
      const grant = game.currentGrant(state), budget = game.activeBudget(state);
      const status = { idle: '未开始', active: '进行中', deferred: '已推迟', completed: '已完成', missed: '已错过' };
      return '<div class="dev-toolbar"><label>学期<select id="devSemester">' + options(game.TERM_NAMES.map((name, i) => [i + 1, name]), state.term) + '</select></label><div class="dev-buttons">' + button('semester', '跳转学期') + button('exam', '进入考试') + button('summary', '进入总结') + '</div></div><p class="dev-help">已结算 ' + state.courses.length + '/8 学期 · 均分 ' + game.averageGrade(state).toFixed(1) + '</p><div class="dev-grid"><section><h3>预算与课程</h3><p>' + escape(grant ? (grant.budgetChosen ? '预算已确认' : '预算未确认') + ' · 支出 ' + grant.livingCost + ' 元' : '旧版经济') + '</p>' + details('查看明细', '<p>生活费 ' + (grant?.allowance || 0) + ' 元</p><p>' + escape(budget ? Object.values(budget.items).map(item => item.label || item.title || item.id).join(' / ') : '') + '</p><p>' + escape(state.selectedCourses.map(id => game.courseById(id)?.title || game.courseById(id)?.name || id).join('、') || '尚未选课') + '</p>') + '</section><section><h3>经历进度</h3><div class="dev-progress-list">' + Object.entries(state.chains).map(([id, chain]) => '<div><span>' + escape(({project:'项目',club:'社团',internship:'实习'})[id]) + '</span><span>' + escape(status[chain.status] || chain.status) + ' · ' + chain.progress + '</span></div>').join('') + '</div>' + details('查看详情', '<pre>' + escape(JSON.stringify({ chains: state.chains, internship: game.internshipProgress(state) }, null, 2)) + '</pre>') + '</section></div>' + help('跳转学期会重建场景：沿用角色与种子，之前学期按达标结算，当前学期使用默认预算和三门课程。考试、总结会跳过当前待办；快速总结按正确答案提交。');
    }
    function eventDetail(state) {
      return '<div class="dev-buttons">' + button('event', '立即触发', selectedEvent) + '</div>' + conditionDetails(dev.eventConditions(state, selectedEvent), '触发条件') + help('强制触发会替换当前待办事件。选项仍按规则检查资源，可用于测试成功和失败情形。');
    }
    function eventMarkup(state) {
      const profile = game.npcCast.profile(selectedPerson), person = game.npcCast.get(state, selectedPerson);
      const story = game.npcStoryAvailability(state, selectedPerson);
      return '<div class="dev-grid"><section><h3>事件</h3><label class="dev-search"><span class="dev-sr-only">搜索事件</span><input id="devEventSearch" type="search" value="' + escape(eventSearch) + '" placeholder="搜索名称或编号"></label><label><span class="dev-sr-only">选择事件</span><select id="devEventList">' + eventOptions() + '</select></label><div id="devEventDetail">' + eventDetail(state) + '</div></section><section><h3>人物</h3><form data-dev-form="person"><div class="dev-person-fields"><label>人物<select id="devPerson">' + options(Object.entries(game.npcCast.PROFILES).map(([id, p]) => [id, p.name]), selectedPerson) + '</select></label><label>相识度<input name="familiarity" type="number" min="0" max="100" step="1" required value="' + (person?.familiarity || 0) + '"></label></div><div class="dev-buttons"><button type="submit">应用</button>' + button('personOpen', '打开互动') + '</div></form><p class="dev-help">' + escape(story.ok ? '剧情可触发' : story.reason) + '</p><div class="dev-toolbar"><label>剧情<select id="devStoryChoice">' + options(selectedPerson === 'zhouNing' ? [['start','展示练习']] : [['prepare','认真准备'],['encourage','鼓励支持']]) + '</select></label><div class="dev-buttons">' + button('storyPrepare', '补齐前置') + button('story', '触发剧情') + '</div></div><div class="dev-toolbar"><label>陪同<select id="devCompanionAction">' + options(profile.activities.map(id => [id, game.ACTIONS[id]?.title || id])) + '</select></label><div class="dev-buttons">' + button('companion', '执行陪同') + button('eventCompanion', '参与事件') + '</div></div>' + help('补齐前置会清除待办，恢复资源和人物精力，重置该人物剧情与本学期互动次数。陪同仍按游戏规则检查。') + '</section></div>';
    }
    function eventOptions() {
      const query = eventSearch.trim().toLowerCase();
      const rows = Object.entries(game.EVENTS).filter(([id, event]) => (id + event.title).toLowerCase().includes(query));
      if (rows.length && !rows.some(([id]) => id === selectedEvent)) selectedEvent = rows[0][0];
      return rows.length ? options(rows.map(([id, event]) => [id, event.title + ' · ' + id]), selectedEvent) : '<option value="">没有匹配事件</option>';
    }
    function growthMarkup(state) {
      const evaluation = game.evaluateEndings(state), route = evaluation.options.find(row => row.id === selectedEnding);
      const growth = game.growthStatus(state), node = growth.nodes.find(item => item.id === selectedGrowth);
      return '<div class="dev-grid"><section><h3>养成 <small>已拥有 ' + growth.ownedCount + '/' + growth.nodes.length + '</small></h3><label>节点<select id="devGrowth">' + options(growth.nodes.map(item => [item.id, item.title + (item.purchased ? ' · 已拥有' : '')]), selectedGrowth) + '</select></label><p>' + escape(node.purchased ? '已拥有' : node.price + ' 元 · ' + (node.reason || '可购买')) + '</p><p class="dev-help">' + escape(node.benefit) + '</p><div class="dev-buttons">' + (node.purchased ? button('growthReset','重置节点',node.id) : button('growthBuy','购买',node.id) + button('growthUnlock','强制解锁',node.id)) + '</div>' + conditionDetails(node.requirements, '解锁条件') + details('更多操作', '<div class="dev-buttons">' + button('growthResetAll','重置全部养成') + '</div><p class="dev-help">重置同时移除依赖节点，不退款，不撤回已经获得的收益和经历。</p>') + '</section><section><h3>结局</h3><label>路线<select id="devEnding">' + options(Object.entries(dev.ENDINGS), selectedEnding) + '</select></label><p class="dev-help">已结算 ' + state.courses.length + '/8 · 均分 ' + evaluation.average.toFixed(1) + ' · 达标 ' + evaluation.passed + '/8</p><div class="dev-buttons">' + button('endingPrepare','补齐路线条件') + button('endingPreview','预览结局') + '</div>' + (route ? conditionDetails(route.requirements, '毕业条件') : '<p class="dev-help">' + escape(['cheatNote','cardThief'].includes(selectedEnding) ? '由作弊或校园卡追查选项触发。' : '毕业基础条件不足时可选。') + '</p>') + help('补齐路线条件会重建八学期成绩及准备条件，进入毕业选择页；特殊终局进入对应考试或追查场景。预览结局使用测试数据打开结局页面。') + '</section></div>';
    }
    function recordsMarkup(state) {
      const points = recorder.checkpoints();
      const entries = recorder.entries.slice(-30).reverse();
      const log = rows => '<ol class="dev-log">' + rows.map(entry => {
        const summary = entry.reason || Object.entries(entry.changes).filter(([, change]) => change.from !== null).map(([key, change]) => dev.FIELDS[key][0] + ' ' + change.from + ' → ' + change.to).join('；') || '进度已更新';
        return '<li class="' + (entry.ok ? '' : 'dev-error') + '"><b>' + escape(entry.label) + '</b><small>' + escape(entry.at.slice(11,19)) + '</small><p title="' + escape(summary) + '">' + escape(summary) + '</p></li>';
      }).join('') + '</ol>';
      return '<div class="dev-grid"><section><h3>恢复</h3><form data-dev-form="checkpoint" class="dev-toolbar"><label><span class="dev-sr-only">检查点名称</span><input name="label" maxlength="60" placeholder="检查点名称（可选）"></label><button type="submit">创建检查点</button></form>' + points.map(point => '<div class="dev-checkpoint"><span>' + escape(point.label) + ' <small>第 ' + point.term + ' 学期</small></span>' + button('checkpointRestore','恢复',point.id) + '</div>').join('') + '<div class="dev-toolbar dev-save-row"><label><span class="dev-sr-only">测试存档</span><select id="devSaveSlot">' + options([1,2,3].map(id => [id, '测试栏位 ' + id]), selectedTestSlot) + '</select></label><div class="dev-buttons">' + button('save','保存') + button('load','读取') + button('backup','上一备份') + '</div></div>' + details('存档状态', '<p class="dev-help">' + escape(store.inspect().slots.map(slot => '测试 ' + slot.id + '：' + (slot.primary.ok ? game.TERM_NAMES[slot.primary.state.term - 1] : slot.primary.reason)).join('；')) + '</p>') + help('本页保留最近 5 个检查点，刷新后清空。测试存档可跨刷新读取，与正常存档分开。') + '</section><section><div class="dev-section-heading"><h3>最近操作</h3>' + button('export','导出日志') + '</div>' + (entries.length ? log(entries.slice(0,5)) + (entries.length > 5 ? details('更多记录', log(entries.slice(5))) : '') : '<p class="dev-help">暂无操作记录</p>') + details('游戏历史与失败记录', '<pre>' + escape(JSON.stringify({ operations: state.history.slice(-15), failures: adapter.failures().slice(-15) }, null, 2)) + '</pre>') + '</section></div>';
    }
    function render() {
      body.querySelectorAll('details[data-dev-section]').forEach(section => {
        if (section.open) openSections.add(section.dataset.devSection);
        else openSections.delete(section.dataset.devSection);
      });
      mark();
      panel.querySelectorAll('[data-dev-tab]').forEach((node, index) => { node.setAttribute('aria-selected', String(index === tab)); node.tabIndex = index === tab ? 0 : -1; });
      const state = adapter.state();
      body.setAttribute('aria-labelledby', 'developerTab' + tab);
      body.innerHTML = state ? [resourceMarkup, progressMarkup, eventMarkup, growthMarkup, recordsMarkup][tab](state) : '<div class="dev-empty"><h3>尚未进入游戏</h3><p>可以先开始正常游戏，也可以直接建立独立测试场景。</p>' + button('create','创建大一测试场景') + (tab === 4 ? '<div class="dev-buttons"><select id="devSaveSlot">' + options([1,2,3].map(id => [id,'测试栏位 ' + id])) + '</select>' + button('load','读取测试副本') + '</div>' : '') + '</div>';
      if (state && tab === 1) body.insertAdjacentHTML('beforeend', economyMarkup(state));
      if (state && tab === 2) body.insertAdjacentHTML('beforeend', animalMarkup(state) + memoryMarkup(state));
      const slot = body.querySelector('#devSaveSlot');
      if (slot) slot.value = String(selectedTestSlot);
    }
    function open() {
      if (panel.open) return;
      previousFocus = document.activeElement;
      adapter.pause(true);
      render();
      panel.showModal();
      panel.querySelector('[data-dev-tab="' + tab + '"]').focus();
    }
    function close() {
      if (!panel.open) return;
      cancelMemory();
      panel.close();
      adapter.pause(false);
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
    }
    function exportReport() {
      const state = adapter.state();
      const report = { format: 'bjtu-developer-report-v1', at: new Date().toISOString(), appVersion: game.RULES.appVersion, testing: recorder.active, userAgent: navigator.userAgent, scene: state ? { seed: state.rng.seed, term: state.term, phase: state.phase } : null, developerOperations: recorder.entries, failures: dev.clone(adapter.failures()), checkpoints: recorder.checkpoints(), finalState: dev.clone(state) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = '北交人生-问题日志-' + Date.now() + '.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      tell('问题日志已导出');
    }
    panel.addEventListener('submit', event => {
      const form = event.target.closest('[data-dev-form]');
      if (!form) return;
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (busy) return;
      const data = new FormData(form);
      if (form.dataset.devForm === 'resources') mutate('修改角色资源', state => dev.applyFields(state, Object.fromEntries([...data].map(([key,value]) => [key,Number(value)]))));
      if (form.dataset.devForm === 'person') mutate('调整' + game.npcCast.profile(selectedPerson).name + '相识度', state => dev.person(state, selectedPerson, Number(data.get('familiarity'))));
      if (form.dataset.devForm === 'budget') mutate('重建预算场景', state => dev.budgetScene(state, Object.fromEntries(data)));
      if (form.dataset.devForm === 'animal') mutate('调整动物熟悉次数', state => dev.animalVisits(state, selectedAnimal, Number(data.get('visits'))));
      if (form.dataset.devForm === 'checkpoint') { enter(); const id = recorder.checkpoint(adapter.state(), data.get('label')); recorder.record('创建检查点 ' + id, adapter.state(), adapter.state()); tell('已创建检查点 ' + id); render(); }
    });
    panel.addEventListener('input', event => {
      if (event.target.id === 'devMemoryQuery') { memoryQuery = event.target.value; panel.querySelector('#devMemoryResults').innerHTML = memoryResults(adapter.state()); return; }
      if (event.target.id !== 'devEventSearch') return;
      eventSearch = event.target.value;
      panel.querySelector('#devEventList').innerHTML = eventOptions();
      panel.querySelector('#devEventDetail').innerHTML = panel.querySelector('#devEventList').value ? eventDetail(adapter.state()) : '<p>没有匹配事件。</p>';
    });
    panel.addEventListener('change', event => {
      if (event.target.id === 'devEventList' && event.target.value) { selectedEvent = event.target.value; panel.querySelector('#devEventDetail').innerHTML = eventDetail(adapter.state()); }
      if (event.target.id === 'devPerson') { selectedPerson = event.target.value; render(); }
      if (event.target.id === 'devEnding') { selectedEnding = event.target.value; render(); }
      if (event.target.id === 'devGrowth') { selectedGrowth = event.target.value; render(); }
      if (event.target.id === 'devSaveSlot') selectedTestSlot = Number(event.target.value);
      if (event.target.id === 'devEconomyAction') { selectedEconomyAction = event.target.value; render(); }
      if (event.target.id === 'devAnimal') { selectedAnimal = event.target.value; render(); }
    });
    panel.addEventListener('toggle', event => {
      const key = event.target.dataset.devSection;
      if (!key || !body.contains(event.target)) return;
      if (event.target.open) openSections.add(key); else openSections.delete(key);
    }, true);
    panel.addEventListener('click', event => {
      const node = event.target.closest('button');
      if (!node) return;
      if (node.dataset.devTab !== undefined) { tab = Number(node.dataset.devTab); render(); body.scrollTop = 0; return; }
      const action = node.dataset.devAction, value = node.dataset.value;
      const read = id => panel.querySelector('#' + id)?.value;
      if (action === 'close') { close(); return; }
      if (action === 'expand') { const expanded = panel.classList.toggle('dev-expanded'); node.textContent = expanded ? '收起' : '展开'; node.setAttribute('aria-expanded', String(expanded)); return; }
      if (action === 'exit') {
        cancelMemory();
        const snapshot = recorder.exit(); if (!snapshot) return;
        adapter.testing(false); adapter.restore(snapshot); recorder.record('退出测试并恢复原进度', null, adapter.state());
        mark(); render(); tell('已恢复原进度'); return;
      }
      if (action === 'export') { exportReport(); return; }
      if (busy) return;
      if (action === 'memorySummary' || action === 'memoryReflection') { updateMemory(action === 'memorySummary' ? 'summary' : 'reflection'); return; }
      if (['animalOpen', 'animalCalm', 'animalStartled', 'animalFeed'].includes(action)) {
        const choice = ({ animalCalm: 'calm', animalStartled: 'startled', animalFeed: 'feed' })[action];
        mutate('构造校园动物场景', state => dev.animalScene(state, selectedAnimal), false, next => {
          close();
          adapter.animal(selectedAnimal, next, choice);
        });
        return;
      }
      if (action === 'save') {
        enter(); const result = store.save(adapter.state(), Number(read('devSaveSlot')));
        recorder.record('保存独立测试存档', adapter.state(), adapter.state(), result.ok ? '' : result.reason);
        tell(result.ok ? '已保存到独立测试栏位' : result.reason, !result.ok); render(); return;
      }
      if (action === 'load' || action === 'backup') { const result = store.load(Number(read('devSaveSlot')), action === 'backup' ? 'backup' : 'primary'); mutate('读取独立测试存档', () => result); return; }
      if (action === 'personOpen') {
        if (!game.npcCast.get(adapter.state(), selectedPerson)) { tell('请先应用相识度以认识人物', true); return; }
        enter(); close(); adapter.character(selectedPerson); return;
      }
      const operations = {
        create: state => dev.semester(state, 1),
        energy: state => dev.applyFields(state, { energy: 100 }), sick: state => dev.applyFields(state, { fitness: 0 }),
        resources: state => dev.applyFields(state, { money: Math.max(10000,state.money), time: 12, energy: 100, fitness: Math.max(50,state.fitness) }),
        semester: state => dev.semester(state, Number(read('devSemester'))), exam: state => dev.exam(state), summary: state => dev.exam(state, true),
        event: state => dev.forceEvent(state, value), storyPrepare: state => dev.prepareStory(state, selectedPerson),
        story: state => game.runNpcStory(state, { npcId: selectedPerson, choice: read('devStoryChoice') }, { npcSupportVersion: 1 }),
        companion: state => read('devCompanionAction') === 'basketball' ? { ok: false, reason: '投篮需要真实操作，请打开人物互动并选择投篮' } : game.executeAction(state, read('devCompanionAction'), { companionId: selectedPerson, characterVersion: 2, npcCastVersion: 1, npcSupportVersion: 1 }),
        eventCompanion: state => game.attachNpcToEvent(state, selectedPerson),
        economyRun: state => game.executeAction(state, selectedEconomyAction, { npcCastVersion: 1, npcSupportVersion: 1 }),
        economyPrepare: state => dev.prepareEconomyAction(state, selectedEconomyAction),
        memoryReset: state => dev.resetMemory(state, selectedPerson),
        growthBuy: state => dev.growth(state,value,'buy'), growthUnlock: state => dev.growth(state,value,'unlock'), growthReset: state => dev.growth(state,value,'reset'), growthResetAll: state => dev.growth(state,null,'resetAll'),
        endingPrepare: state => dev.ending(state,selectedEnding), endingPreview: state => dev.ending(state,selectedEnding,true), checkpointRestore: () => recorder.restore(Number(value))
      };
      if (operations[action]) mutate(node.textContent, operations[action], ['event','exam','summary','story','companion','endingPrepare','endingPreview'].includes(action));
    });
    panel.addEventListener('keydown', event => {
      const node = event.target.closest('[data-dev-tab]');
      if (!node || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); tab = event.key === 'Home' ? 0 : event.key === 'End' ? 4 : (tab + (event.key === 'ArrowRight' ? 1 : 4)) % 5;
      render(); body.scrollTop = 0; panel.querySelector('[data-dev-tab="' + tab + '"]').focus();
    });
    panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && panel.open) { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      if (event.code !== 'Backquote' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      if (event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault(); event.stopImmediatePropagation(); if (panel.open) close(); else open();
    }, true);
    badge.addEventListener('click', open);
    for (const name of ['error','unhandledrejection']) root.addEventListener(name, event => recorder.record('页面异常', adapter.state(), adapter.state(), event.message || event.reason?.message || String(event.reason)));
    return { get active() { return recorder.active; }, get open() { return panel.open; }, record(label,before,after,reason) { if (recorder.active) recorder.record(label,before,after,reason); }, refresh() { if (panel.open) render(); } };
  }
  root.CampusDeveloperPanel = { install };
})(globalThis);
