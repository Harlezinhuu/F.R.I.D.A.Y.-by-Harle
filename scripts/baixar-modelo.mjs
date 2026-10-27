// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Baixa os modelos que rodam no seu PC e prepara para o HUD. Uso: npm run modelo
// - palavra "Friday" (Vosk, ~40 MB): o áudio só vai para a internet depois que você diz "Friday"
// - mãos (MediaPipe Hand Landmarker, ~8 MB): a imagem da câmera nunca sai do PC

import { cpSync, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const NOME = 'vosk-model-small-en-us-0.15'
const URL_MODELO = `https://alphacephei.com/vosk/models/${NOME}.zip`
const pasta = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'models')
const zip = join(pasta, `${NOME}.zip`)
const destino = join(pasta, `${NOME}.tar.gz`)

async function baixarVosk() {
  if (existsSync(destino)) {
    console.log(`O modelo do "Friday" já está pronto em ${destino}`)
    return
  }
  mkdirSync(pasta, { recursive: true })
  console.log(`Baixando ${URL_MODELO} ...`)
  const resp = await fetch(URL_MODELO)
  if (!resp.ok || !resp.body) throw new Error(`Falha no download: HTTP ${resp.status}`)
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(zip))

  // O Windows 10/11 já vem com o "tar", que também abre .zip
  console.log('Extraindo...')
  execFileSync('tar', ['-xf', zip, '-C', pasta], { stdio: 'inherit' })
  console.log('Compactando no formato que o reconhecedor usa...')
  execFileSync('tar', ['-czf', destino, '-C', pasta, NOME], { stdio: 'inherit' })

  rmSync(zip, { force: true })
  rmSync(join(pasta, NOME), { recursive: true, force: true })
  console.log(`Pronto! Modelo do "Friday" salvo em ${destino}`)
}

const URL_MAOS = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

async function prepararMaos() {
  const pastaMaos = join(pasta, 'maos')
  mkdirSync(pastaMaos, { recursive: true })
  // Os arquivos do MediaPipe vêm do pacote instalado (sempre na mesma versão do código)
  const wasm = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
  if (!existsSync(wasm)) throw new Error('Rode "npm install" antes: o pacote @mediapipe/tasks-vision não está instalado.')
  rmSync(join(pastaMaos, 'wasm'), { recursive: true, force: true })
  cpSync(wasm, join(pastaMaos, 'wasm'), { recursive: true })
  const modelo = join(pastaMaos, 'hand_landmarker.task')
  if (existsSync(modelo)) {
    console.log('O modelo das mãos já está pronto.')
    return
  }
  console.log(`Baixando o modelo das mãos (${URL_MAOS}) ...`)
  const resp = await fetch(URL_MAOS)
  if (!resp.ok || !resp.body) throw new Error(`Falha no download do modelo das mãos: HTTP ${resp.status}`)
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(`${modelo}.parcial`))
  cpSync(`${modelo}.parcial`, modelo)
  rmSync(`${modelo}.parcial`, { force: true })
  console.log('Pronto! Modelo das mãos salvo.')
}

let falhou = false
for (const [nome, passo] of [['palavra "Friday"', baixarVosk], ['mãos', prepararMaos]]) {
  try { await passo() } catch (e) { falhou = true; console.error(`Não deu para preparar o modelo de ${nome}: ${e.message}`) }
}
if (falhou) process.exit(1)
