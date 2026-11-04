// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Prospecção pelo mapa aberto e o vigia dos sites dos clientes no ar (com o relatório mensal).

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { carregarConfig } from './config'
import { meuLocal } from './clima'
import { anotarNoDiario, criarCliente, empresa, lerClientes, pastaDoCliente, pedirPermissao, salvarCliente } from './negocio'
import { caiu, consultaOverpass, lerLojas, mensagemDeAbordagem, mensagemDoRelatorio, nomeDoRamo, resumoDoMonitor, voltou, type Checagem, type LojaAchada } from './logica/prospeccao'

const UA = { 'User-Agent': 'FRIDAY-by-Harle/1.0 (assistente pessoal)' }

// ---------- Prospecção ----------

interface Guardado { lista: LojaAchada[]; vistas: string[]; quando: number }
const arquivo = (): string => join(app.getPath('userData'), 'prospeccao.json')
function ler(): Guardado {
  try { if (existsSync(arquivo())) return { lista: [], vistas: [], quando: 0, ...JSON.parse(readFileSync(arquivo(), 'utf8')) } } catch { /* refaz */ }
  return { lista: [], vistas: [], quando: 0 }
}
const salvar = (g: Guardado): void => { try { writeFileSync(arquivo(), JSON.stringify({ ...g, vistas: g.vistas.slice(-3000) }, null, 2)) } catch { /* sem disco */ } }

/** Procura lojas sem site perto de você (ou da cidade pedida). Devolve as 8 mais promissoras. */
export async function procurarLojas(ramo: string, raioKm: number, lugar: string): Promise<{ lojas: LojaAchada[]; onde: string }> {
  const local = await meuLocal(lugar || empresa().cidade || carregarConfig().cidade)
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(consultaOverpass(local.lat, local.lon, raioKm, ramo))}`, signal: AbortSignal.timeout(40_000)
  })
  if (!r.ok) throw new Error(`O mapa aberto respondeu ${r.status}. Tente de novo em um minuto.`)
  const g = ler()
  const clientes = lerClientes().map((c) => c.nome.toLowerCase())
  const lojas = lerLojas((await r.json()) as Parameters<typeof lerLojas>[0], local.lat, local.lon, g.vistas).filter((l) => !clientes.includes(l.nome.toLowerCase())).slice(0, 8)
  g.lista = lojas
  g.quando = Date.now()
  salvar(g)
  return { lojas, onde: local.nome }
}

export const listaAtual = (): LojaAchada[] => ler().lista

function acharNaLista(alvo: string): LojaAchada | null {
  const lista = ler().lista
  const n = Number(alvo.replace(/\D/g, ''))
  if (Number.isInteger(n) && n >= 1 && n <= lista.length && alvo.replace(/\D/g, '').length <= 2) return lista[n - 1]
  const t = alvo.toLowerCase()
  return lista.find((l) => l.nome.toLowerCase().includes(t) || t.includes(l.nome.toLowerCase())) ?? null
}

/** Põe a loja da lista como cliente (etapa prospectado); a mensagem de abordagem espera o seu "pode". */
export function adicionarDaLista(alvo: string, comMensagem: boolean): string {
  const l = acharNaLista(alvo)
  if (!l) throw new Error('Não achei essa loja na última lista. Diga o número dela ("a 3").')
  const { cliente: c } = criarCliente(l.nome)
  c.segmento = c.segmento || l.segmento
  c.contato.telefone = c.contato.telefone || l.telefone
  c.contato.whatsapp = c.contato.whatsapp || l.telefone
  c.contato.instagram = c.contato.instagram || l.instagram
  c.contato.endereco = c.contato.endereco || l.endereco
  c.observacoes = `${c.observacoes}\nAchada no mapa aberto (${l.osm}), a ${l.distanciaKm} km.`.trim()
  salvarCliente(c, 'Achada na prospecção.')
  const g = ler()
  g.vistas.push(l.osm)
  g.lista = g.lista.filter((x) => x.osm !== l.osm)
  salvar(g)
  anotarNoDiario(`Coloquei a ${l.nome} como cliente em prospecção.`)
  if (comMensagem) {
    if (!l.telefone) return `${l.nome} entrou nos clientes, mas não tem telefone no mapa: vale achar o Instagram dela${l.instagram ? ` (${l.instagram})` : ''} e chamar por lá.`
    const e = empresa()
    pedirPermissao('mensagem_prospect', `Mandar a primeira mensagem para a ${l.nome}`, { cliente: c.id, mensagem: mensagemDeAbordagem(l, e.responsavel.split(' ')[0] || e.nome, e.cidade) })
    return `${l.nome} entrou nos clientes. A primeira mensagem está pronta e esperando o seu "pode" (diga "pode mandar para a ${l.nome}"). Antes, vale fazer o raio-X e a prévia, para ter o que mostrar.`
  }
  return `${l.nome} entrou nos clientes, na etapa de prospecção.`
}

/** Some com uma loja da lista (não oferecer de novo). */
export function descartarDaLista(alvo: string): string {
  const l = acharNaLista(alvo)
  if (!l) throw new Error('Não achei essa loja na lista.')
  const g = ler()
  g.vistas.push(l.osm)
  g.lista = g.lista.filter((x) => x.osm !== l.osm)
  salvar(g)
  return `Tirei a ${l.nome} da lista; ela não aparece de novo.`
}

export { nomeDoRamo }

// ---------- Vigia dos sites no ar e relatório mensal ----------

const arquivoMonitor = (id: string): string => join(pastaDoCliente(id), 'monitor.json')
function lerChecagens(id: string): Checagem[] {
  try { return JSON.parse(readFileSync(arquivoMonitor(id), 'utf8')) } catch { return [] }
}

async function checar(url: string): Promise<Checagem> {
  const t = Date.now()
  try {
    const r = await fetch(/^https?:\/\//.test(url) ? url : `https://${url}`, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    return { t, ok: r.status < 500, ms: Date.now() - t }
  } catch {
    return { t, ok: false, ms: Date.now() - t }
  }
}

