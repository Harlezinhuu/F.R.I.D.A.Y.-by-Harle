// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Planilha do Excel (.xlsx) feita na mão, sem biblioteca: um zip (sem compressão) com o XML das
// abas. Abre no Excel, no Google Planilhas e no LibreOffice. Tem cabeçalho em negrito congelado,
// filtro, largura das colunas, formatos de real, data e porcentagem, e fórmulas (SOMA, SOMASE...).

export type Formato = '' | 'moeda' | 'data' | 'pct' | 'inteiro'
/** Uma célula: texto, número, data, fórmula ({ f: 'SUM(B2:B9)' }, em inglês, como o Excel guarda) ou vazia. */
export type Celula = string | number | boolean | Date | { f: string } | null | undefined

export interface Aba {
  nome: string
  linhas: Celula[][]
  /** Largura de cada coluna (em caracteres); sem isso, calcula pelo conteúdo */
  larguras?: number[]
  /** Formato de cada coluna */
  formatos?: Formato[]
  /** A primeira linha é cabeçalho (negrito, fundo, congelada, com filtro). Padrão: sim */
  cabecalho?: boolean
  /** Linhas (índice a partir de 0) em negrito, como a de total */
  destaque?: number[]
}

// ---------- Zip (só "store") ----------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABELA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipar(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let pos = 0
  // Data fixa (1/1/2026) para o mesmo conteúdo dar o mesmo arquivo
  const hora = 0, dia = ((2026 - 1980) << 9) | (1 << 5) | 1
  for (const a of arquivos) {
    const nome = enc.encode(a.nome)
    const crc = crc32(a.dados)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, hora, true); local.setUint16(12, dia, true); local.setUint32(14, crc, true)
    local.setUint32(18, a.dados.length, true); local.setUint32(22, a.dados.length, true); local.setUint16(26, nome.length, true); local.setUint16(28, 0, true)
    partes.push(new Uint8Array(local.buffer), nome, a.dados)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true)
    c.setUint16(12, hora, true); c.setUint16(14, dia, true); c.setUint32(16, crc, true); c.setUint32(20, a.dados.length, true); c.setUint32(24, a.dados.length, true)
    c.setUint16(28, nome.length, true); c.setUint32(42, pos, true)
    central.push(new Uint8Array(c.buffer), nome)
    pos += 30 + nome.length + a.dados.length
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true)
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true)
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)]
  const out = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of tudo) { out.set(p, o); o += p.length }
  return out
}

// ---------- Planilha ----------

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

