# FRIDAY no mundo real: peças para imprimir

Dois projetos, desenho próprio da FRIDAY (nada copiado de filme), já com os encaixes da eletrônica.
Não precisa soldar nada: tudo liga com fios de encaixe (dupont) e conectores de alavanca.

| Pasta | O que é | Peças | Filamento (aprox.) |
|---|---|---|---|
| `nucleo/` | **Núcleo**: luminária de mesa (ou de peito) com um anel de LED atrás de um difusor gravado com a fita da FRIDAY | 3 (mesa) ou 3 (peito) | 90 g |
| `capacete/` | **Capacete**: casco liso com crista, viseira que levanta com um micro servo, barra de luz na testa e casulos sextavados nas laterais | 10 | 700 g |

Os arquivos `.stl` abrem em qualquer fatiador (Cura, PrusaSlicer, Bambu Studio, OrcaSlicer) e já vêm
na posição certa para imprimir. Tudo cabe numa impressora comum de **220 × 220 × 250 mm** (tipo Ender 3).
Para ver antes, os dois também estão na FRIDAY: "projeta o capacete" ou "projeta o núcleo de mesa"
(na mesa holográfica do PC e na oficina do celular).

Para gerar de novo (depois de mudar alguma medida): `npm run hardware` (ou `npm run hardware -- capacete`).
As medidas ficam no topo de `nucleo.mjs` e `capacete.mjs`.

> **Aviso:** o capacete é peça de cosplay. Não protege a cabeça e a visão pela viseira é limitada:
> não use para andar de moto, bicicleta ou dirigir.

---

## Núcleo

### Peças

| Arquivo | Material | Dica |
|---|---|---|
| `nucleo-mesa-carcaca.stl` | PLA ou PETG escuro | sem suporte |
| `nucleo-difusor.stl` | PLA ou PETG **branco translúcido** ("natural") | 100% de preenchimento; a gravação fica virada para os LEDs |
| `nucleo-aro.stl` | PLA prata ou cinza | já vem de cabeça para baixo; sem suporte |
| `nucleo-peito-carcaca.stl` | PLA ou PETG escuro | versão fina para o peito; suporte só tocando a mesa (nos passadores) |

Camada de 0,2 mm, 3 paredes, 15% de preenchimento.

### O que comprar (sem solda)

- **ESP32 DevKit** (38 pinos) **já com os pinos soldados**. O ESP32-C3 SuperMini também cabe no berço.
- **Anel WS2812B de 16 LEDs** (68 mm por fora). Peça **com os fios já soldados** e ponta dupont
  (muitas lojas vendem assim; se não, a loja ou um amigo solda os 3 fios em 5 minutos).
- 3 fios **dupont fêmea-fêmea**.
- Cabo USB **de dados** (o que vem com celular serve) e um carregador de 5 V 1 A.
- Para usar no peito: um power bank pequeno e um elástico de 25 mm.

### Ligação

| Anel | Placa |
|---|---|
| 5V (ou VCC) | VIN (5V) |
| GND | GND |
| DIN (entrada de dados) | GPIO 16 |

### Montagem

1. Encaixe a placa no berço do fundo, com o USB para o lado da saída.
2. Apoie o anel de LED no ressalto (LEDs para cima) e passe os fios por dentro.
3. Encaixe o difusor no rebaixo de cima, com a gravação virada para baixo (para os LEDs).
4. Vista o aro por cima: ele segura o difusor.

### Programa (sem programar)

1. No Chrome do PC, abra **install.wled.me**, ligue a placa no USB e clique em instalar.
2. Coloque o Wi-Fi da sua casa. Depois, no app WLED (celular) ou no navegador:
   Config → LED Preferences → pino **16**, **16** LEDs. Deixe o limite de corrente ligado (850 mA).

A ligação com a FRIDAY (ela acender, pulsar quando fala, mudar de cor com o humor) é a próxima etapa.

---

## Capacete

Feito para cabeça adulta de até uns 60 cm de volta, com espuma por dentro.

### Peças

