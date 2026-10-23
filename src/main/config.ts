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

/** Lê um .env simples (CHAVE=valor), sem dependências. */
function lerEnv(caminho: string): Record<string, string> {
  if (!existsSync(caminho)) return {}
  const saida: Record<string, string> = {}
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || linha.trim().startsWith('#')) continue
    saida[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return saida
}

/** Onde o .env pode estar: na pasta de dados do usuário (app instalado) ou na raiz do projeto (desenvolvimento). */
export function caminhosEnv(): string[] {
  return [join(app.getPath('userData'), '.env'), join(app.getAppPath(), '.env')]
}

function lerTudo(): Record<string, string> {
  const env: Record<string, string> = {}
  // O primeiro arquivo encontrado tem prioridade
  for (const c of caminhosEnv().reverse()) Object.assign(env, lerEnv(c))
  Object.assign(env, Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('FRIDAY_') || k.startsWith('FISH_') || k === 'GEMINI_API_KEY')) as Record<string, string>)
  return env
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
    vozProvedor: (env.FRIDAY_VOZ_PROVEDOR || '').toLowerCase() === 'fish' && env.FISH_API_KEY ? 'fish' : 'gemini',
    efeitoVoz: !['0', 'false', 'nao', 'não'].includes((env.FRIDAY_EFEITO_VOZ || '1').toLowerCase()),
    modeloAtivacaoUrl: existsSync(modeloPath) ? `friday-assets://models/${MODELO_ATIVACAO_ARQUIVO}` : null
  }
}
