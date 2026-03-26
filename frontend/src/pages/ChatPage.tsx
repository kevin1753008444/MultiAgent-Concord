import { useEffect, useRef } from 'react'
import { useConversationStore } from '../store/conversationStore'
import { useWebSocket } from '../hooks/useWebSocket'
import WeatherBar from '../components/WeatherBar'
import AgentIndicator from '../components/AgentIndicator'
import MessageBubble from '../components/MessageBubble'

export default function ChatPage() {
  const { messages, isAutoMode, setAutoMode, reset } = useConversationStore()
  const { send } = useWebSocket()
  const bottomRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleStartAuto() {
    send({ type: 'start_auto_mode', interval_seconds: 20 })
    setAutoMode(true)
  }

  function handleStop() {
    send({ type: 'stop_auto_mode' })
    setAutoMode(false)
  }

  function handleTrigger() {
    send({ type: 'trigger' })
  }

  function handleReset() {
    send({ type: 'reset' })
    reset()
  }

  return (
    <div className="min-h-screen bg-void flex flex-col">
      <WeatherBar />

      {/* 主内容区：天气栏 32px + 指示器 ~48px = 80px 顶部偏移 */}
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
