// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O capacete da FRIDAY: desenho próprio (nada de filme). Casco liso com crista atrás, janela
// sextavada para os olhos coberta por uma viseira que levanta (micro servo SG90), barra de luz na
// testa (fita de LED), grade sextavada na boca e dois casulos sextavados nas laterais: um com o
// servo, outro com a plaquinha (ESP32-C3 SuperMini) e a entrada USB-C.
// Unidades: mm. Y para cima, Z para a frente (rosto), X para a direita de quem veste.
// Origem: na altura do ouvido (trago), no meio da cabeça.

import { caixa, capsula, elipsoide, hexagono, intersecao, subtrair, uniao, uniaoSuave } from './sdf.mjs'

/** Medidas (cabeça adulta média, 58 cm de volta, com uns 10 mm de espuma em volta). */
export const MEDIDAS = {
  W: 100, // meia largura do casco
  R: 121, // raio do domo (visto de lado) e meia profundidade
  yc: 20, // eixo da viseira (as dobradiças): 20 mm acima do ouvido
  zc: 14.5, // e um pouco à frente (sobra espaço para o nariz)
  parede: 3,
  folgaViseira: 1,
  espessuraViseira: 3,
  corteFrente: -125, // borda de baixo na frente (queixo)
  corteTras: -110, // e atrás (nuca)
  // Divisão para caber numa impressora comum (220 × 220 × 250)
  divisaoZ: -20,
  divisaoY: -35,
  servo: { comprimento: 23, largura: 12.5, altura: 22.7, abas: 32.5, alturaAbas: 4.3, espessuraAbas: 2.5, eixo: 5.9, furos: 27.5 },
  placa: { comprimento: 22.5, largura: 18 } // ESP32-C3 SuperMini
}

const M = MEDIDAS
const { W, R, yc, zc, parede: P } = M
const RAD = Math.PI / 180
/** Centro do cubo da viseira (fica 4 mm para fora da ponta do casco, no eixo). */
const EIXO = W + 4

/** Elipse (aproximação de distância), no plano. */
const elipse2 = (a, b) => (u, v) => {
  const k0 = Math.hypot(u / a, v / b), k1 = Math.hypot(u / (a * a), v / (b * b))
  return k1 === 0 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1
}

// ---------- A forma de fora ----------

const domo = elipsoide([W, R, R])
const saia = elipse2(W, R)
/** A saia afina um pouco para baixo (até 6%), sem apertar a passagem da cabeça. */
const afinar = (y) => 1 - 0.06 * Math.min(1, Math.max(0, (yc - y) / (yc - M.corteFrente))) ** 1.5
/** Superfície externa lisa: domo (que gira em volta do eixo das dobradiças) + saia para baixo. */
export const S0 = (x, y, z) => {
  const s = afinar(y)
  return Math.min(domo(x, y - yc, z - zc), Math.max(saia(x / s, (z - zc) / s) * s, y - yc))
}

/** Ângulo em volta do eixo das dobradiças (0 = para a frente, 90° = para cima), em radianos. */
const angulo = (y, z) => Math.atan2(y - yc, z - zc)
const raio = (y, z) => Math.hypot(y - yc, z - zc)

/** Fatia de ângulos [a0, a1] (graus) em volta do eixo, como distância aproximada. */
const setor = (a0, a1) => {
  const meio = ((a0 + a1) / 2) * RAD, meia = ((a1 - a0) / 2) * RAD
  return (x, y, z) => {
    let d = angulo(y, z) - meio
    d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
    const fora = Math.abs(d) - meia
    return raio(y, z) * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, fora)))
  }
}

/** Crista baixa que vai do alto da cabeça até a nuca (atrás de onde a viseira sobe). */
const crista = intersecao((x) => Math.abs(x) - 4.5, (x, y, z) => S0(x, y, z) - 5, setor(98, 212))
const externa = uniaoSuave(3, S0, crista)
const interna = (x, y, z) => S0(x, y, z) + P // negativo = dentro do vão da cabeça

/** Borda de baixo, um pouco mais baixa na frente (queixo) que atrás (nuca). */
const inclinacao = (M.corteFrente - M.corteTras) / (zc + R - (zc - R))
const corte = (x, y, z) => (M.corteTras + inclinacao * (z - (zc - R)) - y) / Math.hypot(1, inclinacao)

