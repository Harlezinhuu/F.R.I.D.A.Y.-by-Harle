import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // O HUD roda numa janela web; o worklet de áudio fica em src/renderer/public
    publicDir: 'public'
  }
})
