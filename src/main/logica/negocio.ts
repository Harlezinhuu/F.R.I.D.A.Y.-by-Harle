// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O negócio de sites para lojas: pacotes, regras de fechamento, prazos pela sua capacidade, o
// ciclo de cada cliente e o que fazer a seguir. Só regras e contas (sem disco, sem rede), para
// dar para testar. As decisões de dinheiro e assinatura nunca saem daqui: elas viram pendências.

export type Etapa = 'prospectado' | 'raio_x' | 'previa' | 'proposta' | 'fechado' | 'construcao' | 'entregue' | 'manutencao' | 'arquivado'

export const ETAPAS: { id: Etapa; nome: string; cor: string }[] = [
  { id: 'prospectado', nome: 'Prospectado', cor: '#8FA3B8' },
  { id: 'raio_x', nome: 'Raio-X feito', cor: '#5FE1F2' },
  { id: 'previa', nome: 'Prévia pronta', cor: '#7FB8FF' },
  { id: 'proposta', nome: 'Proposta enviada', cor: '#B7ADFF' },
  { id: 'fechado', nome: 'Fechado', cor: '#FFB547' },
  { id: 'construcao', nome: 'Em construção', cor: '#FF8F5C' },
  { id: 'entregue', nome: 'Entregue', cor: '#5CF2A6' },
  { id: 'manutencao', nome: 'Em manutenção', cor: '#3FD98A' },
  { id: 'arquivado', nome: 'Arquivado', cor: '#5A6575' }
]

export const nomeDaEtapa = (e: Etapa): string => ETAPAS.find((x) => x.id === e)?.nome ?? e

export type IdPacote = 'vitrine' | 'site' | 'loja'
export interface Pacote { id: IdPacote; nome: string; base: number; maximo: number; inclui: string; diasDeTrabalho: number }

/** A tabela inicial (média nacional de freelancers em 2026, da faixa de baixo para o meio). */
export const PACOTES: Pacote[] = [
  { id: 'vitrine', nome: 'Vitrine', base: 600, maximo: 900, inclui: 'Página única com produtos em destaque, botão de WhatsApp, Instagram, mapa e horário de funcionamento.', diasDeTrabalho: 3 },
  { id: 'site', nome: 'Site da loja', base: 1500, maximo: 2500, inclui: 'Até 5 páginas, catálogo de produtos sem carrinho, pedido pelo WhatsApp, avaliações do Google e Instagram.', diasDeTrabalho: 7 },
  { id: 'loja', nome: 'Loja virtual', base: 3000, maximo: 5000, inclui: 'Loja na Nuvemshop ou Shopify com tema personalizado, até 50 produtos cadastrados, pagamento online (Pix e cartão) e frete calculado.', diasDeTrabalho: 14 }
]

export const MANUTENCAO = { minimo: 100, maximo: 250, inclui: 'Ajustes pequenos, troca de produtos e preços, backup, suporte e relatório mensal.' }

export interface Regras {
  /** Desconto que ela pode dar sozinha (0,10 = 10%) */
  descontoMaximo: number
  /** Quantos sites você aguenta por mês */
  sitesPorMes: number
  /** Porcentagem paga para começar */
  entrada: number
  /** Rodadas de ajuste incluídas */
  rodadas: number
}

export const REGRAS_PADRAO: Regras = { descontoMaximo: 0.1, sitesPorMes: 5, entrada: 50, rodadas: 2 }

export const acharPacote = (texto: string): Pacote | null => {
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/vitrine|pagina unica|one ?page|landing/.test(t)) return PACOTES[0]
  if (/loja virtual|e-?commerce|carrinho|nuvemshop|shopify|loja online/.test(t)) return PACOTES[2]
  if (/site|institucional|catalogo/.test(t)) return PACOTES[1]
  return PACOTES.find((p) => p.id === t) ?? null
}

export const minimoDoPacote = (p: Pacote, r: Regras = REGRAS_PADRAO): number => Math.round(p.base * (1 - r.descontoMaximo))

/**
 * Ela pode fechar esse preço sozinha? Dentro da faixa (até o desconto máximo) sim; abaixo do mínimo
 * ou um preço de portfólio, só com você.
 */
export function avaliarPreco(p: Pacote, valor: number, r: Regras = REGRAS_PADRAO): { sozinha: boolean; minimo: number; desconto: number; motivo: string } {
  const minimo = minimoDoPacote(p, r)
  const desconto = Math.max(0, Math.round((1 - valor / p.base) * 1000) / 10)
  if (!Number.isFinite(valor) || valor <= 0) return { sozinha: false, minimo, desconto: 0, motivo: 'Valor inválido.' }
  if (valor < minimo) return { sozinha: false, minimo, desconto, motivo: `R$ ${valor} fica abaixo do mínimo de R$ ${minimo} do pacote ${p.nome} (${desconto}% de desconto): só com a aprovação dele.` }
  return { sozinha: true, minimo, desconto, motivo: valor > p.maximo ? `Acima da tabela (até R$ ${p.maximo}), mas pode.` : desconto > 0 ? `${desconto}% de desconto, dentro do limite.` : 'Preço de tabela.' }
}

