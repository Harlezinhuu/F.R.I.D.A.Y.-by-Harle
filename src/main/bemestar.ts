// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Bem-estar no PC: a cada minuto ela olha se você está mexendo no PC e avisa da pausa e da hora
// de dormir (src/main/logica/bemestar.ts). Desliga com "para de me lembrar de pausa" ou FRIDAY_BEMESTAR=0.

import { app, powerMonitor } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { variavel } from './config'
import { estadoInicial, passo, resumoDoDia, REGRAS_PADRAO, type EstadoBemEstar } from './logica/bemestar'

const arquivo = (): string => join(app.getPath('userData'), 'bemestar.json')
let estado: EstadoBemEstar & { ligado: boolean } = { ...estadoInicial(), ligado: variavel('FRIDAY_BEMESTAR') !== '0' }

function carregar(): void {
  try { if (existsSync(arquivo())) estado = { ...estado, ...JSON.parse(readFileSync(arquivo(), 'utf8')) } } catch { /* começa de novo */ }
}
const salvar = (): void => { try { writeFileSync(arquivo(), JSON.stringify(estado)) } catch { /* sem disco */ } }

function regras() {
  const pausa = Number(variavel('FRIDAY_PAUSA_MIN'))
  const dormir = Number((variavel('FRIDAY_DORMIR') || '').split(':')[0])
  return {
    ...REGRAS_PADRAO,
    ...(Number.isFinite(pausa) && pausa >= 30 ? { pausaMin: pausa } : {}),
    ...(variavel('FRIDAY_DORMIR') && Number.isInteger(dormir) && dormir >= 0 && dormir < 5 ? { horaDormir: dormir } : {})
  }
}

export const bemEstarLigado = (): boolean => estado.ligado
export function ligarBemEstar(ligar: boolean): void { estado.ligado = ligar; salvar() }
export const resumoBemEstar = (): string => resumoDoDia(estado, new Date())

export function iniciarBemEstar(avisar: (texto: string) => void): void {
  carregar()
  setInterval(() => {
    const aviso = passo(estado, new Date(), powerMonitor.getSystemIdleTime(), regras())
    salvar()
    if (aviso && estado.ligado && powerMonitor.getSystemIdleState(60) === 'active') avisar(aviso)
  }, 60_000)
}
