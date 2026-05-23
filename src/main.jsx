// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import './index.css'
import './App.css'
import 'leaflet/dist/leaflet.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
)