// ---------- Recortes ----------

/** Coordenadas "do rosto": u = lado, v = altura medida pela curva do casco (mm). */
const v = (y, z) => R * angulo(y, z)
const JANELA = { v0: R * -4 * RAD, meiaAltura: R * 12 * RAD, meiaLargura: 74 }
/** Janela sextavada dos olhos (positivo = fora), aumentada em `g` mm. */
const janela = (g = 0) => (x, y, z) => {
  const dv = Math.abs(v(y, z) - JANELA.v0)
  return Math.max(Math.max(dv - JANELA.meiaAltura, Math.abs(x) + 0.5 * dv - JANELA.meiaLargura) - g, zc + 30 - z)
}
const FENDA = { v0: R * 13 * RAD, meiaAltura: R * 2 * RAD, meiaLargura: 55 }
/** Fenda da barra de luz, logo acima da janela. */
const fenda = (g = 0) => (x, y, z) => Math.max(Math.max(Math.abs(v(y, z) - FENDA.v0) - FENDA.meiaAltura, Math.abs(x) - FENDA.meiaLargura) - g, zc + 30 - z)

/** Grade da boca: furinhos sextavados atravessando só a parede da frente. */
const grade = (() => {
  const furos = []
  const linhas = [[-52, [-24, -12, 0, 12, 24]], [-62, [-18, -6, 6, 18]], [-72, [-12, 0, 12]]]
  for (const [y, xs] of linhas) for (const x of xs) furos.push([x, y])
  const hex = hexagono(3.4, 60)
  return (x, y, z) => {
    if (z < 90 || y > -44 || y < -80) return 10
    let d = Infinity
    for (const [cx, cy] of furos) d = Math.min(d, hex(x - cx, z - 130, y - cy))
    return d
  }
})()

/** Hexágono gravado de leve nas bochechas (a marca da FRIDAY). */
const emblema = (() => {
  const linha = (r) => subtrair(hexagono(r, 40), hexagono(r - 1.6, 41))
  const desenho = uniao(linha(14), linha(8.5))
  return (x, y, z) => Math.max(desenho(z - 10, Math.abs(x) - W, y + 55), -0.8 - S0(x, y, z), S0(x, y, z) - 2)
})()

/** Ponto no eixo das dobradiças, `r` mm para fora, no ângulo `a` (graus). */
const noEixo = (r, a) => [yc + r * Math.sin(a * RAD), zc + r * Math.cos(a * RAD)]
const [yFio, zFio] = noEixo(20, 225)
/** Furos para os fios passarem dos casulos para dentro do capacete. */
const furoFio = (x, y, z) => Math.max(Math.hypot(y - yFio, z - zFio) - 4, Math.abs(Math.abs(x) - (W + 1)) - 13)

/** Frisos rasos (0,8 mm): nas emendas das peças (assim a emenda parece desenho) e na linha do queixo. */
const naPele = (x, y, z) => Math.max(-0.8 - S0(x, y, z), S0(x, y, z) - 1.5)
const friso = (plano, largura = 0.8) => (x, y, z) => Math.max(Math.abs(plano(x, y, z)) - largura, naPele(x, y, z))
const [ny, nz] = (() => { const l = Math.hypot(135, 95); return [135 / l, 95 / l] })()
const frisos = uniao(
  friso((x, y, z) => z - M.divisaoZ),
  friso((x, y, z) => y - M.divisaoY),
  // linha do queixo: desce de baixo das dobradiças até a frente, dos dois lados
  (x, y, z) => Math.max(friso((x2, y2, z2) => ny * (y2 + 5) + nz * (z2 + 10), 0.7)(x, y, z), 30 - Math.abs(x), y + 2)
)

// ---------- Casco inteiro e divisão ----------

const casco = subtrair(intersecao(externa, (x, y, z) => -interna(x, y, z), corte), janela(), fenda(), grade, emblema, furoFio, frisos)

