// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Guardiã da rede de casa, a parte que não depende do Windows: ler a tabela ARP, reconhecer o
// fabricante pela placa de rede, saber quem é novo e calcular o uso da internet.

export interface Visto { ip: string; mac: string }

/** Lê o "arp -a" do Windows (português ou inglês) e do Linux/macOS. Ignora broadcast e multicast. */
export function lerArp(saida: string): Visto[] {
  const vistos = new Map<string, Visto>()
  for (const linha of saida.split(/\r?\n/)) {
    const m = linha.match(/(\d{1,3}(?:\.\d{1,3}){3})\D+?(([0-9a-f]{1,2}[-:]){5}[0-9a-f]{1,2})/i)
    if (!m) continue
    const ip = m[1]
    const mac = m[2].split(/[-:]/).map((p) => p.padStart(2, '0')).join(':').toUpperCase()
    if (mac === 'FF:FF:FF:FF:FF:FF' || mac === '00:00:00:00:00:00' || mac.startsWith('01:00:5E') || mac.startsWith('33:33')) continue
    if (/\.255$/.test(ip) || /^(22[4-9]|23\d)\./.test(ip)) continue
    vistos.set(mac, { ip, mac })
  }
  return [...vistos.values()]
}

/** Endereço inventado pelo próprio aparelho (celulares modernos fazem isso por privacidade). */
export const macAleatorio = (mac: string): boolean => /^.[26AE]/i.test(mac)

/** Lê a lista de fabricantes da IEEE (oui.txt): "00-1A-2B   (hex)		Fabricante". */
export function lerOui(texto: string): Record<string, string> {
  const mapa: Record<string, string> = {}
  for (const m of texto.matchAll(/^([0-9A-F]{2})-([0-9A-F]{2})-([0-9A-F]{2})\s+\(hex\)\s+(.+?)\s*$/gim)) {
    mapa[`${m[1]}${m[2]}${m[3]}`.toUpperCase()] = nomeCurto(m[4])
  }
  return mapa
}

/** "Samsung Electronics Co.,Ltd" → "Samsung" */
export function nomeCurto(fabricante: string): string {
  const limpo = fabricante.replace(/\s*(,|\.)?\s*(Inc|Ltd|LLC|Corp|Corporation|Co|Limited|GmbH|S\.?A|Technologies|Technology|Electronics|Communication|Communications|Mobile|International|Industrial|Holdings?|Group|Device|Devices)\b\.?/gi, ' ')
    .replace(/[(),.]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (limpo.split(' ').slice(0, 2).join(' ') || fabricante).slice(0, 30)
}

export const fabricante = (mac: string, oui: Record<string, string>): string =>
  macAleatorio(mac) ? 'celular ou computador (endereço privado)' : oui[mac.replace(/:/g, '').slice(0, 6)] ?? 'fabricante desconhecido'

export interface Aparelho {
  mac: string
  ip: string
  apelido: string
  fabricante: string
  host: string
  primeiraVez: number
  ultimaVez: number
}

/** Junta o que foi visto agora com os conhecidos. Devolve a lista nova e quem apareceu pela primeira vez. */
export function atualizar(conhecidos: Aparelho[], vistos: (Visto & { host: string; fabricante: string })[], agora: number, primeiraVarredura: boolean): { aparelhos: Aparelho[]; novos: Aparelho[] } {
  const porMac = new Map(conhecidos.map((a) => [a.mac, { ...a }]))
  const novos: Aparelho[] = []
  for (const v of vistos) {
    const a = porMac.get(v.mac)
    if (a) {
      a.ip = v.ip
      a.ultimaVez = agora
      if (v.host) a.host = v.host
      continue
    }
    const novo: Aparelho = { mac: v.mac, ip: v.ip, apelido: '', fabricante: v.fabricante, host: v.host, primeiraVez: agora, ultimaVez: agora }
    porMac.set(v.mac, novo)
    if (!primeiraVarredura) novos.push(novo)
  }
  return { aparelhos: [...porMac.values()].sort((x, y) => y.ultimaVez - x.ultimaVez), novos }
}

/** Como ela chama o aparelho: o apelido que você deu, o nome na rede ou o fabricante. */
export function nomeDoAparelho(a: Aparelho): string {
  if (a.apelido) return a.apelido
  const host = a.host.replace(/\.(lan|local|home|localdomain)$/i, '')
  if (host && !/^\d/.test(host)) return `${host} (${a.fabricante})`
  return a.fabricante
}

/** Acha um aparelho pelo IP, pelo final do IP ("o 37"), pelo apelido ou pelo nome. */
export function acharAparelho(alvo: string, lista: Aparelho[]): Aparelho | null {
  const t = alvo.trim().toLowerCase()
  if (!t) return null
  const final = t.match(/^\.?(\d{1,3})$/)?.[1]
  return lista.find((a) => a.ip === t || a.mac.toLowerCase() === t) ??
    (final ? lista.find((a) => a.ip.endsWith(`.${final}`)) : undefined) ??
    lista.find((a) => a.apelido.toLowerCase() === t) ??
    lista.find((a) => `${a.apelido} ${a.host} ${a.fabricante}`.toLowerCase().includes(t)) ?? null
}

/** Bytes de duas medidas → megabits por segundo. */
export const mbps = (antes: number, depois: number, segundos: number): number =>
  Math.max(0, Math.round(((depois - antes) * 8) / segundos / 1e5) / 10)
