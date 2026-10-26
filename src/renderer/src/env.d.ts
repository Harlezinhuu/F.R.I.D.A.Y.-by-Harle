// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Importar um arquivo com "?url" devolve o endereço dele (o Vite copia o arquivo para o build).
declare module '*?url' {
  const url: string
  export default url
}
