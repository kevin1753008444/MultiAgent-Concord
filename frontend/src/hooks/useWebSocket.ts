import { useEffect, useRef, useCallback } from 'react'
import { useConversationStore } from '../store/conversationStore'
import type { WsMessage } from '../types'

const WS_URL = `ws://${window.location.host}/ws`

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { addMessage, setThinking, setWeather, reset } = useConversationStore()

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WsMessage = JSON.parse(event.data)
      switch (data.type) {
        case 'agent_message':
          addMessage(data)
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
  }, [addMessage, setThinking, setWeather, reset])

  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    ws.onmessage = handleMessage
    ws.onopen = () => console.log('WS connected')
    ws.onerror = (e) => console.error('WS error', e)

    return () => ws.close()
  }, [handleMessage])

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}
