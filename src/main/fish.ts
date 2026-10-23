// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Voz pelo Fish Audio: recebe uma frase e devolve o áudio em pedaços, conforme vai sendo gerado.
// Roda no processo principal para a chave do Fish Audio nunca chegar ao HUD.

export interface FishConfig {
  apiKey: string
  vozId: string
  modelo: string
  velocidade: number
}

export const FISH_SAMPLE_RATE = 24000

const ativos = new Map<number, AbortController>()

/**
 * Gera a fala de `texto`. Cada pedaço de áudio (PCM 16 bits, mono, 24 kHz, em base64)
 * vai para `aoPedaco`. Termina quando o Fish Audio acaba de mandar o áudio.
 */
export async function falar(cfg: FishConfig, id: number, texto: string, aoPedaco: (b64: string) => void): Promise<void> {
  const controle = new AbortController()
  ativos.set(id, controle)
  try {
    const resp = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      signal: controle.signal,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        model: cfg.modelo
      },
      body: JSON.stringify({
        text: texto,
        reference_id: cfg.vozId || null,
        format: 'pcm',
        sample_rate: FISH_SAMPLE_RATE,
        latency: 'low',
        normalize: true,
        prosody: { speed: cfg.velocidade }
      })
    })
    if (!resp.ok || !resp.body) {
      const detalhe = await resp.text().catch(() => '')
      if (resp.status === 401) throw new Error('Chave do Fish Audio inválida (FISH_API_KEY).')
      if (resp.status === 402) throw new Error('Sem créditos no Fish Audio.')
      throw new Error(`Fish Audio respondeu ${resp.status}. ${detalhe.slice(0, 160)}`)
    }

    // Amostras de 16 bits têm 2 bytes: se um pedaço chegar com número ímpar de bytes, o último espera o próximo
    let sobra: Uint8Array | null = null
    const leitor = resp.body.getReader()
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      let dados: Uint8Array = value
      if (sobra) {
        const junto = new Uint8Array(sobra.length + dados.length)
        junto.set(sobra)
        junto.set(dados, sobra.length)
        dados = junto
        sobra = null
      }
      const par = dados.length - (dados.length % 2)
      if (par < dados.length) sobra = dados.slice(par)
      if (par > 0) aoPedaco(Buffer.from(dados.buffer, dados.byteOffset, par).toString('base64'))
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    throw e
  } finally {
    ativos.delete(id)
  }
}

/** Cancela todas as falas em andamento (quando você interrompe a FRIDAY). */
export function cancelarTudo(): void {
  for (const c of ativos.values()) c.abort()
  ativos.clear()
}
