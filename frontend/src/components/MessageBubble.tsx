import type { ChatMessage, ModeratorMessage, UserMessage } from '../types'

const AGENT_LABELS: Record<string, string> = {
  Agent_Prison: 'PRISON',
  Agent_Developer: 'DEVELOPER',
  Agent_Town: 'TOWN',
}

function ModeratorBubble({ msg }: { msg: ModeratorMessage }) {
  return (
    <div className="self-center w-full max-w-2xl my-6 animate-fade-in">
      <div className="border-t border-amber-500/30 pt-4 flex flex-col items-center gap-2">
        <span className="text-xs font-mono tracking-widest text-amber-500/60">— FACILITATOR —</span>
        <p className="text-amber-400/80 text-sm font-mono text-center leading-relaxed italic">
          {msg.speech}
        </p>
        <span className="text-xs font-mono text-amber-500/40 tracking-widest uppercase">
          → {msg.phase}
        </span>
      </div>
    </div>
  )
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

function UserBubble({ msg }: { msg: UserMessage }) {
  return (
    <div className="self-center w-full max-w-2xl my-6 animate-fade-in">
      <div className="border-t border-amber-500/30 pt-4 flex flex-col items-center gap-2">
        <span className="text-xs font-mono tracking-widest text-amber-500/60">— YOU —</span>
        <p className="text-amber-300/90 text-sm font-mono text-center leading-relaxed">
          {msg.speech}
        </p>
      </div>
    </div>
  )
}

export default function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.type === 'moderator_message') return <ModeratorBubble msg={msg} />
  if (msg.type === 'user_message') return <UserBubble msg={msg} />
  // AgentMessage from here down
  const label = AGENT_LABELS[msg.agent_id] ?? msg.agent_id
  const urgency = URGENCY_ARROW(msg.urgency_score)
  const isDirected = msg.directed_at !== 'NONE' && msg.directed_at !== 'ALL'
  const directedLabel = isDirected ? AGENT_LABELS[msg.directed_at] ?? msg.directed_at : null

  return (
    <div className={`flex flex-col max-w-2xl animate-fade-in ${getBubbleStyle(msg.agent_id)} mb-8`}>
      {/* Header row */}
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-base text-primary tracking-widest font-mono font-semibold">[{label}]</span>
        <span className="text-sm text-secondary font-mono">urgency {msg.urgency_score} {urgency}</span>
      </div>

      {/* Speech */}
      <p className="text-primary text-base leading-loose font-mono whitespace-pre-wrap">
        {msg.speech}
      </p>

      {/* Footer row */}
      <div className="flex items-center gap-3 mt-3">
        {directedLabel && (
          <span className="text-sm text-muted font-mono">→ {directedLabel}</span>
        )}
        {msg.directed_at === 'ALL' && (
          <span className="text-sm text-muted font-mono">→ ALL</span>
        )}
        <span className="text-sm text-muted font-mono ml-auto">
          {msg.weather_snapshot?.time_str} · {msg.weather_snapshot?.condition} {msg.weather_snapshot?.temp_f}°F
        </span>
      </div>
    </div>
  )
}
