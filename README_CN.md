# MCI Concord — 多智能体对话演化系统

三个 AI Agent 模拟 MCI Concord 监狱（1878–2024）拆除事件中的真实社会冲突。每个 Agent 拥有不可调和的立场、独立知识库（RAG），并接入波士顿实时天气数据。

| Agent | 角色 | 立场 |
|---|---|---|
| **Agent_Prison** | 监狱建筑本身 | 拒绝拆除。通过墙壁和管道感知世界。 |
| **Agent_Developer** | DCAMM / 州政府开发商 | 要求快速拆除以进行住宅开发。 |
| **Agent_Town** | Concord 小镇委员会 | 保护基础设施、交通和历史遗迹。 |

## 技术栈

| 层级 | 技术 |
|---|---|
| 后端 | Python 3.10+ / FastAPI / uvicorn |
| LLM | Gemini API（`google-generativeai` SDK） |
| 嵌入模型 | `gemini-embedding-001` |
| 向量数据库 | ChromaDB（本地持久化） |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 实时通信 | FastAPI 原生 WebSocket |
| 天气数据 | OpenWeatherMap API（波士顿坐标） |

## 快速开始

### 1. 克隆 & 安装

```bash
git clone <repo-url>
cd MultiAgent_Concord_Claude_1

# 后端
python -m venv .venv
# Windows:
.venv\Scripts\pip install -r backend/requirements.txt
# macOS/Linux:
# .venv/bin/pip install -r backend/requirements.txt

# 前端
cd frontend
npm install
cd ..
```

### 2. 配置 API Key

```bash
cp .env.example .env
```

