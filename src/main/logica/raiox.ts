// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Raio-X do PC (o diagnóstico da armadura, só que do computador): o que está deixando lento,
// saúde dos discos e da bateria, temperaturas e a segurança do Windows. Aqui fica a parte que dá
// para testar: transformar o que o Windows informa em achados falados, do mais grave para o menos.

export interface Processo { nome: string; cpu: number | null; ramMb: number; n: number }
export interface Volume { letra: string; rotulo: string; totalGb: number; livreGb: number }
export interface Disco { nome: string; tipo: string; saude: string; temperatura: number | null; desgaste: number | null }

/** O que o PowerShell (e o nvidia-smi) devolvem. Tudo opcional: cada leitura pode falhar sozinha. */
export interface Leitura {
  ligadoDesde?: string
  ramTotalGb?: number
  ramLivreGb?: number
  processos?: Processo[]
  volumes?: Volume[]
  discos?: Disco[]
  cpuTemp?: number | null
  gpu?: { nome: string; temp: number; uso: number } | null
  bateria?: { carga: number; projetadaMwh: number | null; atualMwh: number | null } | null
  inicializacao?: string[]
  defender?: { ligado: boolean; tempoReal: boolean; assinaturaDias: number | null; varreduraDias: number | null } | null
  outrosAntivirus?: string[]
  firewall?: { nome: string; ligado: boolean }[]
  ultimaAtualizacao?: string | null
  reinicioPendente?: boolean
}

export interface Achado {
  /** 0 = tudo certo / informação, 1 = atenção, 2 = problema */
  gravidade: 0 | 1 | 2
  area: 'desempenho' | 'disco' | 'temperatura' | 'bateria' | 'seguranca' | 'sistema'
  texto: string
}

const NOMES: Record<string, string> = {
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', opera: 'Opera', brave: 'Brave', code: 'VS Code', discord: 'Discord',
  spotify: 'Spotify', steam: 'Steam', steamwebhelper: 'Steam', explorer: 'Explorador de Arquivos', teams: 'Teams', 'ms-teams': 'Teams',
  onedrive: 'OneDrive', msmpeng: 'antivírus do Windows', searchhost: 'pesquisa do Windows', dwm: 'janelas do Windows',
  electron: 'FRIDAY', vmmem: 'máquina virtual (WSL/Docker)', vmmemwsl: 'máquina virtual (WSL)', virtualboxvm: 'VirtualBox', ollama: 'Ollama',
  'ollama app': 'Ollama', node: 'Node.js', java: 'Java', javaw: 'Java', python: 'Python', obs64: 'OBS', whatsapp: 'WhatsApp'
}
/** Processos do próprio Windows que não adianta mandar fechar. */
const DO_SISTEMA = /^(system|idle|registry|memory compression|secure system|svchost|csrss|wininit|services|lsass|smss|fontdrvhost|wudfhost|audiodg)$/i

export const nomeAmigavel = (p: string): string => NOMES[p.toLowerCase()] ?? p

