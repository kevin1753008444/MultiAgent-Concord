import { useCallback, useEffect, useMemo, useState } from 'react'
import { AGENT_DISPLAYS, DISPLAY_ORDER, getDisplayByAgent } from '../agents'
import AgentAssetManager from '../components/admin/AgentAssetManager'
import KnowledgeManager from '../components/admin/KnowledgeManager'
import { useExhibitionSettings } from '../hooks/useExhibitionSettings'
import { useHydrateHistory } from '../hooks/useHydrateHistory'
import { useMicInput, type MicMode } from '../hooks/useMicInput'
import { useWebSocket, stopAudio } from '../hooks/useWebSocket'
import { useConversationStore } from '../store/conversationStore'
import type { AgentId } from '../types'

interface RagAgentStatus {
  total_chunks: number
  documents: string[]
}

type RagStatus = Record<AgentId, RagAgentStatus>

const projectionWindows: Record<string, Window | null> = {}

function openProjectionWindows() {
  const features = [
    'popup=yes',
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
    // Stagger each window.open by 150 ms — browsers require a small gap
    // between calls to avoid the popup blocker killing the 2nd and 3rd window.
    setTimeout(() => {
      const existing = projectionWindows[key]
      if (existing && !existing.closed) {
        existing.focus()
        return
      }
      const left = 40 + index * 100
      const top = 40 + index * 60
      projectionWindows[key] = window.open(
        `/screen/${key}`,
        `mci-concord-${key}`,
        `${features},left=${left},top=${top}`,
      )
    }, index * 150)
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

  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null)
  const [health, setHealth] = useState<{ status: string; ws_connections: number } | null>(null)
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [selectedPrompt, setSelectedPrompt] = useState<AgentId>('Agent_Prison')
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const [micMode, setMicMode] = useState<MicMode | null>(null)

  const handleVoiceInject = useCallback((text: string) => {
    send({ type: 'user_transcribing', text, is_final: true })
    send({ type: 'user_inject', text })
    send({ type: 'hold_end' })
  }, [send])

  const handleVoiceInterim = useCallback((text: string) => {
    send({ type: 'user_transcribing', text, is_final: false })
  }, [send])

  const { micState, startHold, endHold } = useMicInput(micMode, handleVoiceInject, handleVoiceInterim)

  // Space key (local) + BroadcastChannel relay from projection windows
  useEffect(() => {
    if (micMode !== 'keyboard') return

    const channel = new BroadcastChannel('mci-space')

    function onHoldStart() {
      stopAudio()
      startHold()
      send({ type: 'hold_start' })
      send({ type: 'user_transcribing', text: '', is_final: false })
    }
    function onHoldEnd() {
      endHold()
      // hold_end sent after transcript arrives via handleVoiceInject
      // but send it now too in case user released without speaking
      send({ type: 'hold_end' })
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      onHoldStart()
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      onHoldEnd()
    }

    channel.onmessage = (e) => {
      if (e.data?.type === 'space_down') onHoldStart()
      if (e.data?.type === 'space_up') onHoldEnd()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      channel.close()
    }
  }, [micMode, startHold, endHold, send])

  function cycleMicMode() {
    setMicMode(prev =>
      prev === null ? 'keyboard' : prev === 'keyboard' ? 'physical' : null
    )
  }

  const agentCounts = useMemo(() => {
    return DISPLAY_ORDER.map((key) => {
      const display = AGENT_DISPLAYS[key]
      const count = messages.filter((msg) => msg.type === 'agent_message' && msg.agent_id === display.id).length
      return { display, count }
    })
  }, [messages])

  async function refreshBackendState(includePrompts = false) {
    const [ragResp, healthResp, promptsResp] = await Promise.allSettled([
      fetch('/api/admin/rag/status').then((r) => r.json()),
      fetch('/health').then((r) => r.json()),
      includePrompts ? fetch('/api/admin/agents').then((r) => r.json()) : Promise.resolve(null),
    ])

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
            <button className="command-button danger" onClick={resetAll}>
              Reset
            </button>
          </div>

          <div className="command-row" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
            <button
              className="command-button"
              onClick={cycleMicMode}
              title="Cycle: OFF → KEYBOARD (space) → PHYSICAL (sound)"
            >
              {micMode === null ? '🎙 MIC: OFF' : micMode === 'keyboard' ? '⌨️ MIC: KEYBOARD' : '🔊 MIC: PHYSICAL'}
            </button>
            {micMode !== null && (
              <span style={{
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
                color: micState === 'listening' ? '#f87171' : micState === 'pending' ? '#facc15' : '#6b7280',
              }}>
                {micState === 'listening' ? '● LISTENING' : micState === 'pending' ? '◌ HOLD…' : '○ READY'}
              </span>
            )}
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
            <span>Session Status</span>
            <strong>{messages.length} turns</strong>
          </div>
          <div className="phase-readout">
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
