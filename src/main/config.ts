// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FridayConfig } from '../shared/types'
import type { FishConfig } from './fish'

/** Pasta com os recursos (modelo de ativação, ícone). Em produção fica ao lado do app. */
export function resourcesDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
}

export const MODELO_ATIVACAO_ARQUIVO = 'vosk-model-small-en-us-0.15.tar.gz'

// Chaves do Google AI Studio: formato antigo (AIza...) e novo (AQ....)
const CHAVE_GOOGLE = /^(AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_.-]{30,})$/

/** Lê um .env simples (CHAVE=valor), sem dependências e tolerante a formatos do Bloco de Notas. */
function lerEnv(caminho: string): Record<string, string> {
  if (!existsSync(caminho)) return {}
  let texto = readFileSync(caminho)
  // UTF-16 (Bloco de Notas "Unicode") ou UTF-8 com BOM
  let conteudo = texto[0] === 0xff && texto[1] === 0xfe ? texto.toString('utf16le') : texto.toString('utf8')
  conteudo = conteudo.replace(/^﻿/, '')
  const saida: Record<string, string> = {}
  const linhas = conteudo.split(/\r?\n/)
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha || linha.startsWith('#')) continue
    const m = linha.match(/^(?:export\s+)?([A-Za-z0-9_]+)\s*[=:]\s*(.*)$/)
    if (!m) continue
    const nome = m[1].toUpperCase()
    let valor = m[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').trim()
    // Chave colada na linha de baixo, em vez de depois do "="
    if (!valor && nome.endsWith('_API_KEY') && CHAVE_GOOGLE.test(linhas[i + 1]?.trim() ?? '')) valor = linhas[i + 1].trim()
    // Uma linha vazia repetida nunca apaga um valor já preenchido
    if (valor || !(nome in saida)) saida[nome] = valor
  }
  // Chave do Gemini colada sozinha ou na linha de outra configuração
  if (!saida.GEMINI_API_KEY) {
    const solta = linhas.map((l) => l.trim()).find((l) => CHAVE_GOOGLE.test(l))
    const trocada = Object.entries(saida).find(([k, v]) => k !== 'GEMINI_API_KEY' && CHAVE_GOOGLE.test(v))
    if (solta) saida.GEMINI_API_KEY = solta
    else if (trocada) {
      saida.GEMINI_API_KEY = trocada[1]
      saida[trocada[0]] = ''
      console.warn(`[friday] a chave do Gemini estava na linha ${trocada[0]} do .env; usando mesmo assim`)
    }
  }
  return saida
}

/** Onde o .env pode estar: pasta de dados do usuário (app instalado), pasta do projeto e pasta de onde foi aberto. */
export function caminhosEnv(): string[] {
  return [...new Set([join(app.getPath('userData'), '.env'), join(app.getAppPath(), '.env'), join(process.cwd(), '.env')])]
}

function lerTudo(): Record<string, string> {
  const env: Record<string, string> = {}
  // Os primeiros caminhos têm prioridade; valores vazios nunca apagam um valor preenchido
  for (const c of [...caminhosEnv()].reverse()) {
    for (const [k, v] of Object.entries(lerEnv(c))) if (v || !(k in env)) env[k] = v
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v && (k.startsWith('FRIDAY_') || k.startsWith('FISH_') || k === 'GEMINI_API_KEY')) env[k] = v
  }
  return env
}

/** Explica por que a chave do Gemini não foi encontrada, para o aviso na tela. */
export function diagnosticoChave(): string {
  const achados = caminhosEnv().filter((c) => existsSync(c))
  if (!achados.length) return `Não achei nenhum arquivo .env. Crie um em: ${caminhosEnv()[1]}`
  const temLinha = achados.some((c) => /GEMINI_API_KEY/i.test(readFileSync(c).toString('utf8')))
  if (!temLinha) return `Achei o .env em ${achados[0]}, mas ele não tem a linha GEMINI_API_KEY=.`
  return `Achei o .env em ${achados[0]}, mas a GEMINI_API_KEY está vazia. Cole a chave logo depois do "=", na mesma linha, e salve.`
}

/** Configuração do Fish Audio. Fica só no processo principal: a chave nunca vai para o HUD. */
export function carregarFish(): FishConfig {
  const env = lerTudo()
  return {
    apiKey: env.FISH_API_KEY ?? '',
    vozId: env.FISH_VOZ_ID ?? '',
    modelo: env.FISH_MODELO || 's2.1-pro-free',
    velocidade: Math.min(2, Math.max(0.5, Number(env.FISH_VELOCIDADE) || 1))
  }
}

export function carregarConfig(): FridayConfig {
  const env = lerTudo()

  const modeloPath = join(resourcesDir(), 'models', MODELO_ATIVACAO_ARQUIVO)
  return {
    apiKey: env.GEMINI_API_KEY ?? '',
    modelo: env.FRIDAY_MODELO || 'gemini-2.5-flash-native-audio-preview-12-2025',
    voz: env.FRIDAY_VOZ || 'Kore',
    nome: env.FRIDAY_NOME ?? '',
    silencioSegundos: Math.max(5, Number(env.FRIDAY_SILENCIO_SEGUNDOS) || 20),
    silencioFimFalaMs: Math.min(2000, Math.max(200, Number(env.FRIDAY_FIM_DA_FALA_MS) || 500)),
    vozProvedor: (env.FRIDAY_VOZ_PROVEDOR || '').toLowerCase() === 'fish' && env.FISH_API_KEY ? 'fish' : 'gemini',
    efeitoVoz: !['0', 'false', 'nao', 'não'].includes((env.FRIDAY_EFEITO_VOZ || '1').toLowerCase()),
    cidade: env.FRIDAY_CIDADE ?? '',
    cenas: !['0', 'false', 'nao', 'não'].includes((env.FRIDAY_CENAS || '1').toLowerCase()),
    saudacao: !['0', 'false', 'nao', 'não'].includes((env.FRIDAY_SAUDACAO || '1').toLowerCase()),
    modeloAtivacaoUrl: existsSync(modeloPath) ? `friday-assets://models/${MODELO_ATIVACAO_ARQUIVO}` : null
  }
}
