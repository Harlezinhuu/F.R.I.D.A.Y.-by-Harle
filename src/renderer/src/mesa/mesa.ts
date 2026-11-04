// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Mesa holográfica: uma mesa de luz na tela com o arquivo dos seus cartões (projetos, designs e
// relatórios). Você passa os cartões com a mão ou pela voz; o da frente abre com um toque duplo
// (pinça duas vezes) ou "abre esse". Projeto vira prédio (pastas = andares, arquivos = salas),
// design vira holograma em cima da mesa. A FRIDAY em miniatura anda pela mesa e aponta o que explica.

import * as THREE from 'three'
import type { CartaoMesa, Predio } from '../../../shared/mesa'
import type { Modelo3D } from '../projetor/tipos'
import { MiniFriday } from './mini'
import { escreverCartao, painelTexto, textoPlano } from './textos'

export type ModoMesa = 'cartoes' | 'design' | 'predio'

const CIANO = new THREE.Color('#5FE1F2')
const COR_ESTADO = { ok: new THREE.Color('#5FE1F2'), mudado: new THREE.Color('#FFB547'), falha: new THREE.Color('#FF5A6E') }
const LARGURA = 10, FUNDO = 5.6, RAIO = 0.5
const MAX_PONTOS = 14_000

const suave = (a: number, b: number, k: number) => a + (b - a) * k

/** Retângulo de cantos redondos (contorno da mesa), no plano XZ. */
function contorno(w: number, d: number, r: number, passos = 10): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const cantos: [number, number, number][] = [[w / 2 - r, -d / 2 + r, -Math.PI / 2], [w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, Math.PI / 2], [-w / 2 + r, -d / 2 + r, Math.PI]]
  for (const [cx, cz, a0] of cantos) for (let i = 0; i <= passos; i++) {
    const a = a0 + (i / passos) * (Math.PI / 2)
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r))
  }
  pts.push(pts[0].clone())
  return pts
}

const MESA_FRAG = /* glsl */ `
  uniform float uTime, uSweep;
  uniform vec3 uCor;
  varying vec2 vP;
  float caixa(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main(){
    float d = caixa(vP, vec2(${(LARGURA / 2).toFixed(2)}, ${(FUNDO / 2).toFixed(2)}), ${RAIO.toFixed(2)});
    if (d > 0.0) discard;
    vec2 g = abs(fract(vP * 2.0) - .5);
    float linha = smoothstep(.485, .5, max(g.x, g.y)) * .10;
    vec2 c = abs(fract(vP) - .5);
    float cruz = (step(c.x, .012) * step(c.y, .07) + step(c.y, .012) * step(c.x, .07)) * .55;
    float borda = exp(d * 9.0) * .55;
    float varre = exp(-abs(vP.y - uSweep) * 6.0) * .12;
    float a = .38 + linha + cruz * .4 + borda + varre;
    gl_FragColor = vec4(mix(vec3(.02, .05, .11), uCor, clamp(linha + cruz + borda + varre, 0.0, 1.0)), a);
  }`

const PONTOS_VERT = /* glsl */ `
  attribute vec3 aCor;
  uniform float uTam, uPixel;
  varying vec3 vCor;
  void main(){
    vCor = aCor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uTam * uPixel / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`
const PONTOS_FRAG = /* glsl */ `
  uniform float uOpac;
  varying vec3 vCor;
  void main(){
    float d = length(gl_PointCoord - .5);
    if (d > .5) discard;
    gl_FragColor = vec4(vCor, (1.0 - d * 2.0) * uOpac);
  }`

