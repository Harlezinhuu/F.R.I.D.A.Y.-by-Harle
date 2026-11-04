// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Recados do PC para o celular que chegam mesmo com o app fechado e longe de casa ("cadê meu
// celular", alerta do modo sentinela). Vão pelo serviço público de avisos ntfy, como o porteiro,
// lacrados com a chave do pareamento (AES-256-GCM, com hora e número único): o serviço só vê
// texto embaralhado. No celular, quem recebe é o Recados.java.

import { createHash } from 'node:crypto'
import { aparelhosPareados, segredoDoElo } from './elo'
import { chaveElo, lacrar } from '../shared/elo'

const SERVIDOR = 'https://ntfy.sh/'

/** O mesmo tópico do lado Java (Porteiro.topicoCelular). */
export function topicoCelular(segredo: string): string {
  return `friday-c${createHash('sha256').update(`friday-celular|${segredo}`).digest('hex').slice(0, 32)}`
}

export type RecadoCelular = { acao: 'tocar'; texto?: string } | { acao: 'parar' } | { acao: 'alerta'; texto: string }

/** Manda o recado. Devolve false se não tem celular pareado ou se o serviço não respondeu. */
export async function recadoParaCelular(r: RecadoCelular): Promise<boolean> {
  const segredo = segredoDoElo()
  if (!segredo || !aparelhosPareados().length) return false
  try {
    const corpo = await lacrar(await chaveElo(segredo), r)
    const resp = await fetch(SERVIDOR + topicoCelular(segredo), { method: 'POST', body: corpo, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, signal: AbortSignal.timeout(10_000) })
    return resp.ok
  } catch {
    return false
  }
}
