import { useEffect, useRef, useState, useCallback } from 'react'
import { useConversationStore } from '../store/conversationStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { useMicInput } from '../hooks/useMicInput'
import WeatherBar from '../components/WeatherBar'
import AgentIndicator from '../components/AgentIndicator'
import MessageBubble from '../components/MessageBubble'

export default function ChatPage() {
  const { messages, isAutoMode, setAutoMode, reset } = useConversationStore()
  const { send } = useWebSocket()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [injecting, setInjecting] = useState(false)
  const [injectText, setInjectText] = useState('')

  const handleVoiceTranscript = useCallback((text: string) => {
    send({ type: 'user_inject', text })
  }, [send])

  const { micState, toggle: toggleMic, stop: stopMic } = useMicInput(handleVoiceTranscript)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (injecting) inputRef.current?.focus()
  }, [injecting])

  useEffect(() => {
    if (!isAutoMode) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      toggleMic()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAutoMode, toggleMic])

  function handleStartAuto() {
    send({ type: 'start_auto_mode', interval_seconds: 20 })
    setAutoMode(true)
  }

  function handleStop() {
    send({ type: 'stop_auto_mode' })
    setAutoMode(false)
    stopMic()
  }

  function handleTrigger() {
    send({ type: 'trigger' })
  }

  function handleFacilitate() {
    send({ type: 'moderator' })
  }

  function handleInjectSubmit() {
    const text = injectText.trim()
    if (!text) return
    send({ type: 'user_inject', text })
    setInjectText('')
    setInjecting(false)
  }

  function handleReset() {
    send({ type: 'reset' })
    reset()
  }

  return (
    <div className="min-h-screen bg-void flex flex-col">
      <WeatherBar />

      <div className="flex flex-col flex-1 pt-10">
        <AgentIndicator />

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col">
          {messages.length === 0 && (
            <p className="text-secondary text-sm font-mono text-center mt-20 tracking-widest">
              — SILENCE —<br />
              <span className="text-muted mt-2 block">press START AUTO or NEXT TURN to begin the negotiation</span>
            </p>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Inject input — slides in above control bar */}
        {injecting && (
          <div className="border-t border-amber-500/30 px-8 py-3 flex items-center gap-3 bg-void">
            <span className="text-xs font-mono text-amber-500/60 tracking-widest shrink-0">YOU →</span>
            <input
              ref={inputRef}
              value={injectText}
              onChange={e => setInjectText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleInjectSubmit()
                if (e.key === 'Escape') { setInjecting(false); setInjectText('') }
              }}
              placeholder="say something all three agents will hear..."
              className="flex-1 bg-transparent text-sm font-mono text-primary placeholder:text-muted outline-none"
            />
            <button
              onClick={handleInjectSubmit}
              className="text-xs font-mono tracking-widest text-amber-500/70 hover:text-amber-400 transition-colors"
            >
              SEND
            </button>
            <button
              onClick={() => { setInjecting(false); setInjectText('') }}
              className="text-xs font-mono tracking-widest text-muted hover:text-secondary transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* 控制栏 */}
        <div className="border-t border-border px-8 py-4 flex items-center gap-4">
          {!isAutoMode ? (
            <button
              onClick={handleStartAuto}
              className="text-sm font-mono tracking-widest text-secondary border border-border px-4 py-1.5 hover:border-secondary hover:text-primary transition-colors"
            >
              START AUTO
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="text-sm font-mono tracking-widest text-secondary border border-border px-4 py-1.5 hover:border-secondary hover:text-primary transition-colors"
            >
              STOP
            </button>
          )}
          <button
            onClick={handleTrigger}
            className="text-sm font-mono tracking-widest text-secondary border border-border px-4 py-1.5 hover:border-secondary hover:text-primary transition-colors"
          >
            NEXT TURN
          </button>
          <button
            onClick={() => setInjecting(v => !v)}
            className={`text-sm font-mono tracking-widest border px-4 py-1.5 transition-colors ${
              injecting
                ? 'text-amber-400 border-amber-500/70'
                : 'text-amber-500/70 border-amber-500/30 hover:border-amber-500/70 hover:text-amber-400'
            }`}
          >
            INTERVENE
          </button>
          <button
            onClick={handleFacilitate}
            className="text-sm font-mono tracking-widest text-amber-500/50 border border-amber-500/20 px-4 py-1.5 hover:border-amber-500/50 hover:text-amber-400/80 transition-colors"
          >
            FACILITATE
          </button>
          {isAutoMode && (
            <>
              <button
                onClick={toggleMic}
                title={micState === 'muted' ? 'Unmute mic' : micState === 'pending' ? 'Holding…' : 'Listening — click to mute'}
                className={`text-sm font-mono tracking-widest border px-4 py-1.5 transition-colors flex items-center gap-2 ${
                  micState === 'muted'
                    ? 'text-zinc-500 border-zinc-600 hover:border-zinc-400 hover:text-zinc-300'
                    : micState === 'pending'
                    ? 'text-yellow-400 border-yellow-500/60'
                    : 'text-red-400 border-red-500/70 animate-pulse'
                }`}
              >
                {micState === 'muted' ? '🎙 MIC OFF' : micState === 'pending' ? '🎙 HOLD…' : '🔴 LISTENING'}
              </button>
              <span className="text-xs font-mono text-zinc-600">SPACE</span>
            </>
          )}
          <button
            onClick={handleReset}
            className="text-sm font-mono tracking-widest text-muted px-4 py-1.5 hover:text-secondary transition-colors ml-auto"
          >
            RESET
          </button>
          <a
            href="/admin"
            className="text-sm font-mono tracking-widest text-muted hover:text-secondary transition-colors"
          >
            ADMIN →
          </a>
        </div>
      </div>
    </div>
  )
}
