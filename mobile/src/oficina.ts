// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Oficina de hologramas no celular: a câmera de trás mostra o quarto, o holograma aparece na sua frente
// e a mão livre mexe nele, como o Tony com a maquete. Apontar seleciona a peça, a pinça pega e arrasta,
// a mão fechada gira, um tapa joga a peça fora. Pelos botões ou pela voz: duplicar, aumentar, pintar,
// desfazer, refazer e salvar como versão nova (fica no celular e, pareado, vai para o PC).
// O holograma fica parado no quarto quando você vira o celular (giroscópio). Tudo roda no celular:
// a imagem da câmera não sai daqui.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { partesDeObjeto } from '../../src/renderer/src/projetor/malha'
import type { Parte } from '../../src/renderer/src/projetor/tipos'
import { GestosOficina, type EventoOficina } from '../../src/renderer/src/gestos/oficina.ts'
import { pose, type Ponto } from '../../src/renderer/src/gestos/gestos.ts'
import { CORES, EditorHolograma, aplicarMatriz, matrizDaPeca, type Vec3 } from '../../src/shared/edicao.ts'
import { escreverGlb } from '../../src/shared/glb.ts'
import listaOriginais from '../../resources/designs/designs.json'
import { pareado, pedirPC } from './elo'
import { apagarSalvo, lerSalvo, listarSalvos, salvarDesign } from './designs-salvos'
import { Mesa } from '../../src/renderer/src/mesa/mesa'
import type { CartaoMesa, Predio } from '../../src/shared/mesa'

/** A mesa do PC tem 10 unidades de largura; no celular ela vira uns 45 cm em cima do seu móvel */
const ESCALA_MESA = 0.045

