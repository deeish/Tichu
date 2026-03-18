import { io } from 'socket.io-client'
import { initClientErrorReport } from './clientErrorReport'

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001')
initClientErrorReport(socket)

export { socket }
