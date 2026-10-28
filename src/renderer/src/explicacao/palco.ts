// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Palco da explicação: um rio de partículas sai da fita e corre até um ponto de fuga, cercado por
// linhas e arcos de radar. Cada palavra-chave da fala é montada com essas partículas, em matriz de
// pontos e em perspectiva; quando vem a próxima, as partículas voam de uma palavra para a outra.

import * as THREE from 'three'

const N = 7200
const MAX_NA_PALAVRA = Math.floor(N * 0.66)
const COR_FLUXO = new THREE.Color('#6FB8FF')
const COR_PALAVRA = new THREE.Color('#EAF6FF')
const COR_ALERTA = new THREE.Color('#FF4A5C')
const FONTE = 'Tektur'

const PONTO_VERT = /* glsl */ `
  attribute vec3 aCor;
  attribute float aTam;
  uniform float uPixel, uAlfa;
  varying vec3 vCor;
  varying float vA;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = aTam * uPixel * (28.0 / dist);
    vCor = aCor;
    vA = uAlfa * clamp(1.15 - (dist - 11.0) / 26.0, 0.12, 1.0);
  }`
const PONTO_FRAG = /* glsl */ `
  varying vec3 vCor;
  varying float vA;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vCor * a * vA * 1.35, a * vA);
  }`

