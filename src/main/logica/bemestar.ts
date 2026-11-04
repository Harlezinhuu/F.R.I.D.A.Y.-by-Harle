// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Bem-estar (o "seus sinais vitais, senhor" dos filmes, do jeito que dá com um PC): ela percebe
// quando você está há horas sem pausa e quando já está tarde demais, e fala uma vez, sem insistir.
// Aqui só a conta, sem relógio nem Windows, para dar para testar.

export interface EstadoBemEstar {
  /** Desde quando você está no PC sem uma pausa de verdade (ms), ou null */
  ativoDesde: number | null
  ultimoAvisoPausa: number
  /** Dia (AAAA-MM-DD) em que já avisou da hora de dormir */
  avisouDormir: string
  /** Minutos de uso por dia (AAAA-MM-DD → minutos) */
  minutos: Record<string, number>
}

export interface RegrasBemEstar {
  /** Minutos seguidos até sugerir uma pausa */
  pausaMin: number
  /** Ocioso por quanto tempo conta como pausa (s) */
  pausaConta: number
  /** Hora (0–23) a partir da qual já é tarde (até as 5h) */
  horaDormir: number
}

export const REGRAS_PADRAO: RegrasBemEstar = { pausaMin: 120, pausaConta: 300, horaDormir: 1 }

export const estadoInicial = (): EstadoBemEstar => ({ ativoDesde: null, ultimoAvisoPausa: 0, avisouDormir: '', minutos: {} })

const diaLocal = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const horas = (min: number): string => {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h ? `${h} ${h === 1 ? 'hora' : 'horas'}${m >= 10 ? ` e ${m} minutos` : ''}` : `${m} minutos`
}

/**
 * Um passo do relógio (a cada minuto): atualiza o estado e devolve o aviso a falar, se houver.
 * `ocioso` = segundos sem mexer no teclado e no mouse.
 */
export function passo(e: EstadoBemEstar, agora: Date, ocioso: number, r: RegrasBemEstar = REGRAS_PADRAO): string | null {
  const t = agora.getTime()
  const hoje = diaLocal(agora)
  if (ocioso < 120) e.minutos[hoje] = (e.minutos[hoje] ?? 0) + 1
  // Guarda só a última semana
  for (const d of Object.keys(e.minutos)) if (d < diaLocal(new Date(t - 7 * 86_400_000))) delete e.minutos[d]

  if (ocioso >= r.pausaConta) { e.ativoDesde = null; return null }
  if (e.ativoDesde === null) e.ativoDesde = t - ocioso * 1000

  const h = agora.getHours()
  if (h >= r.horaDormir && h < 5 && e.avisouDormir !== hoje && ocioso < 120) {
    e.avisouDormir = hoje
    return `Já passou da ${h === 1 ? 'uma' : h} da manhã. Se não for nada urgente, salva o que está fazendo e vai dormir; amanhã eu te lembro de onde parou.`
  }

  const seguidos = (t - e.ativoDesde) / 60_000
  if (seguidos >= r.pausaMin && t - e.ultimoAvisoPausa >= 60 * 60_000) {
    e.ultimoAvisoPausa = t
    return `Você está há ${horas(seguidos)} direto no PC. Levanta, alonga e bebe uma água; eu seguro as coisas aqui.`
  }
  return null
}

/** "Quanto tempo fiquei no PC hoje?" */
export function resumoDoDia(e: EstadoBemEstar, agora: Date): string {
  const hoje = e.minutos[diaLocal(agora)] ?? 0
  const semana = Object.values(e.minutos)
  const media = semana.length ? semana.reduce((a, b) => a + b, 0) / semana.length : 0
  const seguidos = e.ativoDesde ? (agora.getTime() - e.ativoDesde) / 60_000 : 0
  return `Hoje você ficou ${horas(hoje)} no PC${semana.length > 1 ? ` (a média da semana é ${horas(media)})` : ''}.${seguidos >= 20 ? ` Agora, ${horas(seguidos)} sem pausa.` : ''}`
}
