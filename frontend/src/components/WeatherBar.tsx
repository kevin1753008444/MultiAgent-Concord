import { useConversationStore } from '../store/conversationStore'

export default function WeatherBar() {
  const weather = useConversationStore((s) => s.weather)
  const wsConnected = useConversationStore((s) => s.wsConnected)

  const statusText = wsConnected
    ? 'Boston · — connected —'
    : 'Boston · — connecting… —'

  return (
    <div className="fixed top-0 left-0 right-0 h-10 bg-void border-b border-border flex items-center px-4 z-50">
      <span className="text-secondary text-sm font-mono tracking-widest flex-1">
        {statusText}
      </span>
      <span className="text-secondary text-sm font-mono tracking-widest">
        MCI CONCORD · 1878–2024
      </span>
    </div>
  )
}
