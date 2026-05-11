import { useEffect, useMemo, useState } from 'react'
import { AGENT_DISPLAYS, DISPLAY_ORDER, getDisplayByAgent } from '../agents'
import AgentAssetManager from '../components/admin/AgentAssetManager'
import KnowledgeManager from '../components/admin/KnowledgeManager'
import { useExhibitionSettings } from '../hooks/useExhibitionSettings'
import { useHydrateHistory } from '../hooks/useHydrateHistory'
import { useWebSocket } from '../hooks/useWebSocket'
import { useConversationStore } from '../store/conversationStore'
import type { AgentId } from '../types'

type Phase = 'debate' | 'negotiate' | 'resolve'

interface RagAgentStatus {
  total_chunks: number
  documents: string[]
}

type RagStatus = Record<AgentId, RagAgentStatus>

const PHASES: Phase[] = ['debate', 'negotiate', 'resolve']
const projectionWindows: Record<string, Window | null> = {}

function openProjectionWindows() {
  const features = [
    'popup=yes',
    'noopener=no',
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'scrollbars=no',
    'resizable=yes',
    'width=1280',
    'height=720',
  ].join(',')

  DISPLAY_ORDER.forEach((key, index) => {
    const left = 60 + index * 90
    const top = 60 + index * 70
    const existing = projectionWindows[key]
    if (existing && !existing.closed) {
      existing.focus()
      return
    }
    projectionWindows[key] = window.open(`/screen/${key}`, `mci-concord-${key}`, `${features},left=${left},top=${top}`)
  })
}

