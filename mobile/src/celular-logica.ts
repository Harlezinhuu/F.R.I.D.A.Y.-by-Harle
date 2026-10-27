// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Regras do controle do celular que não dependem do Android (e por isso têm testes):
// achar o app e o contato pelo nome falado, montar o número do WhatsApp, os dias do alarme,
// reconhecer botões que precisam de confirmação e resumir a tela para a IA.

export interface App { nome: string; pacote: string }
export interface Numero { numero: string; tipo: string; celular: boolean }
export interface Contato { nome: string; numeros: Numero[] }
export interface Elemento { i: number; texto: string; tipo: string; toca?: boolean; campo?: boolean; senha?: boolean; marcado?: boolean; rola?: boolean }
export interface Tela { pacote: string; elementos: Elemento[] }

/** Minúsculas, sem acento e sem símbolos: "Câmera 📷" → "camera". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Outros nomes que as pessoas falam para os apps. */
const APELIDOS: Record<string, string[]> = {
  whatsapp: ['zap', 'zapzap', 'wpp', 'whats'],
  instagram: ['insta'],
  facebook: ['face'],
  youtube: ['yt', 'youtubi'],
  'youtube music': ['yt music'],
  configuracoes: ['ajustes', 'configuracao', 'settings', 'config'],
  camera: ['camara'],
  galeria: ['fotos', 'gallery', 'photos'],
  relogio: ['clock', 'alarme', 'despertador'],
  calculadora: ['calculator'],
  telefone: ['phone', 'discador'],
  mensagens: ['messages', 'sms'],
  agenda: ['calendar', 'calendario'],
  chrome: ['navegador', 'google chrome', 'internet'],
  maps: ['mapa', 'mapas', 'google maps'],
  'play store': ['loja', 'google play', 'play'],
  gmail: ['email', 'e mail'],
  spotify: ['spot'],
  'mercado livre': ['mercadolivre', 'ml'],
  ifood: ['i food']
}

function nomesAlternativos(pedido: string): string[] {
  const p = normalizar(pedido)
  const lista = [p]
  for (const [nome, apelidos] of Object.entries(APELIDOS)) {
    if (apelidos.includes(p)) lista.push(nome)
    if (nome === p) lista.push(...apelidos)
  }
  return lista
}

function nota(alvo: string, pedido: string): number {
  if (!pedido) return 0
  if (alvo === pedido) return 100
  if (alvo.startsWith(pedido + ' ') || alvo.startsWith(pedido)) return 80
  if (alvo.split(' ').includes(pedido)) return 72
  if (alvo.includes(pedido) && pedido.length >= 3) return 60
  const palavras = pedido.split(' ').filter((w) => w.length >= 2)
  if (palavras.length > 1 && palavras.every((w) => alvo.includes(w))) return 50
  return 0
}

/** Acha o app pelo nome falado. Sem certeza, devolve sugestões. */
export function acharApp(pedido: string, apps: App[]): { app: App | null; sugestoes: string[] } {
  const nomes = nomesAlternativos(pedido)
  let melhor: App | null = null
  let maior = 0
  const pontos = apps.map((a) => {
    const n = normalizar(a.nome)
    const p = Math.max(...nomes.map((x) => nota(n, x)), ...nomes.map((x) => (normalizar(a.pacote).includes(x.replace(/ /g, '')) && x.length >= 4 ? 45 : 0)))
    if (p > maior) { maior = p; melhor = a }
    return { a, p }
  })
  if (maior >= 45) return { app: melhor, sugestoes: [] }
  // Sugestões: apps com alguma letra em comum no começo
  const p0 = normalizar(pedido).slice(0, 2)
  const sugestoes = pontos.filter((x) => p0 && normalizar(x.a.nome).startsWith(p0)).slice(0, 5).map((x) => x.a.nome)
  return { app: null, sugestoes }
}

const soDigitos = (s: string) => s.replace(/\D/g, '')

/** O pedido já é um número de telefone? */
export function pareceNumero(s: string): boolean {
  return /^[\s+()\d-]+$/.test(s.trim()) && soDigitos(s).length >= 3
}

