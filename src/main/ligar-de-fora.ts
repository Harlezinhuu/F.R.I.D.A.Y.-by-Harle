// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ligar o PC de fora de casa: "Friday, liga o PC" no celular, no 4G, e o PC liga, mesmo desligado.
// Com o PC desligado só a placa de rede fica acordada, esperando o "pacote mágico". Daqui (com o PC
// ligado) a FRIDAY deixa tudo pronto uma vez: ajusta a placa de rede e o Windows, abre a porta no
// roteador pelo UPnP, confere se a operadora deixa (CGNAT) e passa o endereço de casa para o celular.
// O celular manda o pacote para esse endereço; o roteador repassa para o PC.

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { createSocket } from 'node:dgram'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { ALVOS_SSDP, acharServicoWan, argsDaPorta, buscaSsdp, campoSoap, diagnosticarNat, envelopeSoap, lerRespostaSsdp } from './logica/upnp'
import { variavel } from './config'

/** Porta de fora (no roteador) que leva o pacote mágico até a porta 9 do PC. */
export const PORTA_DE_FORA = 40009

export interface Casa { endereco: string; porta: number; macs: string[]; atualizadaEm: string }

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const arquivo = (): string => join(app.getPath('userData'), 'casa.json')

export function lerCasa(): Casa | null {
  try {
    if (!existsSync(arquivo())) return null
    const c = JSON.parse(readFileSync(arquivo(), 'utf8')) as Casa
    return c.endereco && Array.isArray(c.macs) && c.macs.length ? c : null
  } catch {
    return null
  }
}

function salvarCasa(c: Casa): void {
  try { writeFileSync(arquivo(), JSON.stringify(c, null, 2)) } catch { /* sem disco */ }
}

// ---------- Roteador (UPnP) ----------

interface Roteador { servico: string; controle: string; ip: string }

/** Aparelhos UPnP da casa (o roteador e outros): o endereço e a descrição de cada um. */
export async function descobrirUpnp(ms = 3000): Promise<{ url: string; xml: string }[]> {
  const sock = createSocket({ type: 'udp4', reuseAddr: true })
  const locais = new Set<string>()
  sock.on('message', (m) => { const l = lerRespostaSsdp(m.toString()); if (l) locais.add(l) })
  sock.on('error', () => {})
  try {
    await new Promise<void>((ok) => sock.bind(0, () => ok()))
    for (const alvo of ALVOS_SSDP) sock.send(buscaSsdp(alvo), 1900, '239.255.255.250')
    await esperar(ms)
  } finally {
    try { sock.close() } catch { /* já fechado */ }
  }
  const saida: { url: string; xml: string }[] = []
  for (const url of locais) {
    try { saida.push({ url, xml: await (await fetch(url, { signal: AbortSignal.timeout(4000) })).text() }) } catch { /* não respondeu */ }
  }
  return saida
}

async function acharRoteador(ms = 3000): Promise<Roteador | null> {
  for (const d of await descobrirUpnp(ms)) {
    const s = acharServicoWan(d.xml, d.url)
    if (s) return { ...s, ip: new URL(d.url).hostname }
  }
  return null
}

/** Pede algo a um serviço UPnP (SOAP). */
export async function pedirUpnp(r: { servico: string; controle: string }, acao: string, args: Record<string, string | number> = {}): Promise<string> {
  return soap({ ...r, ip: '' }, acao, args)
}

async function soap(r: Roteador, acao: string, args: Record<string, string | number> = {}): Promise<string> {
  const resp = await fetch(r.controle, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${r.servico}#${acao}"` },
    body: envelopeSoap(r.servico, acao, args),
    signal: AbortSignal.timeout(6000)
  })
  const t = await resp.text()
  if (!resp.ok) {
    const cod = campoSoap(t, 'errorCode'), desc = campoSoap(t, 'errorDescription')
    throw new Error(`o roteador recusou (${cod || resp.status}${desc ? `: ${desc}` : ''})`)
  }
  return t
}

const numero = (ip: string): number => ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0

/** O IP e a placa de rede do PC na mesma rede do roteador. */
function placaNaRedeDe(ipRoteador: string): { ip: string; mac: string } | null {
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista ?? []) {
      if (i.family !== 'IPv4' || i.internal || !i.netmask) continue
      const m = numero(i.netmask)
      if ((numero(i.address) & m) === (numero(ipRoteador) & m)) return { ip: i.address, mac: i.mac.toUpperCase() }
    }
  }
  return null
}

async function ipPublico(): Promise<string> {
  for (const u of ['https://api.ipify.org', 'https://icanhazip.com', 'https://ifconfig.me/ip']) {
    try {
      const t = (await (await fetch(u, { signal: AbortSignal.timeout(5000) })).text()).trim()
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return t
    } catch { /* tenta o próximo */ }
  }
  return ''
}

