// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O que o Vite acrescenta ao "import.meta" e às importações (só os tipos que o app usa).
interface ImportMeta {
  glob(padrao: string, opcoes?: { query?: string; import?: string; eager?: boolean }): Record<string, unknown>
}
