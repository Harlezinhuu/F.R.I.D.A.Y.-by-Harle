import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FridayConfig } from '../shared/types'

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

export function carregarConfig(): FridayConfig {
  const env: Record<string, string> = {}
  // O primeiro arquivo encontrado tem prioridade
  for (const c of caminhosEnv().reverse()) Object.assign(env, lerEnv(c))
  Object.assign(env, Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('FRIDAY_') || k === 'GEMINI_API_KEY')) as Record<string, string>)

  const modeloPath = join(resourcesDir(), 'models', MODELO_ATIVACAO_ARQUIVO)
  return {
    apiKey: env.GEMINI_API_KEY ?? '',
    modelo: env.FRIDAY_MODELO || 'gemini-2.5-flash-native-audio-preview-12-2025',
    voz: env.FRIDAY_VOZ || 'Kore',
    nome: env.FRIDAY_NOME ?? '',
    silencioSegundos: Math.max(5, Number(env.FRIDAY_SILENCIO_SEGUNDOS) || 20),
    modeloAtivacaoUrl: existsSync(modeloPath) ? `friday-assets://models/${MODELO_ATIVACAO_ARQUIVO}` : null
  }
}
