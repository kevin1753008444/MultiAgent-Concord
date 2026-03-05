# MCI Concord — Multi-Agent Dialogue System

Three AI agents simulate the real-world conflict over the demolition of MCI Concord Prison (1878–2024). Each agent has an irreconcilable stance, independent knowledge base (RAG), and is grounded in real-time Boston weather data.

| Agent | Role | Stance |
|---|---|---|
| **Agent_Prison** | The prison building itself | Refuses demolition. Speaks through walls and pipes. |
| **Agent_Developer** | DCAMM / State developer | Demands fast demolition for housing development. |
| **Agent_Town** | Concord Town committee | Protects infrastructure, traffic, and historic sites. |

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+ / FastAPI / uvicorn |
| LLM | Gemini API (`google-generativeai` SDK) |
| Embeddings | `gemini-embedding-001` |
| Vector DB | ChromaDB (local persistent) |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Real-time | FastAPI native WebSocket |
| Weather | OpenWeatherMap API (Boston coordinates) |

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd MultiAgent_Concord_Claude_1

# Backend
python -m venv .venv
# Windows:
.venv\Scripts\pip install -r backend/requirements.txt
# macOS/Linux:
# .venv/bin/pip install -r backend/requirements.txt

# Frontend
cd frontend
npm install
cd ..
```

### 2. Configure API Keys

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com)
- `OPENWEATHER_API_KEY` — from [OpenWeatherMap](https://openweathermap.org) (free tier works)

### 3. Start Backend

```bash
# Windows:
.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8000

# macOS/Linux:
# .venv/bin/uvicorn backend.main:app --reload --port 8000
```

### 4. Start Frontend (separate terminal)

```bash
cd frontend
npm run dev
```

### 5. Open in Browser

| URL | Purpose |
|---|---|
| `http://localhost:5173` | Chat interface — watch agents debate |
| `http://localhost:5173/admin` | Admin dashboard — edit prompts & manage knowledge base |

## Usage

### Chat Interface

- **NEXT TURN** — trigger one round of dialogue manually
- **START AUTO** — agents talk automatically every 20 seconds
- **STOP** — pause auto mode
- **RESET** — clear conversation history

On the first trigger, RAG knowledgebases are auto-initialized (vectorizes all files in `RAGKnowledgebase/`). This takes 1–2 minutes and only happens once (data persists in `data/chroma_db/`).

### Admin Dashboard

**System Prompts** — select an agent, edit its persona, click SAVE. Changes take effect on the next turn.

**Knowledge Base (RAG)** — bottom section of admin page:
- View loaded documents per agent
- **UPLOAD** — add new .md / .txt / .pdf files to any agent's knowledge base
- **DELETE** — remove a document and its vectors
- **INIT ALL** — batch-vectorize all files in `RAGKnowledgebase/` (only needed if `data/chroma_db/` was deleted)

## Project Structure

```
├── backend/
│   ├── main.py                  # FastAPI entry + WebSocket
│   ├── config.py                # All env vars and constants
│   ├── core/
│   │   ├── orchestrator.py      # Main dialogue loop
│   │   ├── routing_engine.py    # 3-layer speaker selection
│   │   ├── prompt_assembler.py  # SP + weather + RAG + history assembly
│   │   └── stance_guard.py      # Prevents agents from compromising
│   ├── agents/
│   │   ├── base_agent.py        # Agent base class (Gemini call + retry)
│   │   ├── agent_prison.py
│   │   ├── agent_developer.py
│   │   └── agent_town.py
│   ├── rag/
│   │   ├── vector_store.py      # ChromaDB wrapper (3 collections)
│   │   ├── document_processor.py # MD/TXT/PDF parsing + chunking
│   │   └── retriever.py         # Semantic retrieval + batch init
│   ├── services/
│   │   ├── gemini_service.py    # Gemini API + structured JSON output
│   │   └── weather_service.py   # OpenWeatherMap + 5min cache
│   └── api/
│       ├── routes_chat.py       # /api/chat/* endpoints
│       ├── routes_admin.py      # /api/admin/* endpoints (prompts + RAG)
│       └── websocket.py         # WS connection manager + broadcast
│
├── frontend/src/
│   ├── pages/ChatPage.tsx       # Main chat UI
│   ├── pages/AdminPage.tsx      # Admin dashboard
│   ├── components/
│   │   ├── MessageBubble.tsx    # Agent message bubble (positioned by agent)
│   │   ├── WeatherBar.tsx       # Top bar with Boston weather
│   │   ├── AgentIndicator.tsx   # Agent status lights
│   │   └── admin/KnowledgeManager.tsx  # RAG file management UI
│   ├── hooks/useWebSocket.ts    # WS connection hook
│   └── store/conversationStore.ts  # Zustand state
│
├── RAGKnowledgebase/            # Knowledge base files (auto-vectorized)
│   ├── AgentPrison_knowledgebase/   # 5 files (Malcolm X, building history...)
│   ├── AgentDeveloper_knowledgebase/ # 5 files (Section 107, land strategy...)
│   └── AgentTown_knowledgebase/     # 5 files + 1 PDF (WWTP, traffic, vision plan)
│
├── System Prompt Agent_Prison.md    # Prison persona definition
├── System Prompt Agent_Developer.md # Developer persona definition
├── System Prompt Agent_Town.md      # Town persona definition
└── data/                            # Runtime data (gitignored)
    └── chroma_db/                   # Persistent vector storage
```

