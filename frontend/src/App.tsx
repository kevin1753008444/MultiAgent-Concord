import ChatPage from './pages/ChatPage'
import AdminPage from './pages/AdminPage'
import AgentProjectionPage from './pages/AgentProjectionPage'

export default function App() {
  const path = window.location.pathname
  if (path.startsWith('/screen/')) return <AgentProjectionPage />
  if (path === '/chat') return <ChatPage />
  return <AdminPage />
}
