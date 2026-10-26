// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Leitura de moléculas (SDF, do PubChem) e proteínas (PDB, do RCSB). Sem dependências, para ter testes.

export interface Atomo { el: string; x: number; y: number; z: number; cadeia?: string; ca?: boolean }
export interface Ligacao { a: number; b: number; ordem: number }

/** Lê o primeiro registro de um arquivo SDF/MOL (formato V2000). */
export function lerSdf(texto: string): { nome: string; atomos: Atomo[]; ligacoes: Ligacao[] } {
  const linhas = texto.replace(/\r/g, '').split('\n')
  if (linhas.length < 4) throw new Error('Arquivo de molécula vazio.')
  const contagem = linhas[3]
  if (/V3000/.test(contagem)) throw new Error('Formato V3000 ainda não é suportado.')
  const nA = parseInt(contagem.slice(0, 3), 10), nL = parseInt(contagem.slice(3, 6), 10)
  if (!Number.isFinite(nA) || nA <= 0) throw new Error('Não achei os átomos da molécula.')
  const atomos: Atomo[] = []
  for (let i = 0; i < nA; i++) {
    const l = linhas[4 + i] ?? ''
    atomos.push({ x: parseFloat(l.slice(0, 10)), y: parseFloat(l.slice(10, 20)), z: parseFloat(l.slice(20, 30)), el: normalizarElemento(l.slice(31, 34).trim()) })
  }
  const ligacoes: Ligacao[] = []
  for (let i = 0; i < (Number.isFinite(nL) ? nL : 0); i++) {
    const l = linhas[4 + nA + i] ?? ''
    const a = parseInt(l.slice(0, 3), 10) - 1, b = parseInt(l.slice(3, 6), 10) - 1, ordem = parseInt(l.slice(6, 9), 10) || 1
    if (a >= 0 && b >= 0 && a < nA && b < nA) ligacoes.push({ a, b, ordem: Math.min(3, ordem) })
  }
  if (atomos.some((a) => !Number.isFinite(a.x + a.y + a.z))) throw new Error('Coordenadas inválidas na molécula.')
  return { nome: linhas[0].trim(), atomos, ligacoes }
}

/** Lê os átomos de um arquivo PDB (só o primeiro modelo, sem água). */
export function lerPdb(texto: string): { titulo: string; atomos: Atomo[] } {
  const atomos: Atomo[] = []
  let titulo = ''
  for (const l of texto.replace(/\r/g, '').split('\n')) {
    if (l.startsWith('TITLE')) titulo += ` ${l.slice(10).trim()}`
    if (l.startsWith('ENDMDL')) break
    if (!l.startsWith('ATOM') && !l.startsWith('HETATM')) continue
    const residuo = l.slice(17, 20).trim()
    if (residuo === 'HOH' || residuo === 'WAT') continue
    const nome = l.slice(12, 16).trim()
    const el = normalizarElemento(l.slice(76, 78).trim() || nome.replace(/[^A-Za-z]/g, '').slice(0, 1))
    const x = parseFloat(l.slice(30, 38)), y = parseFloat(l.slice(38, 46)), z = parseFloat(l.slice(46, 54))
    if (!Number.isFinite(x + y + z)) continue
    atomos.push({ el, x, y, z, cadeia: l.slice(21, 22).trim() || 'A', ca: l.startsWith('ATOM') && nome === 'CA' })
  }
  if (!atomos.length) throw new Error('Não achei átomos na proteína.')
  return { titulo: titulo.trim().replace(/\s+/g, ' '), atomos }
}

function normalizarElemento(s: string): string {
  const e = s.replace(/[^A-Za-z]/g, '')
  return e ? e[0].toUpperCase() + e.slice(1).toLowerCase() : 'X'
}

/** Nome em português dos elementos mais comuns. */
export const NOMES_ELEMENTOS: Record<string, string> = {
  H: 'Hidrogênio', C: 'Carbono', N: 'Nitrogênio', O: 'Oxigênio', S: 'Enxofre', P: 'Fósforo', F: 'Flúor', Cl: 'Cloro',
  Br: 'Bromo', I: 'Iodo', Na: 'Sódio', K: 'Potássio', Ca: 'Cálcio', Mg: 'Magnésio', Fe: 'Ferro', Zn: 'Zinco', Cu: 'Cobre',
  Si: 'Silício', B: 'Boro', Li: 'Lítio', Al: 'Alumínio', Co: 'Cobalto', Ni: 'Níquel', Mn: 'Manganês', Se: 'Selênio'
}

/** Raio para desenhar o átomo (Å, aproximado do raio covalente). */
export function raioAtomo(el: string): number {
  return ({ H: 0.31, C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07, F: 0.57, Cl: 1.02, Br: 1.2, I: 1.39, Fe: 1.32, Zn: 1.22, Cu: 1.32, Na: 1.66, K: 2.03, Ca: 1.76, Mg: 1.41 } as Record<string, number>)[el] ?? 0.9
}

/** Cor do elemento (inspirada no padrão CPK, puxada para o holograma). */
export function corAtomo(el: string): [number, number, number] {
  const c: Record<string, [number, number, number]> = {
    H: [0.62, 0.7, 0.82], C: [0.85, 0.9, 1], N: [0.36, 0.55, 1], O: [1, 0.42, 0.42], S: [1, 0.83, 0.36], P: [1, 0.62, 0.27],
    F: [0.36, 1, 0.6], Cl: [0.36, 1, 0.6], Br: [0.8, 0.45, 0.3], Fe: [1, 0.55, 0.2], Zn: [0.6, 0.6, 0.85], Cu: [0.95, 0.6, 0.35]
  }
  return c[el] ?? [0.75, 0.55, 1]
}
