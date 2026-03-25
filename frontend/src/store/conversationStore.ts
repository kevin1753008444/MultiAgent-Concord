import { create } from 'zustand'
import type { AgentMessage, AgentId, WeatherData } from '../types'

interface ConversationState {
  messages: AgentMessage[]
  thinkingAgent: AgentId | null
  weather: WeatherData | null
  isAutoMode: boolean
  wsConnected: boolean

  addMessage: (msg: AgentMessage) => void
  setThinking: (agentId: AgentId | null) => void
  setWeather: (data: WeatherData) => void
  setAutoMode: (val: boolean) => void
  setWsConnected: (val: boolean) => void
  reset: () => void
}

export const useConversationStore = create<ConversationState>((set) => ({
  messages: [],
  thinkingAgent: null,
  weather: null,
  isAutoMode: false,
  wsConnected: false,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg], thinkingAgent: null })),
  setThinking: (agentId) => set({ thinkingAgent: agentId }),
  setWeather: (data) => set({ weather: data }),
  setAutoMode: (val) => set({ isAutoMode: val }),
  setWsConnected: (val) => set({ wsConnected: val }),
  reset: () => set({ messages: [], thinkingAgent: null }),
}))