/** Ressalto de encaixe: uma tira por dentro que entra 6 mm na peça vizinha. */
const tiraDentro = (x, y, z) => Math.max(-(S0(x, y, z) + P + 0.25), S0(x, y, z) + P + 1.6)
const tiraPresa = (x, y, z) => Math.max(-(S0(x, y, z) + P - 0.4), S0(x, y, z) + P + 1.6)
const entre = (a, b) => (t) => Math.max(a - t, t - b)

function parteDoCasco(frente, cima) {
  const { divisaoZ: zs, divisaoY: ys } = M
  const regiao = (x, y, z) => Math.max(frente ? zs - z : z - zs, cima ? ys - y : y - ys)
  const pecas = [intersecao(casco, regiao)]
  // A frente entra na parte de trás
  if (frente) {
    const faixaY = cima ? (y) => ys + 6 - y : (y) => y - ys
    pecas.push((x, y, z) => Math.max(tiraDentro(x, y, z), entre(zs - 6, zs)(z), faixaY(y), corte(x, y, z)))
    pecas.push((x, y, z) => Math.max(tiraPresa(x, y, z), entre(zs, zs + 4)(z), faixaY(y), corte(x, y, z)))
  }
  // A parte de baixo entra na de cima
  if (!cima) {
    const faixaZ = frente ? (z) => zs - z : (z) => z - zs
    pecas.push((x, y, z) => Math.max(tiraDentro(x, y, z), entre(ys, ys + 6)(y), faixaZ(z)))
    pecas.push((x, y, z) => Math.max(tiraPresa(x, y, z), entre(ys - 4, ys)(y), faixaZ(z)))
  }
  return uniao(...pecas)
}

// ---------- Viseira ----------

const ANGULOS_VISEIRA = [-22, 19]
const naCasca = (de, ate) => (x, y, z) => { const s = S0(x, y, z); return Math.max(de - s, s - ate) }
const { folgaViseira: fv, espessuraViseira: ev } = M
const cubo = (x, y, z) => Math.max(raio(y, z) - 12, Math.abs(Math.abs(x) - EIXO) - 2)

export function viseira() {
  const faixa = intersecao(naCasca(fv, fv + ev), setor(...ANGULOS_VISEIRA), (x) => Math.abs(x) - (W + 6))
  const braco = intersecao(setor(...ANGULOS_VISEIRA), (x, y, z) => raio(y, z) - 40, (x) => Math.abs(x) - (EIXO + 2), (x) => EIXO - 10 - Math.abs(x), (x, y, z) => fv - S0(x, y, z))
  const corpo = uniao(faixa, braco, cubo)
  // Janela menor que a do casco, com um rebaixo por dentro para colar a película fumê (até 1 mm)
  const vao = janela(-3)
  const rebaixo = intersecao(janela(4), (x, y, z) => S0(x, y, z) - (fv + 1.2))
  const fresta = (x, y, z) => Math.max(fenda(-0.6)(x, y, z), Math.abs(x) - (FENDA.meiaLargura - 3))
  // Lado esquerdo: furo do eixo. Lado direito: furo para a chave e o encaixe do braço do servo
  const furoEixo = (x, y, z) => Math.max(raio(y, z) - 4.1, Math.abs(x + EIXO) - 3)
  const acessoParafuso = (x, y, z) => Math.max(raio(y, z) - 2.5, Math.abs(x - EIXO) - 3)
  const bracoServo = uniao(
    (x, y, z) => Math.max(raio(y, z) - 3.9, Math.abs(x - (EIXO + 1.25)) - 0.85),
    (x, y, z) => Math.max(capsula([0, yc, zc], [0, yc, zc + 16], 2.6)(0, y, z), Math.abs(x - (EIXO + 1.25)) - 0.85)
  )
  return subtrair(corpo, vao, rebaixo, fresta, furoEixo, acessoParafuso, bracoServo)
}

/** Barra translúcida que encaixa na fenda da testa; a fita de LED cola na aba de dentro. */
export function barraDeLuz() {
  const naParede = intersecao(naCasca(-P, -0.05), fenda(-0.25))
  const aba = intersecao(naCasca(-P - 1.5, -P + 0.2), fenda(2.5))
  return uniao(naParede, aba)
}

// ---------- Casulos (laterais) ----------

const CASULO = { r: 21, rDentro: 18.6, deslocZ: -5.6, placa: [EIXO + 3.5, EIXO + 6.5], fim: EIXO + 32, tampa: 2 }