export class Mesa {
  private renderer: THREE.WebGLRenderer | null = null
  private cena = new THREE.Scene()
  /** Tudo da mesa fica aqui dentro: no celular, este grupo vai para a cena da câmera */
  readonly raiz = new THREE.Group()
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80)
  private raf = 0
  private relogio = new THREE.Clock()
  private uniMesa = { uTime: { value: 0 }, uSweep: { value: 0 }, uCor: { value: CIANO.clone() } }
  private uniPontos = { uTam: { value: 26 }, uPixel: { value: 1 }, uOpac: { value: 0.85 } }
  private letreiro: THREE.Mesh | null = null
  private dica: THREE.Mesh | null = null
  private grupoCartoes = new THREE.Group()
  private palco = new THREE.Group()
  private emissor = new THREE.Group()
  private cartoes: CartaoMesa[] = []
  private malhasCartoes: THREE.Mesh[] = []
  private contador: THREE.Mesh | null = null
  private posicao = 0
  private explodido = 0
  private alvoExplodido = 0
  private orbita = { yaw: 0, pitch: 0.95, raio: 8.6, alvoYaw: 0, alvoPitch: 0.95, alvoRaio: 8.6 }
  /** Para onde a câmera olha (o centro do que está na mesa) */
  private foco = new THREE.Vector3(0, 0.3, 0)
  private alvoFoco = new THREE.Vector3(0, 0.3, 0)
  /** Distância mínima para a mesa caber na tela */
  private raioBase = 8.6
  private sumindo = 0
  private partes: { grupo: THREE.Group; direcao: THREE.Vector3; rotulo: THREE.Sprite | null }[] = []
  private andares: { grupo: THREE.Group; base: number; estado: 'ok' | 'mudado' | 'falha'; preenchimento: THREE.MeshBasicMaterial }[] = []
  private giroModelo = 0
  readonly mini = new MiniFriday()
  aberta = false
  indice = 0
  modo: ModoMesa = 'cartoes'
  titulo = ''

  /**
   * `canvas`: a mesa desenha sozinha na tela (PC). null: modo embutido (celular), quem desenha é a cena
   * de quem usa, que chama `animar` a cada quadro.
   */
  constructor(private canvas: HTMLCanvasElement | null, private estado: () => string = () => 'repouso') {
    this.camera.position.set(0, 6, 7)
    this.cena.add(this.raiz)
    this.raiz.add(this.grupoCartoes, this.palco, this.emissor, this.mini.raiz)
    this.criarMesa()
    this.criarEmissor()
  }

  // ---------- Montagem ----------

  private criarMesa(): void {
    const forma = new THREE.PlaneGeometry(LARGURA + 0.2, FUNDO + 0.2)
    forma.rotateX(-Math.PI / 2)
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniMesa,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: MESA_FRAG,
      transparent: true,
      depthWrite: false
    })
    const tampo = new THREE.Mesh(forma, mat)
    tampo.renderOrder = -2
    this.raiz.add(tampo)
    // Bordas: a de fora acesa, uma de dentro mais fraca e um risco violeta no canto (como uma etiqueta)
    const linha = (pts: THREE.Vector3[], cor: string, opac: number) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: opac, blending: THREE.AdditiveBlending, depthWrite: false }))
      this.raiz.add(l)
      return l
    }
    linha(contorno(LARGURA, FUNDO, RAIO), '#8FEFFF', 0.95)
    linha(contorno(LARGURA - 0.35, FUNDO - 0.35, RAIO * 0.7).map((p) => p.setY(0.002)), '#5FE1F2', 0.35)
    linha([new THREE.Vector3(-LARGURA / 2 + 0.6, 0.004, -FUNDO / 2 + 0.32), new THREE.Vector3(-LARGURA / 2 + 1.5, 0.004, -FUNDO / 2 + 0.32)], '#FF5A8A', 0.9)
    const legenda = textoPlano(['MESA HOLOGRÁFICA · F.R.I.D.A.Y', 'BY HARLE'], { tamanho: 26, cor: '#7FD8F0', fonte: 'JetBrains Mono', espacamento: 6 }, 3.2)
    legenda.position.set(-LARGURA / 2 + 2.2, 0.005, -FUNDO / 2 + 0.6)
    this.raiz.add(legenda)
    // Anel em volta da mesa, no ar (o "horizonte" do vídeo)
    const arco = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 121 }, (_, i) => { const a = Math.PI * (0.08 + (i / 120) * 0.84); return new THREE.Vector3(Math.cos(a) * 9, 1.6, -Math.sin(a) * 6.5) })),
      new THREE.LineBasicMaterial({ color: '#4E8FE8', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.raiz.add(arco)
  }

  /** O círculo no meio da mesa, de onde sobe o holograma. */
  private criarEmissor(): void {
    const anel = (r: number, opac: number) => new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => { const a = (i / 96) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, 0.01, Math.sin(a) * r) })),
      new THREE.LineBasicMaterial({ color: '#8FEFFF', transparent: true, opacity: opac, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    this.emissor.add(anel(1.45, 0.9), anel(1.25, 0.35), anel(0.5, 0.5))
    const disco = new THREE.Mesh(new THREE.CircleGeometry(1.45, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1C5F88', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
    disco.position.y = 0.006
    // Feixe de luz subindo do disco
    const feixe = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.4, 2.4, 48, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(.25, .75, 1.0, (1.0 - vY) * (1.0 - vY) * .16); }'
      })
    )
    feixe.position.y = 1.2
    this.emissor.add(disco, feixe)
    this.emissor.visible = false
  }

  private iniciarRenderer(): void {
    if (this.renderer || !this.canvas) return
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75))
    this.uniPontos.uPixel.value = this.renderer.getPixelRatio()
    window.addEventListener('resize', () => this.redimensionar())
    this.redimensionar()
  }

  private redimensionar(): void {
    if (!this.renderer) return
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Tela estreita: chega mais longe para a mesa caber
    this.raioBase = Math.max(8.6, 8.6 * (1.6 / Math.max(0.6, w / h)))
    this.orbita.alvoRaio = this.raioBase
    this.camera.updateProjectionMatrix()
  }

  // ---------- Abrir e fechar ----------

  abrir(cartoes: CartaoMesa[]): void {
    this.aberta = true
    this.sumindo = 0
    this.definirCartoes(cartoes)
    this.voltar()
    this.mini.colocar(new THREE.Vector3(-3.4, 0, 1.6))
    if (!this.canvas) return
    this.iniciarRenderer()
    this.canvas.hidden = false
    this.canvas.style.opacity = '1'
    if (!this.raf) { this.relogio.start(); this.raf = requestAnimationFrame(this.quadro) }
  }

  fechar(): void {
    if (!this.aberta) return
    this.aberta = false
    if (this.canvas) this.sumindo = performance.now()
    else this.limparPalco()
  }

  /** No celular a mesa é pequena (uns 45 cm): as partículas encolhem junto. */
  escalaDasParticulas(f: number): void {
    this.uniPontos.uTam.value = 26 * f
    this.mini.escalaDasParticulas(f)
  }

  /** O cartão que está nesta posição da tela (raio já no espaço do mundo), ou -1. */
  cartaoNoRaio(raio: THREE.Ray): number {
    let melhor = -1, dist = Infinity
    this.malhasCartoes.forEach((m, i) => {
      if (!m.visible || !this.grupoCartoes.visible) return
      const caixa = new THREE.Box3().setFromObject(m)
      const p = raio.intersectBox(caixa, new THREE.Vector3())
      if (p && p.distanceTo(raio.origin) < dist) { dist = p.distanceTo(raio.origin); melhor = i }
    })
    return melhor
  }

  /** O centro do palco (onde o holograma ou o prédio aparece), no espaço da mesa. */
  get alturaDoPalco(): number { return this.foco.y }

  definirCartoes(cartoes: CartaoMesa[]): void {
    for (const m of this.malhasCartoes) { this.grupoCartoes.remove(m); (m.material as THREE.MeshBasicMaterial).map?.dispose(); (m.material as THREE.Material).dispose(); m.geometry.dispose() }
    this.cartoes = cartoes
    this.malhasCartoes = cartoes.map((c) => {
      const tex = escreverCartao(c)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.06), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
      this.grupoCartoes.add(m)
      return m
    })
    this.indice = Math.min(this.indice, Math.max(0, cartoes.length - 1))
    this.posicao = this.indice
    this.atualizarContador()
  }

  get atual(): CartaoMesa | null { return this.cartoes[this.indice] ?? null }
  get total(): number { return this.cartoes.length }

  proximo(): CartaoMesa | null { return this.irPara(this.indice + 1) }
  anterior(): CartaoMesa | null { return this.irPara(this.indice - 1) }

  irPara(i: number): CartaoMesa | null {
    if (!this.cartoes.length) return null
    this.indice = Math.max(0, Math.min(this.cartoes.length - 1, i))
    this.atualizarContador()
    return this.atual
  }

  /** Procura um cartão pelo nome ("harle bot", "turbina"). */
  acharCartao(nome: string, tipo?: CartaoMesa['tipo']): number {
    const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim()
    const alvo = n(nome)
    if (!alvo) return -1
    const lista = this.cartoes.map((c, i) => ({ c, i })).filter(({ c }) => !tipo || c.tipo === tipo)
    return (lista.find(({ c }) => n(c.titulo) === alvo) ?? lista.find(({ c }) => n(c.titulo).includes(alvo) || alvo.includes(n(c.titulo))) ?? lista.find(({ c }) => alvo.split(' ').filter((p) => p.length > 2).every((p) => n(c.titulo).includes(p))))?.i ?? -1
  }

  private atualizarContador(): void {
    if (this.contador) { this.raiz.remove(this.contador); this.contador.geometry.dispose(); ((this.contador.material as THREE.MeshBasicMaterial).map)?.dispose() }
    if (!this.cartoes.length) { this.contador = null; return }
    const tipo = { projeto: 'PROJETO', design: 'DESIGN', relatorio: 'RELATÓRIO' }[this.atual!.tipo]
    this.contador = textoPlano([`${String(this.indice + 1).padStart(2, '0')} / ${String(this.cartoes.length).padStart(2, '0')}  ·  ${tipo}`], { tamanho: 30, cor: '#9FE9FF', fonte: 'JetBrains Mono', espacamento: 4 }, 2.6)
    this.contador.position.set(0, 0.006, 1.32)
    this.contador.visible = this.modo === 'cartoes'
    this.raiz.add(this.contador)
  }

  private trocarLetreiro(texto: string, dica: string): void {
    for (const m of [this.letreiro, this.dica]) if (m) { this.raiz.remove(m); m.geometry.dispose(); ((m.material as THREE.MeshBasicMaterial).map)?.dispose() }
    this.letreiro = textoPlano([texto.toUpperCase()], { tamanho: 150, cor: '#5FE1F2', fonte: 'Tektur', contorno: true, espacamento: 10 }, Math.min(7.4, 0.9 + texto.length * 0.52))
    this.letreiro.position.set(0, 0.004, 1.95)
    ;(this.letreiro.material as THREE.MeshBasicMaterial).opacity = 0.4
    this.dica = textoPlano([dica], { tamanho: 24, cor: '#7FD8F0', fonte: 'JetBrains Mono', espacamento: 5 }, 6.2)
    this.dica.position.set(0, 0.005, FUNDO / 2 - 0.3)
    this.raiz.add(this.letreiro, this.dica)
  }

  // ---------- Modos ----------

  private limparPalco(): void {
    for (const filho of [...this.palco.children]) {
      this.palco.remove(filho)
      filho.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose() }
      })
    }
    this.partes = []
    this.andares = []
    this.palco.rotation.set(0, 0, 0)
    this.alvoExplodido = 0
    this.explodido = 0
  }

  /** Ângulo e ponto de vista de cada modo (cartões de cima; prédio e design mais de lado, como no vídeo). */
  private enquadrar(pitch: number, focoY: number, perto = 1): void {
    this.orbita.alvoPitch = pitch
    this.orbita.alvoYaw = 0
    this.orbita.alvoRaio = this.raioBase * perto
    this.alvoFoco.set(0, focoY, 0)
  }

  /** Volta para o arquivo de cartões. */
  voltar(): void {
    this.limparPalco()
    this.modo = 'cartoes'
    this.titulo = ''
    this.emissor.visible = false
    this.grupoCartoes.visible = true
    if (this.contador) this.contador.visible = true
    this.trocarLetreiro('ARQUIVO', 'DESLIZE OS CARTÕES COM A MÃO · TOQUE DUPLO PARA ABRIR')
    this.enquadrar(0.95, 0.3)
    this.mini.andarPara(new THREE.Vector3(-1.75, 0, 1.25), new THREE.Vector3(0, 0.6, 0))
  }

  /**
   * Outro desenha em cima da mesa (no celular, o editor de hologramas): a mesa só esconde os cartões,
   * acende o emissor, troca o letreiro e manda a FRIDAY para o lado.
   */
  ocupar(titulo: string, dica: string): void {
    this.limparPalco()
    this.modo = 'design'
    this.titulo = titulo
    this.grupoCartoes.visible = false
    if (this.contador) this.contador.visible = false
    this.emissor.visible = true
    this.trocarLetreiro(titulo, dica)
    this.mini.andarPara(new THREE.Vector3(2.3, 0, 1.0), new THREE.Vector3(0, 1.4, 0))
  }

  /** Design em holograma: as peças em partículas e linhas, girando em cima do emissor. */
  mostrarDesign(m: Modelo3D): void {
    this.limparPalco()
    this.modo = 'design'
    this.titulo = m.nome
    this.grupoCartoes.visible = false
    if (this.contador) this.contador.visible = false
    this.emissor.visible = true
    this.trocarLetreiro(m.nome, 'MÃO FECHADA GIRA · ABRA AS DUAS MÃOS PARA EXPLODIR · "VOLTA" PARA OS CARTÕES')
    // Tamanho e centro do modelo inteiro
    const caixa = new THREE.Box3()
    for (const p of m.partes) for (let i = 0; i < p.pontos.length; i += 3) caixa.expandByPoint(new THREE.Vector3(p.pontos[i], p.pontos[i + 1], p.pontos[i + 2]))
    const tam = caixa.getSize(new THREE.Vector3()), centro = caixa.getCenter(new THREE.Vector3())
    const escala = 2.7 / Math.max(tam.x, tam.y, tam.z, 1e-6)
    const totalPontos = m.partes.reduce((s, p) => s + p.pontos.length / 3, 0)
    const passo = Math.max(1, Math.ceil(totalPontos / MAX_PONTOS))
    const raiz = new THREE.Group()
    raiz.position.y = 0.15 + (tam.y * escala) / 2
    for (const parte of m.partes) {
      const g = new THREE.Group()
      const cor = parte.cor ? new THREE.Color(...parte.cor).lerp(CIANO, 0.35) : CIANO.clone()
      const pos: number[] = [], cores: number[] = []
      const centroParte = new THREE.Vector3()
      let n = 0
      for (let i = 0; i < parte.pontos.length; i += 3 * passo) {
        const x = (parte.pontos[i] - centro.x) * escala, y = (parte.pontos[i + 1] - centro.y) * escala, z = (parte.pontos[i + 2] - centro.z) * escala
        pos.push(x, y, z)
        const brilho = 0.75 + Math.random() * 0.25
        cores.push(cor.r * brilho, cor.g * brilho, cor.b * brilho)
        centroParte.add(new THREE.Vector3(x, y, z)); n++
      }
      if (!n) continue
      centroParte.divideScalar(n)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('aCor', new THREE.Float32BufferAttribute(cores, 3))
      g.add(new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.uniPontos, vertexShader: PONTOS_VERT, fragmentShader: PONTOS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
      if (parte.arestas.length) {
        const ar = new Float32Array(parte.arestas.length)
        for (let i = 0; i < ar.length; i += 3) { ar[i] = (parte.arestas[i] - centro.x) * escala; ar[i + 1] = (parte.arestas[i + 1] - centro.y) * escala; ar[i + 2] = (parte.arestas[i + 2] - centro.z) * escala }
        const lg = new THREE.BufferGeometry()
        lg.setAttribute('position', new THREE.BufferAttribute(ar, 3))
        g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })))
      }
      raiz.add(g)
      const rotulo = m.partes.length > 1 && this.partes.length < 16 ? painelTexto([parte.nome.toUpperCase()], { tamanho: 34, cor: '#E4FEFF', fonte: 'JetBrains Mono', fundo: 'rgba(8,20,40,.75)', borda: '#5FE1F2' }, 0.2) : null
      // Etiquetas em alturas alternadas, para não ficarem uma em cima da outra
      if (rotulo) { rotulo.position.copy(centroParte).add(new THREE.Vector3(0, 0.12 + (this.partes.length % 3) * 0.14, 0)); rotulo.material.opacity = 0; g.add(rotulo) }
      this.partes.push({ grupo: g, direcao: centroParte.lengthSq() > 1e-6 ? centroParte.clone().normalize().multiplyScalar(0.25 + centroParte.length() * 0.9) : new THREE.Vector3(0, 0.6, 0), rotulo })
    }
    this.palco.add(raiz)
    this.enquadrar(0.52, raiz.position.y, 0.86)
    this.mini.andarPara(new THREE.Vector3(2.1, 0, 1.0), new THREE.Vector3(0, raiz.position.y, 0))
  }

  /** Projeto em prédio: andar por pasta, sala por arquivo, cor pelo estado. */
  mostrarPredio(p: Predio): void {
    this.limparPalco()
    this.modo = 'predio'
    this.titulo = p.projeto
    this.grupoCartoes.visible = false
    if (this.contador) this.contador.visible = false
    this.emissor.visible = true
    this.trocarLetreiro(p.projeto, `${p.andares.length} ANDARES · ${p.arquivos} ARQUIVOS · ${p.linhas.toLocaleString('pt-BR')} LINHAS · VERMELHO = TESTE FALHANDO · ÂMBAR = NÃO ENVIADO`)
    const maior = Math.max(...p.andares.map((a) => a.linhas), 1)
    const ALTURA = 0.2, VAO = 0.09
    const predio = new THREE.Group()
    p.andares.forEach((a, i) => {
      const g = new THREE.Group()
      const s = Math.max(0.42, Math.sqrt(a.linhas / maior)) * (1 - i * 0.025)
      const w = 1.8 * s, d = 1.25 * s
      const cor = COR_ESTADO[a.estado]
      // Laje: vidro + contorno aceso
      const caixa = new THREE.BoxGeometry(w, ALTURA, d)
      const preenchimento = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: a.estado === 'ok' ? 0.05 : 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
      g.add(new THREE.Mesh(caixa, preenchimento))
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(caixa), new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })))
      // Salas em grade em cima da laje, do tamanho do arquivo
      const n = a.salas.length
      const cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / d)))
      const linhas = Math.ceil(n / cols)
      const maiorSala = Math.max(...a.salas.map((x) => x.linhas), 1)
      a.salas.forEach((sala, k) => {
        const cx = -w / 2 + (w / cols) * ((k % cols) + 0.5), cz = -d / 2 + (d / Math.max(1, linhas)) * (Math.floor(k / cols) + 0.5)
        const lado = Math.min(w / cols, d / Math.max(1, linhas)) * (0.35 + 0.5 * Math.sqrt(sala.linhas / maiorSala))
        const h = 0.025 + 0.09 * Math.sqrt(sala.linhas / maiorSala)
        const sg = new THREE.BoxGeometry(lado, h, lado)
        const c = COR_ESTADO[sala.estado]
        const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: sala.estado === 'ok' ? 0.16 : 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(sg), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: sala.estado === 'ok' ? 0.35 : 0.9, blending: THREE.AdditiveBlending, depthWrite: false })))
        m.position.set(cx, ALTURA / 2 + h / 2, cz)
        g.add(m)
      })
      // Placa do andar à esquerda, com a linha até a laje (como as plantas do vídeo)
      const placa = painelTexto([`${a.nome}  ·  ${a.arquivos} arq · ${a.linhas.toLocaleString('pt-BR')} linhas`], { tamanho: 30, cor: a.estado === 'ok' ? '#CFF6FF' : a.estado === 'falha' ? '#FFB3BE' : '#FFE0A8', fonte: 'JetBrains Mono', fundo: 'rgba(0,0,0,0)', alinhar: 'right' }, 0.17)
      placa.position.set(-1.75, 0, 0)
      g.add(placa)
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.7, 0, 0), new THREE.Vector3(-w / 2, 0, 0)]), new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })))
      const base = 0.12 + i * (ALTURA + VAO)
      g.position.y = base
      predio.add(g)
      this.andares.push({ grupo: g, base, estado: a.estado, preenchimento })
    })
    this.palco.add(predio)
    const meio = 0.12 + (p.andares.length * (ALTURA + VAO)) / 2
    this.enquadrar(0.42, meio, 0.82)
    this.mini.andarPara(new THREE.Vector3(1.55, 0, 0.55), new THREE.Vector3(0, meio, 0))
  }

  // ---------- Gestos ----------

  explodir(sim: boolean): void {
    this.alvoExplodido = sim ? 1 : 0
    // Prédio aberto fica mais alto: a câmera sobe junto
    if (this.modo === 'predio') {
      this.alvoFoco.y = (0.12 + this.andares.length * 0.29) / 2 + (sim ? this.andares.length * 0.16 : 0)
      this.orbita.alvoRaio = this.raioBase * (sim ? 0.82 + this.andares.length * 0.04 : 0.82)
    }
  }
  get explodida(): boolean { return this.alvoExplodido > 0.5 }

  girar(dx: number, dy: number): void {
    this.orbita.alvoYaw -= dx * 0.6
    this.orbita.alvoPitch = Math.max(0.45, Math.min(1.3, this.orbita.alvoPitch + dy * 0.4))
  }

  escalar(f: number): void {
    this.orbita.alvoRaio = Math.max(5, Math.min(14, this.orbita.alvoRaio / f))
  }

  // ---------- Animação ----------

  private quadro = (): void => {
    const dt = Math.min(0.05, this.relogio.getDelta())
    const t = this.relogio.elapsedTime
    if (!this.aberta && this.sumindo && this.canvas) {
      const k = Math.min(1, (performance.now() - this.sumindo) / 450)
      this.canvas.style.opacity = String(1 - k)
      if (k >= 1) {
        cancelAnimationFrame(this.raf)
        this.raf = 0
        this.canvas.hidden = true
        this.limparPalco()
        return
      }
    }
    // Câmera em órbita em volta do centro da mesa
    const o = this.orbita
    o.yaw = suave(o.yaw, o.alvoYaw, 0.08); o.pitch = suave(o.pitch, o.alvoPitch, 0.08); o.raio = suave(o.raio, o.alvoRaio, 0.08)
    this.foco.lerp(this.alvoFoco, 0.08)
    const alvo = this.foco
    this.camera.position.set(alvo.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.raio, alvo.y + Math.sin(o.pitch) * o.raio, alvo.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.raio)
    this.camera.lookAt(alvo)
    this.animar(dt, t, this.camera.position)
    this.renderer?.render(this.cena, this.camera)
    this.raf = requestAnimationFrame(this.quadro)
  }

  /** Um passo da animação. `camera`: onde está quem olha, no espaço da mesa (a FRIDAY vira para lá). */
  animar(dt: number, t: number, camera: THREE.Vector3): void {
    if (!this.canvas) this.foco.lerp(this.alvoFoco, 0.08)
    this.uniMesa.uTime.value = t
    this.uniMesa.uSweep.value = ((t * 0.35) % 1.4) * FUNDO - FUNDO * 0.7

    // Cartões: o da frente sobe e cresce; os outros se afastam em arco e apagam
    this.posicao = suave(this.posicao, this.indice, 0.12)
    this.malhasCartoes.forEach((m, i) => {
      const k = i - this.posicao
      const longe = Math.abs(k)
      m.visible = longe < 4.6
      if (!m.visible) return
      const frente = Math.max(0, 1 - longe)
      m.position.set(k * 1.85, 0.42 + frente * 0.35 + Math.sin(t * 1.3 + i) * 0.02, 0.35 + longe * longe * 0.12 - frente * 0.25)
      m.rotation.set(-1.0 + frente * 0.35, -k * 0.18, 0)
      m.scale.setScalar(0.88 + frente * 0.3)
      ;(m.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 1 - longe * 0.32)
    })

    // Explodir: peças do design se afastam com etiqueta; andares do prédio se abrem
    this.explodido = suave(this.explodido, this.alvoExplodido, 0.08)
    for (const p of this.partes) {
      p.grupo.position.copy(p.direcao).multiplyScalar(this.explodido)
      if (p.rotulo) p.rotulo.material.opacity = Math.max(0, (this.explodido - 0.4) / 0.6)
    }
    this.andares.forEach((a, i) => {
      a.grupo.position.y = a.base + this.explodido * i * 0.32
      if (a.estado === 'falha') a.preenchimento.opacity = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(t * 5))
    })
    if (this.modo === 'design') { this.giroModelo += dt * 0.35; this.palco.rotation.y = this.giroModelo }
    this.emissor.rotation.y = -t * 0.2

    this.mini.atualizar(dt, t, this.estado() === 'falando', camera)
  }
}