// ---------- Windows (placa de rede e inicialização rápida) ----------

/** Roda como administrador (o Windows pergunta uma vez). Escreve o resultado num JSON. */
const SCRIPT_WINDOWS = `param([string]$saida)
$r = @{}
$a = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Sort-Object { if ($_.MediaType -eq '802.3') { 0 } else { 1 } } | Select-Object -First 1
if (-not $a) { $r.erro = 'nenhuma placa de rede conectada' } else {
  $r.placa = $a.InterfaceDescription
  $r.cabo = ($a.MediaType -eq '802.3')
  $r.mac = $a.MacAddress
  try { Set-NetAdapterPowerManagement -Name $a.Name -WakeOnMagicPacket Enabled -WakeOnPattern Disabled -ErrorAction Stop; $r.magico = $true } catch { $r.magico = $false }
  foreach ($k in '*WakeOnMagicPacket', 'WakeOnMagicPacket', 'S5WakeOnLan', '*S5WakeOnLan', 'WakeFromPowerOff') {
    try { Set-NetAdapterAdvancedProperty -Name $a.Name -RegistryKeyword $k -RegistryValue 1 -ErrorAction Stop } catch {}
  }
  powercfg /deviceenablewake "$($a.InterfaceDescription)" | Out-Null
}
try {
  New-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power' -Name HiberbootEnabled -Value 0 -PropertyType DWord -Force -ErrorAction Stop | Out-Null
  $r.rapida = $true
} catch { $r.rapida = $false }
$r | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $saida
`

interface ResultadoWindows { placa?: string; cabo?: boolean; mac?: string; magico?: boolean; rapida?: boolean; erro?: string }

async function ajustarWindows(): Promise<ResultadoWindows> {
  if (process.platform !== 'win32') return { erro: 'isso só funciona no Windows' }
  const pasta = app.getPath('temp')
  const ps1 = join(pasta, 'friday-ligar-de-fora.ps1')
  const saida = join(pasta, `friday-ligar-de-fora-${Date.now()}.json`)
  writeFileSync(ps1, `﻿${SCRIPT_WINDOWS}`, 'utf8')
  const pedido = `try { Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${ps1}" "${saida}"' -ErrorAction Stop } catch { exit 5 }`
  const codigo = await new Promise<number>((ok) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', pedido], { windowsHide: true, timeout: 180_000 }, (e) => ok(e ? (typeof e.code === 'number' ? e.code : 1) : 0))
  })
  if (codigo === 5) return { erro: 'você não autorizou no aviso do Windows' }
  try {
    return JSON.parse(readFileSync(saida, 'utf8').replace(/^﻿/, '')) as ResultadoWindows
  } catch {
    return { erro: 'o ajuste do Windows não terminou' }
  }
}

// ---------- DuckDNS (opcional: endereço fixo mesmo quando a operadora troca o IP) ----------

function duckdns(): { nome: string; token: string } | null {
  const v = variavel('FRIDAY_DUCKDNS')
  const m = v.match(/^([a-z0-9-]+)(?:\.duckdns\.org)?:([0-9a-f-]{36})$/i)
  return m ? { nome: m[1].toLowerCase(), token: m[2] } : null
}

async function atualizarDuckdns(): Promise<boolean> {
  const d = duckdns()
  if (!d) return false
  try {
    const t = await (await fetch(`https://www.duckdns.org/update?domains=${d.nome}&token=${d.token}`, { signal: AbortSignal.timeout(8000) })).text()
    return t.trim() === 'OK'
  } catch {
    return false
  }
}

// ---------- Preparar ----------

