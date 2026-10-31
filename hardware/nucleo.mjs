// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O núcleo: a presença física da FRIDAY. Um anel de LED (WS2812B de 16 LEDs, 68 mm) atrás de um
// difusor translúcido gravado com a fita de Möbius dela, numa carcaça com berço para a plaquinha
// (ESP32 DevKit ou ESP32-C3) e saída para o cabo USB. Desenho próprio da FRIDAY, nada de filme.
// Unidades: mm. Modelado com Y para cima; o gerador vira Z para cima na hora de salvar.

import { caixa, cilindro, hexagono, intersecao, mover, subtrair, uniao, emVolta, girar } from './sdf.mjs'

/** Medidas que contam para a eletrônica caber (folgas de 0,3 a 0,5 mm para impressora comum). */
export const MEDIDAS = {
  raio: 50, // núcleo de 100 mm
  parede: 3.2,
  anel: { externo: 34, interno: 26, espessura: 3.6 }, // WS2812B 16 LEDs (68 mm por fora)
  placa: { comprimento: 57, largura: 30, altura: 4 }, // berço do ESP32 DevKit (cabe o ESP32-C3 também)
  usb: { largura: 12, altura: 8 },
  difusor: { raio: 47.9, espessura: 3, gravacao: 1.8 },
  folga: 0.3
}

const M = MEDIDAS

/** Contorno da fita de Möbius vista de frente: uma faixa em volta do anel de LED, mais larga onde a fita "deita". */
function fitaVistaDeFrente(raio = 30, largura = 11, minimo = 2) {
  return (x, y, z) => {
    const r = Math.hypot(x, z), u = Math.atan2(z, x)
    const w = minimo + largura * Math.abs(Math.cos(u / 2 + 0.6))
    return Math.abs(r - raio) - w / 2
  }
}

/** Contorno do hexágono da FRIDAY (o mesmo do HUD), como linha. */
const hexagonoLinha = (r, linha, h) => subtrair(hexagono(r, h), hexagono(r - linha, h + 1))

// ---------- Núcleo de mesa ----------

/** Carcaça: fundo, parede, ressalto para o anel, berço da placa e saída do USB. Imprime de boca para cima. */
export function carcacaMesa(altura = 32) {
  const R = M.raio, P = M.parede
  const corpo = mover(cilindro(R, altura, 2), [0, altura / 2, 0])
  const oco = mover(cilindro(R - P, altura), [0, altura / 2 + 2.4, 0])
  // Rebaixo no topo onde o difusor encaixa (por pressão)
  const rebaixo = mover(cilindro(M.difusor.raio + M.folga, 4), [0, altura - 1.9, 0])
  // Ressalto em que o anel de LED apoia (a luz fica a 6 mm do difusor)
  const yAnel = altura - M.difusor.espessura - 6 - M.anel.espessura
  const ressalto = subtrair(mover(cilindro(R - P + 0.1, 2), [0, yAnel - 1, 0]), mover(cilindro(M.anel.interno + 2, 3), [0, yAnel - 1, 0]))
  // Berço da plaquinha no fundo, com a ponta do USB virada para a saída (+X)
  const { comprimento: bc, largura: bl, altura: bh } = M.placa
  const cx = R - P - 2 - bc / 2
  const berco = subtrair(mover(caixa([bc + 3.2, bh, bl + 3.2], 0.6), [cx, 2.4 + bh / 2, 0]), mover(caixa([bc, bh + 2, bl]), [cx, 2.4 + bh / 2 + 1, 0]))
  const saidaUsb = mover(caixa([P * 3, M.usb.altura, M.usb.largura], 1.5), [R - P / 2, 2.4 + 4 + M.usb.altura / 2, 0])
  // Pezinhos de ventilação na base (e para o cabo não forçar)
  const ventilacao = emVolta(mover(caixa([10, 6, 2.2], 1), [R - 9, 0.4, 0]), 6)
  return subtrair(uniao(subtrair(corpo, oco, rebaixo), ressalto, berco), saidaUsb, ventilacao)
}

