// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Mesa holográfica: o que o processo principal manda para o HUD (os cartões e a maquete de um projeto).

export type TipoCartao = 'projeto' | 'design' | 'relatorio'

export interface CartaoMesa {
  id: string
  tipo: TipoCartao
  titulo: string
  /** Linha pequena embaixo do título */
  sub: string
  /** Até 4 linhas de ficha */
  ficha: string[]
}

export type EstadoSala = 'ok' | 'mudado' | 'falha'
export interface Sala { nome: string; caminho: string; linhas: number; estado: EstadoSala }
export interface Andar { nome: string; caminho: string; linhas: number; arquivos: number; salas: Sala[]; estado: EstadoSala }
export interface Predio { projeto: string; andares: Andar[]; arquivos: number; linhas: number; falhas: number; mudados: number }
