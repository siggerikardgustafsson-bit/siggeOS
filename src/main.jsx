import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { registerSW } from './pwa.js'
import { initPwaInstall } from './hooks/usePwaInstall.js'
import './index.css'

// Capture beforeinstallprompt as early as possible so the install button works
// everywhere (it can fire before React mounts).
initPwaInstall()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)

registerSW()
