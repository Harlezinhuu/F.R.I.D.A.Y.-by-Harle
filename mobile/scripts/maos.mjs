// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Coloca dentro do app o que o reconhecimento de mãos precisa para funcionar sem internet:
// os arquivos do MediaPipe (do pacote instalado, na mesma versão do código) e o modelo das mãos.
// Roda depois do "vite build". Sem internet, o app baixa o modelo na primeira vez que for usado.
import { cpSync, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const destino = join(raiz, 'dist', 'maos')
const URL_MAOS = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const wasm = join(raiz, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
if (!existsSync(wasm)) {
  console.warn('Aviso: @mediapipe/tasks-vision não está instalado; o editor de hologramas fica sem as mãos.')
  process.exit(0)
}
mkdirSync(destino, { recursive: true })
rmSync(join(destino, 'wasm'), { recursive: true, force: true })
cpSync(wasm, join(destino, 'wasm'), { recursive: true })
try {
  const resp = await fetch(URL_MAOS, { signal: AbortSignal.timeout(120_000) })
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(join(destino, 'hand_landmarker.task')))
  console.log('Modelo das mãos dentro do app.')
} catch (e) {
  rmSync(join(destino, 'hand_landmarker.task'), { force: true })
  console.warn(`Aviso: não baixei o modelo das mãos (${e.message}); o app baixa na primeira vez.`)
}
