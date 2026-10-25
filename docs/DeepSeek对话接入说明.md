# DeepSeek 在线对话接入说明

NPC 对话默认使用本地台词库，离线可用。配置云函数中转后，地图上点击 NPC 会多出一个输入框，玩家打字后 NPC 按身份人设用 DeepSeek 在线回答；中转不可达或超时自动回退本地台词，聊天不中断。

DeepSeek 不需要训练模型：中转函数把「人物设定 + 玩家背景 + 聊天记录」发给 `deepseek-chat` 接口，模型按人设回答。

## 一、申请 DeepSeek API Key

1. 打开 https://platform.deepseek.com 注册并登录（手机号即可）。
2. 在「充值」页充值少量金额（对话按 token 计费，`deepseek-chat` 单价很低，测试用几块钱足够）。
3. 在「API Keys」页点击创建，得到一串 `sk-` 开头的密钥。**密钥不要发给任何人，也不要写进前端代码或提交到仓库。**

## 二、部署中转云函数（二选一）

前端是静态页面，密钥不能放前端，所以由云函数中转：前端 → 云函数 → DeepSeek。

### 方案 A：阿里云函数计算（HTTP 触发器）

1. 登录阿里云控制台 → 函数计算 FC → 创建函数，函数类型选 **事件函数**，运行环境选 **Node.js 20**，触发器选 **HTTP 触发器**（请求方式 POST）。
2. 代码上传 `scripts/deepseek-relay.js`（它导出事件函数入口 `handler` 和 `main`，请求处理程序填 `deepseek-relay.handler` 或 `deepseek-relay.main` 均可）。
3. 在函数配置里添加环境变量：`DEEPSEEK_API_KEY` = 你的密钥。
4. 部署后在触发器详情里拿到公网 URL，形如 `https://xxx.cn-hangzhou.fcapp.run`。线上转发逻辑会自动兼容对象与 Buffer 形式的事件、CORS 预检与控制台测试。

### 方案 B：华为云函数工作流 FunctionGraph（API 网关触发器）

1. 登录华为云控制台 → 函数工作流 → 创建函数，运行时选 **Node.js 20**，触发器选 API 网关（POST）。
2. 代码上传 `scripts/deepseek-relay.js`（它导出的入口是 `main`）。
3. 添加环境变量：`DEEPSEEK_API_KEY` = 你的密钥。
4. 部署后拿到 API 网关的 HTTPS 调用地址。

### 本地先试跑（可选）

中转逻辑可以不部署直接在本地验证：

```
set DEEPSEEK_API_KEY=sk-你的密钥
node scripts/deepseek-relay.js "{\"messages\":[{\"role\":\"system\",\"content\":\"你是食堂阿姨\"},{\"role\":\"user\",\"content\":\"今天有什么好吃的？\"}]}"
```

返回 `200 {"reply": "..."}` 即表示密钥和中转都通。

## 三、接入游戏

1. 打开 `config.js`，找到末尾的 `AI_CHAT`：
   - `relay`：填第二步拿到的云函数地址，例如 `'https://xxx.cn-hangzhou.fc.aliyuncs.com/...'`。
   - `timeoutMs`：超时毫秒数，默认 15000，可留空。
2. 把页面和改好的 `config.js` 一起重新发布/部署。
3. 验收：打开游戏 → 入学 → 回到地图，等 NPC 出现后点击 → 输入一句「你好」→ NPC 按身份回话；把 `relay` 改回空字符串或断网，NPC 自动回本地台词并提示。

## 四、安全与成本

- 密钥只存在于云函数的环境变量中，前端和仓库里都没有；`deepseek-relay.js` 任何情况下都不会把密钥返回给前端。
- 中转做了基本防护：最多透传 14 条消息、每条内容截断到 600 字符、回复截断到 400 字符、20 秒超时；CORS 仅允许 POST/OPTIONS。正式发布如需更严，可在云函数上加请求限流与告警（阿里云/华为云控制台均有现成配置）。
- DeepSeek 按 token 计费，每次对话消耗很少；若担心费用可在控制台设置余额告警。
- 不改动存档格式：在线对话和本地台词一样属于观感层，不写入存档。
