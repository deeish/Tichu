import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import HowToPlay from './components/HowToPlay'
import { RootErrorBoundary } from './components/GameErrorBoundary'
import { reportClientError } from './clientErrorReport'
import './index.css'

if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary onError={(p) => reportClientError(p)}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/how-to-play" element={<HowToPlay />} />
        </Routes>
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>,
)