/** Coordenadas do casulo: xl = distância para o lado (sempre positiva), y/z relativos ao eixo. */
const doCasulo = (f, lado) => (x, y, z) => f(lado * x, y - yc, z - zc)
/** Prisma sextavado deitado no eixo X, entre xl = de e ate. */
const hexLado = (r, de, ate) => {
  const h = hexagono(r, ate - de)
  return (xl, yl, zl) => h(zl - CASULO.deslocZ, xl - (de + ate) / 2, yl)
}

function casulo(lado, comServo) {
  const C = CASULO
  const fora = hexLado(C.r, C.placa[0], C.fim)
  const dentro = hexLado(C.rDentro, C.placa[1], C.fim + 2)
  // Suporte que abraça o casco atrás e embaixo da dobradiça (onde a viseira nunca passa)
  const suporte = (xl, yl, zl) => {
    const x = lado * xl, y = yl + yc, z = zl + zc
    return Math.max(setor(150, 300)(x, y, z), 14 - raio(y, z), raio(y, z) - 26, xl - C.placa[1], EIXO - 12 - xl, 0.2 - S0(x, y, z))
  }
  const fio = (xl, yl, zl) => Math.max(Math.hypot(yl + yc - yFio, zl + zc - zFio) - 3.5, Math.abs(xl - (EIXO - 1)) - 9)
  const casca = subtrair(uniao(fora, suporte), dentro)
  const partes = [casca]
  const furos = [fio]
  if (comServo) {
    const S = M.servo
    furos.push((xl, yl, zl) => Math.max(Math.hypot(yl, zl) - 6.5, Math.abs(xl - (EIXO + 5)) - 3))
    // Apoios para as abas do servo (com furo para os parafusinhos que vêm com ele)
    const zCentro = -(S.comprimento / 2 - S.eixo)
    const topo = C.placa[1], apoioAte = topo + S.alturaAbas
    for (const s of [-1, 1]) {
      const zc2 = zCentro + s * ((S.comprimento / 2 + S.abas / 2) / 2 + 0.15)
      partes.push((xl, yl, zl) => caixa([apoioAte - topo + 0.4, 10, (S.abas - S.comprimento) / 2 - 0.3])(xl - (topo + apoioAte) / 2 + 0.2, yl, zl - zc2))
      furos.push((xl, yl, zl) => Math.max(Math.hypot(yl, zl - (zCentro + (s * S.furos) / 2)) - 0.9, Math.abs(xl - apoioAte) - 4))
    }
  } else {
    // Eixo em que a viseira gira (entra no furo do cubo) e trilhos para a plaquinha deslizar
    partes.push((xl, yl, zl) => Math.max(Math.hypot(yl, zl) - 3.8, entre(EIXO - 1.5, C.placa[0] + 0.5)(xl), Math.hypot(yl, zl) - (3.8 - Math.max(0, EIXO - 0.8 - xl))))
    for (const s of [-1, 1]) {
      // trilho de 8,2 mm do centro até a parede; a ranhura vai até 9,5 (a placa tem 18 mm de largura)
      partes.push((xl, yl, zl) => caixa([18, 5, 14])(xl - (C.placa[1] + 8.5), yl, zl - (C.deslocZ + s * 15.2)))
      furos.push((xl, yl, zl) => caixa([22, 1.9, 1.9])(xl - (C.placa[1] + 10), yl, zl - (C.deslocZ + s * 8.55)))
    }
  }
  return doCasulo(subtrair(uniao(...partes), ...furos), lado)
}

/** Tampa do casulo (encaixe justo). A da esquerda tem o furo do USB-C. */
function tampa(lado, comUsb) {
  const C = CASULO
  const plugue = hexLado(C.rDentro - 0.25, C.fim - 2, C.fim)
  const chapa = (xl, yl, zl) => hexLado(C.r - 0.6, C.fim, C.fim + C.tampa)(xl, yl, zl) - 0.6
  const furos = [(xl, yl, zl) => caixa([4, 4, 1.6])(xl - (C.fim + C.tampa), yl - C.r * 0.75, zl - C.deslocZ)]
  if (comUsb) furos.push((xl, yl, zl) => caixa([20, 8, 13], 1.5)(xl - C.fim, yl - 1.6, zl - C.deslocZ))
  return doCasulo(subtrair(uniao(plugue, chapa), ...furos), lado)
}