let avisar: (texto: string, serio: boolean) => void = () => {}

async function vigiar(): Promise<void> {
  for (const c of lerClientes().filter((x) => x.site && (x.etapa === 'entregue' || x.etapa === 'manutencao'))) {
    const cs = [...lerChecagens(c.id), await checar(c.site)].filter((x) => Date.now() - x.t < 70 * 86_400_000)
    writeFileSync(arquivoMonitor(c.id), JSON.stringify(cs))
    if (caiu(cs)) { avisar(`O site da ${c.nome} (${c.site}) saiu do ar. Vale olhar antes que o cliente perceba.`, true); anotarNoDiario(`O site da ${c.nome} saiu do ar.`) }
    else if (voltou(cs)) { avisar(`O site da ${c.nome} voltou ao ar.`, false); anotarNoDiario(`O site da ${c.nome} voltou ao ar.`) }
  }
}

/** No começo do mês: relatório de cada cliente com manutenção, esperando o seu "pode" (ou vai sozinho em 24 h). */
function relatoriosDoMes(): void {
  const agora = new Date()
  if (agora.getDate() > 3 || agora.getHours() < 9) return
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).getTime()
  const fim = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime()
  const mes = new Date(inicio).toLocaleDateString('pt-BR', { month: 'long' })
  const chave = new Date(inicio).toISOString().slice(0, 7)
  for (const c of lerClientes().filter((x) => x.etapa === 'manutencao' && x.site)) {
    const pasta = join(pastaDoCliente(c.id), 'relatorios')
    const arq = join(pasta, `relatorio-${chave}.json`)
    if (existsSync(arq)) continue
    const r = resumoDoMonitor(lerChecagens(c.id), inicio, fim)
    if (!r.checagens) continue
    mkdirSync(pasta, { recursive: true })
    writeFileSync(arq, JSON.stringify({ mes: chave, ...r }, null, 2))
    const e = empresa()
    pedirPermissao('mandar_relatorio', `Mandar o relatório de ${mes} para a ${c.nome} (no ar ${r.noAr}% do tempo)`, {
      cliente: c.id, mensagem: mensagemDoRelatorio(c.nome, mes, r, e.responsavel.split(' ')[0] || e.nome), planoSeguro: 'Mando o relatório do jeito que está'
    })
  }
}

export function iniciarProspeccao(o: { avisar(texto: string, serio: boolean): void; log(t: string): void }): void {
  avisar = o.avisar
  const rodar = () => { void vigiar().catch((e) => o.log(`vigia de sites: ${(e as Error).message}`)); relatoriosDoMes() }
  setTimeout(rodar, 4 * 60_000)
  setInterval(rodar, 30 * 60_000)
}
