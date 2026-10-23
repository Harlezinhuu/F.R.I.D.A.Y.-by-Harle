// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Tradução dos códigos de tempo do Open-Meteo (padrão WMO) para português.

const CODIGOS: Record<number, string> = {
  0: 'céu limpo', 1: 'quase limpo', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'neblina', 48: 'neblina com geada',
  51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte', 56: 'garoa congelante', 57: 'garoa congelante forte',
  61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte', 66: 'chuva congelante', 67: 'chuva congelante forte',
  71: 'neve fraca', 73: 'neve', 75: 'neve forte', 77: 'grãos de neve',
  80: 'pancadas de chuva fracas', 81: 'pancadas de chuva', 82: 'pancadas de chuva fortes',
  85: 'pancadas de neve', 86: 'pancadas de neve fortes',
  95: 'trovoadas', 96: 'trovoadas com granizo', 99: 'trovoadas com granizo forte'
}

export function descreverTempo(codigo: number): string {
  return CODIGOS[codigo] ?? 'tempo indefinido'
}

/** Ícone simples para o cartão: sol, nuvem, chuva, neve, raio, neblina. */
export function iconeTempo(codigo: number): 'sol' | 'nuvem' | 'chuva' | 'neve' | 'raio' | 'neblina' {
  if (codigo <= 1) return 'sol'
  if (codigo <= 3) return 'nuvem'
  if (codigo === 45 || codigo === 48) return 'neblina'
  if (codigo >= 95) return 'raio'
  if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return 'neve'
  return 'chuva'
}
