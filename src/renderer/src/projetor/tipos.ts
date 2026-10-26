// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O que a projeção 3D recebe: um modelo feito de partes, cada uma com pontos (as partículas),
// arestas (as linhas do wireframe) e, se tiver, triângulos (a superfície do "renderiza").

export interface Parte {
  nome: string
  /** x, y, z de cada partícula */
  pontos: Float32Array
  /** pares de pontos (x1, y1, z1, x2, y2, z2) de cada linha */
  arestas: Float32Array
  /** triângulos soltos (9 números cada), para a superfície sólida */
  triangulos?: Float32Array
  /** cor própria da parte (0 a 1), misturada com a cor do holograma */
  cor?: [number, number, number]
}

export interface Modelo3D {
  nome: string
  /** De onde veio: "FORMA", "NASA", "WIKIMEDIA", "PUBCHEM", "SEU ARQUIVO", "IA", "FUNÇÃO" */
  fonte: string
  /** Linhas de informação mostradas ao lado do holograma */
  detalhes: string[]
  partes: Parte[]
  /** Já vem centrado e no tamanho do holograma (formas animadas) */
  normalizado?: boolean
  /**
   * Formas animadas (tesseract, sistema solar, funções com t): atualiza pontos e arestas
   * das partes no lugar, a cada quadro. `t` em segundos.
   */
  animar?: (t: number, partes: Parte[]) => void
  /** Tamanho real, quando se sabe (para o "mede") */
  medidaReal?: { largura: number; altura: number; profundidade: number; unidade: string }
  /** Crédito/licença exigidos pela fonte */
  credito?: string
  /** Etiquetas das peças sempre visíveis (sistema solar), não só na vista explodida */
  rotulosSempre?: boolean
  /** Comandos aplicados logo ao abrir (ex.: a Möbius invertida já abre invertida) */
  acoesIniciais?: string[]
}
