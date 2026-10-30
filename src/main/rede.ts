// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Guardiã da rede de casa: de tempos em tempos ela vê quais aparelhos estão no seu Wi-Fi e avisa
// quando aparece um desconhecido ("um aparelho novo entrou no seu Wi-Fi: Xiaomi, 192.168.0.37").
// Também diz quanto da internet a casa está usando agora e quanto disso é o PC.
// Só olha a sua própria rede, e só o que qualquer aparelho dela já enxerga (a tabela ARP).

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { createSocket } from 'node:dgram'
import { reverse } from 'node:dns/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { variavel } from './config'
import { descobrirUpnp, pedirUpnp } from './ligar-de-fora'
import { acharServico, campoSoap } from './logica/upnp'
import { atualizar, fabricante, lerArp, lerOui, mbps, nomeDoAparelho, type Aparelho } from './logica/rede'

interface Guardado { aparelhos: Aparelho[]; varreduras: number; rede: string }

let opcoes: { avisar(texto: string): void; log(t: string): void } = { avisar() {}, log() {} }
let oui: Record<string, string> = {}
let varrendo = false

const arquivo = (): string => join(app.getPath('userData'), 'rede.json')
const arquivoOui = (): string => join(app.getPath('userData'), 'fabricantes.json')
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const redeLigada = (): boolean => variavel('FRIDAY_REDE') !== '0'

function ler(): Guardado {
  try { if (existsSync(arquivo())) return { aparelhos: [], varreduras: 0, rede: '', ...JSON.parse(readFileSync(arquivo(), 'utf8')) } } catch { /* refaz */ }
  return { aparelhos: [], varreduras: 0, rede: '' }
}
const salvar = (g: Guardado): void => { try { writeFileSync(arquivo(), JSON.stringify(g, null, 2)) } catch { /* sem disco */ } }

/** A rede de casa: o IP do PC nela e quantos endereços tem (só redes privadas; nada de VPN ou máquina virtual). */
function minhaRede(): { ip: string; mac: string; base: number; tamanho: number; nome: string } | null {
  const num = (ip: string) => ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0
  for (const [nome, lista] of Object.entries(networkInterfaces())) {
    if (/vethernet|virtual|vmware|vbox|tailscale|zerotier|hyper-v|wsl|docker|loopback|bluetooth/i.test(nome)) continue
    for (const i of lista ?? []) {
      if (i.family !== 'IPv4' || i.internal || !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) continue
      const mascara = num(i.netmask)
      const tamanho = Math.min(1024, (~mascara >>> 0) + 1)
      return { ip: i.address, mac: i.mac.toUpperCase(), base: (num(i.address) & mascara) >>> 0, tamanho, nome: `${i.address.split('.').slice(0, 3).join('.')}.0` }
    }
  }
  return null
}

const ipDe = (n: number): string => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')

/** "Cutuca" todos os endereços da rede (um pacote UDP pequeno) para a tabela ARP se encher. */
async function cutucar(base: number, tamanho: number): Promise<void> {
  const sock = createSocket('udp4')
  sock.on('error', () => {})
  await new Promise<void>((ok) => sock.bind(0, () => ok()))
  for (let i = 1; i < tamanho - 1; i++) {
    sock.send(Buffer.from([0]), 9, ipDe(base + i))
    if (i % 64 === 0) await esperar(20)
  }
  await esperar(2500)
  try { sock.close() } catch { /* já fechado */ }
}

const arp = (): Promise<string> => new Promise((ok) => execFile('arp', ['-a'], { windowsHide: true, timeout: 10_000 }, (_e, out) => ok(String(out ?? ''))))

async function nomeNaRede(ip: string): Promise<string> {
  try {
    const nomes = await Promise.race([reverse(ip), esperar(800).then(() => [] as string[])])
    return nomes[0] ?? ''
  } catch {
    return ''
  }
}

/** Baixa uma vez a lista oficial de fabricantes de placas de rede (IEEE) e guarda no PC. */
async function prepararFabricantes(): Promise<void> {
  try {
    if (existsSync(arquivoOui())) { oui = JSON.parse(readFileSync(arquivoOui(), 'utf8')); return }
    const t = await (await fetch('https://standards-oui.ieee.org/oui/oui.txt', { signal: AbortSignal.timeout(60_000) })).text()
    oui = lerOui(t)
    if (Object.keys(oui).length > 1000) writeFileSync(arquivoOui(), JSON.stringify(oui))
  } catch (e) {
    opcoes.log(`lista de fabricantes: ${(e as Error).message}`)
  }
}

