// Baixa o modelo de reconhecimento da palavra "Friday" (Vosk, ~40 MB) e prepara para o HUD.
// Uso: npm run modelo
//
// O modelo roda 100% no seu PC: o áudio só vai para a internet depois que você diz "Friday".

import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
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

if (existsSync(destino)) {
  console.log(`O modelo já está pronto em ${destino}`)
  process.exit(0)
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
console.log(`Pronto! Modelo salvo em ${destino}`)
