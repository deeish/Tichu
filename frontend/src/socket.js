import { io } from 'socket.io-client'
import { initClientErrorReport } from './clientErrorReport'

// Read once at module load — same timing as the socket init — so the auth
// callback can suppress credentials when landing from an invite link.
// Without this, the server's handshake-auth handler fires synchronously on
// connection and overwrites the host's socketId with the new socket, causing
// both players to share the same socketId ("You, Host" on every row).
const _INVITE_JOIN_CODE = new URLSearchParams(window.location.search).get('join') || null

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
  auth: (cb) => {
    // Called before every connection and reconnect — fresh creds each time.
    // Server reads these in the connection handler to restore players.set()
    // synchronously, before any event can race with make-move.
    if (_INVITE_JOIN_CODE) { cb({}); return }
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