// Os designs originais vão dentro do app
const ARQUIVOS = import.meta.glob('../../resources/designs/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const urlOriginal = (arquivo: string): string | null => Object.entries(ARQUIVOS).find(([k]) => k.endsWith(`/${arquivo}`))?.[1] ?? null

export interface ItemCatalogo { nome: string; apelidos: string[]; origem: 'original' | 'salvo'; arquivo: string }

export async function catalogo(): Promise<ItemCatalogo[]> {
  const originais = (listaOriginais as { arquivo: string; nome: string; apelidos: string[] }[]).map((d) => ({ nome: d.nome, apelidos: d.apelidos, origem: 'original' as const, arquivo: d.arquivo }))
  const salvos = (await listarSalvos().catch(() => [])).map((s) => ({ nome: s.nome, apelidos: [], origem: 'salvo' as const, arquivo: s.nome }))
  return [...salvos, ...originais]
}

const sem = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim()
export function acharNoCatalogo(nome: string, lista: ItemCatalogo[]): ItemCatalogo | null {
  const a = sem(nome)
  if (!a) return null
  return lista.find((d) => sem(d.nome) === a || d.apelidos.some((x) => sem(x) === a)) ??
    lista.find((d) => sem(d.nome).includes(a) || a.includes(sem(d.nome)) || d.apelidos.some((x) => a.includes(sem(x)))) ?? null
}

// ---------- Mãos ----------

const MODELO_MAOS_ONLINE = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
let detector: HandLandmarker | null = null

async function prepararMaos(): Promise<HandLandmarker> {
  if (detector) return detector
  const arquivos = await FilesetResolver.forVisionTasks(new URL('maos/wasm', location.href).href)
  // O modelo vem dentro do app; se o build não conseguiu baixar, vem da internet (uma vez)
  let modelo: Uint8Array
  try {
    const r = await fetch(new URL('maos/hand_landmarker.task', location.href).href)
    if (!r.ok) throw new Error(String(r.status))
    modelo = new Uint8Array(await r.arrayBuffer())
  } catch {
    const cache = await caches.open('friday-maos').catch(() => null)
    let r = await cache?.match(MODELO_MAOS_ONLINE)
    if (!r) { r = await fetch(MODELO_MAOS_ONLINE); if (r.ok) await cache?.put(MODELO_MAOS_ONLINE, r.clone()) }
    if (!r.ok) throw new Error('Não consegui o modelo das mãos (sem internet?).')
    modelo = new Uint8Array(await r.arrayBuffer())
  }
  const opcoes = (delegate: 'GPU' | 'CPU') => ({ baseOptions: { modelAssetBuffer: modelo, delegate }, runningMode: 'VIDEO' as const, numHands: 1, minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.5 })
  try { detector = await HandLandmarker.createFromOptions(arquivos, opcoes('GPU')) } catch { detector = await HandLandmarker.createFromOptions(arquivos, opcoes('CPU')) }
  return detector
}

// ---------- Visual do holograma ----------

const PONTOS_VERT = /* glsl */ `
  uniform float uTam, uPixel;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uTam * uPixel / -mv.z; gl_Position = projectionMatrix * mv; }`
const PONTOS_FRAG = /* glsl */ `
  uniform vec3 uCor; uniform float uOpac;
  void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(uCor, (1.0 - d * 2.0) * uOpac); }`
// Casca: transparente de frente e acesa nas bordas (fresnel), o que dá o volume do holograma
const CASCA_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`
const CASCA_FRAG = /* glsl */ `
  uniform vec3 uCor; uniform float uOpac, uTempo;
  varying vec3 vN; varying vec3 vV;
  void main(){
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    float faixa = .85 + .15 * sin(gl_FragCoord.y * .35 - uTempo * 6.0);
    gl_FragColor = vec4(uCor * (0.55 + f), (0.07 + f * 0.6) * uOpac * faixa);
  }`

const LARANJA = new THREE.Color('#FFB547')
const CIANO = new THREE.Color('#5FE1F2')

interface Geometria { centro: THREE.Vector3; pontos: THREE.BufferGeometry; arestas: THREE.BufferGeometry; casca: THREE.BufferGeometry; tri: Float32Array; cor: THREE.Color; brilho: boolean; caixa: THREE.Box3 }
interface Instancia { pivo: THREE.Group; interno: THREE.Group; mats: { pontos: THREE.ShaderMaterial; linhas: THREE.LineBasicMaterial; casca: THREE.ShaderMaterial }; saindo: number; direcaoSaida: THREE.Vector3 }

/** Quaternion do celular a partir da orientação (o mesmo cálculo do DeviceOrientationControls do three.js). */
function quaternionDoCelular(q: THREE.Quaternion, alfa: number, beta: number, gama: number, tela: number): void {
  const e = new THREE.Euler(beta, alfa, -gama, 'YXZ')
  q.setFromEuler(e)
  q.multiply(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)))
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tela))
}

export interface OpcoesOficina { avisar(texto: string): void; vibrar(): void; aoFechar(): void; estado?(): string }

type ModoMesa = 'fora' | 'cartoes' | 'design' | 'predio'

export class Oficina {
  private raiz: HTMLElement
  private video: HTMLVideoElement
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private cena = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(62, 1, 0.02, 20)
  private ancora = new THREE.Group()
  private modelo = new THREE.Group()
  private escalaBase = 1
  private tamanhoModelo = 1
  private geos: Geometria[] = []
  private instancias: Instancia[] = []
  private editor: EditorHolograma | null = null
  private gestos = new GestosOficina()
  private camStream: MediaStream | null = null
  private raf = 0
  private ultimoQuadroVideo = -1
  private orientacao: { a: number; b: number; g: number } | null = null
  private posicionou = false
  private cursor: { x: number; y: number; desde: number; peca: number } | null = null
  private arrastando: 'peca' | 'modelo' | null = null
  private ultimoArrasto: { x: number; y: number } | null = null
  private girandoAte = 0
  private explodido = 0
  private alvoExplodido = 0
  private uniPontos = { uTam: { value: 1.1 }, uPixel: { value: 1 } }
  private tempo = { value: 0 }
  private relogio = new THREE.Clock()
  private maosLigadas = false
  private toques = new Map<number, { x: number; y: number }>()
  private toqueInicio: { x: number; y: number; t: number } | null = null
  aberta = false
  nome = ''
  // Mesa holográfica (a mesma do PC, pequena, em cima do seu móvel)
  private mesa: Mesa | null = null
  modoMesa: ModoMesa = 'fora'
  /** Onde o modelo fica em relação à âncora (em cima do emissor, quando está na mesa) */
  private baseModelo = new THREE.Vector3()
  private arrastoToque = { dx: 0, dy: 0 }

  constructor(private o: OpcoesOficina) {
    this.raiz = document.createElement('section')
    this.raiz.className = 'oficina'
    this.raiz.setAttribute('aria-label', 'Oficina de hologramas')
    this.raiz.innerHTML = `
      <video playsinline muted></video>
      <canvas class="of-tela"></canvas>
      <canvas class="of-mao" aria-hidden="true"></canvas>
      <header class="of-topo">
        <div><span class="of-rotulo">OFICINA DE HOLOGRAMAS</span><b class="of-nome">—</b></div>
        <span class="of-chip" data-mao>MÃO: LIGANDO…</span>
        <button type="button" class="vidro icone" data-acao="fechar" aria-label="Fechar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="of-peca" hidden>
        <b class="of-peca-nome"></b>
        <div class="of-botoes">
          <button type="button" data-acao="tirar">Tirar</button><button type="button" data-acao="duplicar">Duplicar</button>
          <button type="button" data-acao="diminuir" aria-label="Diminuir">−</button><button type="button" data-acao="aumentar" aria-label="Aumentar">+</button>
          <button type="button" data-acao="cor">Cor</button><button type="button" data-acao="restaurar">Original</button><button type="button" data-acao="soltar" aria-label="Soltar a peça">✕</button>
        </div>
      </div>
      <p class="of-dica" aria-live="polite">Aponte o dedo para uma peça e segure para selecionar · pinça pega e arrasta · mão fechada gira · tapa joga fora</p>
      <nav class="of-barra">
        <button type="button" data-acao="mesa">Mesa</button><button type="button" data-acao="designs">Designs</button><button type="button" data-acao="explodir">Explodir</button>
        <button type="button" data-acao="desfazer">Desfazer</button><button type="button" data-acao="refazer">Refazer</button>
        <button type="button" data-acao="centralizar">Trazer</button><button type="button" data-acao="salvar">Salvar</button>
      </nav>
      <div class="of-folha" hidden><div class="of-folha-painel"><h2>DESIGNS</h2><ul class="of-lista"></ul><button type="button" class="vidro" data-acao="fechar-folha">Fechar</button></div></div>`
    this.video = this.raiz.querySelector('video')!
    this.canvas = this.raiz.querySelector('.of-tela')!
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
    this.uniPontos.uPixel.value = this.renderer.getPixelRatio()
    this.cena.add(this.ancora)
    this.ancora.add(this.modelo)
    this.cena.add(this.camera)
    this.raiz.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-acao]')
      if (b) void this.acao(b.dataset.acao!, b.dataset)
    })
    this.ligarToque()
  }

  // ---------- Abrir e fechar ----------

  async abrir(qual = ''): Promise<string> {
    if (!this.aberta) {
      document.body.appendChild(this.raiz)
      this.aberta = true
      try {
        this.camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        this.video.srcObject = this.camStream
        // Sem esperar para sempre: em alguns aparelhos o primeiro quadro demora
        await Promise.race([this.video.play().catch(() => {}), new Promise((r) => setTimeout(r, 1500))])
      } catch {
        this.o.avisar('Sem a câmera, o holograma aparece no fundo escuro. Libere a câmera para a FRIDAY nas permissões.')
      }
      window.addEventListener('deviceorientation', this.aoGirarCelular)
      window.addEventListener('resize', this.redimensionar)
      this.redimensionar()
      this.relogio.start()
      this.raf = requestAnimationFrame(this.quadro)
      void prepararMaos().then(() => { this.maosLigadas = true; this.chip('MÃO: PROCURANDO') }).catch((e) => {
        this.chip('SEM MÃOS')
        this.dica(`Sem o reconhecimento de mãos (${(e as Error).message.slice(0, 60)}). Use o toque: um dedo gira, dois dedos mudam o tamanho, toque na peça para selecionar.`)
      })
    }
    const lista = await catalogo()
    const item = qual ? acharNoCatalogo(qual, lista) : this.nome ? null : lista.find((d) => d.origem === 'original') ?? null
    if (qual && !item) return `Não achei o design "${qual}". Tenho: ${lista.map((d) => d.nome).join(', ')}.`
    if (item) await this.carregar(item)
    return `Oficina aberta com ${this.nome}: ${this.editor?.visiveis ?? 0} peças (${this.geos.length ? this.nomesDasPecas().slice(0, 8).join(', ') : ''}).`
  }

  fechar(): void {
    if (!this.aberta) return
    this.aberta = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('deviceorientation', this.aoGirarCelular)
    window.removeEventListener('resize', this.redimensionar)
    this.camStream?.getTracks().forEach((t) => t.stop())
    this.camStream = null
    this.raiz.remove()
    this.o.aoFechar()
  }

  // ---------- Mesa holográfica ----------

  /** Os cartões: os designs do celular e, com o PC pareado e ligado, os projetos, relatórios e designs de lá. */
  private async cartoesDaMesa(): Promise<{ cartoes: CartaoMesa[]; pc: boolean }> {
    const locais: CartaoMesa[] = (await catalogo()).map((d) => ({
      id: `celular:${d.origem}:${d.nome}`,
      tipo: 'design',
      titulo: d.nome,
      sub: d.origem === 'salvo' ? 'sua versão · no celular' : 'design original',
      ficha: [d.apelidos.length ? `Também: ${d.apelidos.slice(0, 3).join(', ')}` : 'Editável com a mão', 'Toque duplo: abre no editor']
    }))
    let doPc: CartaoMesa[] = []
    let pc = false
    if (await pareado()) {
      try {
        const r = await pedirPC<{ ok: boolean; cartoes?: CartaoMesa[] }>({ acao: 'mesa', pedido: 'cartoes' }, 5000)
        doPc = (r.cartoes ?? []).map((c) => (c.tipo === 'design' ? { ...c, id: `pc:${c.titulo}`, sub: `${c.sub} · no PC` } : c))
        pc = true
      } catch { /* PC desligado ou longe: só os do celular */ }
    }
    const nomes = new Set(locais.map((c) => c.titulo.toLowerCase()))
    const todos = [...doPc.filter((c) => c.tipo === 'projeto'), ...locais, ...doPc.filter((c) => c.tipo === 'design' && !nomes.has(c.titulo.toLowerCase())), ...doPc.filter((c) => c.tipo === 'relatorio')]
    return { cartoes: todos, pc }
  }

  /** Abre a mesa em cima do seu móvel, com os cartões. */
  async abrirMesa(): Promise<string> {
    if (!this.aberta) await this.abrir()
    if (!this.mesa) {
      this.mesa = new Mesa(null, () => this.o.estado?.() ?? 'repouso')
      this.mesa.raiz.scale.setScalar(ESCALA_MESA)
      this.mesa.escalaDasParticulas(ESCALA_MESA * this.renderer.getPixelRatio() * 1.6)
    }
    const { cartoes, pc } = await this.cartoesDaMesa()
    // A mesa nasce dentro da cena própria dela: aqui ela passa para a âncora (fica em cima do móvel)
    this.ancora.add(this.mesa.raiz)
    this.mesa.abrir(cartoes)
    this.modoMesa = 'cartoes'
    this.editor?.selecionar(-1)
    this.mostrarPeca()
    this.centralizar(0.7, 0.1)
    this.raiz.querySelector('.of-nome')!.textContent = 'Mesa holográfica'
    this.dica('Tapa de lado passa os cartões · duas pinças rápidas abrem · no toque: deslize para passar e toque no cartão')
    const conta = (t: CartaoMesa['tipo']) => cartoes.filter((c) => c.tipo === t).length
    return `Mesa aberta em cima do seu móvel: ${cartoes.length} cartões (${conta('projeto')} projetos, ${conta('design')} designs, ${conta('relatorio')} relatórios)${pc ? '' : '; sem o PC, só os designs do celular'}. Na frente: ${this.mesa.atual?.titulo ?? 'nada'}.`
  }

  sairDaMesa(): void {
    if (!this.mesa || this.modoMesa === 'fora') return
    this.mesa.fechar()
    this.mesa.raiz.removeFromParent()
    this.modoMesa = 'fora'
    this.baseModelo.set(0, 0, 0)
    this.raiz.querySelector('.of-nome')!.textContent = this.nome || '—'
    this.centralizar()
  }

  /** Abre o cartão da frente (ou o que você disse): design vai para o editor, projeto vira prédio. */
  async abrirCartao(qual = ''): Promise<string> {
    const mesa = this.mesa
    if (!mesa || this.modoMesa === 'fora') return 'A mesa não está aberta.'
    if (qual) {
      const i = mesa.acharCartao(qual)
      if (i < 0) return `Não tem "${qual}" na mesa.`
      mesa.irPara(i)
    }
    const c = mesa.atual
    if (!c) return 'A mesa está vazia.'
    this.o.vibrar()
    if (c.tipo === 'design') {
      if (c.id.startsWith('pc:')) {
        this.dica(`Trazendo ${c.titulo} do PC…`)
        const r = await pedirPC<{ ok: boolean; mensagem: string; glb?: string; nome?: string }>({ acao: 'design_baixar', nome: c.titulo }, 30_000)
        if (!r.ok || !r.glb) return r.mensagem
        await this.carregarDados(r.nome ?? c.titulo, Uint8Array.from(atob(r.glb), (x) => x.charCodeAt(0)).buffer)
      } else {
        const item = acharNoCatalogo(c.titulo, await catalogo())
        if (!item) return 'Esse design sumiu do celular.'
        await this.carregar(item)
      }
      mesa.ocupar(this.nome, 'APONTE PARA SELECIONAR · PINÇA ARRASTA · TAPA JOGA FORA · "VOLTA" PARA OS CARTÕES')
      this.modoMesa = 'design'
      this.baseModelo.set(0, 0.13, 0)
      return `${this.nome} em cima da mesa: ${this.editor?.visiveis ?? 0} peças (${this.nomesDasPecas().slice(0, 8).join(', ')}).`
    }
    if (c.tipo === 'projeto') {
      this.dica(`Montando o prédio do ${c.titulo}…`)
      try {
        const r = await pedirPC<{ ok: boolean; mensagem?: string; predio?: Predio; resumo?: string }>({ acao: 'mesa', pedido: 'predio', projeto: c.titulo }, 30_000)
        if (!r.ok || !r.predio) return r.mensagem ?? 'O PC não montou o prédio.'
        mesa.mostrarPredio(r.predio)
        this.modoMesa = 'predio'
        this.dica('Mão fechada ou um dedo giram a mesa · duas pinças rápidas abrem os andares · tapa volta aos cartões')
        return `Prédio do ${c.titulo} na mesa. ${r.resumo ?? ''}`
      } catch (e) { return `O PC não respondeu (${(e as Error).message}).` }
    }
    try {
      const r = await pedirPC<{ ok: boolean; mensagem: string }>({ acao: 'mesa', pedido: 'relatorio', id: c.id.replace(/^relatorio:/, '') }, 10_000)
      return r.ok ? `${r.mensagem} (no PC)` : r.mensagem
    } catch { return 'O PC não respondeu.' }
  }

  voltarParaOsCartoes(): string {
    if (!this.mesa || this.modoMesa === 'fora') return 'A mesa não está aberta.'
    this.mesa.voltar()
    this.modoMesa = 'cartoes'
    this.editor?.selecionar(-1)
    this.mostrarPeca()
    this.baseModelo.set(0, 0, 0)
    return `De volta aos cartões. Na frente: ${this.mesa.atual?.titulo ?? 'nada'}.`
  }

  passarCartao(direcao: 1 | -1): string {
    if (!this.mesa || this.modoMesa !== 'cartoes') return 'Abra a mesa (ou volte aos cartões) primeiro.'
    const antes = this.mesa.indice
    const c = direcao > 0 ? this.mesa.proximo() : this.mesa.anterior()
    this.o.vibrar()
    if (this.mesa.indice === antes) return `Esse já é o ${direcao > 0 ? 'último' : 'primeiro'}: ${c?.titulo ?? ''}.`
    return `Cartão ${this.mesa.indice + 1} de ${this.mesa.total}: ${c?.titulo ?? ''}.`
  }

  private nomesDasPecas(): string[] { return this.editor ? this.editor.estado.pecas.filter((p) => !p.tirada).map((p) => p.nome) : [] }

  // ---------- Carregar um design ----------

  async carregar(item: ItemCatalogo): Promise<void> {
    let dados: ArrayBuffer
    if (item.origem === 'salvo') {
      const s = await lerSalvo(item.nome)
      if (!s) throw new Error('Esse design salvo sumiu.')
      dados = s
    } else {
      const url = urlOriginal(item.arquivo)
      if (!url) throw new Error('Esse design não veio com o app.')
      dados = await (await fetch(url)).arrayBuffer()
    }
    await this.carregarDados(item.nome, dados)
  }

  /** Abre um .glb (do app, das suas versões ou baixado do PC) no editor. */
  async carregarDados(nome: string, dados: ArrayBuffer): Promise<void> {
    const gltf = await new GLTFLoader().parseAsync(dados, '')
    // Cor e brilho originais de cada malha, pelo nome
    const cores = new Map<string, { cor: THREE.Color; brilho: boolean }>()
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mat = ([] as THREE.Material[]).concat(m.material)[0] as THREE.MeshStandardMaterial
      cores.set(m.name, { cor: mat?.color?.clone() ?? CIANO.clone(), brilho: !!mat?.emissive && mat.emissive.getHex() !== 0 })
    })
    const partes = partesDeObjeto(gltf.scene, { particulas: 9000 })
    this.montar(nome, partes, cores)
  }

  private montar(nome: string, partes: Parte[], cores: Map<string, { cor: THREE.Color; brilho: boolean }>): void {
    for (const i of this.instancias) this.modelo.remove(i.pivo)
    for (const g of this.geos) { g.pontos.dispose(); g.arestas.dispose(); g.casca.dispose() }
    this.instancias = []
    this.nome = nome
    const caixaTotal = new THREE.Box3()
    this.geos = partes.map((p) => {
      const tri = p.triangulos ?? new Float32Array(0)
      const caixa = new THREE.Box3().setFromArray(tri.length ? tri : p.pontos)
      caixaTotal.union(caixa)
      const centro = caixa.getCenter(new THREE.Vector3())
      const desloca = (a: Float32Array) => { const b = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { b[i] = a[i] - centro.x; b[i + 1] = a[i + 1] - centro.y; b[i + 2] = a[i + 2] - centro.z } return b }
      const gp = new THREE.BufferGeometry(); gp.setAttribute('position', new THREE.BufferAttribute(desloca(p.pontos), 3))
      const ga = new THREE.BufferGeometry(); ga.setAttribute('position', new THREE.BufferAttribute(desloca(p.arestas), 3))
      const gc = new THREE.BufferGeometry(); gc.setAttribute('position', new THREE.BufferAttribute(desloca(tri), 3)); gc.computeVertexNormals()
      const original = cores.get(p.nome) ?? cores.get(p.nome.replace(/ \d+$/, '')) ?? { cor: CIANO.clone(), brilho: false }
      // A cor do holograma puxa para o ciano, mas mantém o tom da peça
      return { centro, pontos: gp, arestas: ga, casca: gc, tri, cor: original.cor, brilho: original.brilho, caixa: caixa.translate(centro.clone().negate()) }
    })
    const tam = caixaTotal.getSize(new THREE.Vector3())
    const centroTotal = caixaTotal.getCenter(new THREE.Vector3())
    // Uns 22 a 30 cm no maior lado (cabe na tela em pé), centrado na âncora
    this.escalaBase = (window.innerWidth > window.innerHeight ? 0.3 : 0.22) / Math.max(tam.x, tam.y, tam.z, 1e-6)
    this.tamanhoModelo = Math.max(tam.x, tam.y, tam.z, 1e-6)
    this.modelo.userData.centro = centroTotal
    this.editor = new EditorHolograma(partes.map((p) => p.nome))
    this.explodido = this.alvoExplodido = 0
    this.raiz.querySelector('.of-nome')!.textContent = nome
    this.dica('Aponte o dedo para uma peça e segure para selecionar · pinça pega e arrasta · mão fechada gira · tapa joga fora')
    this.mostrarPeca()
  }

  private instancia(origem: number): Instancia {
    const g = this.geos[origem]
    const cor = g.cor.clone().lerp(CIANO, 0.22)
    const mats = {
      pontos: new THREE.ShaderMaterial({ uniforms: { ...this.uniPontos, uCor: { value: cor.clone() }, uOpac: { value: 0.9 } }, vertexShader: PONTOS_VERT, fragmentShader: PONTOS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      linhas: new THREE.LineBasicMaterial({ color: cor.clone(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      casca: new THREE.ShaderMaterial({ uniforms: { uCor: { value: cor.clone() }, uOpac: { value: 1 }, uTempo: this.tempo }, vertexShader: CASCA_VERT, fragmentShader: CASCA_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    }
    const interno = new THREE.Group()
    interno.add(new THREE.Mesh(g.casca, mats.casca), new THREE.LineSegments(g.arestas, mats.linhas), new THREE.Points(g.pontos, mats.pontos))
    const pivo = new THREE.Group()
    pivo.add(interno)
    this.modelo.add(pivo)
    return { pivo, interno, mats, saindo: 0, direcaoSaida: new THREE.Vector3() }
  }

  // ---------- Câmera e giroscópio ----------

  private aoGirarCelular = (e: DeviceOrientationEvent): void => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return
    this.orientacao = { a: e.alpha, b: e.beta, g: e.gamma }
  }

  private redimensionar = (): void => {
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Câmera de celular: uns 65° no lado maior da imagem
    this.camera.fov = w > h ? 42 : 62
    this.camera.updateProjectionMatrix()
    const mao = this.raiz.querySelector<HTMLCanvasElement>('.of-mao')!
    mao.width = w; mao.height = h
  }

  /** Põe o holograma uns 55 cm na sua frente, um pouco abaixo do centro. */
  centralizar(distancia = 0.55, abaixo = 0.12): void {
    const frente = new THREE.Vector3(0, -abaixo, -1).normalize().applyQuaternion(this.camera.quaternion)
    this.ancora.position.copy(this.camera.position).addScaledVector(frente, distancia)
    // Em pé na mesa: só o giro em volta do eixo vertical acompanha a câmera
    const yaw = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ').y
    // Sem giroscópio (prévia no navegador), a câmera não aponta para baixo: a mesa inclina para você ver de cima
    this.ancora.rotation.set(!this.orientacao && this.modoMesa !== 'fora' ? 0.6 : 0, yaw, 0, 'YXZ')
  }

  /** Ponto da imagem da câmera (0 a 1) → ponto na tela (o vídeo cobre a tela). */
  private naTela(p: { x: number; y: number }): { x: number; y: number } {
    const vw = this.video.videoWidth || window.innerWidth, vh = this.video.videoHeight || window.innerHeight
    const W = window.innerWidth, H = window.innerHeight
    const s = Math.max(W / vw, H / vh)
    return { x: p.x * vw * s + (W - vw * s) / 2, y: p.y * vh * s + (H - vh * s) / 2 }
  }

  /** Qual peça está debaixo deste ponto da tela (raio da câmera contra a caixa de cada peça). */
  private pecaEm(x: number, y: number): number {
    if (!this.editor) return -1
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1)
    const raio = new THREE.Raycaster()
    raio.setFromCamera(ndc, this.camera)
    let melhor = -1, dist = Infinity
    this.editor.estado.pecas.forEach((p, i) => {
      const inst = this.instancias[i]
      if (p.tirada || !inst) return
      const caixa = this.geos[p.origem].caixa.clone().applyMatrix4(inst.interno.matrixWorld)
      const ponto = raio.ray.intersectBox(caixa, new THREE.Vector3())
      if (ponto) {
        // Entre caixas que se cruzam, ganha a menor (a peça mais "precisa")
        const d = ponto.distanceTo(this.camera.position) + caixa.getSize(new THREE.Vector3()).length() * 0.3
        if (d < dist) { dist = d; melhor = i }
      }
    })
    if (melhor >= 0) return melhor
    // Perto o bastante do centro de alguma peça na tela
    let perto = 46
    this.editor.estado.pecas.forEach((p, i) => {
      const inst = this.instancias[i]
      if (p.tirada || !inst) return
      const c = new THREE.Vector3().setFromMatrixPosition(inst.interno.matrixWorld).project(this.camera)
      const d = Math.hypot((c.x * 0.5 + 0.5) * window.innerWidth - x, (-c.y * 0.5 + 0.5) * window.innerHeight - y)
      if (d < perto) { perto = d; melhor = i }
    })
    return melhor
  }

  /** Direção no mundo → a mesma direção no espaço do modelo (para a peça voar para o lado certo). */
  private direcaoLocal(d: THREE.Vector3): THREE.Vector3 {
    this.modelo.updateMatrixWorld()
    const o = new THREE.Vector3().setFromMatrixPosition(this.modelo.matrixWorld)
    return this.modelo.worldToLocal(o.clone().add(d)).sub(this.modelo.worldToLocal(o.clone()))
  }

  private jogarFora(direcao: number): void {
    const ed = this.editor!
    const inst = this.instancias[ed.selecionada]
    if (inst) {
      inst.direcaoSaida = this.direcaoLocal(new THREE.Vector3(direcao, 0.35, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(0.45))
      inst.saindo = performance.now()
    }
    ed.tirar()
    this.o.vibrar()
  }

  /** Ponto da tela na profundidade de um ponto do mundo. */
  private noMundo(x: number, y: number, profundidadeDe: THREE.Vector3): THREE.Vector3 {
    const ndcZ = profundidadeDe.clone().project(this.camera).z
    return new THREE.Vector3((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, ndcZ).unproject(this.camera)
  }

  // ---------- Mãos e toque ----------

  /** Gestos com a mesa nos cartões ou no prédio (no design, vale o editor). Devolve se tratou. */
  private maoNaMesa(ev: EventoOficina): boolean {
    if (this.modoMesa === 'cartoes' || this.modoMesa === 'predio') {
      switch (ev.tipo) {
        case 'jogar_fora':
          if (this.modoMesa === 'cartoes') this.dica(this.passarCartao(ev.direcao < 0 ? 1 : -1))
          else this.dica(this.voltarParaOsCartoes())
          return true
        case 'toque_duplo':
          if (this.modoMesa === 'cartoes') void this.abrirCartao().then((r) => this.dica(r))
          else { this.mesa?.explodir(!this.mesa.explodida); this.o.vibrar() }
          return true
        case 'girar':
          this.ancora.rotation.y += ev.dx * 0.8
          return true
        default:
          return true
      }
    }
    // No design em cima da mesa: tapa sem peça selecionada volta aos cartões
    if (this.modoMesa === 'design' && ev.tipo === 'jogar_fora' && !this.editor?.peca) { this.dica(this.voltarParaOsCartoes()); return true }
    return false
  }

  private tratarMao(ev: EventoOficina): void {
    if (this.maoNaMesa(ev)) return
    const ed = this.editor
    if (!ed) return
    switch (ev.tipo) {
      case 'cursor': {
        const p = this.naTela(ev)
        const i = this.pecaEm(p.x, p.y)
        const agora = performance.now()
        if (!this.cursor || this.cursor.peca !== i) this.cursor = { ...p, desde: agora, peca: i }
        else { this.cursor.x = p.x; this.cursor.y = p.y }
        // Parar o dedo em cima de uma peça por 0,7 s seleciona
        if (i >= 0 && i !== ed.selecionada && agora - this.cursor.desde > 700) { this.selecionar(i); this.cursor.desde = Infinity }
        break
      }
      case 'pegar': {
        const p = this.naTela(ev)
        const i = this.pecaEm(p.x, p.y)
        if (i >= 0) { if (i !== ed.selecionada) this.selecionar(i); this.arrastando = 'peca' }
        else this.arrastando = ed.selecionada >= 0 ? 'peca' : 'modelo'
        if (this.arrastando === 'modelo') ed.selecionar(-1)
        ed.comecarGesto()
        this.ultimoArrasto = p
        this.o.vibrar()
        break
      }
      case 'arrastar': {
        if (!this.arrastando || !this.ultimoArrasto) break
        const p = this.naTela(ev)
        this.arrastar(this.ultimoArrasto, p)
        this.ultimoArrasto = p
        break
      }
      case 'soltar':
        ed.terminarGesto()
        this.arrastando = null
        this.ultimoArrasto = null
        if (ed.peca && !ed.peca.tirada) this.mostrarPeca()
        break
      case 'girar':
        if (performance.now() > this.girandoAte) ed.comecarGesto()
        this.girandoAte = performance.now() + 400
        ed.girar([ev.dy, ev.dx, 0])
        break
      case 'jogar_fora': {
        const p = ed.peca
        if (!p) { this.dica('Selecione uma peça antes (aponte e segure) para jogar fora.'); break }
        this.jogarFora(ev.direcao)
        this.dica(`${p.nome} saiu. "Desfazer" traz de volta.`)
        this.mostrarPeca()
        break
      }
      case 'toque_duplo': {
        const p = this.naTela(ev)
        const i = this.pecaEm(p.x, p.y)
        this.selecionar(i)
        break
      }
      case 'sem_mao':
        this.cursor = null
        break
    }
  }

  /** Arrasta a peça selecionada (ou o modelo) de um ponto da tela para outro, na profundidade dela. */
  private arrastar(de: { x: number; y: number }, para: { x: number; y: number }): void {
    const ed = this.editor!
    const inst = this.arrastando === 'peca' && ed.selecionada >= 0 ? this.instancias[ed.selecionada] : null
    const ref = new THREE.Vector3().setFromMatrixPosition((inst?.interno ?? this.modelo).matrixWorld)
    const a = this.noMundo(de.x, de.y, ref), b = this.noMundo(para.x, para.y, ref)
    if (inst) {
      // Para o espaço do modelo (onde a peça vive)
      const la = this.modelo.worldToLocal(a.clone()), lb = this.modelo.worldToLocal(b.clone())
      ed.mover([lb.x - la.x, lb.y - la.y, lb.z - la.z])
    } else {
      const la = this.ancora.worldToLocal(a.clone()), lb = this.ancora.worldToLocal(b.clone())
      ed.mover([lb.x - la.x, lb.y - la.y, lb.z - la.z])
    }
  }

  private ligarToque(): void {
    const tela = this.canvas
    tela.addEventListener('pointerdown', (e) => {
      tela.setPointerCapture(e.pointerId)
      this.toques.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.toques.size === 1) { this.toqueInicio = { x: e.clientX, y: e.clientY, t: performance.now() }; this.arrastoToque = { dx: 0, dy: 0 } }
    })
    tela.addEventListener('pointermove', (e) => {
      const antes = this.toques.get(e.pointerId)
      if (!antes || !this.editor) return
      const agora = { x: e.clientX, y: e.clientY }
      if (Math.hypot(agora.x - antes.x, agora.y - antes.y) < 1) return
      if (this.modoMesa === 'cartoes' || this.modoMesa === 'predio') {
        this.arrastoToque.dx += agora.x - antes.x
        this.arrastoToque.dy += agora.y - antes.y
        if (this.modoMesa === 'predio') this.ancora.rotation.y += (agora.x - antes.x) * 0.01
        this.toques.set(e.pointerId, agora)
        return
      }
      this.editor.comecarGesto()
      if (this.toques.size === 1) {
        // Um dedo: gira (a peça selecionada ou o modelo)
        this.editor.girar([(agora.y - antes.y) * 0.01, (agora.x - antes.x) * 0.01, 0])
      } else if (this.toques.size === 2) {
        const [p, q] = [...this.toques.values()]
        const d0 = Math.hypot(p.x - q.x, p.y - q.y)
        this.toques.set(e.pointerId, agora)
        const [p2, q2] = [...this.toques.values()]
        const d1 = Math.hypot(p2.x - q2.x, p2.y - q2.y)
        if (d0 > 10) this.editor.escalar(d1 / d0)
        return
      }
      this.toques.set(e.pointerId, agora)
    })
    const fim = (e: PointerEvent) => {
      this.toques.delete(e.pointerId)
      if (this.toques.size) return
      this.editor?.terminarGesto()
      const t0 = this.toqueInicio
      // Na mesa: deslizar de lado passa os cartões; tocar num cartão traz ele para a frente ou abre
      if (this.modoMesa === 'cartoes' && t0) {
        this.toqueInicio = null
        if (Math.abs(this.arrastoToque.dx) > 50 && Math.abs(this.arrastoToque.dx) > Math.abs(this.arrastoToque.dy)) { this.dica(this.passarCartao(this.arrastoToque.dx < 0 ? 1 : -1)); return }
        if (performance.now() - t0.t < 350 && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < 12 && this.mesa) {
          const raio = new THREE.Raycaster()
          raio.setFromCamera(new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1), this.camera)
          const i = this.mesa.cartaoNoRaio(raio.ray)
          if (i >= 0 && i === this.mesa.indice) void this.abrirCartao().then((r) => this.dica(r))
          else if (i >= 0) { this.mesa.irPara(i); this.o.vibrar() }
        }
        return
      }
      if (this.modoMesa === 'predio') { this.toqueInicio = null; return }
      // Toque rápido sem arrastar: seleciona a peça ali (ou solta a seleção)
      if (t0 && performance.now() - t0.t < 300 && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < 12) {
        this.selecionar(this.pecaEm(e.clientX, e.clientY))
      }
      this.toqueInicio = null
    }
    tela.addEventListener('pointerup', fim)
    tela.addEventListener('pointercancel', fim)
  }

  // ---------- Ações (botões e voz) ----------

  private selecionar(i: number): void {
    if (!this.editor) return
    const antes = this.editor.selecionada
    this.editor.selecionar(i)
    if (this.editor.selecionada !== antes && this.editor.selecionada >= 0) this.o.vibrar()
    this.mostrarPeca()
  }

  private mostrarPeca(): void {
    const p = this.editor?.peca
    const caixa = this.raiz.querySelector<HTMLElement>('.of-peca')!
    caixa.hidden = !p
    if (p) this.raiz.querySelector('.of-peca-nome')!.textContent = p.nome
  }

  private dica(texto: string): void {
    const d = this.raiz.querySelector<HTMLElement>('.of-dica')!
    d.textContent = texto
  }

  private chip(texto: string): void { this.raiz.querySelector('[data-mao]')!.textContent = texto }

  /** Botões da tela; a voz chama `comando`. */
  private async acao(qual: string, _dados: DOMStringMap): Promise<void> {
    if (qual === 'fechar') { this.fechar(); return }
    if (qual === 'designs') { await this.mostrarDesigns(); return }
    if (qual === 'mesa') {
      // Fora da mesa: abre; com um cartão aberto: volta aos cartões; nos cartões: sai da mesa
      if (this.modoMesa === 'fora') this.o.avisar(await this.abrirMesa())
      else if (this.modoMesa === 'cartoes') this.sairDaMesa()
      else this.dica(this.voltarParaOsCartoes())
      return
    }
    if (qual === 'fechar-folha') { this.raiz.querySelector<HTMLElement>('.of-folha')!.hidden = true; return }
    if (qual === 'salvar') {
      const nome = prompt('Nome da versão nova:', `${this.nome.replace(/ v\d+$/, '')} v2`)
      if (nome) this.o.avisar(await this.salvar(nome))
      return
    }
    const r = this.comando({ acao: qual === 'cor' ? 'pintar' : qual })
    if (r) this.dica(r)
  }

  private async mostrarDesigns(): Promise<void> {
    const folha = this.raiz.querySelector<HTMLElement>('.of-folha')!
    const ul = folha.querySelector('ul')!
    const lista = await catalogo()
    ul.replaceChildren(...lista.map((d) => {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      b.innerHTML = `<b></b><small>${d.origem === 'salvo' ? 'sua versão' : 'original'}</small>`
      b.querySelector('b')!.textContent = d.nome
      b.addEventListener('click', async () => {
        folha.hidden = true
        try {
          await this.carregar(d)
          if (this.modoMesa !== 'fora' && this.mesa) { this.mesa.ocupar(this.nome, 'APONTE PARA SELECIONAR · PINÇA ARRASTA · TAPA JOGA FORA'); this.modoMesa = 'design'; this.baseModelo.set(0, 0.13, 0) }
        } catch (e) { this.o.avisar((e as Error).message) }
      })
      li.appendChild(b)
      if (d.origem === 'salvo') {
        const x = document.createElement('button')
        x.type = 'button'; x.className = 'of-apagar'; x.textContent = 'Apagar'; x.setAttribute('aria-label', `Apagar ${d.nome}`)
        x.addEventListener('click', async () => { if (confirm(`Apagar "${d.nome}" do celular?`)) { await apagarSalvo(d.nome); void this.mostrarDesigns() } })
        li.appendChild(x)
      }
      return li
    }))
    folha.hidden = false
  }

  /** Um comando (de botão ou da voz). Devolve a frase do resultado. */
  comando(a: { acao: string; peca?: string; cor?: string; design?: string; nome?: string }): string {
    const ed = this.editor
    if (!ed) return 'Nenhum design aberto.'
    if (a.peca) {
      const i = ed.acharPeca(a.peca)
      if (i < 0) return `Não achei a peça "${a.peca}". Peças: ${this.nomesDasPecas().join(', ')}.`
      this.selecionar(i)
    }
    const precisaPeca = ['tirar', 'duplicar', 'pintar', 'soltar'].includes(a.acao)
    if (precisaPeca && a.acao !== 'soltar' && !ed.peca) return 'Selecione uma peça primeiro (aponte e segure, toque nela ou diga o nome).'
    const nome = ed.peca?.nome ?? 'o modelo'
    let r = ''
    switch (a.acao) {
      case 'selecionar': r = ed.peca ? `${ed.peca.nome} selecionada.` : 'Nenhuma peça.'; break
      case 'soltar': ed.selecionar(-1); r = 'Seleção solta.'; break
      case 'tirar': {
        this.jogarFora(1); r = `${nome} tirada.`; break
      }
      case 'duplicar': {
        // A cópia aparece logo acima da original
        const tam = this.geos[ed.peca!.origem].caixa.getSize(new THREE.Vector3())
        ed.duplicar([0, Math.max(tam.y * 1.3, this.tamanhoModelo * 0.18), 0]); r = `${nome} duplicada: ${ed.peca?.nome}.`; break
      }
      case 'aumentar': ed.escalar(1.2); r = `${nome} maior.`; break
      case 'diminuir': ed.escalar(1 / 1.2); r = `${nome} menor.`; break
      case 'girar': ed.girar([0, Math.PI / 4, 0]); r = `${nome} girou 45 graus.`; break
      case 'pintar': {
        const cor = a.cor ? CORES[sem(a.cor)] : null
        if (a.cor && !cor) return 'Cor que eu não conheço. Posso: vermelho, azul, verde, amarelo, laranja, roxo, rosa, branco, ciano, dourado, prata, preto e cinza.'
        if (cor) ed.pintar(cor); else ed.proximaCor()
        r = `${nome} pintada.`
        break
      }
      case 'restaurar': ed.restaurar(); r = `${nome} voltou ao original.`; break
      case 'desfazer': r = ed.desfazer() ? 'Desfeito.' : 'Nada para desfazer.'; break
      case 'refazer': r = ed.refazer() ? 'Refeito.' : 'Nada para refazer.'; break
      case 'explodir': if (this.modoMesa === 'predio') { this.mesa?.explodir(!this.mesa.explodida); r = this.mesa?.explodida ? 'Andares separados.' : 'Prédio montado.'; break } this.alvoExplodido = this.alvoExplodido > 0.5 ? 0 : 1; r = this.alvoExplodido ? 'Peças separadas.' : 'Montado de novo.'; break
      case 'juntar': this.alvoExplodido = 0; this.mesa?.explodir(false); r = 'Montado de novo.'; break
      case 'centralizar': if (this.modoMesa === 'fora') this.centralizar(); else this.centralizar(0.7, 0.1); r = 'Holograma na sua frente.'; break
      default: return 'Ação desconhecida.'
    }
    this.mostrarPeca()
    return r
  }

  /** Salva o modelo como está (peças tiradas ficam de fora) como design novo. */
  async salvar(nome: string): Promise<string> {
    const ed = this.editor
    if (!ed) return 'Nada para salvar.'
    const limpo = nome.trim().slice(0, 50)
    if (!limpo) return 'Faltou o nome.'
    const pecas = ed.estado.pecas.filter((p) => !p.tirada).map((p) => {
      const g = this.geos[p.origem]
      const c = g.centro
      const m = matrizDaPeca([c.x, c.y, c.z], p)
      // Os triângulos guardados estão em volta do centro da peça: volta para o lugar antes de aplicar
      const tri = aplicarMatriz(m, g.tri)
      return { nome: p.nome, triangulos: tri, cor: (p.cor ?? [g.cor.r, g.cor.g, g.cor.b]) as Vec3, brilho: g.brilho }
    })
    const glb = escreverGlb(limpo, pecas)
    await salvarDesign(limpo, glb)
    this.nome = limpo
    this.raiz.querySelector('.of-nome')!.textContent = limpo
    let pc = ''
    if (await pareado()) {
      try {
        let bin = ''
        for (let i = 0; i < glb.length; i += 0x8000) bin += String.fromCharCode(...glb.subarray(i, i + 0x8000))
        const r = await pedirPC<{ ok: boolean; mensagem: string }>({ acao: 'design', nome: limpo, glb: btoa(bin) }, 15_000)
        pc = r.ok ? ' Também mandei para o PC.' : ` O PC não aceitou: ${r.mensagem}`
      } catch { pc = ' O PC não respondeu; fica só no celular por enquanto.' }
    }
    return `Salvei "${limpo}" no celular (${pecas.length} peças; ${ed.resumo()}).${pc}`
  }

  resumo(): string { return this.editor ? `${this.nome}: ${this.editor.resumo()}${this.editor.peca ? `; selecionada: ${this.editor.peca.nome}` : ''}` : 'Nenhum design aberto.' }

  // ---------- Quadro a quadro ----------

  private quadro = (): void => {
    if (!this.aberta) return
    this.raf = requestAnimationFrame(this.quadro)
    const dt = Math.min(0.05, this.relogio.getDelta())
    this.tempo.value += dt
    // Câmera: segue o celular (o holograma fica parado no quarto)
    if (this.orientacao) {
      const tela = ((screen.orientation?.angle ?? 0) * Math.PI) / 180
      quaternionDoCelular(this.camera.quaternion, THREE.MathUtils.degToRad(this.orientacao.a), THREE.MathUtils.degToRad(this.orientacao.b), THREE.MathUtils.degToRad(this.orientacao.g), tela)
    }
    if (!this.posicionou && (this.orientacao || this.relogio.elapsedTime > 0.6)) { this.camera.updateMatrixWorld(); if (this.modoMesa === 'fora') this.centralizar(); else this.centralizar(0.7, 0.1); this.posicionou = true }

    // Mãos
    if (this.maosLigadas && detector && this.video.readyState >= 2 && this.video.currentTime !== this.ultimoQuadroVideo) {
      this.ultimoQuadroVideo = this.video.currentTime
      const r = detector.detectForVideo(this.video, performance.now())
      const maos: Ponto[][] = (r.landmarks ?? []).map((m) => m.map((p) => ({ x: p.x, y: p.y, z: p.z })))
      for (const ev of this.gestos.atualizar(maos, performance.now())) this.tratarMao(ev)
      this.chip(maos.length ? `MÃO: ${{ aberta: 'ABERTA', fechada: 'GIRANDO', pinca: this.arrastando ? 'SEGURANDO' : 'PINÇA', aponta: 'APONTANDO', outra: '—' }[pose(maos[0])]}` : 'MÃO: PROCURANDO')
      this.desenharMao(maos)
    }
    if (this.girandoAte && performance.now() > this.girandoAte) { this.editor?.terminarGesto(); this.girandoAte = 0 }

    // Estado → objetos 3D
    const ed = this.editor
    if (ed) {
      const e = ed.estado
      const centro = this.modelo.userData.centro as THREE.Vector3 | undefined
      this.modelo.position.set(...e.pos)
      this.modelo.rotation.set(...e.giro)
      this.modelo.scale.setScalar(this.escalaBase * e.escala)
      if (centro) this.modelo.position.sub(centro.clone().multiplyScalar(this.escalaBase * e.escala).applyEuler(this.modelo.rotation))
      this.modelo.position.add(this.baseModelo)
      this.modelo.visible = this.modoMesa === 'fora' || this.modoMesa === 'design'
      this.explodido += (this.alvoExplodido - this.explodido) * 0.1
      const algumaSelecionada = ed.selecionada >= 0
      e.pecas.forEach((p, i) => {
        const inst = this.instancias[i] ?? (this.instancias[i] = this.instancia(p.origem))
        const g = this.geos[p.origem]
        // Explodir: cada peça se afasta do centro; peças no meio (concêntricas) se abrem para cima e para baixo
        let explode = new THREE.Vector3()
        if (centro && this.explodido > 0.001) {
          explode = g.centro.clone().sub(centro)
          if (explode.length() < this.tamanhoModelo * 0.12) explode.set(0, (p.origem - (this.geos.length - 1) / 2) * this.tamanhoModelo * 0.1, 0)
          explode.multiplyScalar(this.explodido * 1.1)
        }
        inst.pivo.position.set(g.centro.x + p.pos[0] + explode.x, g.centro.y + p.pos[1] + explode.y, g.centro.z + p.pos[2] + explode.z)
        inst.pivo.rotation.set(...p.giro)
        inst.pivo.scale.setScalar(p.escala)
        // Peça jogada fora: voa, gira e some
        if (p.tirada) {
          if (inst.saindo) {
            const k = (performance.now() - inst.saindo) / 600
            if (k >= 1) { inst.saindo = 0; inst.pivo.visible = false }
            else {
              inst.pivo.visible = true
              // O pivô tem a escala da peça: divide para a distância do voo não depender dela
              inst.interno.position.copy(inst.direcaoSaida).multiplyScalar((k * k * 1.6 + k) / Math.max(p.escala, 0.1))
              inst.interno.rotation.z += dt * 12
              inst.mats.casca.uniforms.uOpac.value = 1 - k
              inst.mats.pontos.uniforms.uOpac.value = 0.9 * (1 - k)
              inst.mats.linhas.opacity = 0.35 * (1 - k)
            }
          } else inst.pivo.visible = false
          return
        }
        inst.pivo.visible = true
        inst.interno.position.set(0, 0, 0)
        inst.interno.rotation.set(0, 0, 0)
        const base = (p.cor ? new THREE.Color(...p.cor) : g.cor.clone()).lerp(CIANO, p.cor ? 0.12 : 0.22)
        const sel = i === ed.selecionada
        const pulso = 0.75 + 0.25 * Math.sin(this.tempo.value * 6)
        const cor = sel ? base.clone().lerp(LARANJA, 0.55) : base
        const opac = sel ? 1 : algumaSelecionada ? 0.4 : 1
        ;(inst.mats.pontos.uniforms.uCor.value as THREE.Color).copy(cor)
        inst.mats.pontos.uniforms.uOpac.value = 0.9 * opac * (sel ? pulso : 1)
        inst.mats.linhas.color.copy(cor)
        inst.mats.linhas.opacity = 0.35 * opac
        ;(inst.mats.casca.uniforms.uCor.value as THREE.Color).copy(cor)
        inst.mats.casca.uniforms.uOpac.value = opac * (sel ? 1.4 : 1)
      })
      for (let i = e.pecas.length; i < this.instancias.length; i++) this.instancias[i].pivo.visible = false
    }
    // A mesa (quando aberta) anda junto: cartões, prédio e a FRIDAY olhando para o celular
    if (this.mesa && this.modoMesa !== 'fora') {
      this.ancora.updateMatrixWorld()
      this.mesa.animar(dt, this.tempo.value, this.mesa.raiz.worldToLocal(this.camera.position.clone()))
    }
    this.renderer.render(this.cena, this.camera)
  }

  /** Mostra onde ela está vendo a ponta do dedo (e o polegar), por cima da câmera. */
  private desenharMao(maos: Ponto[][]): void {
    const c = this.raiz.querySelector<HTMLCanvasElement>('.of-mao')!
    const g = c.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, c.width, c.height)
    const m = maos[0]
    if (!m) return
    const ponta = this.naTela(m[8]), polegar = this.naTela(m[4])
    const segurando = !!this.arrastando
    g.strokeStyle = segurando ? '#FFB547' : '#5FE1F2'
    g.lineWidth = 2
    g.beginPath(); g.arc(ponta.x, ponta.y, segurando ? 16 : 12, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.arc(polegar.x, polegar.y, 7, 0, Math.PI * 2); g.stroke()
    // Carregando a seleção (dedo parado em cima de uma peça)
    if (this.cursor && this.cursor.peca >= 0 && Number.isFinite(this.cursor.desde)) {
      const k = Math.min(1, (performance.now() - this.cursor.desde) / 700)
      g.beginPath(); g.arc(ponta.x, ponta.y, 20, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke()
    }
  }
}
