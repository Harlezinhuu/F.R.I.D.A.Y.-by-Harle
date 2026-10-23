// Validação de rotinas ("modo trabalho": abre o Chrome, abre o Spotify, volume em 30).
// Cada passo precisa ser uma ferramenta conhecida e segura; um passo ruim recusa a rotina inteira.

export interface Passo {
  ferramenta: string
  argumentos: Record<string, unknown>
}

/** Ferramentas que podem entrar numa rotina. Apagar e mover arquivos nunca entram. */
export const FERRAMENTAS_DE_ROTINA = new Set([
  'abrir_app', 'fechar_app', 'volume', 'midia', 'pesquisar_web', 'abrir_site', 'status_sistema',
  'clima', 'capturar_tela', 'modo_foco', 'mostrar_painel', 'dizer', 'esperar'
])

/** Passos que precisam de confirmação na hora de criar a rotina. */
export const PASSOS_PERIGOSOS = new Set(['fechar_app'])

export const MAX_PASSOS = 15

export type Validacao = { ok: true; passos: Passo[]; perigosa: boolean } | { ok: false; erro: string }

export function normalizarNome(nome: string): string {
  return nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Aceita a lista que vem da IA: [{ferramenta, argumentos_json}] ou [{ferramenta, argumentos}]. */
export function validarPassos(entrada: unknown): Validacao {
  let lista = entrada
  if (typeof lista === 'string') {
    try { lista = JSON.parse(lista) } catch { return { ok: false, erro: 'Os passos da rotina vieram num formato inválido.' } }
  }
  if (!Array.isArray(lista) || lista.length === 0) return { ok: false, erro: 'A rotina precisa de pelo menos um passo.' }
  if (lista.length > MAX_PASSOS) return { ok: false, erro: `Uma rotina pode ter no máximo ${MAX_PASSOS} passos.` }

  const passos: Passo[] = []
  for (const [i, bruto] of lista.entries()) {
    const item = bruto as Record<string, unknown>
    const ferramenta = typeof item?.ferramenta === 'string' ? item.ferramenta.trim() : ''
    if (!FERRAMENTAS_DE_ROTINA.has(ferramenta)) return { ok: false, erro: `O passo ${i + 1} ("${ferramenta || '?'}") não pode entrar numa rotina.` }

    let argumentos: unknown = item.argumentos ?? {}
    if (typeof item.argumentos_json === 'string' && item.argumentos_json.trim()) {
      try { argumentos = JSON.parse(item.argumentos_json) } catch { return { ok: false, erro: `Os argumentos do passo ${i + 1} estão inválidos.` } }
    }
    if (typeof argumentos !== 'object' || argumentos === null || Array.isArray(argumentos)) return { ok: false, erro: `Os argumentos do passo ${i + 1} estão inválidos.` }
    const args = { ...(argumentos as Record<string, unknown>) }

    if (ferramenta === 'dizer') {
      const texto = typeof args.texto === 'string' ? args.texto.trim() : ''
      if (!texto || texto.length > 300) return { ok: false, erro: `O passo ${i + 1} precisa de um texto curto para dizer.` }
      args.texto = texto
    }
    if (ferramenta === 'esperar') {
      const s = Number(args.segundos)
      if (!Number.isFinite(s) || s <= 0 || s > 60) return { ok: false, erro: `O passo ${i + 1} só pode esperar de 1 a 60 segundos.` }
      args.segundos = s
    }
    // A confirmação é dada uma vez, ao criar a rotina; na hora de rodar não pergunta de novo
    delete args.confirmado
    passos.push({ ferramenta, argumentos: args })
  }
  return { ok: true, passos, perigosa: passos.some((p) => PASSOS_PERIGOSOS.has(p.ferramenta)) }
}

/** Resumo falável dos passos: "abrir Chrome, abrir Spotify, volume em 30". */
export function resumirPassos(passos: Passo[]): string {
  return passos.map((p) => {
    const a = p.argumentos
    switch (p.ferramenta) {
      case 'abrir_app': return `abrir ${a.nome}`
      case 'fechar_app': return `fechar ${a.nome}`
      case 'volume': return a.acao === 'definir' ? `volume em ${a.valor}` : `volume: ${a.acao}`
      case 'midia': return `mídia: ${a.acao}`
      case 'pesquisar_web': return `pesquisar ${a.consulta}`
      case 'abrir_site': return `abrir ${a.url}`
      case 'dizer': return `dizer "${a.texto}"`
      case 'esperar': return `esperar ${a.segundos} s`
      case 'modo_foco': return `foco de ${a.minutos ?? 25} min`
      default: return p.ferramenta.replace(/_/g, ' ')
    }
  }).join(', ')
}
