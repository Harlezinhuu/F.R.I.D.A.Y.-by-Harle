// Cálculo da próxima vez que um lembrete repetido toca. Sem dependências, para ter testes.
// Usa o horário local do PC, então "todo dia às 8h" continua às 8h mesmo com horário de verão.

export type Repeticao = 'nunca' | 'diario' | 'dias_uteis' | 'semanal' | 'mensal'

export const REPETICOES: Repeticao[] = ['nunca', 'diario', 'dias_uteis', 'semanal', 'mensal']

export function ehRepeticao(v: unknown): v is Repeticao {
  return typeof v === 'string' && (REPETICOES as string[]).includes(v)
}

const ehFimDeSemana = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6

function avancar(d: Date, repetir: Repeticao, diaOriginal: number): Date {
  const n = new Date(d)
  switch (repetir) {
    case 'diario':
      n.setDate(n.getDate() + 1)
      break
    case 'dias_uteis':
      do n.setDate(n.getDate() + 1)
      while (ehFimDeSemana(n))
      break
    case 'semanal':
      n.setDate(n.getDate() + 7)
      break
    case 'mensal': {
      // Dia 31 vira o último dia dos meses mais curtos, e volta ao 31 quando der
      const mes = n.getMonth() + 1
      n.setDate(1)
      n.setMonth(mes)
      const ultimo = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()
      n.setDate(Math.min(diaOriginal, ultimo))
      break
    }
    case 'nunca':
      break
  }
  return n
}

/** Próxima ocorrência estritamente depois de `agora`, ou null se o lembrete não se repete. */
export function proximaOcorrencia(quando: Date, repetir: Repeticao, agora: Date): Date | null {
  if (repetir === 'nunca') return null
  const diaOriginal = quando.getDate()
  let d = new Date(quando)
  // Um lembrete "dias úteis" criado para um sábado começa na segunda
  if (repetir === 'dias_uteis') while (ehFimDeSemana(d)) d.setDate(d.getDate() + 1)
  for (let i = 0; d.getTime() <= agora.getTime() && i < 5000; i++) d = avancar(d, repetir, diaOriginal)
  return d
}

/** Primeira vez que toca: o próprio horário, ajustado para dia útil quando for o caso. */
export function primeiraOcorrencia(quando: Date, repetir: Repeticao): Date {
  const d = new Date(quando)
  if (repetir === 'dias_uteis') while (ehFimDeSemana(d)) d.setDate(d.getDate() + 1)
  return d
}

export function descreverRepeticao(r: Repeticao): string {
  return { nunca: '', diario: 'todo dia', dias_uteis: 'nos dias úteis', semanal: 'toda semana', mensal: 'todo mês' }[r]
}
