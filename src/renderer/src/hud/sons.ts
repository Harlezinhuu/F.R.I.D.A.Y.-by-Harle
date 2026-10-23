// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Sons de interface, sintetizados na hora (sem arquivos de áudio).
// Servem para você saber o que a FRIDAY está fazendo mesmo sem olhar para a tela.

let ctx: AudioContext | null = null
let master: GainNode | null = null

function iniciar(): AudioContext {
  if (ctx) return ctx
  ctx = new AudioContext()
  master = ctx.createGain()
  master.gain.value = 0.18
  const eco = ctx.createDelay(), retorno = ctx.createGain(), molhado = ctx.createGain()
  eco.delayTime.value = 0.17; retorno.gain.value = 0.22; molhado.gain.value = 0.28
  master.connect(ctx.destination)
  master.connect(eco); eco.connect(retorno); retorno.connect(eco); eco.connect(molhado); molhado.connect(ctx.destination)
  return ctx
}

function tom(freq: number, inicio: number, dur: number, tipo: OscillatorType = 'sine', vol = 0.6, deslizarPara?: number): void {
  const c = iniciar()
  if (c.state === 'suspended') c.resume()
  const t0 = c.currentTime + inicio
  const o = c.createOscillator(), g = c.createGain()
  o.type = tipo
  o.frequency.setValueAtTime(freq, t0)
  if (deslizarPara) o.frequency.exponentialRampToValueAtTime(deslizarPara, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(master!)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

export const sons = {
  ativar: () => { tom(523.25, 0, 0.35, 'sine', 0.8); tom(783.99, 0.09, 0.45, 'sine', 0.7); tom(1567.98, 0.09, 0.3, 'sine', 0.12) },
  entendi: () => tom(1046.5, 0, 0.12, 'sine', 0.3),
  feito: () => { tom(659.25, 0, 0.25, 'sine', 0.55); tom(987.77, 0.08, 0.35, 'sine', 0.45) },
  alerta: () => { tom(880, 0, 0.16, 'triangle', 0.55); tom(880, 0.2, 0.16, 'triangle', 0.55) },
  erro: () => { tom(659.25, 0, 0.2, 'sine', 0.5); tom(440, 0.1, 0.3, 'sine', 0.5) },
  silenciar: () => tom(700, 0, 0.38, 'sine', 0.6, 240),
  voltar: () => tom(280, 0, 0.38, 'sine', 0.6, 820),
  offline: () => { tom(330, 0, 0.3, 'triangle', 0.6); tom(220, 0.22, 0.5, 'triangle', 0.6) },
  reconectou: () => { tom(523.25, 0, 0.18, 'sine', 0.5); tom(659.25, 0.1, 0.18, 'sine', 0.5); tom(783.99, 0.2, 0.4, 'sine', 0.5) },
  semMic: () => { tom(260, 0, 0.18, 'square', 0.22); tom(260, 0.28, 0.18, 'square', 0.22) },
  despedida: () => { tom(783.99, 0, 0.3, 'sine', 0.45); tom(523.25, 0.12, 0.45, 'sine', 0.4) }
}