编辑 `.env`，填入：
- `GEMINI_API_KEY` — 从 [Google AI Studio](https://aistudio.google.com) 获取
- `OPENWEATHER_API_KEY` — 从 [OpenWeatherMap](https://openweathermap.org) 获取（免费层即可）

### 3. 启动后端

```bash
# Windows:
.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8000

# macOS/Linux:
# .venv/bin/uvicorn backend.main:app --reload --port 8000
```

### 4. 启动前端（新开一个终端）

```bash
cd frontend
npm run dev
```

### 5. 在浏览器中打开

| 地址 | 用途 |
|---|---|
| `http://localhost:5173` | 对话界面 — 观看 Agent 辩论 |
| `http://localhost:5173/admin` | 管理后台 — 编辑人设 & 管理知识库 |

## 使用说明

### 对话界面

- **NEXT TURN** — 手动触发一轮对话
- **START AUTO** — Agent 每 20 秒自动对话
- **STOP** — 暂停自动模式
- **RESET** — 清空对话历史

首次触发时，系统会自动初始化 RAG 知识库（向量化 `RAGKnowledgebase/` 下所有文件）。大约需要 1–2 分钟，此后数据持久化在 `data/chroma_db/`，重启无需重新初始化。

### 管理后台

**System Prompt** — 选择 Agent，编辑人设，点击 SAVE。更改在下一轮对话立即生效。

**知识库（RAG）** — 管理页面底部：
- 查看每个 Agent 已加载的文档
- **UPLOAD** — 上传 .md / .txt / .pdf 文件到任意 Agent 的知识库
- **DELETE** — 删除文档及其向量
- **INIT ALL** — 批量向量化所有文件（仅在 `data/chroma_db/` 被删除时需要）

## 项目结构

```
├── backend/
│   ├── main.py                  # FastAPI 入口 + WebSocket
│   ├── config.py                # 环境变量和常量
│   ├── core/
│   │   ├── orchestrator.py      # 主对话循环
│   │   ├── routing_engine.py    # 三层发言者选择引擎
│   │   ├── prompt_assembler.py  # SP + 天气 + RAG + 历史 组装
│   │   └── stance_guard.py      # 防止 Agent 妥协
│   ├── agents/
│   │   ├── base_agent.py        # Agent 基类（Gemini 调用 + 重试）
│   │   ├── agent_prison.py
│   │   ├── agent_developer.py
│   │   └── agent_town.py
│   ├── rag/
│   │   ├── vector_store.py      # ChromaDB 封装（三个独立 collection）
│   │   ├── document_processor.py # MD/TXT/PDF 解析 + 分块
│   │   └── retriever.py         # 语义检索 + 批量初始化
│   ├── services/
│   │   ├── gemini_service.py    # Gemini API + 结构化 JSON 输出
│   │   └── weather_service.py   # OpenWeatherMap + 5分钟缓存
│   └── api/
│       ├── routes_chat.py       # /api/chat/* 端点
│       ├── routes_admin.py      # /api/admin/*（人设 + RAG 管理）
│       └── websocket.py         # WS 连接管理 + 广播
│
├── frontend/src/
│   ├── pages/ChatPage.tsx       # 主对话 UI
│   ├── pages/AdminPage.tsx      # 管理后台
│   ├── components/
│   │   ├── MessageBubble.tsx    # Agent 消息气泡（按 Agent 定位）
│   │   ├── WeatherBar.tsx       # 顶部波士顿天气栏
│   │   ├── AgentIndicator.tsx   # Agent 状态灯
│   │   └── admin/KnowledgeManager.tsx  # RAG 文件管理 UI
│   ├── hooks/useWebSocket.ts    # WS 连接 hook
│   └── store/conversationStore.ts  # Zustand 状态管理
│
├── RAGKnowledgebase/            # 知识库文件（自动向量化）
│   ├── AgentPrison_knowledgebase/   # 5 个文件（Malcolm X、建筑历史等）
│   ├── AgentDeveloper_knowledgebase/ # 5 个文件（Section 107、土地策略等）
│   └── AgentTown_knowledgebase/     # 5 个文件 + 1 个 PDF（污水处理、交通、规划报告）
│
├── System Prompt Agent_Prison.md    # 监狱人设定义
├── System Prompt Agent_Developer.md # 开发商人设定义
├── System Prompt Agent_Town.md      # 小镇人设定义
└── data/                            # 运行时数据（已 gitignore）
    └── chroma_db/                   # 持久化向量存储
```

## 核心架构

### 对话路由引擎（三层决策）

每个 Agent 的 Gemini 响应包含结构化元数据：

```json
{
  "speech": "实际发言内容",
  "directed_at": "Agent_Prison | Agent_Developer | Agent_Town | ALL | NONE",
  "emotional_state": "DEFIANT | THREATENING | PLEADING | CALCULATING | ...",
  "urgency_score": 8,
  "implicit_challenge_to": "Agent_Town | NONE"
}
```

**Layer 1 — 硬规则**：Agent 明确点名某人（`directed_at`）→ 该 Agent 下一个发言（除非已连续发言两次）。

**Layer 2 — 权重计算**：情绪状态、隐性挑战、天气条件、连续发言惩罚 → 为每个候选人计算权重。

**Layer 3 — 加权随机**：通过 `random.choices()` 最终选择，防止对话僵化。

### Prompt 组装（每轮）

```
System Instruction = System Prompt + 实时天气 + 立场锁定指令 + JSON 格式要求
Contents = [RAG 记忆 (top-3 chunks)] + [对话历史 (最近 10 条)] + [触发指令]
```

### 立场守卫

基于关键词的验证器，拒绝 Agent 软化立场的响应。失败的响应会以更高 temperature 重新生成（最多重试 2 次）。

## API 参考

### 对话

| 方法 | 端点 | 说明 |
|---|---|---|
| POST | `/api/chat/trigger` | 触发一轮对话（可选 `force_speaker`） |
| POST | `/api/chat/auto/start` | 启动自动模式（`interval_seconds` 参数） |
| POST | `/api/chat/auto/stop` | 停止自动模式 |
| POST | `/api/chat/reset` | 清空对话历史 |
| GET | `/api/chat/history` | 获取所有消息 |

### 管理

| 方法 | 端点 | 说明 |
|---|---|---|
| GET | `/api/admin/agents` | 获取所有 Agent 的 System Prompt |
| PUT | `/api/admin/agents/{id}` | 更新 Agent 的 System Prompt |
| GET | `/api/admin/rag/status` | 所有 Agent 的 RAG 状态 |
| GET | `/api/admin/rag/{id}` | 列出某 Agent 的文档 |
| POST | `/api/admin/rag/{id}/upload` | 上传文件（multipart/form-data） |
| DELETE | `/api/admin/rag/{id}/{filename}` | 删除文件及其向量 |
| POST | `/api/admin/rag/init` | 批量向量化所有知识库文件 |

### WebSocket

连接 `ws://localhost:8000/ws`，发送 JSON 消息：

```json
{"type": "start_auto_mode", "interval_seconds": 20}
{"type": "stop_auto_mode"}
{"type": "trigger"}
{"type": "trigger", "force_speaker": "Agent_Prison"}
{"type": "reset"}
```

## 环境变量

详见 `.env.example`。关键配置：

| 变量 | 必填 | 说明 |
|---|---|---|
| `GEMINI_API_KEY` | 是 | Google AI Studio API key |
| `OPENWEATHER_API_KEY` | 是 | OpenWeatherMap API key（免费层） |
| `GEMINI_MODEL` | 否 | 默认：`gemini-2.5-flash` |
| `AUTO_MODE_INTERVAL` | 否 | 自动模式间隔秒数（默认：15） |
| `RAG_TOP_K` | 否 | 每次检索返回的 chunk 数（默认：3） |
| `DEBUG` | 否 | 设为 `true` 可通过 WS 广播路由权重 |

## 添加知识库文件

1. 将 `.md`、`.txt` 或 `.pdf` 文件放入对应的 `RAGKnowledgebase/Agent*_knowledgebase/` 目录
2. 进入 Admin → 知识库 → 点击 **INIT ALL**，或通过 UI 上传
3. 文件会被分块（512 字符，64 重叠）、嵌入并存入 ChromaDB
4. Agent 在对话中会自动引用相关内容

## 注意事项

- **持久化**：`data/chroma_db/` 中的向量数据在重启后保留。只有删除该目录才需要重新初始化。
- **52MB PDF**：Town Agent 有一个大型 Vision Plan PDF，首次向量化可能需要几分钟。
- **天气降级**：如果 OpenWeatherMap key 无效或达到速率限制，系统使用降级数据（45°F，未知天气）—— Agent 仍正常工作。
- **设计风格**：前端采用 Nothing Phone 风格的极简黑白美学。
