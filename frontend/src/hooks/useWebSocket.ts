import { useEffect, useRef, useCallback } from 'react'
import { useConversationStore } from '../store/conversationStore'
import type { WsMessage } from '../types'

const WS_URL = `ws://${window.location.host}/ws`

// ── Audio queue ────────────────────────────────────────────────────────────
// Plays base64 MP3 clips sequentially so agent voices never overlap.
const audioQueue: string[] = []
let audioPlaying = false

function enqueueAudio(base64Mp3: string) {
  audioQueue.push(base64Mp3)
  if (!audioPlaying) drainQueue()
}

function drainQueue() {
  const next = audioQueue.shift()
  if (!next) { audioPlaying = false; return }
  audioPlaying = true
  const audio = new Audio(`data:audio/mpeg;base64,${next}`)
  audio.onended = drainQueue
  audio.onerror = drainQueue  // skip broken clips, keep going
  audio.play().catch(drainQueue)
}
// ──────────────────────────────────────────────────────────────────────────

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { addMessage, addModeratorMessage, addUserMessage, setThinking, setWeather, setWsConnected, reset } = useConversationStore()

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WsMessage = JSON.parse(event.data)
      switch (data.type) {
        case 'agent_message':
          addMessage(data)
          if (data.audio_data) enqueueAudio(data.audio_data)
          break
        case 'moderator_message':
          addModeratorMessage(data)
          break
        case 'user_message':
          addUserMessage(data)
          break
        case 'agent_thinking':
          setThinking(data.agent_id)
          break
        case 'weather_update':
          setWeather(data.data)
          break
        case 'reset_ack':
          reset()
          break
      }
    } catch (e) {
      console.error('WS parse error', e)
    }
  }, [addMessage, addModeratorMessage, addUserMessage, setThinking, setWeather, reset])

  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    ws.onmessage = handleMessage
    ws.onopen = () => { setWsConnected(true); console.log('WS connected') }
    ws.onclose = () => setWsConnected(false)
    ws.onerror = (e) => console.error('WS error', e)

    return () => ws.close()
  }, [handleMessage, setWsConnected])

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}
