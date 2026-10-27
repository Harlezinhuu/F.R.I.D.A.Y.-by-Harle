// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Markdown simples e seguro para as respostas do chat: o texto é escapado antes de tudo,
// então nada que venha da IA vira HTML de verdade. Links só com https.

const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function emLinha(s: string): string {
  return s
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)"]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

/** Converte o markdown da resposta em HTML seguro. */
export function markdown(texto: string): string {
  const linhas = escapar(texto.replace(/\r/g, '')).split('\n')
  const out: string[] = []
  let lista: 'ul' | 'ol' | null = null
  let codigo: string[] | null = null
  const fecharLista = () => { if (lista) { out.push(`</${lista}>`); lista = null } }
  for (const l of linhas) {
    if (/^```/.test(l)) {
      if (codigo) { out.push(`<pre><code>${codigo.join('\n')}</code></pre>`); codigo = null } else { fecharLista(); codigo = [] }
      continue
    }
    if (codigo) { codigo.push(l); continue }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(l)
    const item = /^\s*[-*•]\s+(.*)$/.exec(l)
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(l)
    if (titulo) { fecharLista(); out.push(`<h${titulo[1].length + 2}>${emLinha(titulo[2])}</h${titulo[1].length + 2}>`) }
    else if (item || numero) {
      const tipo = item ? 'ul' : 'ol'
      if (lista !== tipo) { fecharLista(); out.push(`<${tipo}>`); lista = tipo }
      out.push(`<li>${emLinha((item ?? numero)![1])}</li>`)
    } else if (!l.trim()) fecharLista()
    else { fecharLista(); out.push(`<p>${emLinha(l)}</p>`) }
  }
  if (codigo) out.push(`<pre><code>${codigo.join('\n')}</code></pre>`)
  fecharLista()
  return out.join('')
}
