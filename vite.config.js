// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',          
  plugins: [react()],
})
