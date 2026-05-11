export type AgentId = 'Agent_Prison' | 'Agent_Developer' | 'Agent_Town'
export type DirectedAt = AgentId | 'ALL' | 'NONE'
export type AgentVisualMode = 'idle' | 'thinking' | 'speaking'
export type AgentEmotion = 'neutral' | 'uneasy' | 'angry'

export interface AgentMessage {
  type: 'agent_message'
  agent_id: AgentId
  speech: string
  directed_at: DirectedAt
  emotional_state?: string | null
  urgency_score: number
  implicit_challenge_to: AgentId | null
  weather_snapshot: WeatherSnapshot
  timestamp: string
  audio_data?: string  // base64 MP3 from ElevenLabs, optional
}

export interface ModeratorMessage {
  type: 'moderator_message'
  speech: string
  timestamp: string
}

export interface UserMessage {
  type: 'user_message'
  speech: string
  timestamp: string
}

export type ChatMessage = AgentMessage | ModeratorMessage | UserMessage

export interface HistoryMessage {
  sender: AgentId | 'USER' | 'MODERATOR' | 'SYSTEM'
  speech: string
  directed_at?: DirectedAt | null
  urgency_score?: number | null
  weather_snapshot?: WeatherSnapshot | null
  created_at?: string | null
}

export interface WeatherSnapshot {
  condition: string
  temp_f: number
  time_str: string
}

export interface WeatherData {
  condition: string
  description: string
  temp_f: number
  temp_c: number
  humidity: number
  time_str: string
}

export interface AgentAsset {
  agent_id: AgentId
  mode: AgentVisualMode
  emotion: AgentEmotion
  filename: string
  url: string
  media_type: 'image' | 'video'
}

export type AgentAssetMap = Partial<Record<AgentId, Partial<Record<AgentVisualMode, Partial<Record<AgentEmotion, AgentAsset>>>>>>

export type WsMessage =
  | AgentMessage
  | ModeratorMessage
  | UserMessage
  | { type: 'agent_thinking'; agent_id: AgentId }
  | { type: 'weather_update'; data: WeatherData }
  | { type: 'routing_debug'; weights: Record<string, number>; selected: AgentId }
  | { type: 'reset_ack' }
  | { type: 'pong' }
  | { type: 'user_transcribing'; text: string; is_final: boolean }