| Arquivo | Material | Dica |
|---|---|---|
| `capacete-1-frente-cima.stl` | PLA/PETG (cor do casco) | suporte em árvore |
| `capacete-2-frente-baixo.stl` | PLA/PETG (cor do casco) | queixo com a grade da boca |
| `capacete-3-tras-cima.stl` | PLA/PETG (cor do casco) | suporte em árvore |
| `capacete-4-tras-baixo.stl` | PLA/PETG (cor do casco) | nuca |
| `capacete-5-viseira.stl` | PLA/PETG prata ou cor do casco | suporte em árvore |
| `capacete-6-barra-de-luz.stl` | PLA/PETG **branco translúcido** | 100% de preenchimento |
| `capacete-7-casulo-servo.stl` | PLA prata | lado direito |
| `capacete-8-casulo-placa.stl` | PLA prata | lado esquerdo |
| `capacete-9-tampa-servo.stl` | PLA prata | |
| `capacete-10-tampa-placa.stl` | PLA prata | tem o furo do USB-C |

Camada de 0,2 mm, 3 paredes, 10 a 15% de preenchimento, brim nas peças grandes.

### O que comprar (sem solda)

- **ESP32-C3 SuperMini já com os pinos soldados**.
- **Micro servo SG90** (vem com os braços e os parafusinhos).
- **Fita de LED WS2812B** 60 LEDs/m: corte **7 LEDs** a partir da ponta que já vem com o conector
  (assim os fios já estão soldados).
- Fios dupont (fêmea-fêmea e macho-fêmea) e **2 conectores de alavanca** pequenos (tipo WAGO 221) para dividir o 5V e o GND.
- Cabo USB-C e um power bank (de bolso).
- **Película fumê flexível** de até 1 mm (acetato/PETG de viseira) para a janela dos olhos.
- Espuma EVA de 5 a 10 mm para forrar por dentro, e cola epóxi (ou cola instantânea com bicarbonato nas emendas).

### Ligação

| Peça | Fio | Vai para |
|---|---|---|
| Servo (marrom, vermelho, laranja) | GND / 5V / sinal | GND / 5V / **GPIO 3** |
| Fita de LED | GND / 5V / DIN | GND / 5V / **GPIO 4** |
| ESP32-C3 | 5V e GND | nos conectores de alavanca, junto com os do servo e da fita |

O power bank alimenta tudo pelo USB-C do casulo esquerdo.

### Montagem

1. **Casco:** cole as duas de baixo nas de cima (a tira de dentro da de baixo entra na de cima) e depois a
   frente na de trás (a tira da frente entra atrás). As emendas caem nos frisos, então quase não aparecem.
2. **Barra de luz:** encaixe por dentro na fenda da testa e cole pela aba. Cole a fita de 7 LEDs atrás da aba,
   com os LEDs virados para a barra.
3. **Película:** recorte no contorno do rebaixo de dentro da viseira e cole.
4. **Lado esquerdo:** cole o casulo da placa no casco (a parte de baixo dele tem o formato do casco), com o furo
   dos fios alinhado. Deslize a plaquinha nos trilhos, com o USB-C para fora.
5. **Viseira:** parafuse o braço do servo (o de uma ponta só) no encaixe do cubo direito da viseira.
   Encaixe o cubo esquerdo no eixo do casulo da placa.
6. **Lado direito:** ponha o servo no casulo dele (o eixo para dentro), parafuse pelas abas, encaixe o braço
   no eixo do servo e aperte o parafuso do meio pelo furo do cubo. Com a viseira fechada, cole o casulo no casco.
7. Passe os fios pelos furos para dentro do capacete, junte nos conectores, ligue na placa e feche as tampas.
8. Forre por dentro com a espuma.

A viseira abre até uns 65°. Não force com a mão com o servo ligado.

### Programa

O capacete precisa mexer no servo além das luzes, então ele leva uma configuração própria. Essa parte
(e a FRIDAY abrindo a viseira e acendendo a luz por voz) fica pronta junto com a etapa da eletrônica.