## Core Architecture

### Dialogue Routing Engine (3-Layer Decision)

Each agent's Gemini response includes structured metadata:

```json
{
  "speech": "The actual spoken words",
  "directed_at": "Agent_Prison | Agent_Developer | Agent_Town | ALL | NONE",
  "emotional_state": "DEFIANT | THREATENING | PLEADING | CALCULATING | ...",
  "urgency_score": 8,
  "implicit_challenge_to": "Agent_Town | NONE"
}
```

**Layer 1 — Hard Rules**: If an agent explicitly addresses another (`directed_at`), that agent speaks next (unless it just spoke twice in a row).

**Layer 2 — Weighted Scoring**: Emotional state, implicit challenges, weather conditions, and consecutive-speak penalties produce a weight for each candidate.

**Layer 3 — Weighted Random**: Final selection via `random.choices()` to prevent rigid patterns.

### Prompt Assembly (per turn)

```
System Instruction = System Prompt + Real-time Weather + Stance Lock + JSON Format Requirement
Contents = [RAG Memory (top-3 chunks)] + [Conversation History (last 10)] + [Trigger]
```

### Stance Guard

Keyword-based validator that rejects responses where an agent softens its position. Failed responses are regenerated with higher temperature (max 2 retries).

## API Reference

### Chat

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/chat/trigger` | Trigger one dialogue turn (`force_speaker` optional) |
| POST | `/api/chat/auto/start` | Start auto mode (`interval_seconds` param) |
| POST | `/api/chat/auto/stop` | Stop auto mode |
| POST | `/api/chat/reset` | Clear conversation history |
| GET | `/api/chat/history` | Get all messages |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/agents` | Get all agents' system prompts |
| PUT | `/api/admin/agents/{id}` | Update an agent's system prompt |
| GET | `/api/admin/rag/status` | RAG status for all agents |
| GET | `/api/admin/rag/{id}` | List documents for one agent |
| POST | `/api/admin/rag/{id}/upload` | Upload file (multipart/form-data) |
| DELETE | `/api/admin/rag/{id}/{filename}` | Delete file and its vectors |
| POST | `/api/admin/rag/init` | Batch-vectorize all knowledgebase files |

### WebSocket

Connect to `ws://localhost:8000/ws`. Send JSON messages:

```json
{"type": "start_auto_mode", "interval_seconds": 20}
{"type": "stop_auto_mode"}
{"type": "trigger"}
{"type": "trigger", "force_speaker": "Agent_Prison"}
{"type": "reset"}
```

## Environment Variables

See `.env.example` for all options. Key ones:

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `OPENWEATHER_API_KEY` | Yes | OpenWeatherMap API key (free tier) |
| `GEMINI_MODEL` | No | Default: `gemini-2.5-flash` |
| `AUTO_MODE_INTERVAL` | No | Seconds between auto turns (default: 15) |
| `RAG_TOP_K` | No | Number of RAG chunks per retrieval (default: 3) |
| `DEBUG` | No | Set `true` to broadcast routing weights via WS |

## Adding Knowledge Base Files

1. Drop `.md`, `.txt`, or `.pdf` files into the appropriate `RAGKnowledgebase/Agent*_knowledgebase/` directory
2. Go to Admin → Knowledge Base → click **INIT ALL**, or upload via the UI
3. Files are chunked (512 chars, 64 overlap), embedded via Gemini, and stored in ChromaDB
4. Agents will automatically reference relevant content in their responses

## Notes

- **Persistence**: Vector data in `data/chroma_db/` survives restarts. Only re-init if you delete it.
- **52MB PDF**: The Town agent has a large Vision Plan PDF. First vectorization may take a few minutes.
- **Weather fallback**: If the OpenWeatherMap key is invalid or rate-limited, the system uses fallback data (45°F, Unknown conditions) — agents still function.
- **Design**: Frontend uses a Nothing Phone-inspired black/white minimal aesthetic.