export interface Pagamento { descricao: string; valor: number; vencimento: string; pago: boolean; aprovado: boolean; notaEmitida?: boolean }
export interface Evento { quando: string; texto: string }

export interface Cliente {
  id: string
  nome: string
  segmento: string
  contato: { responsavel: string; whatsapp: string; telefone: string; instagram: string; email: string; endereco: string; cidade: string; documento: string }
  etapa: Etapa
  pacote: IdPacote | ''
  valor: number
  mensalidade: number
  /** Prazo de entrega combinado (ISO) */
  prazo: string
  site: string
  materialPedidoEm: string
  materialRecebidoEm: string
  propostaEnviadaEm: string
  entregueEm: string
  depoimentoPedidoEm: string
  indicacaoPedidaEm: string
  ultimoLembreteEm: string
  pagamentos: Pagamento[]
  historico: Evento[]
  observacoes: string
  criadoEm: string
  atualizadoEm: string
}

/** Nome de pasta e identificador a partir do nome da loja. */
export const slugDoCliente = (nome: string): string =>
  nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cliente'

export function novoCliente(nome: string, agora = new Date()): Cliente {
  const iso = agora.toISOString()
  return {
    id: slugDoCliente(nome), nome: nome.trim().slice(0, 60), segmento: '',
    contato: { responsavel: '', whatsapp: '', telefone: '', instagram: '', email: '', endereco: '', cidade: '', documento: '' },
    etapa: 'prospectado', pacote: '', valor: 0, mensalidade: 0, prazo: '', site: '',
    materialPedidoEm: '', materialRecebidoEm: '', propostaEnviadaEm: '', entregueEm: '', depoimentoPedidoEm: '', indicacaoPedidaEm: '', ultimoLembreteEm: '',
    pagamentos: [], historico: [{ quando: iso, texto: 'Cliente criado.' }], observacoes: '', criadoEm: iso, atualizadoEm: iso
  }
}

/** Sites ocupando a sua agenda (fechados e em construção). */
export const ocupados = (cs: Cliente[]): Cliente[] => cs.filter((c) => c.etapa === 'fechado' || c.etapa === 'construcao')

/**
 * Prazo realista: cada site leva os dias de trabalho do pacote, mas a fila anda no ritmo da sua
 * capacidade (sites por mês). O prazo só começa quando o material chega, então soma 3 dias de folga.
 */
export function prazoPara(p: Pacote, clientes: Cliente[], hoje = new Date(), r: Regras = REGRAS_PADRAO): Date {
  const fila = ocupados(clientes).length
  const diasPorSite = 30 / Math.max(1, r.sitesPorMes)
  const espera = Math.max(0, fila - Math.floor(r.sitesPorMes / 2)) * diasPorSite
  const dias = Math.ceil(espera + p.diasDeTrabalho + 3)
  const d = new Date(hoje.getTime() + dias * 86_400_000)
  // Entrega em dia útil
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}

/** Cabe mais um site este mês? */
export const temCapacidade = (clientes: Cliente[], r: Regras = REGRAS_PADRAO): boolean => ocupados(clientes).length < r.sitesPorMes

/** Os dois pagamentos do combinado (entrada e restante), ainda não aprovados por você. */
export function pagamentosDoFechamento(valor: number, hoje: Date, prazo: Date, r: Regras = REGRAS_PADRAO): Pagamento[] {
  const entrada = Math.round(valor * r.entrada) / 100
  return [
    { descricao: `Entrada (${r.entrada}%)`, valor: entrada, vencimento: hoje.toISOString().slice(0, 10), pago: false, aprovado: false },
    { descricao: `Restante (${100 - r.entrada}%), na entrega`, valor: Math.round((valor - entrada) * 100) / 100, vencimento: prazo.toISOString().slice(0, 10), pago: false, aprovado: false }
  ]
}

export type TipoAcao = 'cobrar_material' | 'lembrar_proposta' | 'cobrar_pagamento' | 'pedir_depoimento' | 'pedir_indicacao' | 'emitir_nota' | 'prazo_perto'
export interface Acao { cliente: string; tipo: TipoAcao; texto: string; mensagem?: string }

const dias = (de: string, ate: Date): number => (de ? (ate.getTime() - Date.parse(de)) / 86_400_000 : Infinity)
const primeiroNome = (c: Cliente): string => (c.contato.responsavel || '').split(' ')[0] || ''
const ola = (c: Cliente): string => `Oi${primeiroNome(c) ? `, ${primeiroNome(c)}` : ''}! Tudo bem?`

/**
 * O que fazer agora com este cliente (no máximo um lembrete por cliente a cada 2 dias, para não
 * virar chatice). As mensagens são educadas e curtas, no seu nome.
 */