/** Acha o contato pelo nome falado ("liga pra mãe", "manda pro Pedro Silva"). */
export function acharContato(pedido: string, contatos: Contato[]): { contato: Contato; numero: Numero } | { varios: string[] } | null {
  const p = normalizar(pedido).replace(/^(o|a|pro|pra|para|meu|minha)\s+/, '')
  if (!p) return null
  const pontos = contatos.map((c) => ({ c, p: nota(normalizar(c.nome), p) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p)
  if (!pontos.length) return null
  const topo = pontos.filter((x) => x.p === pontos[0].p)
  if (topo.length > 1 && pontos[0].p < 100) return { varios: topo.slice(0, 5).map((x) => x.c.nome) }
  const c = topo[0].c
  const numero = c.numeros.find((n) => n.celular) ?? c.numeros[0]
  return numero ? { contato: c, numero } : null
}

/** Número no formato do WhatsApp (só dígitos, com o código do país). Brasil por padrão. */
export function numeroWhatsapp(numero: string, pais = '55'): string {
  const t = numero.trim()
  let d = soDigitos(t)
  if (t.startsWith('+')) return d
  if (d.startsWith('00')) return d.slice(2)
  d = d.replace(/^0+/, '')
  // 0XX (operadora) + DDD + número: "015 11 98888-7777" vira "11988887777"
  if (d.length === 13 && !d.startsWith(pais)) d = d.slice(2)
  if (d.length === 10 || d.length === 11) return pais + d
  return d
}

/** Dias do alarme no padrão do Android (1 = domingo ... 7 = sábado). Vazio = só uma vez. */
export function diasDoAlarme(texto: string): number[] {
  const t = normalizar(texto)
  if (!t || /\b(uma vez|hoje|amanha)\b/.test(t)) return []
  if (/\b(todo dia|todos|diario|todos os dias|sempre)\b/.test(t)) return [1, 2, 3, 4, 5, 6, 7]
  if (/\b(uteis|semana toda|segunda a sexta)\b/.test(t)) return [2, 3, 4, 5, 6]
  if (/\bfim de semana\b/.test(t)) return [1, 7]
  const nomes: [RegExp, number][] = [[/\bdom/, 1], [/\bseg/, 2], [/\bter/, 3], [/\bqua/, 4], [/\bqui/, 5], [/\bsex/, 6], [/\bsab/, 7]]
  return nomes.filter(([r]) => r.test(t)).map(([, n]) => n)
}

/** Botões que mexem com dinheiro, apagam coisas ou falam por você: pedem confirmação antes. */
const SENSIVEIS = /\b(pagar|pague|pagamento|comprar|compre|finalizar (compra|pedido)|fazer pedido|confirmar (compra|pedido|pagamento)|transferir|transferencia|pix|assinar|assinatura|excluir|apagar|deletar|remover|desinstalar|limpar dados|formatar|redefinir|restaurar|sair da conta|desconectar|enviar|send|postar|publicar|compartilhar|responder a todos|confirmar)\b/

export function botaoSensivel(rotulo: string): boolean {
  return SENSIVEIS.test(normalizar(rotulo))
}

/** Resumo da tela para a IA: uma linha por item, curto. */
export function resumirTela(tela: Tela, limite = 110): string {
  const linhas = tela.elementos.slice(0, limite).map((e) => {
    const marcas = [e.toca ? 'toca' : '', e.campo ? 'campo' : '', e.senha ? 'SENHA' : '', e.rola ? 'rola' : '', e.marcado !== undefined ? (e.marcado ? 'ligado' : 'desligado') : '']
      .filter(Boolean).join(', ')
    return `#${e.i} ${e.tipo} "${e.texto}"${marcas ? ` (${marcas})` : ''}`
  })
  const resto = tela.elementos.length > limite ? `\n...e mais ${tela.elementos.length - limite} itens (role para ver).` : ''
  return `App na tela: ${tela.pacote || 'desconhecido'}\n${linhas.join('\n') || '(nada legível na tela)'}${resto}`
}

/** Hora de um ISO ("2026-10-28T07:30") ou de "7:30", "7h30", "19h". */
export function horaMinuto(s: string): { hora: number; minuto: number } | null {
  const iso = /T(\d{2}):(\d{2})/.exec(s)
  const m = iso ?? /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/.exec(s)
  if (!m) return null
  const hora = Number(m[1]), minuto = Number(m[2] ?? 0)
  if (hora > 23 || minuto > 59) return null
  return { hora, minuto }
}