const LINHA_VERT = /* glsl */ `
  attribute float aBrilho;
  varying float vB;
  void main(){ vB = aBrilho; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const LINHA_FRAG = /* glsl */ `
  uniform vec3 uCor;
  uniform float uAlfa, uPulso;
  varying float vB;
  void main(){ float b = vB * uAlfa * (1.0 + uPulso * 1.6); gl_FragColor = vec4(uCor * b, b); }`

const fract = (x: number) => x - Math.floor(x)
const suave = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

/** Pontos de uma palavra desenhada em matriz: [x, y, ...] em unidades de altura da letra, e a largura. */
function amostrarTexto(texto: string, quantos: number): { pts: Float32Array; largura: number } {
  const tam = 150
  const fonte = `700 ${tam}px ${FONTE}, 'Bahnschrift', 'Segoe UI', sans-serif`
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.font = fonte
  // Frases longas quebram em duas linhas
  let linhas = [texto]
  if (texto.includes(' ') && ctx.measureText(texto).width > tam * 7) {
    const meio = texto.length / 2
    let corte = -1
    for (let i = 0; i < texto.length; i++) if (texto[i] === ' ' && (corte < 0 || Math.abs(i - meio) < Math.abs(corte - meio))) corte = i
    linhas = [texto.slice(0, corte), texto.slice(corte + 1)]
  }
  const larg = Math.max(...linhas.map((l) => ctx.measureText(l).width))
  const alturaLinha = tam * 1.05
  cv.width = Math.ceil(larg + 40)
  cv.height = Math.ceil(alturaLinha * linhas.length + 50)
  ctx.font = fonte
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  linhas.forEach((l, i) => ctx.fillText(l, cv.width / 2, 25 + alturaLinha * (i + 0.5)))
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data
  let cheios = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 140) cheios++
  const passo = Math.max(2, Math.round(Math.sqrt(cheios / quantos)))
  const pts: number[] = []
  for (let y = 0; y < cv.height; y += passo) {
    for (let x = 0; x < cv.width; x += passo) {
      if (d[(y * cv.width + x) * 4 + 3] > 140) pts.push((x - cv.width / 2) / tam, -(y - cv.height / 2) / tam)
    }
  }
  return { pts: new Float32Array(pts), largura: larg / tam }
}

export class Palco {
  private renderer: THREE.WebGLRenderer
  private cena = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200)
  private geo = new THREE.BufferGeometry()
  private pos = new Float32Array(N * 3)
  private cor = new Float32Array(N * 3)
  private tam = new Float32Array(N)
  private ini = new Float32Array(N * 3)
  private ctl = new Float32Array(N * 3)
  private alvo = new Float32Array(N * 3)
  private prox = new Float32Array(N * 3)
  private ctlProx = new Float32Array(N * 3)
  private corAlvo = new Float32Array(N * 3)
  private corProx = new Float32Array(N * 3)
  private xn = new Float32Array(N)
  private modo = new Uint8Array(N) // 0 fluxo, 1 palavra, 2 volta para a fita
  private proxModo = new Uint8Array(N)
  private viagem = new Uint8Array(N) // 0 parada, 1 esperando a vez, 2 voando
  private t0 = new Float32Array(N)
  private dur = new Float32Array(N)
  private semente = new Float32Array(N)
  private naPalavra = 0
  private tPalavra = -10

  private origem = new THREE.Vector3(-6.5, -2.6, -1)
  private fuga = new THREE.Vector3(6.5, 1.9, -18)
  private plano = new THREE.Matrix4().compose(
    new THREE.Vector3(-0.35, 0.5, 0.6),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.06, -0.42, 0.035)),
    new THREE.Vector3(1, 1, 1)
  )
  private uPontos = { uPixel: { value: 1 }, uAlfa: { value: 0 } }
  private uLinhas = { uCor: { value: COR_FLUXO.clone() }, uAlfa: { value: 0 }, uPulso: { value: 0 } }
  private arcos: THREE.LineSegments[] = []
  private corredores!: THREE.Points
  private dirCorredores: Float32Array = new Float32Array(0)
  private alfa = 0
  private alfaAlvo = 0
  private raf = 0
  private retrato = false
  private agora = 0
  private ultimo = 0
  private quadros = 0
  ativo = false

  constructor(private canvas: HTMLCanvasElement, private fonteNaTela: () => { x: number; y: number } | null = () => null) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.camera.position.set(0, 0, 11)
    for (let i = 0; i < N; i++) {
      this.semente[i] = Math.random()
      this.tam[i] = 0
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aCor', new THREE.BufferAttribute(this.cor, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aTam', new THREE.BufferAttribute(this.tam, 1).setUsage(THREE.DynamicDrawUsage))
    const pontos = new THREE.Points(this.geo, new THREE.ShaderMaterial({
      uniforms: this.uPontos, vertexShader: PONTO_VERT, fragmentShader: PONTO_FRAG,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    }))
    pontos.frustumCulled = false
    this.montarRadar()
    this.cena.add(pontos)
    this.redimensionar()
    window.addEventListener('resize', () => this.redimensionar())
    // Carrega a fonte das letras antes da primeira palavra
    void document.fonts?.load(`700 150px ${FONTE}`).catch(() => {})
  }

  // ---------- Radar: leque de linhas até o ponto de fuga e arcos girando ----------

  private material(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: this.uLinhas, vertexShader: LINHA_VERT, fragmentShader: LINHA_FRAG,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    })
  }

  private montarRadar(): void {
    const f = this.fuga
    // Leque
    const v: number[] = [], b: number[] = []
    const fins: THREE.Vector3[] = []
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + Math.random() * 0.08
      const fim = new THREE.Vector3(f.x + Math.cos(a) * 26 - 6, f.y + Math.sin(a) * 15, 6)
      fins.push(fim)
      v.push(f.x, f.y, f.z, fim.x, fim.y, fim.z)
      const forte = i % 5 === 0 ? 0.42 : 0.2
      b.push(forte, 0)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.setAttribute('aBrilho', new THREE.Float32BufferAttribute(b, 1))
    const leque = new THREE.LineSegments(g, this.material())
    leque.frustumCulled = false
    this.cena.add(leque)

    // Arcos em volta do ponto de fuga, com marcas
    const raios = [2.4, 4.6, 7.2, 10.5, 14]
    raios.forEach((r, k) => {
      const pv: number[] = [], pb: number[] = []
      const inicio = Math.random() * Math.PI * 2
      const vao = Math.PI * (0.7 + Math.random() * 0.9)
      const passos = 96
      for (let i = 0; i < passos; i++) {
        const a0 = inicio + (i / passos) * vao, a1 = inicio + ((i + 1) / passos) * vao
        const borda = Math.min(i, passos - i) / 10
        const br = 0.28 * Math.min(1, borda)
        pv.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0)
        pb.push(br, br)
        // Marcas a cada tantos passos
        if (i % 8 === 0) {
          const r2 = r + (k % 2 ? 0.22 : -0.22)
          pv.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a0) * r2, Math.sin(a0) * r2, 0)
          pb.push(0.35, 0.35)
        }
      }
      const ga = new THREE.BufferGeometry()
      ga.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3))
      ga.setAttribute('aBrilho', new THREE.Float32BufferAttribute(pb, 1))
      const arco = new THREE.LineSegments(ga, this.material())
      arco.position.copy(f)
      arco.position.z += 4 + k * 2.2
      arco.userData.vel = (k % 2 ? -1 : 1) * (0.04 + Math.random() * 0.06)
      arco.frustumCulled = false
      this.arcos.push(arco)
      this.cena.add(arco)
    })

    // Pontinhos correndo pelo leque em direção ao ponto de fuga
    const n = 180
    const cp = new Float32Array(n * 3)
    this.dirCorredores = new Float32Array(n * 4) // índice da linha, fase, velocidade, livre
    for (let i = 0; i < n; i++) {
      this.dirCorredores[i * 4] = Math.floor(Math.random() * fins.length)
      this.dirCorredores[i * 4 + 1] = Math.random()
      this.dirCorredores[i * 4 + 2] = 0.05 + Math.random() * 0.12
    }
    const gc = new THREE.BufferGeometry()
    gc.setAttribute('position', new THREE.BufferAttribute(cp, 3).setUsage(THREE.DynamicDrawUsage))
    this.corredores = new THREE.Points(gc, new THREE.PointsMaterial({
      color: COR_FLUXO, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }))
    this.corredores.userData.fins = fins
    this.corredores.frustumCulled = false
    this.cena.add(this.corredores)
  }

  private redimensionar(): void {
    const w = window.innerWidth, h = window.innerHeight
    const pr = Math.min(window.devicePixelRatio || 1, 1.75)
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Em telas estreitas a câmera recua para a palavra caber
    // Tela em pé (celular): palavra mais de frente, mais alta e ocupando a largura
    this.retrato = this.camera.aspect < 1
    this.camera.position.z = this.retrato ? 11 : 11 * Math.max(1, 1.6 / this.camera.aspect)
    this.plano.compose(
      this.retrato ? new THREE.Vector3(0, 1.4, 0.6) : new THREE.Vector3(-0.35, 0.5, 0.6),
      new THREE.Quaternion().setFromEuler(this.retrato ? new THREE.Euler(-0.05, -0.22, 0.02) : new THREE.Euler(-0.06, -0.42, 0.035)),
      new THREE.Vector3(1, 1, 1)
    )
    this.camera.updateProjectionMatrix()
    this.uPontos.uPixel.value = pr * (h / 1080) * 1.25
  }

  // ---------- Fluxo ----------

  private fluxo(i: number, t: number, out: Float32Array, o: number): number {
    const s = this.semente[i]
    const u = fract(s * 7.31 + t * (0.022 + 0.03 * fract(s * 3.71)))
    const O = this.origem, F = this.fuga
    const cx = (O.x + F.x) / 2 - 0.5, cy = (O.y + F.y) / 2 - 1.6, cz = (O.z + F.z) / 2 + 4
    const a1 = (1 - u) * (1 - u), a2 = 2 * u * (1 - u), a3 = u * u
    const r = (0.12 + 2.1 * Math.pow(fract(s * 5.13), 2)) * Math.pow(1 - u, 1.25) + 0.03
    const ang = s * 61 + t * (0.25 + 0.5 * fract(s * 2.3)) * (1.2 - u)
    out[o] = a1 * O.x + a2 * cx + a3 * F.x + Math.cos(ang) * r * 0.55
    out[o + 1] = a1 * O.y + a2 * cy + a3 * F.y + Math.sin(ang) * r * 0.8
    out[o + 2] = a1 * O.z + a2 * cz + a3 * F.z + Math.cos(ang * 1.3) * r * 0.6
    // Tamanho: nasce da fita, some no ponto de fuga
    return Math.min(1, u / 0.03) * Math.pow(1 - u, 0.45) * (0.55 + 0.8 * fract(s * 9.7))
  }

  // ---------- Ciclo ----------

  /** Abre o palco: as partículas saem da fita e formam o rio. */
  ligar(): void {
    const voltando = this.ativo
    this.ativo = true
    this.alfaAlvo = 1
    this.canvas.hidden = false
    if (!voltando) {
      this.atualizarOrigem()
      const t = this.agora
      for (let i = 0; i < N; i++) {
        const o = i * 3
        this.pos[o] = this.origem.x; this.pos[o + 1] = this.origem.y; this.pos[o + 2] = this.origem.z
        this.cor[o] = COR_FLUXO.r; this.cor[o + 1] = COR_FLUXO.g; this.cor[o + 2] = COR_FLUXO.b
        this.modo[i] = 2
        this.agendar(i, 0, t + Math.random() * 1.4, 0.9 + Math.random() * 0.9, COR_FLUXO, false)
      }
      this.naPalavra = 0
    }
    if (!this.raf) {
      this.ultimo = performance.now()
      this.raf = requestAnimationFrame(this.quadro)
    }
  }

  /** Fecha o palco: tudo volta para a fita e some. */
  desligar(): void {
    if (!this.ativo) return
    this.ativo = false
    this.atualizarOrigem()
    for (let i = 0; i < N; i++) this.agendar(i, 2, this.agora + Math.random() * 0.5, 0.8 + Math.random() * 0.7, COR_FLUXO, false)
    this.naPalavra = 0
    window.setTimeout(() => { if (!this.ativo) this.alfaAlvo = 0 }, 1300)
  }

  /** Monta uma palavra com as partículas. */
  palavra(texto: string, alerta = false): void {
    if (!this.ativo) this.ligar()
    const { pts, largura } = amostrarTexto(texto, 3600)
    const total = Math.min(pts.length / 2, MAX_NA_PALAVRA)
    // Escala: cabe na largura do palco e não fica alta demais
    const larguraVisivel = 2 * this.camera.position.z * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect
    const larguraMax = this.retrato ? larguraVisivel * 0.9 : 7.2 * Math.min(1, this.camera.aspect / 1.6)
    const altura = Math.min(2.6, larguraMax / Math.max(largura, 0.1))
    const linhas = pts.length / 2
    const ordem = Array.from({ length: linhas }, (_, k) => k)
    // Se tem ponto demais, pega uma amostra espalhada
    if (linhas > total) for (let k = linhas - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [ordem[k], ordem[j]] = [ordem[j], ordem[k]] }
    const escolhidos = ordem.slice(0, total).sort((a, b) => pts[a * 2] - pts[b * 2])
    const minX = pts[escolhidos[0] * 2] ?? 0, maxX = pts[escolhidos[escolhidos.length - 1] * 2] ?? 1
    const cor = alerta ? COR_ALERTA : COR_PALAVRA
    const v = new THREE.Vector3()
    const t = this.agora
    for (let k = 0; k < total; k++) {
      const idx = escolhidos[k]
      v.set(pts[idx * 2] * altura, pts[idx * 2 + 1] * altura, 0).applyMatrix4(this.plano)
      const o = k * 3
      this.prox[o] = v.x; this.prox[o + 1] = v.y; this.prox[o + 2] = v.z
      const xn = (pts[idx * 2] - minX) / Math.max(1e-3, maxX - minX)
      this.xn[k] = xn
      this.agendar(k, 1, t + 0.03 + xn * 0.32 + Math.random() * 0.1, 0.5 + Math.random() * 0.35, cor, true)
    }
    // O que sobrou da palavra anterior se desfaz e volta para o rio
    for (let k = total; k < this.naPalavra; k++) this.agendar(k, 0, t + Math.random() * 0.25, 1.1 + Math.random() * 0.9, COR_FLUXO, false)
    this.naPalavra = total
    this.tPalavra = t
  }

  /** Desfaz a palavra na tela (as partículas voltam ao rio). */
  soltarPalavra(): void {
    for (let k = 0; k < this.naPalavra; k++) this.agendar(k, 0, this.agora + Math.random() * 0.3, 1 + Math.random() * 0.8, COR_FLUXO, false)
    this.naPalavra = 0
  }

  /** Brilho nos arcos (quando entra um cartão ou o carimbo). */
  pulso(forca = 1): void { this.uLinhas.uPulso.value = Math.max(this.uLinhas.uPulso.value, forca) }

  private agendar(i: number, modo: number, quando: number, dur: number, cor: THREE.Color, paraPalavra: boolean): void {
    const o = i * 3
    this.proxModo[i] = modo
    this.viagem[i] = 1
    this.t0[i] = quando
    this.dur[i] = dur
    this.corProx[o] = cor.r; this.corProx[o + 1] = cor.g; this.corProx[o + 2] = cor.b
    // Desvio da curva: para a palavra, as partículas vêm em arco na direção da câmera;
    // para o rio, se espalham como poeira
    if (paraPalavra) {
      this.ctlProx[o] = (Math.random() - 0.5) * 1.6
      this.ctlProx[o + 1] = 0.5 + Math.random() * 1.6
      this.ctlProx[o + 2] = 1.6 + Math.random() * 2.6
    } else {
      this.ctlProx[o] = (Math.random() - 0.5) * 3.2
      this.ctlProx[o + 1] = (Math.random() - 0.5) * 2.4
      this.ctlProx[o + 2] = (Math.random() - 0.3) * 3
    }
  }

  private atualizarOrigem(): void {
    const p = this.fonteNaTela()
    if (!p) return
    const ndc = new THREE.Vector3((p.x / window.innerWidth) * 2 - 1, -(p.y / window.innerHeight) * 2 + 1, 0.5)
    ndc.unproject(this.camera)
    const dir = ndc.sub(this.camera.position).normalize()
    const k = (-1 - this.camera.position.z) / dir.z
    this.origem.copy(this.camera.position).addScaledVector(dir, k)
  }

  private quadro = (agoraMs: number): void => {
    const dt = Math.min(0.05, (agoraMs - this.ultimo) / 1000)
    this.ultimo = agoraMs
    this.agora += dt
    const t = this.agora
    if (++this.quadros % 20 === 0) this.atualizarOrigem()

    this.alfa += (this.alfaAlvo - this.alfa) * Math.min(1, dt * 2.4)
    this.uPontos.uAlfa.value = this.alfa
    this.uLinhas.uAlfa.value = this.alfa * 0.85
    this.uLinhas.uPulso.value *= Math.exp(-dt * 3)
    ;(this.corredores.material as THREE.PointsMaterial).opacity = this.alfa * 0.55

    // Câmera balançando devagar: dá volume ao palco
    this.camera.position.x = Math.sin(t * 0.13) * 0.55
    this.camera.position.y = Math.sin(t * 0.09) * 0.3
    if (this.retrato) this.camera.lookAt(0, 0.9, -3)
    else this.camera.lookAt(0.4, 0.25, -3)

    const tmp = new Float32Array(3)
    const varrer = (t - this.tPalavra) * 0.9 - 0.3 // brilho que passa pela palavra depois que ela monta
    const cr = Math.min(1, dt * 3.2)
    for (let i = 0; i < N; i++) {
      const o = i * 3
      // Hora de sair: guarda de onde parte e assume o novo destino
      if (this.viagem[i] === 1 && t >= this.t0[i]) {
        this.viagem[i] = 2
        this.ini[o] = this.pos[o]; this.ini[o + 1] = this.pos[o + 1]; this.ini[o + 2] = this.pos[o + 2]
        this.ctl[o] = this.ctlProx[o]; this.ctl[o + 1] = this.ctlProx[o + 1]; this.ctl[o + 2] = this.ctlProx[o + 2]
        this.modo[i] = this.proxModo[i]
        if (this.modo[i] === 1) { this.alvo[o] = this.prox[o]; this.alvo[o + 1] = this.prox[o + 1]; this.alvo[o + 2] = this.prox[o + 2] }
        this.corAlvo[o] = this.corProx[o]; this.corAlvo[o + 1] = this.corProx[o + 1]; this.corAlvo[o + 2] = this.corProx[o + 2]
      }
      // Destino de agora
      let tamanho = 1
      const m = this.modo[i]
      if (m === 1) {
        const s = this.semente[i]
        tmp[0] = this.alvo[o] + Math.sin(t * 2.1 + s * 40) * 0.008
        tmp[1] = this.alvo[o + 1] + Math.cos(t * 1.7 + s * 30) * 0.008
        tmp[2] = this.alvo[o + 2] + Math.sin(t * 1.3 + s * 50) * 0.02
        const dx = this.xn[i] - varrer
        tamanho = 1.6 * (1 + 1.4 * Math.exp(-(dx * dx) / 0.004)) * (0.9 + 0.2 * Math.sin(t * 5 + s * 90))
      } else if (m === 2) {
        tmp[0] = this.origem.x; tmp[1] = this.origem.y; tmp[2] = this.origem.z
        tamanho = 0.8
      } else {
        tamanho = this.fluxo(i, t, tmp, 0)
      }
      if (this.viagem[i] === 2) {
        const k = (t - this.t0[i]) / this.dur[i]
        if (k >= 1) {
          this.viagem[i] = 0
          this.pos[o] = tmp[0]; this.pos[o + 1] = tmp[1]; this.pos[o + 2] = tmp[2]
        } else {
          const e = suave(Math.max(0, k)), a = (1 - e) * (1 - e), b = 2 * e * (1 - e), c = e * e
          for (let j = 0; j < 3; j++) {
            const meio = (this.ini[o + j] + tmp[j]) / 2 + this.ctl[o + j]
            this.pos[o + j] = a * this.ini[o + j] + b * meio + c * tmp[j]
          }
          // Voando, a partícula brilha um pouco mais
          tamanho = Math.max(tamanho, 0.9) * (1 + 0.5 * Math.sin(Math.PI * e))
        }
      } else {
        // Parada ou esperando a vez: segue no lugar de agora (no rio ou na palavra)
        this.pos[o] = tmp[0]; this.pos[o + 1] = tmp[1]; this.pos[o + 2] = tmp[2]
      }
      this.tam[i] = tamanho
      for (let j = 0; j < 3; j++) this.cor[o + j] += (this.corAlvo[o + j] - this.cor[o + j]) * cr
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aCor.needsUpdate = true
    this.geo.attributes.aTam.needsUpdate = true

    // Arcos girando e pontinhos correndo pelo leque
    for (const a of this.arcos) a.rotation.z += a.userData.vel * dt
    const fins = this.corredores.userData.fins as THREE.Vector3[]
    const cp = this.corredores.geometry.attributes.position as THREE.BufferAttribute
    const d = this.dirCorredores
    for (let i = 0; i < cp.count; i++) {
      d[i * 4 + 1] = fract(d[i * 4 + 1] + d[i * 4 + 2] * dt)
      const fim = fins[d[i * 4]], f = this.fuga, u = d[i * 4 + 1]
      cp.setXYZ(i, fim.x + (f.x - fim.x) * u, fim.y + (f.y - fim.y) * u, fim.z + (f.z - fim.z) * u)
    }
    cp.needsUpdate = true

    this.renderer.render(this.cena, this.camera)

    if (!this.ativo && this.alfaAlvo === 0 && this.alfa < 0.01) {
      this.raf = 0
      this.renderer.clear()
      this.canvas.hidden = true
      return
    }
    this.raf = requestAnimationFrame(this.quadro)
  }
}
