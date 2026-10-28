// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// UPnP do roteador, a parte que não depende de rede: ler as respostas, achar o serviço da internet
// (WANIPConnection) e montar os pedidos SOAP. Com isso a FRIDAY abre sozinha, no roteador, a porta
// que deixa o "liga o PC" chegar de fora de casa. Testado em tests/ligar-de-fora.test.ts.

/** Endereço da descrição do roteador numa resposta SSDP (cabeçalho LOCATION). */
export function lerRespostaSsdp(texto: string): string | null {
  const m = texto.match(/^location:\s*(\S+)\s*$/im)
  return m && /^https?:\/\//i.test(m[1]) ? m[1] : null
}

/** Pedido SSDP de busca pelo roteador. */
export const buscaSsdp = (alvo: string): string =>
  ['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'MX: 2', `ST: ${alvo}`, '', ''].join('\r\n')

export const ALVOS_SSDP = [
  'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
  'urn:schemas-upnp-org:service:WANIPConnection:1',
  'urn:schemas-upnp-org:service:WANPPPConnection:1'
]

const tag = (xml: string, nome: string): string => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}>\\s*([^<]*?)\\s*</(?:\\w+:)?${nome}>`, 'i'))
  return m ? m[1].replace(/&amp;/g, '&') : ''
}

/** Na descrição XML do roteador, o serviço que abre portas e o endereço de controle dele. */
export function acharServicoWan(xml: string, localizacao: string): { servico: string; controle: string } | null {
  const base = tag(xml, 'URLBase') || localizacao
  const servicos = xml.match(/<(?:\w+:)?service>[\s\S]*?<\/(?:\w+:)?service>/gi) ?? []
  // WANIPConnection (fibra, cabo) antes de WANPPPConnection (PPPoE)
  const ordem = ['WANIPConnection', 'WANPPPConnection']
  for (const tipo of ordem) {
    for (const s of servicos) {
      const servico = tag(s, 'serviceType')
      if (!servico.includes(`:${tipo}:`)) continue
      const caminho = tag(s, 'controlURL')
      if (!caminho) continue
      try { return { servico, controle: new URL(caminho, base).toString() } } catch { /* endereço estranho */ }
    }
  }
  return null
}

const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function envelopeSoap(servico: string, acao: string, args: Record<string, string | number> = {}): string {
  const campos = Object.entries(args).map(([k, v]) => `<${k}>${escapar(String(v))}</${k}>`).join('')
  return `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${acao} xmlns:u="${servico}">${campos}</u:${acao}></s:Body></s:Envelope>`
}

/** Um campo da resposta SOAP (ex.: NewExternalIPAddress) ou o código de erro UPnP. */
export const campoSoap = (xml: string, nome: string): string => tag(xml, nome)

/** Pedido para abrir a porta (UDP externa → porta do PC). Prazo 0 = para sempre. */
export function argsDaPorta(externa: number, interna: number, ipDoPc: string, prazo = 0): Record<string, string | number> {
  return {
    NewRemoteHost: '',
    NewExternalPort: externa,
    NewProtocol: 'UDP',
    NewInternalPort: interna,
    NewInternalClient: ipDoPc,
    NewEnabled: 1,
    NewPortMappingDescription: 'FRIDAY - ligar o PC',
    NewLeaseDuration: prazo
  }
}

/** IP que não é da internet de verdade (rede local, CGNAT da operadora, Tailscale). */
export function ipNaoPublico(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
}

/**
 * A internet de casa aceita conexão de fora? Compara o IP que o roteador diz ter com o IP que a
 * internet vê. Diferentes, ou o do roteador não público: a operadora usa CGNAT (ou há dois roteadores).
 */
export function diagnosticarNat(ipDoRoteador: string, ipPublico: string): 'ok' | 'cgnat' | 'desconhecido' {
  if (ipDoRoteador && ipNaoPublico(ipDoRoteador)) return 'cgnat'
  if (!ipPublico || !ipDoRoteador) return 'desconhecido'
  return ipDoRoteador === ipPublico ? 'ok' : 'cgnat'
}
