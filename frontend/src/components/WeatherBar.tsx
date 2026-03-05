import { useConversationStore } from '../store/conversationStore'

export default function WeatherBar() {
  const weather = useConversationStore((s) => s.weather)

  return (
    <div className="fixed top-0 left-0 right-0 h-8 bg-void border-b border-border flex items-center px-4 z-50">
      <span className="text-secondary text-xs font-mono tracking-widest flex-1">
        {weather
          ? `Boston · ${weather.time_str} EST  |  ${weather.condition}  ${weather.temp_f}°F`
          : 'Boston · — connecting —'}
      </span>
      <span className="text-muted text-xs font-mono tracking-widest">
        MCI CONCORD · 1878–2024
      </span>
    </div>
  )
}
