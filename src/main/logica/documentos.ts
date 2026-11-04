// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Proposta e contrato de cada cliente, em HTML pronto para virar PDF (o Electron imprime).
// O contrato é um modelo: vale revisar uma vez com um advogado ou contador antes de usar.

import type { Cliente, Pacote, Regras } from './negocio'
import type { RaioXLoja } from './raioxloja'

export interface DadosEmpresa { nome: string; responsavel: string; documento: string; cidade: string; whatsapp: string; email: string; site: string; pix: string }

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const reais = (v: number): string => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dataLonga = (d: Date): string => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
const linha = (rotulo: string, valor: string) => (valor ? `<p><b>${esc(rotulo)}:</b> ${esc(valor)}</p>` : '')

const ESTILO = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #1b2230; font-size: 11pt; line-height: 1.5; margin: 0; }
.capa { background: linear-gradient(135deg, #0b0f18, #16223a); color: #e8eef7; padding: 28px 30px; border-radius: 14px; margin-bottom: 22px; }
.capa .marca { letter-spacing: .25em; font-size: 9pt; color: #8fb8ff; text-transform: uppercase; }
.capa h1 { font-size: 24pt; margin: 6px 0 4px; font-weight: 700; }
.capa p { margin: 0; color: #b9c6da; }
h2 { font-size: 13pt; color: #16223a; border-bottom: 2px solid #c9d3e3; padding-bottom: 4px; margin: 22px 0 10px; }
.caixa { background: #f2f5fa; border-radius: 10px; padding: 12px 16px; }
.preco { font-size: 22pt; font-weight: 700; color: #16223a; }
table { width: 100%; border-collapse: collapse; }
td { padding: 6px 4px; border-bottom: 1px solid #e3e8f0; vertical-align: top; }
.pe { margin-top: 26px; font-size: 9pt; color: #6b778a; }
.assinaturas { display: flex; gap: 40px; margin-top: 50px; }
.assinaturas div { flex: 1; border-top: 1px solid #1b2230; padding-top: 6px; text-align: center; font-size: 10pt; }
ol li { margin-bottom: 8px; }
`

const pagina = (titulo: string, corpo: string): string =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${ESTILO}</style></head><body>${corpo}</body></html>`

export interface DadosProposta { cliente: Cliente; pacote: Pacote; valor: number; mensalidade: number; prazo: Date; raioX: RaioXLoja | null; empresa: DadosEmpresa; regras: Regras; previa: string; hoje: Date }

export function htmlProposta(d: DadosProposta): string {
  const { cliente: c, pacote: p, empresa: e, raioX: r } = d
  const validade = new Date(d.hoje.getTime() + 7 * 86_400_000)
  const entendemos = r ? [...r.elogios.slice(0, 2).map((x) => `Os clientes elogiam: ${x}`), ...r.reclamacoes.slice(0, 2).map((x) => `O site pode resolver: ${x}`)] : []
  return pagina(`Proposta · ${c.nome}`, `
<div class="capa"><div class="marca">${esc(e.nome)} · sites para lojas</div><h1>Proposta para ${esc(c.nome)}</h1><p>${esc(dataLonga(d.hoje))}${c.contato.responsavel ? ` · aos cuidados de ${esc(c.contato.responsavel)}` : ''}</p></div>
${r?.resumo ? `<h2>O que entendemos da sua loja</h2><p>${esc(r.resumo)}</p>${entendemos.length ? `<ul>${entendemos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}` : ''}
<h2>O que vamos fazer: ${esc(p.nome)}</h2>
<p>${esc(p.inclui)}</p>
${r?.estrutura.length ? `<div class="caixa"><b>Como o site vai ser:</b><ol>${r.estrutura.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
<p>Todo site sai pronto para o celular, abre rápido até no 4G, tem botão de WhatsApp com a mensagem pronta, mapa e horário, e aparece no Google.</p>
${d.previa ? `<p><b>Veja a prévia:</b> ${esc(d.previa)}</p>` : ''}
<h2>Investimento</h2>
<p class="preco">${reais(d.valor)}</p>
<p>${d.regras.entrada}% para começar (${reais(Math.round(d.valor * d.regras.entrada) / 100)}) e o restante na entrega, por Pix ou transferência. Inclui ${d.regras.rodadas} rodadas de ajustes.</p>
${d.mensalidade ? `<div class="caixa"><b>Manutenção mensal (opcional): ${reais(d.mensalidade)} por mês.</b> Ajustes pequenos, troca de produtos e preços, backup, suporte e um relatório todo mês com quantas pessoas viram o site.</div>` : ''}
<p>Domínio (o endereço do site, cerca de R$ 40 por ano no .com.br)${p.id === 'loja' ? ' e a mensalidade da plataforma da loja' : ''} ficam no nome da sua loja e são pagos direto por você.</p>
<h2>Prazo</h2>
<p>Entrega até <b>${esc(dataLonga(d.prazo))}</b>, contando a partir do recebimento do material (logo, fotos, textos e preços dos produtos).</p>
<h2>Próximos passos</h2>
<ol><li>Você aprova a proposta.</li><li>Assinamos o contrato e é feito o pagamento da entrada.</li><li>Você manda o material e eu começo.</li></ol>
<p class="pe">Proposta válida até ${esc(dataLonga(validade))}. ${esc(e.responsavel)}${e.whatsapp ? ` · WhatsApp ${esc(e.whatsapp)}` : ''}${e.email ? ` · ${esc(e.email)}` : ''}${e.site ? ` · ${esc(e.site)}` : ''}</p>`)
}

export function htmlContrato(d: DadosProposta): string {
  const { cliente: c, pacote: p, empresa: e, regras: g } = d
  const vazio = '____________________'
  const entrada = Math.round(d.valor * g.entrada) / 100
  return pagina(`Contrato · ${c.nome}`, `
<div class="capa"><div class="marca">${esc(e.nome)}</div><h1>Contrato de criação de site</h1><p>${esc(c.nome)}</p></div>
<h2>As partes</h2>
<p><b>CONTRATADO:</b> ${esc(e.responsavel)}${e.nome && e.nome !== e.responsavel ? ` (${esc(e.nome)})` : ''}, ${e.documento ? `CPF/CNPJ ${esc(e.documento)}` : `CPF/CNPJ ${vazio}`}, ${esc(e.cidade || vazio)}.</p>
<p><b>CONTRATANTE:</b> ${esc(c.nome)}, ${c.contato.documento ? `CNPJ/CPF ${esc(c.contato.documento)}` : `CNPJ/CPF ${vazio}`}, ${esc(c.contato.endereco || vazio)}${c.contato.responsavel ? `, representada por ${esc(c.contato.responsavel)}` : ''}.</p>
<h2>Cláusulas</h2>
<ol>
<li><b>Objeto.</b> Criação do site "${esc(p.nome)}" para a CONTRATANTE: ${esc(p.inclui)}</li>
<li><b>Prazo.</b> Entrega até ${esc(dataLonga(d.prazo))}. O prazo começa a contar quando a CONTRATANTE entregar todo o material (logo, fotos, textos e preços). Atraso no material adia a entrega pelo mesmo tempo.</li>
<li><b>Ajustes.</b> Estão incluídas ${g.rodadas} rodadas de ajustes depois da primeira versão. Mudanças fora do que está descrito no objeto são orçadas à parte.</li>
<li><b>Valor e pagamento.</b> Valor total de ${reais(d.valor)}: ${g.entrada}% (${reais(entrada)}) na assinatura deste contrato e o restante (${reais(Math.round((d.valor - entrada) * 100) / 100)}) na entrega, por Pix${e.pix ? ` (chave ${esc(e.pix)})` : ''} ou transferência.</li>
<li><b>Custos de terceiros.</b> Domínio, hospedagem${p.id === 'loja' ? ', mensalidade da plataforma da loja, taxas de pagamento' : ''} e ferramentas pagas ficam em nome da CONTRATANTE e são pagos por ela.</li>
<li><b>Conteúdo.</b> A CONTRATANTE garante que tem direito de uso das fotos, logos e textos que fornecer.</li>
<li><b>Propriedade.</b> Com o pagamento completo, o site e o domínio passam a ser da CONTRATANTE. O CONTRATADO pode mostrar o trabalho no próprio portfólio e manter um crédito discreto no rodapé, que é retirado se a CONTRATANTE pedir.</li>
${d.mensalidade ? `<li><b>Manutenção (opcional).</b> Se contratada, ${reais(d.mensalidade)} por mês, com ajustes pequenos, troca de produtos e preços, backup, suporte e relatório mensal. Pode ser cancelada por qualquer parte com 30 dias de aviso.</li>` : ''}
<li><b>Cancelamento.</b> Se a CONTRATANTE desistir depois do início, a entrada não é devolvida. Se o CONTRATADO não entregar no prazo combinado (descontados os atrasos de material), devolve a entrada.</li>
<li><b>Foro.</b> Fica eleito o foro da comarca de ${esc(e.cidade || vazio)} para resolver qualquer questão deste contrato.</li>
</ol>
<p>${esc(e.cidade || vazio)}, ${esc(dataLonga(d.hoje))}.</p>
<div class="assinaturas"><div>${esc(e.responsavel)}<br>CONTRATADO</div><div>${esc(c.contato.responsavel || c.nome)}<br>CONTRATANTE</div></div>`)
}