// ---------- Peças ----------

const X = W + 4, CIMA = 151, BAIXO = -128, FRENTE = zc + R + 4, TRAS = zc - R - 7
const { divisaoZ: ZS, divisaoY: YS } = M
const GRAFITE = [0.17, 0.19, 0.25], PRATA = [0.72, 0.76, 0.83]

export const PECAS_CAPACETE = [
  { arquivo: 'capacete-1-frente-cima', nome: 'Frente de cima (janela e testa)', f: parteDoCasco(true, true), caixa: [[-X, YS - 2, ZS - 8], [X, CIMA, FRENTE]], passo: 0.8, cor: GRAFITE, material: 'PLA/PETG (cor do casco)' },
  { arquivo: 'capacete-2-frente-baixo', nome: 'Queixo (grade da boca)', f: parteDoCasco(true, false), caixa: [[-X, BAIXO, ZS - 8], [X, YS + 8, FRENTE]], passo: 0.8, cor: GRAFITE, material: 'PLA/PETG (cor do casco)' },
  { arquivo: 'capacete-3-tras-cima', nome: 'Topo de trás (crista)', f: parteDoCasco(false, true), caixa: [[-X, YS - 2, TRAS], [X, CIMA, ZS + 2]], passo: 0.8, cor: GRAFITE, material: 'PLA/PETG (cor do casco)' },
  { arquivo: 'capacete-4-tras-baixo', nome: 'Nuca', f: parteDoCasco(false, false), caixa: [[-X, BAIXO, TRAS], [X, YS + 8, ZS + 2]], passo: 0.8, cor: GRAFITE, material: 'PLA/PETG (cor do casco)' },
  { arquivo: 'capacete-5-viseira', nome: 'Viseira', f: viseira(), caixa: [[-EIXO - 5, -34, -30], [EIXO + 5, 68, FRENTE + 4]], passo: 0.7, cor: [0.24, 0.42, 0.52], material: 'PLA/PETG (prata ou cor do casco) + película fumê' },
  { arquivo: 'capacete-6-barra-de-luz', nome: 'Barra de luz da testa', f: barraDeLuz(), caixa: [[-62, 30, 70], [62, 66, FRENTE]], passo: 0.4, cor: [0.55, 0.92, 1], brilho: true, material: 'PLA/PETG branco translúcido' },
  { arquivo: 'capacete-7-casulo-servo', nome: 'Casulo direito (servo)', f: casulo(1, true), caixa: [[EIXO - 14, yc - 30, zc - 33], [EIXO + 35, yc + 30, zc + 30]], passo: 0.4, cor: PRATA, material: 'PLA prata', orientacao: 'x+' },
  { arquivo: 'capacete-8-casulo-placa', nome: 'Casulo esquerdo (placa e USB-C)', f: casulo(-1, false), caixa: [[-EIXO - 35, yc - 30, zc - 33], [-EIXO + 14, yc + 30, zc + 30]], passo: 0.4, cor: PRATA, material: 'PLA prata', orientacao: 'x-' },
  { arquivo: 'capacete-9-tampa-servo', nome: 'Tampa do casulo direito', f: tampa(1, false), caixa: [[EIXO + 27, yc - 25, zc - 33], [EIXO + 37, yc + 25, zc + 22]], passo: 0.3, cor: PRATA, material: 'PLA prata', orientacao: 'x-' },
  { arquivo: 'capacete-10-tampa-placa', nome: 'Tampa do casulo esquerdo (USB-C)', f: tampa(-1, true), caixa: [[-EIXO - 37, yc - 25, zc - 33], [-EIXO - 27, yc + 25, zc + 22]], passo: 0.3, cor: PRATA, material: 'PLA prata', orientacao: 'x+' }
]

/** Montado (todas as peças já estão modeladas no lugar). */
export const MONTAGEM_CAPACETE = PECAS_CAPACETE.map((p) => ({ arquivo: p.arquivo, nome: p.nome, cor: p.cor, brilho: p.brilho }))
