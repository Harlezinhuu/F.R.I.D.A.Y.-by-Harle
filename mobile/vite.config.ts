// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O app do celular reaproveita o núcleo 3D, o áudio, o Gemini Live e a projeção do PC
// (pasta src/ da raiz). Os pacotes vêm sempre do node_modules do próprio app.
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const aqui = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  base: './',
  // O worklet do microfone é o mesmo do PC
  publicDir: aqui('../src/renderer/public'),
  resolve: {
    alias: {
      three: aqui('./node_modules/three'),
      '@google/genai': aqui('./node_modules/@google/genai'),
      '@mediapipe/tasks-vision': aqui('./node_modules/@mediapipe/tasks-vision')
    }
  },
  server: { fs: { allow: [aqui('..')] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000 }
})
