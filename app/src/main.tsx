import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerCoiServiceWorker } from './engine/registerCoi'
import './i18n'
import './index.css'

registerCoiServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
