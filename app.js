const places = {
  activity: { title: '学生活动中心', kicker: '主校区 · 社团与活动', description: '百团大战、社团活动和偶遇新朋友的地方。今天的校园生活，从这里开始也不错。', action: '社团活动 · 消耗 2 点行动力', event: '百团大战事件 · 已接入' },
  think: { title: '思源楼', kicker: '主校区 · 课程与自习', description: '课程、助教和一段安静的自习时间。认真走进这栋楼，成绩会记住你的选择。', action: '上课自习 · 消耗 1 点行动力', event: '课程事件 · 已接入' },
  library: { title: '图书馆', kicker: '主校区 · 查资料', description: '把零散的好奇心整理成答案。期末周，这里还会开启一场抢座小游戏。', action: '自习查资料 · 消耗 1 点行动力', event: '期末抢座 · 已接入' },
  hospital: { title: '校医院', kicker: '主校区 · 身体状态', description: '状态不佳时，先照顾好自己。恢复体能，才能继续把校园地图走下去。', action: '恢复状态 · 暂不开放', event: '校医院事件占位 · 后续接入' },
  gate: { title: '南门', kicker: '主校区 · 校园入口', description: '从南门走进来，四年的故事就有了起点。也可以从这里接一份校外家教。', action: '校外家教 · 消耗 3 点行动力', event: '校外家教事件 · 已接入' },
  track: { title: '操场', kicker: '主校区 · 运动与体测', description: '跑道、球场和体测季的倒计时都在这里。先把状态拉回来，再去迎接下一场考试。', action: '球场锻炼 · 消耗 1 点行动力', event: '操场事件占位 · 后续接入' },
  auditorium: { title: '天佑会堂', kicker: '主校区 · 讲座与演出', description: '听一场讲座，或者把晚上的时间交给一场演出。新的方向，常常从一次路过开始。', action: '听讲座 · 消耗 1 点行动力', event: '天佑会堂事件占位 · 后续接入' },
  ginkgo: { title: '银杏大道', kicker: '主校区 · 秋日散步', description: '风一吹，整条路都会变成金色。适合散步，也适合在忙碌的学期里停一会儿。', action: '散步 · 消耗 2 点行动力', event: '银杏季事件占位 · 后续接入' },
  yifu: { title: '逸夫楼', kicker: '主校区 · 课程与项目', description: '新的课程、项目和小组讨论正在这里发生。先找到自己的节奏，故事才会继续展开。', action: '进入教学楼 · 消耗 1 点行动力', event: '逸夫楼事件占位 · 后续接入' },
  dorm: { title: '宿舍', kicker: '主校区 · 生活与休息', description: '一天的课程结束后回到这里，和室友聊聊近况，也把精力留给明天。', action: '回宿舍休息 · 消耗 1 点行动力', event: '宿舍日常事件 · 后续接入' },
  hotel: { title: '红果园宾馆', kicker: '主校区 · 接待与交流', description: '来访的老师、校友和朋友会在这里短暂停留，也是校园里一处安静的会面地点。', action: '接待来访 · 消耗 1 点行动力', event: '红果园宾馆事件 · 后续接入' }
};

const mapScreen = document.querySelector('#mapScreen');
const mapLayer = document.querySelector('#mapLayer');
const placeScreen = document.querySelector('#placeScreen');
const placeTitle = document.querySelector('#placeTitle');
const placeKicker = document.querySelector('#placeKicker');
const placeDescription = document.querySelector('#placeDescription');
const placeAction = document.querySelector('#placeAction');
const placeEvent = document.querySelector('#placeEvent');
const toast = document.querySelector('#toast');
const hotspots = [...document.querySelectorAll('.map-hotspot')];

let activePlace = null;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function openPlace(key) {
  const place = places[key];
  if (!place) return;
  activePlace = key;
  placeTitle.textContent = place.title;
  placeKicker.textContent = place.kicker;
  placeDescription.textContent = place.description;
  placeAction.textContent = place.action;
  placeEvent.textContent = place.event || '地点事件占位 · 后续接入';
  hotspots.forEach((item) => item.classList.toggle('is-active', item.dataset.place === key));
  placeScreen.classList.add('is-open');
  placeScreen.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closePlace() {
  placeScreen.classList.remove('is-open');
  placeScreen.setAttribute('aria-hidden', 'true');
  hotspots.forEach((item) => item.classList.remove('is-active'));
  document.body.style.overflow = '';
  activePlace = null;
}

hotspots.forEach((hotspot) => {
  hotspot.addEventListener('click', () => openPlace(hotspot.dataset.place));
});

document.querySelector('#backButton').addEventListener('click', closePlace);
document.querySelector('#continueButton').addEventListener('click', () => {
  const place = places[activePlace];
  if (place?.action.includes('暂不开放')) showToast('这个地点将在后续版本开放');
  else showToast('地点详情将在下一步接入');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activePlace) closePlace();
});
