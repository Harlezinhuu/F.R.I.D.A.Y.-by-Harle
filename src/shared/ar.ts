// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// HUD em realidade aumentada: o celular aponta a câmera para o monitor e os dados do PC aparecem
// flutuando em volta dele. Para o celular saber onde está a tela, o PC mostra quatro marcas nos cantos
// (o mesmo desenho dos quadrados de canto do QR Code: preto, branco, preto, na proporção 1:1:3:1:1).
// Este arquivo é o combinado entre os dois lados: onde ficam as marcas e o que o PC manda.

/** Módulos de cada marca: 7 do desenho e 1 de margem branca de cada lado. */
export const MODULOS_MARCA = 9

/** Tamanho (px) e posição das marcas numa tela w × h. Centros normalizados (0 a 1), na ordem: ↖ ↗ ↘ ↙. */
export function marcasAr(w: number, h: number): { lado: number; margem: number; centros: [number, number][] } {
  const lado = Math.max(MODULOS_MARCA * 6, Math.round((Math.min(w, h) * 0.12) / MODULOS_MARCA) * MODULOS_MARCA)
  const margem = Math.round(Math.min(w, h) * 0.012)
  const c = margem + lado / 2
  return { lado, margem, centros: [[c / w, c / h], [(w - c) / w, c / h], [(w - c) / w, (h - c) / h], [c / w, (h - c) / h]] }
}

/** Uma marca em SVG (9 × 9 módulos, bordas nítidas). */
export const svgMarca = (lado: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 9 9" shape-rendering="crispEdges">` +
  '<rect width="9" height="9" fill="#fff"/><rect x="1" y="1" width="7" height="7" fill="#000"/><rect x="2" y="2" width="5" height="5" fill="#fff"/><rect x="3" y="3" width="3" height="3" fill="#000"/></svg>'

export interface DadosAr {
  pc: string
  hora: string
  /** Há quanto tempo o PC está ligado ("3 h 12 min") */
  ligadoHa: string
  sistema: { cpu: number; ram: number; ramTotalGb: number; gpu: number | null; vramUsadaGb: number | null; vramTotalGb: number | null } | null
  /** Programa que está na frente ("Code", "chrome") */
  programa: string
  lembretes: { hora: string; texto: string }[]
  /** Tarefa de programação em andamento */
  tarefa: { projeto: string; estado: string; andamento: string } | null
  pesquisas: { titulo: string; etapa: string }[]
  rede: { ligados: number; desconhecidos: string[] } | null
  consulta: string | null
}

export interface RespostaAr {
  /** Largura ÷ altura da tela do PC */
  aspecto: number
  /** Centros das marcas, normalizados, ↖ ↗ ↘ ↙ */
  marcas: [number, number][]
  dados: DadosAr
}
