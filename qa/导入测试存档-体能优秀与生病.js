// 使用前：
// 1. 在本地 0.5.4 版本上打开 http://127.0.0.1:8765/
// 2. 打开浏览器 DevTools -> Console，整段粘贴本文件并回车
// 3. 会覆盖 2 号栏位（体能优秀）和 3 号栏位（生病），然后自动刷新
// 4. 在“读取进度”里选择 2 或 3 号栏位
// 注意：localStorage 按协议/域名/端口隔离，必须在游戏页面同源执行。
(() => {
  const excellent = {
  "saveFormatVersion": 1,
  "rulesVersion": 3,
  "appVersion": "0.5.4",
  "saveSequence": 1,
  "savedAt": "2026-10-31T15:00:28.110Z",
  "state": {
    "version": 3,
    "rulesVersion": 3,
    "saveFormatVersion": 1,
    "appVersion": "0.5.4",
    "nickname": "体能优秀",
    "background": {
      "id": "engineering",
      "college": "工程类学院",
      "major": "机械工程"
    },
    "rng": {
      "algorithm": "mulberry32-v1",
      "seed": "excellent-save",
      "value": 2341677475,
      "calls": 2
    },
    "term": 1,
    "phase": "playing",
    "revision": 1,
    "processedCommands": [
      "rule:1:selectCourses"
    ],
    "time": 12,
    "energy": 80,
    "money": 1000,
    "social": 20,
    "fitness": 90,
    "mood": 70,
    "preparation": 0,
    "furtherStudy": 0,
    "jobPreparation": 0,
    "counts": {},
    "courses": [],
    "selectedCourses": [
      "calc1",
      "english1",
      "ethics"
    ],
    "exam": null,
    "history": [
      {
        "action": "selectCourses",
        "title": "完成选课",
        "term": 1,
        "revision": 1,
        "commandId": "rule:1:selectCourses",
        "command": {
          "operation": "selectCourses",
          "id": [
            "calc1",
            "english1",
            "ethics"
          ]
        },
        "before": {
          "term": 1,
          "phase": "playing",
          "time": 12,
          "energy": 80,
          "money": 1000,
          "preparation": 0,
          "pendingEvent": null,
          "rngCalls": 2
        },
        "after": {
          "term": 1,
          "phase": "playing",
          "time": 12,
          "energy": 80,
          "money": 1000,
          "preparation": 0,
          "pendingEvent": null,
          "rngCalls": 2
        }
      }
    ],
    "summary": null,
    "pendingEvent": null,
    "eventQueue": [],
    "eventFlags": {},
    "eventHistory": [],
    "experiences": [],
    "chains": {
      "project": {
        "status": "idle",
        "progress": 0,
        "startedTerm": 0,
        "deadline": 0,
        "nextEligibleTerm": 1,
        "reviewAfter": 0
      },
      "club": {
        "status": "idle",
        "progress": 0,
        "startedTerm": 0,
        "deadline": 0,
        "nextEligibleTerm": 1,
        "reviewAfter": 0
      },
      "internship": {
        "status": "idle",
        "progress": 0,
        "startedTerm": 0,
        "deadline": 0,
        "nextEligibleTerm": 1,
        "reviewAfter": 0
      }
    },
    "endingOptions": null,
    "result": null,
    "npcChats": {}
  }
};
  const sick = {
  "saveFormatVersion": 1,
  "rulesVersion": 3,
  "appVersion": "0.5.4",
  "saveSequence": 1,
  "savedAt": "2026-10-31T15:00:28.112Z",
  "state": {
    "version": 3,
    "rulesVersion": 3,
    "saveFormatVersion": 1,
    "appVersion": "0.5.4",
    "nickname": "生病测试",
    "background": {
      "id": "management",
      "college": "经管类学院",
      "major": "经济学"
    },
    "rng": {
      "algorithm": "mulberry32-v1",
      "seed": "sick-save",
      "value": 1943427493,
      "calls": 2
    },
    "term": 1,
    "phase": "playing",
    "revision": 1,
    "processedCommands": [
      "rule:1:selectCourses"
    ],
    "time": 12,
    "energy": 80,
    "money": 1000,
    "social": 20,
    "fitness": 10,
    "mood": 70,
    "preparation": 0,
    "furtherStudy": 0,
    "jobPreparation": 0,
    "counts": {},
    "courses": [],
    "selectedCourses": [
      "calc1",
      "english1",
      "ethics"
    ],
    "exam": null,
    "history": [
      {
        "action": "selectCourses",
        "title": "完成选课",
        "term": 1,
        "revision": 1,
        "commandId": "rule:1:selectCourses",
        "command": {
          "operation": "selectCourses",
          "id": [
            "calc1",
            "english1",
            "ethics"
          ]
        },
        "before": {
          "term": 1,
          "phase": "playing",
          "time": 12,
          "energy": 80,
          "money": 1000,
          "preparation": 0,
          "pendingEvent": null,
          "rngCalls": 2
        },
        "after": {
          "term": 1,
          "phase": "playing",
          "time": 12,
          "energy": 80,
          "money": 1000,
          "preparation": 0,
          "pendingEvent": null,
          "rngCalls": 2
        }
      }
    ],
    "summary": null,
    "pendingEvent": null,
    "eventQueue": [],
    "eventFlags": {},
    "eventHistory": [],
    "experiences": [],
    "chains": {
      "project": {
        "status": "idle",
        "progress": 0,
        "startedTerm": 0,
        "deadline": 0,
        "nextEligibleTerm": 1,
        "reviewAfter": 0
      },
      "club": {
        "status": "idle",
        "progress": 0,
        "startedTerm": 0,
        "deadline": 0,
        "nextEligibleTerm": 1,
        "reviewAfter": 0
      },
      "internship": {
        "status": "idle",
        "progress": 0,
        "startedTerm": 0,
        "deadline": 0,
        "nextEligibleTerm": 1,
        "reviewAfter": 0
      }
    },
    "endingOptions": null,
    "result": null,
    "npcChats": {}
  }
};
  const entries = {
    'bjtu-life:mvp:slot:2:main': excellent,
    'bjtu-life:mvp:slot:3:main': sick
  };
  for (const [key, value] of Object.entries(entries)) {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.removeItem(key.replace(':main', ':backup'));
    localStorage.removeItem(key.replace(':main', ':temporary'));
  }
  location.reload();
})();
