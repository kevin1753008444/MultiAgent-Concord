import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENT_DISPLAYS, DISPLAY_ORDER, getDisplayByAgent, getDisplayByPath } from '../agents'
import { useExhibitionSettings } from '../hooks/useExhibitionSettings'
import { useHydrateHistory } from '../hooks/useHydrateHistory'
import { useWebSocket } from '../hooks/useWebSocket'
import { useConversationStore } from '../store/conversationStore'
import type { AgentAsset, AgentAssetMap, AgentEmotion, AgentId, AgentMessage, AgentVisualMode, ChatMessage } from '../types'

const FALLBACK_LINES = [
  'The room is listening.',
  'The next statement will surface here when this agent speaks.',
  'This screen is connected to the live negotiation.',
]

const EASTERN_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
})

type AgentStatus = 'thinking' | 'speaking' | 'listening' | 'idle'

function estimateSpeakingMs(text: string): number {
  return Math.min(24000, Math.max(7000, text.length * 62))
}

function isAgentMessage(message: ChatMessage): message is AgentMessage {
  return message.type === 'agent_message'
}

function getMessageTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '--:--'
  return EASTERN_TIME.format(date)
}

function summarize(text: string, max = 58): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 3).trimEnd()}...`
}

function normalizeEmotion(value?: string | null): AgentEmotion {
  const text = (value ?? '').toLowerCase()
  if (text.includes('angry') || text.includes('rage') || text.includes('furious')) return 'angry'
  if (text.includes('anx') || text.includes('uneasy') || text.includes('fear') || text.includes('worr')) return 'uneasy'
  return 'neutral'
}

function getLatestAgentMessage(messages: ChatMessage[], agentId?: AgentId): AgentMessage | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const item = messages[index]
    if (isAgentMessage(item) && (!agentId || item.agent_id === agentId)) return item
  }
  return null
}

function getReplyMeta(message: AgentMessage, messages: ChatMessage[]) {
  if (message.directed_at === 'NONE') return null

  const currentTime = new Date(message.timestamp).getTime()

  if (message.directed_at === 'ALL') {
    // Show what triggered this open address — only if it was the human speaking
    for (let index = messages.length - 1; index >= 0; index--) {
      const item = messages[index]
      if (new Date(item.timestamp).getTime() >= currentTime) continue
      if (item.type === 'user_message') return { label: 'Facilitator', excerpt: summarize(item.speech) }
      return null // last message was an agent — no chip needed
    }
    return null
  }

  // directed_at is a specific agent — find their most recent prior message
  for (let index = messages.length - 1; index >= 0; index--) {
    const item = messages[index]
    if (new Date(item.timestamp).getTime() >= currentTime) continue
    if (item.type === 'agent_message' && item.agent_id === message.directed_at) {
      return { label: getDisplayByAgent(item.agent_id).label, excerpt: summarize(item.speech) }
    }
  }
  return null
}

function getAgentStatuses(messages: ChatMessage[], thinkingAgent: AgentId | null, now: number): Record<AgentId, AgentStatus> {
  const latest = getLatestAgentMessage(messages)
  const statuses: Record<AgentId, AgentStatus> = {
    Agent_Prison: 'idle',
    Agent_Developer: 'idle',
    Agent_Town: 'idle',
  }

  if (thinkingAgent) {
    DISPLAY_ORDER.forEach((key) => {
      const agentId = AGENT_DISPLAYS[key].id
      statuses[agentId] = agentId === thinkingAgent ? 'thinking' : 'listening'
    })
    return statuses
  }

  if (latest) {
    const messageTime = new Date(latest.timestamp).getTime()
    if (now - messageTime < estimateSpeakingMs(latest.speech)) {
      DISPLAY_ORDER.forEach((key) => {
        const agentId = AGENT_DISPLAYS[key].id
        statuses[agentId] = agentId === latest.agent_id ? 'speaking' : 'listening'
      })
    }
  }
  return statuses
}

function getAssetForState(
  assets: AgentAssetMap,
  agentId: AgentId,
  mode: AgentVisualMode,
  emotion: AgentEmotion,
): AgentAsset | undefined {
  return assets[agentId]?.[mode]?.[emotion] ?? assets[agentId]?.[mode]?.neutral
}

function StatusGlyph({ status }: { status: AgentStatus }) {
  return (
    <span className={`agent-state-glyph is-${status}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