/** Uma passada pela rede. Na primeira, só aprende quem já está em casa (ninguém é "novo"). */
export async function varrerRede(): Promise<{ aparelhos: Aparelho[]; novos: Aparelho[] } | null> {
  if (varrendo) return null
  const rede = minhaRede()
  if (!rede) return null
  varrendo = true
  try {
    if (!Object.keys(oui).length) await prepararFabricantes()
    await cutucar(rede.base, rede.tamanho)
    const prefixo = rede.nome.slice(0, rede.nome.lastIndexOf('.'))
    const vistos = lerArp(await arp()).filter((v) => v.mac !== rede.mac && (rede.tamanho > 256 || v.ip.startsWith(`${prefixo}.`)))
    const comNome = await Promise.all(vistos.map(async (v) => ({ ...v, host: await nomeNaRede(v.ip), fabricante: fabricante(v.mac, oui) })))
    const g = ler()
    // Mudou de rede (outra casa, outro roteador): começa a aprender de novo
    const outraRede = g.rede && g.rede !== rede.nome
    const r = atualizar(outraRede ? [] : g.aparelhos, comNome, Date.now(), g.varreduras === 0 || !!outraRede)
    salvar({ aparelhos: r.aparelhos.slice(0, 300), varreduras: (outraRede ? 0 : g.varreduras) + 1, rede: rede.nome })
    for (const n of r.novos) {
      opcoes.log(`aparelho novo: ${n.mac} ${n.ip} ${n.fabricante}`)
      opcoes.avisar(`Um aparelho que eu não conhecia entrou no seu Wi-Fi: ${nomeDoAparelho(n)}, no endereço ${n.ip}. Se for de casa, diga "esse é o celular da minha mãe" para eu lembrar.`)
    }
    return r
  } finally {
    varrendo = false
  }
}

export const aparelhosConhecidos = (): Aparelho[] => ler().aparelhos

export function apelidar(mac: string, apelido: string): void {
  const g = ler()
  const a = g.aparelhos.find((x) => x.mac === mac)
  if (a) { a.apelido = apelido.trim().slice(0, 40); salvar(g) }
}

export function esquecerAparelho(mac: string): void {
  const g = ler()
  g.aparelhos = g.aparelhos.filter((x) => x.mac !== mac)
  salvar(g)
}

// ---------- Uso da internet ----------

const SCRIPT_BYTES = `$a = Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Where-Object { $_.ReceivedBytes -gt 0 }
$r = ($a | Measure-Object -Property ReceivedBytes -Sum).Sum; $s = ($a | Measure-Object -Property SentBytes -Sum).Sum
Write-Output "$r $s"`

function bytesDoPc(): Promise<[number, number] | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)
  return new Promise((ok) => execFile('powershell.exe', ['-NoProfile', '-Command', SCRIPT_BYTES], { windowsHide: true, timeout: 15_000 }, (e, out) => {
    const [r, s] = String(out ?? '').trim().split(/\s+/).map(Number)
    ok(e || !Number.isFinite(r) ? null : [r, s])
  }))
}

/** Quanto a casa inteira (pelo roteador) e o PC estão usando agora, em Mb/s. */
export async function usoDaInternet(): Promise<{ casa: { baixando: number; enviando: number } | null; pc: { baixando: number; enviando: number } | null }> {
  let servico: { servico: string; controle: string } | null = null
  for (const d of await descobrirUpnp(2500)) {
    servico = acharServico(d.xml, d.url, ['WANCommonInterfaceConfig'])
    if (servico) break
  }
  const lerRoteador = async (): Promise<[number, number] | null> => {
    if (!servico) return null
    try {
      const r = Number(campoSoap(await pedirUpnp(servico, 'GetTotalBytesReceived'), 'NewTotalBytesReceived'))
      const s = Number(campoSoap(await pedirUpnp(servico, 'GetTotalBytesSent'), 'NewTotalBytesSent'))
      return Number.isFinite(r) && Number.isFinite(s) ? [r, s] : null
    } catch {
      return null
    }
  }
  const [r1, p1] = await Promise.all([lerRoteador(), bytesDoPc()])
  const inicio = Date.now()
  await esperar(4000)
  const [r2, p2] = await Promise.all([lerRoteador(), bytesDoPc()])
  const seg = (Date.now() - inicio) / 1000
  // Contadores de 32 bits dão a volta: ignora medida que "andou para trás"
  const casa = r1 && r2 && r2[0] >= r1[0] ? { baixando: mbps(r1[0], r2[0], seg), enviando: mbps(r1[1], r2[1], seg) } : null
  const pc = p1 && p2 ? { baixando: mbps(p1[0], p2[0], seg), enviando: mbps(p1[1], p2[1], seg) } : null
  return { casa, pc }
}

/** Ao abrir: aprende a rede daqui a pouco e olha de novo a cada 10 minutos. */
export function iniciarRede(o: typeof opcoes): void {
  opcoes = o
  if (!redeLigada()) return
  const passar = () => void varrerRede().catch((e) => opcoes.log(`varredura: ${(e as Error).message}`))
  setTimeout(passar, 2 * 60_000)
  setInterval(passar, 10 * 60_000)
}