/** Difusor (imprimir em PLA/PETG branco translúcido): a fita gravada por baixo brilha mais. */
export function difusor() {
  const { raio, espessura, gravacao } = M.difusor
  const disco = mover(cilindro(raio, espessura, 0.4), [0, espessura / 2, 0])
  // Gravado na face de cima (assim imprime sem suporte); na montagem, essa face fica virada para os LEDs
  const camada = mover(cilindro(raio, gravacao * 2), [0, espessura, 0])
  const desenho = uniao(fitaVistaDeFrente(), hexagonoLinha(9, 1.6, 10))
  return subtrair(disco, intersecao(camada, desenho))
}

/** Aro da frente (opaco): segura o difusor e dá o acabamento, com seis recortes de hexágono. */
export function aro() {
  const R = M.raio
  const tampa = subtrair(mover(cilindro(R + 2.4, 3, 0.8), [0, 1.5, 0]), mover(cilindro(R - 7, 5), [0, 1.5, 0]))
  // Saia que veste a carcaça por fora
  const saia = subtrair(mover(cilindro(R + 2.4, 7), [0, -3.5, 0]), mover(cilindro(R + M.folga, 9), [0, -3.5, 0]))
  const recortes = emVolta(girar(mover(hexagono(2.2, 2), [R - 2.5, 3, 0]), 'y', 0), 6)
  return subtrair(uniao(tampa, saia), recortes)
}

// ---------- Núcleo de peito ----------

/** Carcaça fina para usar no peito: a plaquinha fica no bolso; atrás, dois passadores para um elástico de 25 mm. */
export function carcacaPeito() {
  const R = M.raio, P = M.parede, altura = 17
  const corpo = mover(cilindro(R, altura, 2), [0, altura / 2, 0])
  const oco = mover(cilindro(R - P, altura), [0, altura / 2 + 2.4, 0])
  const rebaixo = mover(cilindro(M.difusor.raio + M.folga, 4), [0, altura - 1.9, 0])
  const yAnel = altura - M.difusor.espessura - 4 - M.anel.espessura
  const ressalto = subtrair(mover(cilindro(R - P + 0.1, 2), [0, yAnel - 1, 0]), mover(cilindro(M.anel.interno + 2, 3), [0, yAnel - 1, 0]))
  // Furo do cabo no fundo e dois passadores (pontes) para o elástico
  const furoCabo = mover(cilindro(3.5, 10), [0, 1, -20])
  const passador = (x) => subtrair(mover(caixa([8, 6, 34], 1.5), [x, -2, 0]), mover(caixa([9, 3.2, 27]), [x, -1.6, 0]))
  return subtrair(uniao(subtrair(corpo, oco, rebaixo), ressalto, passador(-22), passador(22)), furoCabo)
}

/** Peças e caixas de cálculo (mm, com folga), na ordem em que o guia explica. */
export const PECAS_NUCLEO = [
  { arquivo: 'nucleo-mesa-carcaca', nome: 'Carcaça (mesa)', f: carcacaMesa(), caixa: [[-56, -2, -56], [56, 36, 56]], passo: 0.4, cor: [0.17, 0.2, 0.28], material: 'PLA ou PETG escuro' },
  { arquivo: 'nucleo-difusor', nome: 'Difusor', f: difusor(), caixa: [[-51, -2, -51], [51, 6, 51]], passo: 0.3, cor: [0.55, 0.92, 1], brilho: true, material: 'PLA ou PETG branco translúcido' },
  { arquivo: 'nucleo-aro', nome: 'Aro da frente', f: aro(), caixa: [[-56, -10, -56], [56, 6, 56]], passo: 0.35, cor: [0.78, 0.82, 0.9], material: 'PLA prata ou cinza', deCabecaParaBaixo: true },
  { arquivo: 'nucleo-peito-carcaca', nome: 'Carcaça (peito)', f: carcacaPeito(), caixa: [[-56, -7, -56], [56, 21, 56]], passo: 0.4, cor: [0.17, 0.2, 0.28], material: 'PLA ou PETG escuro' }
]