export default function AgentProjectionPage() {
  const display = getDisplayByPath(window.location.pathname)
  const messages = useConversationStore((s) => s.messages)
  const thinkingAgent = useConversationStore((s) => s.thinkingAgent)
  const wsConnected = useConversationStore((s) => s.wsConnected)
  const transcribingText = useConversationStore((s) => s.transcribingText)
  const [flashKey, setFlashKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [assets, setAssets] = useState<AgentAssetMap>({})
  const latestSpeechRef = useRef<string | null>(null)

  useWebSocket({ playAudio: true, audioFilterAgentId: display.id })
  useHydrateHistory()
  useExhibitionSettings()

  // Relay space key to admin window via BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('mci-space')
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.code !== 'Space') return
      e.preventDefault()
      channel.postMessage({ type: 'space_down' })
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      channel.postMessage({ type: 'space_up' })
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      channel.close()
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 900)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    function refreshAssets() {
      fetch('/api/admin/agent-assets')
        .then((response) => response.ok ? response.json() : {})
        .then(setAssets)
        .catch(() => setAssets({}))
    }
    refreshAssets()
    const timer = window.setInterval(refreshAssets, 10000)
    return () => window.clearInterval(timer)
  }, [])

  const statuses = useMemo(() => getAgentStatuses(messages, thinkingAgent, now), [messages, now, thinkingAgent])
  const currentStatus = statuses[display.id]

  const agentMessages = useMemo(
    () => messages.filter((msg): msg is AgentMessage => isAgentMessage(msg) && msg.agent_id === display.id),
    [display.id, messages],
  )
  const recentMessages = agentMessages.slice(-3)
  const latest = recentMessages[recentMessages.length - 1]
  const currentEmotion = normalizeEmotion(latest?.emotional_state)
  const visualMode: AgentVisualMode = currentStatus === 'thinking' ? 'thinking' : currentStatus === 'speaking' ? 'speaking' : 'idle'
  const activeAsset = getAssetForState(assets, display.id, visualMode, currentEmotion)

  useEffect(() => {
    if (!latest || latestSpeechRef.current === latest.speech) return
    latestSpeechRef.current = latest.speech
    setFlashKey((value) => value + 1)
  }, [latest])

  return (
    <main className="projection-page">
      {transcribingText !== null && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(20,20,20,0.72)',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'none',
        }}>
          <div style={{
            maxWidth: '72%',
            textAlign: 'center',
            padding: '2rem 2.5rem',
            border: '1px solid rgba(251,191,36,0.25)',
            background: 'rgba(10,10,10,0.6)',
          }}>
            <p style={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              letterSpacing: '0.15em',
              color: 'rgba(251,191,36,0.5)',
              marginBottom: '0.75rem',
            }}>— HUMAN SPEAKING —</p>
            <p style={{
              fontFamily: 'monospace',
              fontSize: '1.35rem',
              lineHeight: 1.6,
              color: transcribingText ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.3)',
              fontStyle: transcribingText ? 'normal' : 'italic',
            }}>{transcribingText || '…'}</p>
          </div>
        </div>
      )}
      <div className="projection-status-board" aria-label="Agent status board">
        <div className="connection-line">
          <span className={wsConnected ? 'status-dot online' : 'status-dot'} />
          <strong>{wsConnected ? 'LIVE' : 'RECONNECTING'}</strong>
        </div>
        {DISPLAY_ORDER.map((key) => {
          const item = AGENT_DISPLAYS[key]
          const status = statuses[item.id]
          return (
            <div className={`agent-status-row ${item.id === display.id ? 'is-current' : ''}`} key={item.id}>
              <span>{item.label}</span>
              <StatusGlyph status={status} />
              <strong>{status}</strong>
            </div>
          )
        })}
      </div>

      <section className="projection-transcript" aria-label={`${display.label} transcript`}>
        <div className="projection-rail" />
        {(recentMessages.length ? recentMessages : FALLBACK_LINES).map((item, index) => {
          const isText = typeof item === 'string'
          const speech = isText ? item : item.speech
          const active = !isText && index === recentMessages.length - 1
          const reply = isText ? null : getReplyMeta(item, messages)
          return (
            <article
              className={`projection-line ${active ? 'is-active' : ''}`}
              key={isText ? `${display.key}-fallback-${index}` : `${item.timestamp}-${index}`}
            >
              <div className="projection-line-rule" />
              <div className="message-body">
                {!isText && (
                  <div className="message-meta">
                    <time>{getMessageTime(item.timestamp)} ET</time>
                    {reply && <span>replying to {reply.label}</span>}
                  </div>
                )}
                {reply && (
                  <div className="reply-chip">
                    <strong>{reply.label}</strong>
                    <span>{reply.excerpt}</span>
                  </div>
                )}
                <p>{speech}</p>
              </div>
            </article>
          )
        })}

        <div className={`projection-wait-state is-${currentStatus}`}>
          <StatusGlyph status={currentStatus} />
          <span>
            {currentStatus === 'thinking' && `${display.label} is thinking`}
            {currentStatus === 'speaking' && `${display.label} is speaking`}
            {currentStatus === 'listening' && `${display.label} is listening`}
            {currentStatus === 'idle' && `${display.label} is waiting`}
          </span>
        </div>
      </section>

      <section className={`projection-figure is-${currentStatus}`} key={flashKey}>
        <div className="eye-field">
          {activeAsset?.media_type === 'video' ? (
            <video src={activeAsset.url} autoPlay muted loop playsInline />
          ) : (
            <img src={activeAsset?.url ?? display.image} alt={`${display.label} symbolic eye`} draggable={false} />
          )}
        </div>
        <div className="agent-caption">
          <h1>{display.label}</h1>
          <p>{display.role}</p>
        </div>
      </section>
    </main>
  )
}
