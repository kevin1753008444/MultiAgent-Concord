import type { AgentMessage } from '../types'

const AGENT_LABELS: Record<string, string> = {
  Agent_Prison: 'PRISON',
  Agent_Developer: 'DEV',
  Agent_Town: 'TOWN',
}

const URGENCY_ARROW = (score: number) =>
  score >= 8 ? '↑↑' : score >= 6 ? '↑' : score <= 3 ? '↓' : '—'

// Nothing Phone 极简风格：三方各有布局
function getBubbleStyle(agentId: string): string {
  switch (agentId) {
    case 'Agent_Prison':
      return 'self-start border-l-2 border-prison pl-3'
    case 'Agent_Developer':
      return 'self-end border-r-2 border-developer pr-3 items-end'
    case 'Agent_Town':
      return 'self-center border-b-2 border-town pb-1 items-center'
    default:
      return 'self-start border border-dashed border-muted px-3'
  }
}

export default function MessageBubble({ msg }: { msg: AgentMessage }) {
  const label = AGENT_LABELS[msg.agent_id] ?? msg.agent_id
  const urgency = URGENCY_ARROW(msg.urgency_score)
  const isDirected = msg.directed_at !== 'NONE' && msg.directed_at !== 'ALL'
  const directedLabel = isDirected ? AGENT_LABELS[msg.directed_at] ?? msg.directed_at : null

  return (
    <div className={`flex flex-col max-w-xl animate-fade-in ${getBubbleStyle(msg.agent_id)} mb-6`}>
      {/* Header row */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xs text-secondary tracking-widest font-mono">[{label}]</span>
        <span className="text-xs text-muted font-mono">— {msg.emotional_state} {urgency}{msg.urgency_score}</span>
      </div>

      {/* Speech */}
      <p className="text-primary text-sm leading-relaxed font-mono whitespace-pre-wrap">
        {msg.speech}
      </p>

      {/* Footer row */}
      <div className="flex items-center gap-3 mt-2">
        {directedLabel && (
          <span className="text-xs text-muted font-mono">→ {directedLabel}</span>
        )}
        {msg.directed_at === 'ALL' && (
          <span className="text-xs text-muted font-mono">→ ALL</span>
        )}
        <span className="text-xs text-muted font-mono ml-auto">
          {msg.weather_snapshot?.time_str} · {msg.weather_snapshot?.condition} {msg.weather_snapshot?.temp_f}°F
        </span>
      </div>
    </div>
  )
}
