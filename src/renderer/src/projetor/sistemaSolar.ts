// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Posição real dos planetas numa data, pelos elementos orbitais aproximados do JPL
// (Standish, "Keplerian Elements for Approximate Positions of the Major Planets", 1800–2050).
// Precisão de poucos décimos de grau: de sobra para o holograma.

export interface Planeta { nome: string; raio: number }

// a (UA), e, I (graus), L (graus), longitude do periélio (graus), longitude do nodo (graus), e as taxas por século
const ELEMENTOS: [string, number[], number[]][] = [
  ['Mercúrio', [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  ['Vênus', [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  ['Terra', [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  ['Marte', [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  ['Júpiter', [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  ['Saturno', [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  ['Urano', [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  ['Netuno', [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]]
]

/** Tamanho relativo de cada planeta no holograma (fora de escala, para dar para ver). */
export const PLANETAS: Planeta[] = [
  { nome: 'Mercúrio', raio: 0.035 }, { nome: 'Vênus', raio: 0.055 }, { nome: 'Terra', raio: 0.058 }, { nome: 'Marte', raio: 0.045 },
  { nome: 'Júpiter', raio: 0.12 }, { nome: 'Saturno', raio: 0.1 }, { nome: 'Urano', raio: 0.075 }, { nome: 'Netuno', raio: 0.073 }
]

const RAD = Math.PI / 180

/** Séculos julianos desde J2000 (1/1/2000, 12h TT). */
export const seculos = (data: Date): number => (data.getTime() / 86_400_000 + 2440587.5 - 2451545.0) / 36525

function kepler(M: number, e: number): number {
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 12; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-10) break
  }
  return E
}

/** Posição heliocêntrica (x, y, z em UA, plano da eclíptica) de cada planeta na data. */
export function posicoes(data: Date): { nome: string; x: number; y: number; z: number; a: number; e: number }[] {
  const T = seculos(data)
  return ELEMENTOS.map(([nome, el, taxa]) => {
    const [a, e, I, L, w, O] = el.map((v, i) => v + taxa[i] * T)
    const peri = (w - O) * RAD, no = O * RAD, inc = I * RAD
    let M = ((L - w) % 360) * RAD
    if (M > Math.PI) M -= 2 * Math.PI
    if (M < -Math.PI) M += 2 * Math.PI
    const E = kepler(M, e)
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
    const cw = Math.cos(peri), sw = Math.sin(peri), cO = Math.cos(no), sO = Math.sin(no), cI = Math.cos(inc), sI = Math.sin(inc)
    return {
      nome,
      a, e,
      x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
      z: sw * sI * xp + cw * sI * yp
    }
  })
}

/** Distância em escala logarítmica, para caber Netuno e ainda separar Mercúrio, Vênus, Terra e Marte. */
export const comprimir = (ua: number): number => 0.25 + 0.3 * Math.log(1 + ua * 2)

/** Pontos da órbita inteira de um planeta (mesmo plano e orientação da data). */
export function orbita(indice: number, data: Date, n = 160): { x: number; y: number; z: number }[] {
  const T = seculos(data)
  const [, el, taxa] = ELEMENTOS[indice]
  const [a, e, I, , w, O] = el.map((v, i) => v + taxa[i] * T)
  const peri = (w - O) * RAD, no = O * RAD, inc = I * RAD
  const cw = Math.cos(peri), sw = Math.sin(peri), cO = Math.cos(no), sO = Math.sin(no), cI = Math.cos(inc), sI = Math.sin(inc)
  const out: { x: number; y: number; z: number }[] = []
  for (let k = 0; k <= n; k++) {
    const E = (k / n) * Math.PI * 2
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
    out.push({
      x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
      z: sw * sI * xp + cw * sI * yp
    })
  }
  return out
}
