import { io } from 'socket.io-client'
import { initClientErrorReport } from './clientErrorReport'

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
  auth: (cb) => {
    // Called before every connection and reconnect — fresh creds each time.
    // Server reads these in the connection handler to restore players.set()
    // synchronously, before any event can race with make-move.
    const gameId = localStorage.getItem('tichu_rejoin_gameId') || undefined
    const token = localStorage.getItem('tichu_rejoin_token') || undefined
    cb(gameId && token ? { gameId, token } : {})
  },
  reconnectionDelay: 500,
  reconnectionDelayMax: 2500,
  closeOnBeforeunload: false,
})
initClientErrorReport(socket)

export { socket }
