export type AgentId = 'Agent_Prison' | 'Agent_Developer' | 'Agent_Town'
export type EmotionalState = 'DEFIANT' | 'THREATENING' | 'PLEADING' | 'CALCULATING' | 'NEGOTIATING' | 'DISMISSIVE' | 'ALARMED'
export type DirectedAt = AgentId | 'ALL' | 'NONE'

export interface AgentMessage {
  type: 'agent_message'
  agent_id: AgentId
  speech: string
  directed_at: DirectedAt
  emotional_state: EmotionalState
  urgency_score: number
  implicit_challenge_to: AgentId | null
  weather_snapshot: WeatherSnapshot
  timestamp: string
  audio_data?: string  // base64 MP3 from ElevenLabs, optional
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

export type WsMessage =
  | AgentMessage
  | { type: 'agent_thinking'; agent_id: AgentId }
  | { type: 'weather_update'; data: WeatherData }
  | { type: 'routing_debug'; weights: Record<string, number>; selected: AgentId }
  | { type: 'reset_ack' }
  | { type: 'pong' }