/** Coluna 0 → "A", 26 → "AA". */
export function letraDaColuna(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Data → número de série do Excel (dias desde 30/12/1899), no fuso local. */
export const serialDaData = (d: Date): number => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000

/** Nome de aba válido e único (até 31 letras, sem []:*?/\). */
function nomesDasAbas(abas: Aba[]): string[] {
  const usados = new Set<string>()
  return abas.map((a, i) => {
    const base = (a.nome.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || `Aba ${i + 1}`).slice(0, 31)
    let n = base, k = 2
    while (usados.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${k++}`
    usados.add(n.toLowerCase())
    return n
  })
}

// Estilos: 0 normal, 1 cabeçalho, 2 moeda, 3 data, 4 pct, 5 inteiro, e as mesmas em negrito (6..9)
const ESTILO: Record<Formato, number> = { '': 0, moeda: 2, data: 3, pct: 4, inteiro: 5 }
const NEGRITO: Record<Formato, number> = { '': 6, moeda: 7, data: 8, pct: 9, inteiro: 10 }

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;[Red]\\-&quot;R$&quot;\\ #,##0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF8899AA"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="14" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="9" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="1" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function largura(c: Celula, f: Formato): number {
  if (c === null || c === undefined) return 0
  if (c instanceof Date) return 10
  if (typeof c === 'object') return f === 'moeda' ? 14 : 10
  if (typeof c === 'number') return f === 'moeda' ? String(Math.round(c)).length + 8 : String(c).length + 1
  return String(c).length
}

function xmlDaAba(a: Aba): string {
  const cab = a.cabecalho !== false
  const destaque = new Set(a.destaque ?? [])
  const nCols = Math.max(1, ...a.linhas.map((l) => l.length))
  const fmt = (j: number): Formato => a.formatos?.[j] ?? ''
  const larg = Array.from({ length: nCols }, (_, j) =>
    Math.min(60, Math.max(8, a.larguras?.[j] ?? Math.max(...a.linhas.map((l, i) => largura(l[j], i === 0 && cab ? '' : fmt(j)) + (i === 0 && cab ? 3 : 1))))))
  const linhas = a.linhas.map((l, i) => {
    const cels = l.map((c, j) => {
      if (c === null || c === undefined || c === '') return ''
      const ref = `${letraDaColuna(j)}${i + 1}`
      const s = i === 0 && cab ? 1 : (destaque.has(i) ? NEGRITO : ESTILO)[fmt(j)]
      const st = s ? ` s="${s}"` : ''
      if (c instanceof Date) return `<c r="${ref}" s="${destaque.has(i) ? NEGRITO.data : ESTILO.data}"><v>${serialDaData(c)}</v></c>`
      if (typeof c === 'object') return `<c r="${ref}"${st}><f>${esc(c.f.replace(/^=/, ''))}</f></c>`
      if (typeof c === 'number') return Number.isFinite(c) ? `<c r="${ref}"${st}><v>${c}</v></c>` : ''
      if (typeof c === 'boolean') return `<c r="${ref}" t="b"${st}><v>${c ? 1 : 0}</v></c>`
      return `<c r="${ref}" t="inlineStr"${i === 0 && cab ? ' s="1"' : destaque.has(i) ? ' s="6"' : ''}><is><t xml:space="preserve">${esc(c)}</t></is></c>`
    }).join('')
    return `<row r="${i + 1}">${cels}</row>`
  }).join('')
  const ultima = `${letraDaColuna(nCols - 1)}${Math.max(1, a.linhas.length)}`
  const congelar = cab && a.linhas.length > 1
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const filtro = cab && a.linhas.length > 1 ? `<autoFilter ref="A1:${letraDaColuna(nCols - 1)}${a.linhas.length - (a.destaque?.length ? a.destaque.length : 0)}"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${ultima}"/>${congelar}<sheetFormatPr defaultRowHeight="15"/><cols>${larg.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${linhas}</sheetData>${filtro}</worksheet>`
}

/** Monta o arquivo .xlsx com as abas. */
export function planilhaXlsx(abas: Aba[]): Uint8Array {
  if (!abas.length) abas = [{ nome: 'Planilha', linhas: [] }]
  const enc = new TextEncoder()
  const nomes = nomesDasAbas(abas)
  const arq = (nome: string, texto: string) => ({ nome, dados: enc.encode(texto) })
  const temFiltro = abas.map((a) => a.cabecalho !== false && a.linhas.length > 1)
  return zipar([
    arq('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    arq('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    arq('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${temFiltro.some(Boolean) ? `<definedNames>${abas.map((a, i) => temFiltro[i] ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(nomes[i].replace(/'/g, "''"))}'!$A$1:$${letraDaColuna(Math.max(1, ...a.linhas.map((l) => l.length)) - 1)}$${a.linhas.length - (a.destaque?.length ?? 0)}</definedName>` : '').join('')}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    arq('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    arq('xl/styles.xml', ESTILOS),
    ...abas.map((a, i) => arq(`xl/worksheets/sheet${i + 1}.xml`, xmlDaAba(a)))
  ])
}

/** Adivinha o formato da coluna pelo nome do cabeçalho e pelos valores. */
export function formatoDaColuna(titulo: string, valores: Celula[]): Formato {
  const t = titulo.toLowerCase()
  if (/valor|pre[cç]o|total|r\$|custo|gasto|receita|saldo|pago|entrada|sa[ií]da|mensal|limite/.test(t) && valores.some((v) => typeof v === 'number')) return 'moeda'
  if (/%|porcent|percent/.test(t)) return 'pct'
  if (valores.length && valores.every((v) => v === null || v === undefined || v === '' || v instanceof Date)) return valores.some((v) => v instanceof Date) ? 'data' : ''
  return ''
}

/** Texto vindo da IA → célula: "R$ 1.200,50" e "12,5" viram número, "2026-11-04"/"04/11/2026" viram data, "=SOMA(...)" vira fórmula. */
export function celulaDoTexto(v: unknown): Celula {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'boolean') return v
  const s = String(v).trim()
  if (!s) return null
  if (s.startsWith('=')) return { f: traduzirFormula(s.slice(1)) }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  if (/^-?(R\$\s*)?\d{1,3}(\.\d{3})*(,\d+)?$|^-?(R\$\s*)?\d+(,\d+)?$|^-?\d+\.\d+$/.test(s)) {
    const neg = s.startsWith('-')
    let t = s.replace(/^-/, '').replace(/R\$\s*/, '')
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
    const n = Number(t)
    if (Number.isFinite(n)) return neg ? -n : n
  }
  if (/^-?\d+(,\d+)?%$/.test(s)) return Number(s.replace('%', '').replace(',', '.')) / 100
  return s
}

/** Fórmula em português ("SOMA(B2:B9;C2)") → como o Excel guarda ("SUM(B2:B9,C2)"). */
export function traduzirFormula(f: string): string {
  const nomes: Record<string, string> = { SOMA: 'SUM', 'MÉDIA': 'AVERAGE', MEDIA: 'AVERAGE', SE: 'IF', SOMASE: 'SUMIF', 'SOMASES': 'SUMIFS', 'CONT.SE': 'COUNTIF', 'CONT.SES': 'COUNTIFS', 'CONT.VALORES': 'COUNTA', CONT: 'COUNT', 'MÁXIMO': 'MAX', MAXIMO: 'MAX', 'MÍNIMO': 'MIN', MINIMO: 'MIN', ARRED: 'ROUND', PROCV: 'VLOOKUP', HOJE: 'TODAY', AGORA: 'NOW', E: 'AND', OU: 'OR' }
  // No jeito brasileiro (com ";"), a vírgula é a casa decimal: 0,1 → 0.1
  const brasileiro = f.includes(';')
  let dentroDeTexto = false, out = ''
  for (let i = 0; i < f.length; i++) {
    const ch = f[i]
    if (ch === '"') dentroDeTexto = !dentroDeTexto
    if (!dentroDeTexto && brasileiro && ch === ',' && /\d/.test(f[i - 1] ?? '') && /\d/.test(f[i + 1] ?? '')) out += '.'
    else out += !dentroDeTexto && ch === ';' ? ',' : ch
  }
  return out.replace(/([A-ZÀ-Ú][A-ZÀ-Ú.]*)\s*\(/g, (m, n: string) => (nomes[n] ? `${nomes[n]}(` : m))
}