const gb = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`)
const dias = (iso: string, agora: number): number => Math.floor((agora - Date.parse(iso)) / 86_400_000)

/** Os que mais pesam agora (somando todas as janelas/abas de cada programa). */
export function maisPesados(ps: Processo[], quantos = 3): { ram: Processo[]; cpu: Processo[] } {
  const validos = ps.filter((p) => !DO_SISTEMA.test(p.nome))
  return {
    ram: [...validos].sort((a, b) => b.ramMb - a.ramMb).slice(0, quantos),
    cpu: [...validos].filter((p) => (p.cpu ?? 0) >= 5).sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)).slice(0, quantos)
  }
}

export function analisar(l: Leitura, agora = Date.now()): Achado[] {
  const out: Achado[] = []
  const add = (gravidade: 0 | 1 | 2, area: Achado['area'], texto: string) => out.push({ gravidade, area, texto })

  // ---------- Desempenho ----------
  if (l.ramTotalGb && l.ramLivreGb !== undefined) {
    const uso = Math.round((1 - l.ramLivreGb / l.ramTotalGb) * 100)
    if (uso >= 90) add(2, 'desempenho', `A memória está em ${uso}%: é o principal motivo de lentidão agora.`)
    else if (uso >= 80) add(1, 'desempenho', `A memória está em ${uso}%, quase cheia.`)
    else add(0, 'desempenho', `Memória em ${uso}% de ${Math.round(l.ramTotalGb)} GB, tranquila.`)
  }
  if (l.processos?.length) {
    const { ram, cpu } = maisPesados(l.processos)
    const total = (l.ramTotalGb ?? 16) * 1024
    const pesados = ram.filter((p) => p.ramMb >= Math.max(1500, total * 0.15))
    if (pesados.length) add(1, 'desempenho', `O que mais pesa na memória: ${pesados.map((p) => `${nomeAmigavel(p.nome)} com ${gb(p.ramMb)}${p.n > 3 ? ` (${p.n} processos)` : ''}`).join(', ')}.`)
    else if (ram[0]) add(0, 'desempenho', `O programa que mais usa memória é ${nomeAmigavel(ram[0].nome)}, com ${gb(ram[0].ramMb)}.`)
    const quentes = cpu.filter((p) => (p.cpu ?? 0) >= 25)
    if (quentes.length) add(quentes[0].cpu! >= 60 ? 2 : 1, 'desempenho', `O processador está ocupado com ${quentes.map((p) => `${nomeAmigavel(p.nome)} (${Math.round(p.cpu!)}%)`).join(', ')}.`)
  }
  if (l.ligadoDesde) {
    const d = dias(l.ligadoDesde, agora)
    if (d >= 7) add(1, 'sistema', `O PC não reinicia faz ${d} dias. Reiniciar costuma devolver a agilidade.`)
  }
  if (l.reinicioPendente) add(1, 'sistema', 'Tem atualização do Windows esperando um reinício.')
  if ((l.inicializacao?.length ?? 0) >= 12) add(1, 'desempenho', `${l.inicializacao!.length} programas abrem junto com o Windows; alguns dá para tirar (Gerenciador de Tarefas, aba Inicializar).`)

  // ---------- Discos ----------
  for (const v of l.volumes ?? []) {
    if (!v.totalGb) continue
    const livre = Math.round((v.livreGb / v.totalGb) * 100)
    const nome = `O disco ${v.letra}${v.rotulo ? ` (${v.rotulo})` : ''}`
    if (livre < 5 || v.livreGb < 5) add(2, 'disco', `${nome} está quase cheio: só ${Math.round(v.livreGb)} GB livres (${livre}%).`)
    else if (livre < 12) add(1, 'disco', `${nome} tem ${Math.round(v.livreGb)} GB livres (${livre}%). Vale limpar.`)
  }
  for (const d of l.discos ?? []) {
    if (d.saude && !/^(healthy|íntegro|saudável)$/i.test(d.saude)) add(2, 'disco', `O disco ${d.nome} está com a saúde "${d.saude}". Faça backup do que importa.`)
    if (d.temperatura !== null && d.temperatura >= 60) add(d.temperatura >= 70 ? 2 : 1, 'temperatura', `O disco ${d.nome} está a ${d.temperatura} graus.`)
    if (d.desgaste !== null && d.desgaste >= 70) add(d.desgaste >= 90 ? 2 : 1, 'disco', `O SSD ${d.nome} já gastou ${d.desgaste}% da vida útil.`)
  }
  if ((l.discos?.length ?? 0) && !out.some((a) => a.area === 'disco' && a.gravidade > 0)) add(0, 'disco', 'Discos saudáveis e com espaço.')

  // ---------- Temperaturas ----------
  if (l.gpu) {
    if (l.gpu.temp >= 87) add(2, 'temperatura', `A placa de vídeo está a ${l.gpu.temp} graus, quente demais. Veja a ventilação e a poeira.`)
    else if (l.gpu.temp >= 80) add(1, 'temperatura', `A placa de vídeo está a ${l.gpu.temp} graus, no limite do confortável.`)
    else add(0, 'temperatura', `Placa de vídeo a ${l.gpu.temp} graus.`)
  }
  if (typeof l.cpuTemp === 'number' && l.cpuTemp > 0) {
    if (l.cpuTemp >= 90) add(2, 'temperatura', `O processador está a ${l.cpuTemp} graus, quente demais.`)
    else if (l.cpuTemp >= 80) add(1, 'temperatura', `O processador está a ${l.cpuTemp} graus.`)
  }

  // ---------- Bateria (notebook) ----------
  if (l.bateria?.projetadaMwh && l.bateria.atualMwh) {
    const saude = Math.round((l.bateria.atualMwh / l.bateria.projetadaMwh) * 100)
    if (saude < 60) add(2, 'bateria', `A bateria guarda só ${saude}% do que guardava nova. Já vale trocar.`)
    else if (saude < 80) add(1, 'bateria', `A bateria está com ${saude}% da capacidade de quando era nova.`)
  }

  // ---------- Segurança ----------
  const outros = (l.outrosAntivirus ?? []).filter((n) => !/defender/i.test(n))
  if (l.defender) {
    if (!l.defender.tempoReal && !outros.length) add(2, 'seguranca', 'A proteção em tempo real do antivírus está desligada, e não tem outro antivírus no lugar.')
    if (l.defender.tempoReal && l.defender.assinaturaDias !== null && l.defender.assinaturaDias > 7) add(1, 'seguranca', `O antivírus está sem atualizar faz ${l.defender.assinaturaDias} dias.`)
  } else if (!outros.length && l.outrosAntivirus) {
    add(1, 'seguranca', 'Não consegui ver o antivírus.')
  }
  if (outros.length) add(0, 'seguranca', `Antivírus: ${outros.join(', ')}.`)
  const desligados = (l.firewall ?? []).filter((f) => !f.ligado).map((f) => ({ Domain: 'domínio', Private: 'privada', Public: 'pública' }[f.nome] ?? f.nome))
  if (desligados.length) add(desligados.includes('pública') ? 2 : 1, 'seguranca', `O firewall está desligado na rede ${desligados.join(' e ')}.`)
  if (l.ultimaAtualizacao) {
    const d = dias(l.ultimaAtualizacao, agora)
    if (d > 45) add(1, 'seguranca', `A última atualização do Windows foi há ${d} dias.`)
  }
  if (l.defender && l.defender.tempoReal && !desligados.length && !out.some((a) => a.area === 'seguranca' && a.gravidade > 0)) add(0, 'seguranca', 'Segurança em dia: antivírus ligado e atualizado, firewall ligado.')

  return out.sort((a, b) => b.gravidade - a.gravidade)
}

/** Resposta falada: os problemas primeiro; se não tiver nenhum, diz que está tudo bem. */
export function resumoFalado(achados: Achado[], foco: 'geral' | 'lento' | 'seguranca' = 'geral'): string {
  const areas: Record<typeof foco, Achado['area'][]> = {
    geral: ['desempenho', 'disco', 'temperatura', 'bateria', 'seguranca', 'sistema'],
    lento: ['desempenho', 'sistema', 'disco', 'temperatura'],
    seguranca: ['seguranca', 'sistema']
  }
  const daqui = achados.filter((a) => areas[foco].includes(a.area))
  const problemas = daqui.filter((a) => a.gravidade > 0)
  if (!problemas.length) {
    const bons = daqui.filter((a) => a.gravidade === 0).slice(0, 3).map((a) => a.texto)
    return `Tudo em ordem. ${bons.join(' ')}`.trim()
  }
  return problemas.slice(0, 6).map((a) => a.texto).join(' ')
}
