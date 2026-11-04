# Base de design para sites de lojas (F.R.I.D.A.Y by Harle)

Todo site de loja segue esta base. O site impressiona quem compra (o dono da loja) e vende para quem visita (o cliente da loja). Regra de ouro: o "uau" nunca atrapalha a venda.

## O que faz alguém comprar
- A beleza é julgada em 50 ms e vira confiança: topo forte, foto real, contraste alto, pouca coisa e bem alinhada.
- Cada segundo a mais de carregamento aumenta em 32% a chance de sair: velocidade é requisito.
- Custos escondidos, falta de confiança e cadastro obrigatório derrubam compras: frete, prazo e pagamento visíveis cedo; nada de cadastro.
- No Brasil, o caminho mais curto é ver o produto e falar no WhatsApp: botão fixo com a mensagem pronta.

## Estrutura da página (de cima para baixo)
1. Topo: nome da loja enorme, frase do que vende e para quem, foto ou vídeo curto real, botões "Pedir pelo WhatsApp" (principal) e "Ver produtos". Tudo visível sem rolar no celular.
2. Prova rápida: nota no Google com nº de avaliações, anos de loja, bairro (uma linha).
3. Produtos em destaque: 4 a 8 cartões, foto quadrada, nome e preço.
4. Categorias: blocos com foto (bento grid).
5. Diferencial: 3 motivos curtos com ícone.
6. Como comprar: 3 passos; frete, prazo e formas de pagamento.
7. Depoimentos reais do Google (nunca inventados).
8. Galeria ou Instagram.
9. Onde estamos: mapa, endereço, "aberto agora até 19h", telefone que liga com um toque.
10. Rodapé: redes, CNPJ, política de troca e "site por Harle" com link.
Botão do WhatsApp fixo no canto, abrindo https://wa.me/<número>?text=<mensagem pronta>.

## Visual
- Duas fontes do Google Fonts: título com personalidade + texto legível (Bricolage Grotesque + Inter; Fraunces + DM Sans; Syne + Manrope; Playfair Display + Lato).
- Texto ≥ 16 px no celular, linhas de 45–75 caracteres; título do topo 40–56 px no celular, 72–120 px no computador.
- Contraste ≥ 4,5:1 (texto normal) e ≥ 3:1 (texto grande).
- Cores 60-30-10: fundo neutro, cor da marca, destaque só nos botões de ação.
- Fotos reais; produtos em foto quadrada, mesmo fundo e luz; WebP/AVIF, tamanhos responsivos, lazy loading (menos a do topo).
- Movimento: 100–400 ms (entradas ~300 ms, toque ~100 ms), só transform/opacity, animar só o que guia o olho, tudo parado com prefers-reduced-motion.
- Um efeito-assinatura que tenha a ver com a loja (farinha caindo na padaria, açaí escorrendo, patinha que segue o dedo).
- Evitar: rolagem infinita, parallax pesado, texto dentro de imagem, mundo 3D inteiro.

## Metas obrigatórias (no celular)
LCP ≤ 2,5 s · INP ≤ 200 ms · CLS ≤ 0,1 · PageSpeed ≥ 90 · área de toque ≥ 48 px.
Site estático (HTML, CSS e pouco JavaScript), foto do topo ≤ 150 KB, fontes só com os pesos usados, 3D e vídeo só depois do resto carregar.

## Nível de "uau" por pacote
- Vitrine (1 página): foto grande e título animado, entradas simples, sem efeito-assinatura, 4–8 produtos, mapa e horário.
- Site da loja (até 5 páginas): vídeo curto ou foto com movimento suave, entradas coreografadas e microinterações, um efeito-assinatura no topo, catálogo com categorias e pedido pelo WhatsApp, depoimentos, Instagram, 404 criativa.
- Loja virtual (Nuvemshop/Shopify): tudo do anterior, produto em 3D girando ou vídeo no topo, carrinho, Pix e cartão, frete calculado, compra sem cadastro.

## Checklist antes de entregar
- Nome, o que vende e o WhatsApp aparecem sem rolar no celular; o WhatsApp abre com a mensagem pronta no número certo.
- Preço, frete, prazo e pagamento visíveis; endereço, mapa, horário e telefone com um toque; avaliações reais.
- PageSpeed ≥ 90 no celular; testado em celular de verdade, em 4G; botões ≥ 48 px; nada sai da tela para o lado.
- Contraste ok; fotos com descrição em WebP/AVIF; animações param com "reduzir movimento".
- Título e descrição para o Google, imagem de prévia para o WhatsApp, favicon, 404 e "site por Harle".
