import ChatPage from './pages/ChatPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  const isAdmin = window.location.pathname === '/admin'
  return isAdmin ? <AdminPage /> : <ChatPage />
}