export default function AdminPage() {
  const { send } = useWebSocket({ playAudio: false })
  const { settings, updateSettings } = useExhibitionSettings()
  useHydrateHistory()

  const messages = useConversationStore((s) => s.messages)
  const isAutoMode = useConversationStore((s) => s.isAutoMode)
  const setAutoMode = useConversationStore((s) => s.setAutoMode)
  const wsConnected = useConversationStore((s) => s.wsConnected)
  const thinkingAgent = useConversationStore((s) => s.thinkingAgent)
  const lastWsEvent = useConversationStore((s) => s.lastWsEvent)
  const resetLocal = useConversationStore((s) => s.reset)

  const [phase, setPhase] = useState<Phase>('debate')
  const [turn, setTurn] = useState(0)
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null)
  const [health, setHealth] = useState<{ status: string; ws_connections: number } | null>(null)
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [selectedPrompt, setSelectedPrompt] = useState<AgentId>('Agent_Prison')
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')

  const agentCounts = useMemo(() => {
    return DISPLAY_ORDER.map((key) => {
      const display = AGENT_DISPLAYS[key]
      const count = messages.filter((msg) => msg.type === 'agent_message' && msg.agent_id === display.id).length
      return { display, count }
    })
  }, [messages])

  async function refreshBackendState(includePrompts = false) {
    const [phaseResp, ragResp, healthResp, promptsResp] = await Promise.allSettled([
      fetch('/api/admin/phase').then((r) => r.json()),
      fetch('/api/admin/rag/status').then((r) => r.json()),
      fetch('/health').then((r) => r.json()),
      includePrompts ? fetch('/api/admin/agents').then((r) => r.json()) : Promise.resolve(null),
    ])

    if (phaseResp.status === 'fulfilled') {
      setPhase(phaseResp.value.phase)
      setTurn(phaseResp.value.turn)
    }
    if (ragResp.status === 'fulfilled') setRagStatus(ragResp.value)
    if (healthResp.status === 'fulfilled') setHealth(healthResp.value)
    if (includePrompts && promptsResp.status === 'fulfilled' && promptsResp.value) {
      setPrompts(promptsResp.value)
      setDraft(promptsResp.value[selectedPrompt] ?? '')
    }
  }

  useEffect(() => {
    refreshBackendState(true)
    const timer = window.setInterval(refreshBackendState, 5000)
    return () => window.clearInterval(timer)
  }, [])

  function startAuto() {
    send({ type: 'start_auto_mode', interval_seconds: 20 })
    setAutoMode(true)
  }

  function stopAuto() {
    send({ type: 'stop_auto_mode' })
    setAutoMode(false)
  }

  function trigger(forceSpeaker?: AgentId) {
    send({ type: 'trigger', force_speaker: forceSpeaker })
  }

  function resetAll() {
    stopAuto()
    send({ type: 'reset' })
    resetLocal()
    setNotice('Reset sent to all exhibition windows.')
    window.setTimeout(() => setNotice(''), 2500)
  }

  async function changePhase(nextPhase: Phase) {
    const response = await fetch('/api/admin/phase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: nextPhase }),
    })
    if (response.ok) {
      const data = await response.json()
      setPhase(data.phase)
    }
  }

  function selectPrompt(agentId: AgentId) {
    setSelectedPrompt(agentId)
    setDraft(prompts[agentId] ?? '')
  }

  async function savePrompt() {
    const response = await fetch(`/api/admin/agents/${selectedPrompt}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: selectedPrompt, system_prompt: draft }),
    })
    if (response.ok) {
      setPrompts((value) => ({ ...value, [selectedPrompt]: draft }))
      setNotice(`${getDisplayByAgent(selectedPrompt).label} prompt saved.`)
      window.setTimeout(() => setNotice(''), 2500)
    }
  }

  return (
    <main className="control-room">
      <header className="control-header">
        <div>
          <p className="control-kicker">MCI CONCORD EXHIBITION CONTROL</p>
          <h1>Projection Console</h1>
        </div>
        <div className="control-live">
          <span className={wsConnected ? 'status-dot online' : 'status-dot'} />
          <span>{wsConnected ? 'WebSocket online' : 'Reconnecting'}</span>
          <span>{health?.ws_connections ?? 0} windows</span>
          <span>{lastWsEvent ?? 'standby'}</span>
        </div>
      </header>

      <section className="console-grid">
        <div className="console-panel command-panel">
          <div className="panel-heading">
            <span>Show Control</span>
            <strong>{isAutoMode ? 'PLAYING' : 'PAUSED'}</strong>
          </div>

          <div className="command-row">
            <button className="command-button primary" onClick={isAutoMode ? stopAuto : startAuto}>
              {isAutoMode ? 'Pause' : 'Play'}
            </button>
            <button className="command-button" onClick={() => trigger()}>
              Next Turn
            </button>
            <button className="command-button" onClick={() => send({ type: 'moderator' })}>
              Facilitate
            </button>
            <button className="command-button danger" onClick={resetAll}>
              Reset
            </button>
          </div>

          <div className="force-grid">
            {DISPLAY_ORDER.map((key) => {
              const display = AGENT_DISPLAYS[key]
              return (
                <button className="force-button" key={display.id} onClick={() => trigger(display.id)}>
                  <span>{display.label}</span>
                  <small>force next speech</small>
                </button>
              )
            })}
          </div>

          <div className="window-tools">
            <button className="command-button wide" onClick={openProjectionWindows}>
              Open / Focus Three Projection Windows
            </button>
            <a href="/chat" target="_blank" rel="noreferrer">Legacy chat monitor</a>
          </div>
        </div>

        <div className="console-panel">
          <div className="panel-heading">
            <span>Negotiation Phase</span>
            <strong>{phase}</strong>
          </div>
          <div className="phase-switch">
            {PHASES.map((item) => (
              <button key={item} className={phase === item ? 'is-selected' : ''} onClick={() => changePhase(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="phase-readout">
            <span>turns</span>
            <strong>{turn}</strong>
            <span>thinking</span>
            <strong>{thinkingAgent ? getDisplayByAgent(thinkingAgent).label : 'none'}</strong>
          </div>
        </div>

        <div className="console-panel">
          <div className="panel-heading">
            <span>Projection Feeds</span>
            <strong>{messages.length} events</strong>
          </div>
          <div className="feed-list">
            {agentCounts.map(({ display, count }) => (
              <a href={`/screen/${display.key}`} target="_blank" rel="noreferrer" key={display.id} className="feed-row">
                <img src={display.image} alt="" />
                <span>{display.label}</span>
                <strong>{count}</strong>
              </a>
            ))}
          </div>
        </div>

        <div className="console-panel">
          <div className="panel-heading">
            <span>RAG Status</span>
            <strong>{health?.status ?? 'checking'}</strong>
          </div>
          <div className="rag-list">
            {DISPLAY_ORDER.map((key) => {
              const display = AGENT_DISPLAYS[key]
              const status = ragStatus?.[display.id]
              return (
                <div className="rag-row" key={display.id}>
                  <span>{display.label}</span>
                  <strong>{status?.total_chunks ?? '-'}</strong>
                  <small>{status?.documents.length ?? 0} docs</small>
                </div>
              )
            })}
          </div>
        </div>

        <div className="console-panel">
          <div className="panel-heading">
            <span>Projection Typography</span>
            <strong>{Math.round(settings.projectionTextScale * 100)}%</strong>
          </div>
          <label className="range-control">
            <span>Message size</span>
            <input
              type="range"
              min="0.58"
              max="1.1"
              step="0.02"
              value={settings.projectionTextScale}
              onChange={(event) => updateSettings({ projectionTextScale: Number(event.target.value) })}
            />
          </label>
          <p className="setting-note">Saved locally and synced to open projection windows.</p>
        </div>
      </section>

      {notice && <div className="control-notice">{notice}</div>}

      <section className="console-panel prompt-panel">
        <div className="panel-heading">
          <span>System Prompt Editor</span>
          <strong>{getDisplayByAgent(selectedPrompt).label}</strong>
        </div>
        <div className="prompt-tabs">
          {DISPLAY_ORDER.map((key) => {
            const display = AGENT_DISPLAYS[key]
            return (
              <button
                key={display.id}
                className={selectedPrompt === display.id ? 'is-selected' : ''}
                onClick={() => selectPrompt(display.id)}
              >
                {display.label}
              </button>
            )
          })}
        </div>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button className="command-button" onClick={savePrompt}>Save Prompt</button>
      </section>

      <section className="console-panel knowledge-panel">
        <AgentAssetManager />
      </section>

      <section className="console-panel knowledge-panel">
        <KnowledgeManager />
      </section>
    </main>
  )
}