/** Deixa tudo pronto para ligar o PC de fora. Devolve o relatório para ela falar. */
export async function prepararLigarDeFora(): Promise<{ ok: boolean; mensagem: string }> {
  const feito: string[] = []
  const falta: string[] = []

  const w = await ajustarWindows()
  if (w.erro) falta.push(`Não ajustei a placa de rede: ${w.erro}. Diga de novo e aceite o aviso do Windows.`)
  else {
    feito.push(`placa de rede ${w.magico ? 'pronta para o pacote mágico' : 'ajustada (ela não aceitou o modo "só pacote mágico", mas deve funcionar)'}`)
    if (w.rapida) feito.push('inicialização rápida desligada')
    if (!w.cabo) falta.push('O PC está no Wi-Fi. Desligado, quase nenhuma placa Wi-Fi acorda: ligue o PC no cabo de rede.')
  }

  const r = await acharRoteador()
  const publico = await ipPublico()
  const placa = r ? placaNaRedeDe(r.ip) : null
  let nat: 'ok' | 'cgnat' | 'desconhecido' = 'desconhecido'
  let portaAberta = false
  if (!r) {
    falta.push(`O roteador não respondeu ao UPnP (ele pode estar desligado nas opções do roteador). Dá para abrir a porta à mão: UDP ${PORTA_DE_FORA} para o IP do PC, porta 9.`)
  } else {
    let externo = ''
    try { externo = campoSoap(await soap(r, 'GetExternalIPAddress'), 'NewExternalIPAddress') } catch { /* alguns não dizem */ }
    nat = diagnosticarNat(externo, publico)
    if (nat === 'cgnat') {
      falta.push('A sua operadora usa CGNAT: a internet de casa não recebe nada de fora. Peça um "IP público" para a operadora (muitas liberam de graça) ou use um celular velho ligado em casa como porteiro.')
    } else if (!placa) {
      falta.push('Não achei o IP do PC na rede do roteador.')
    } else {
      try {
        await soap(r, 'AddPortMapping', argsDaPorta(PORTA_DE_FORA, 9, placa.ip, 0))
        portaAberta = true
      } catch {
        // Alguns roteadores só aceitam porta com prazo: 7 dias, renovados toda vez que o PC liga
        try {
          await soap(r, 'AddPortMapping', argsDaPorta(PORTA_DE_FORA, 9, placa.ip, 7 * 86_400))
          portaAberta = true
        } catch (e) {
          falta.push(`O roteador não deixou abrir a porta (${(e as Error).message}). Abra à mão: UDP ${PORTA_DE_FORA} para ${placa.ip}, porta 9.`)
        }
      }
      if (portaAberta) feito.push(`porta ${PORTA_DE_FORA} aberta no roteador para o PC (${placa.ip})`)
    }
  }

  const d = duckdns()
  if (d) await atualizarDuckdns()
  const endereco = d ? `${d.nome}.duckdns.org` : publico
  const mac = (w.mac ?? '').replace(/-/g, ':').toUpperCase() || placa?.mac || ''
  if (endereco && mac && nat !== 'cgnat') {
    salvarCasa({ endereco, porta: PORTA_DE_FORA, macs: [mac], atualizadaEm: new Date().toISOString() })
    feito.push(d ? `endereço de casa: ${endereco}` : 'endereço de casa guardado para o celular')
  } else if (!endereco && nat !== 'cgnat') {
    falta.push('Não consegui descobrir o endereço da internet de casa agora. Tente de novo daqui a pouco.')
  }

  falta.push('Na BIOS, uma vez só: ligue "Wake on LAN" (ou "Power On By PCI-E") e desligue o "ErP". Programa nenhum mexe na BIOS.')
  if (portaAberta) falta.push('Se depois de uns minutos desligado ele não ligar pela internet, o roteador esqueceu o PC: ative o vínculo de IP e MAC (IP & MAC Binding) para o IP do PC.')
  if (!d && endereco) falta.push('Se a operadora trocar o IP de casa, o celular pega o novo quando falar com o PC de novo. Para nunca depender disso, crie um nome grátis no DuckDNS e coloque FRIDAY_DUCKDNS=nome:token no .env.')

  const ok = portaAberta && !w.erro
  return {
    ok,
    mensagem: `${feito.length ? `Feito: ${feito.join('; ')}.` : 'Não consegui ajustar nada ainda.'} Falta: ${falta.join(' ')}${ok ? ' Com o celular pareado, "liga o PC" passa a funcionar de qualquer lugar: o celular pega o endereço sozinho na próxima vez que abrir em casa.' : ''}`
  }
}

/** Ao abrir: renova a porta no roteador e o endereço de casa (o IP da operadora pode ter mudado). */
export function manterCasa(log: (t: string) => void): void {
  const renovar = async (): Promise<void> => {
    const c = lerCasa()
    if (!c) return
    await atualizarDuckdns()
    try {
      const r = await acharRoteador()
      const placa = r ? placaNaRedeDe(r.ip) : null
      if (r && placa) {
        await soap(r, 'AddPortMapping', argsDaPorta(c.porta, 9, placa.ip, 0)).catch(() => soap(r, 'AddPortMapping', argsDaPorta(c.porta, 9, placa.ip, 7 * 86_400)))
      }
    } catch (e) { log(`porta de casa: ${(e as Error).message}`) }
    if (!duckdns()) {
      const ip = await ipPublico()
      if (ip && ip !== c.endereco) { salvarCasa({ ...c, endereco: ip, atualizadaEm: new Date().toISOString() }); log('IP de casa mudou; atualizado') }
    }
  }
  setTimeout(() => void renovar(), 30_000)
  setInterval(() => void renovar(), 30 * 60_000)
}