export function proximasAcoes(c: Cliente, agora = new Date(), assinatura = 'Harle'): Acao[] {
  const out: Acao[] = []
  const podeLembrar = dias(c.ultimoLembreteEm, agora) >= 2
  if (c.etapa === 'construcao' && c.materialPedidoEm && !c.materialRecebidoEm && dias(c.materialPedidoEm, agora) >= 3 && podeLembrar) {
    out.push({ cliente: c.id, tipo: 'cobrar_material', texto: `${c.nome} ainda não mandou o material (pedido há ${Math.floor(dias(c.materialPedidoEm, agora))} dias).`, mensagem: `${ola(c)} Aqui é o ${assinatura}, do site da ${c.nome}. Para eu seguir com o site, só falta o material (fotos, logo e os textos/preços dos produtos). Pode me mandar por aqui mesmo quando der? O prazo começa a contar quando ele chegar.` })
  }
  if (c.etapa === 'proposta' && c.propostaEnviadaEm && dias(c.propostaEnviadaEm, agora) >= 3 && podeLembrar) {
    out.push({ cliente: c.id, tipo: 'lembrar_proposta', texto: `A proposta da ${c.nome} está sem resposta há ${Math.floor(dias(c.propostaEnviadaEm, agora))} dias.`, mensagem: `${ola(c)} Aqui é o ${assinatura}. Conseguiu dar uma olhada na proposta do site da ${c.nome}? Se tiver alguma dúvida ou quiser mudar alguma coisa, é só me falar.` })
  }
  for (const p of c.pagamentos) {
    if (!p.pago && p.vencimento && Date.parse(`${p.vencimento}T23:59:59`) < agora.getTime()) {
      // Cobrança de dinheiro: nunca sai sozinha (vira pendência)
      out.push({ cliente: c.id, tipo: 'cobrar_pagamento', texto: `${p.descricao} da ${c.nome} (R$ ${p.valor}) venceu em ${p.vencimento}.`, mensagem: `${ola(c)} Aqui é o ${assinatura}. Passando para lembrar do pagamento de R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${p.descricao.toLowerCase()}) do site da ${c.nome}. Qualquer coisa, me chama!` })
    }
    if (p.pago && !p.notaEmitida) out.push({ cliente: c.id, tipo: 'emitir_nota', texto: `Falta emitir a nota de R$ ${p.valor} da ${c.nome} (${p.descricao}).` })
  }
  if ((c.etapa === 'entregue' || c.etapa === 'manutencao') && c.entregueEm) {
    if (!c.depoimentoPedidoEm && dias(c.entregueEm, agora) >= 3) {
      out.push({ cliente: c.id, tipo: 'pedir_depoimento', texto: `Pedir depoimento para a ${c.nome}.`, mensagem: `${ola(c)} Aqui é o ${assinatura}. O site da ${c.nome} já está no ar há alguns dias. Se você gostou, poderia deixar um depoimento curtinho (uma ou duas frases) sobre o trabalho? Vai me ajudar muito!` })
    }
    if (!c.indicacaoPedidaEm && dias(c.entregueEm, agora) >= 30) {
      out.push({ cliente: c.id, tipo: 'pedir_indicacao', texto: `Pedir indicação para a ${c.nome} (um mês de site no ar).`, mensagem: `${ola(c)} Aqui é o ${assinatura}. Faz um mês que o site da ${c.nome} está no ar! Você conhece alguma outra loja que também precisaria de um site? Se indicar e fechar, o próximo mês da sua manutenção fica por minha conta.` })
    }
  }
  if (c.etapa === 'construcao' && c.prazo) {
    const faltam = (Date.parse(c.prazo) - agora.getTime()) / 86_400_000
    if (faltam >= 0 && faltam <= 2) out.push({ cliente: c.id, tipo: 'prazo_perto', texto: `O site da ${c.nome} vence em ${Math.ceil(faltam)} ${Math.ceil(faltam) === 1 ? 'dia' : 'dias'}.` })
  }
  return out
}

/** Resumo do funil ("como estão os clientes?"). */
export function resumoDoFunil(cs: Cliente[], agora = new Date()): string {
  const ativos = cs.filter((c) => c.etapa !== 'arquivado')
  if (!ativos.length) return 'Ainda não tem nenhum cliente.'
  const por = ETAPAS.filter((e) => e.id !== 'arquivado').map((e) => ({ e, n: ativos.filter((c) => c.etapa === e.id).length })).filter((x) => x.n)
  const mes = agora.toISOString().slice(0, 7)
  const recebido = cs.flatMap((c) => c.pagamentos).filter((p) => p.pago && p.vencimento.startsWith(mes)).reduce((s, p) => s + p.valor, 0)
  const aReceber = cs.flatMap((c) => c.pagamentos).filter((p) => !p.pago).reduce((s, p) => s + p.valor, 0)
  const recorrente = cs.filter((c) => c.etapa === 'manutencao').reduce((s, c) => s + c.mensalidade, 0)
  return `${ativos.length} clientes: ${por.map((x) => `${x.n} ${x.e.nome.toLowerCase()}`).join(', ')}. Este mês entrou R$ ${recebido.toLocaleString('pt-BR')}; a receber, R$ ${aReceber.toLocaleString('pt-BR')}${recorrente ? `; manutenções somam R$ ${recorrente.toLocaleString('pt-BR')} por mês` : ''}.`
}
