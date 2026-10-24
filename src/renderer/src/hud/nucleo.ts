// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Núcleo 3D da FRIDAY: holograma de partículas em fita de Möbius, projetado de uma base.
// A fita reage ao nível real do áudio (sua voz quando ela ouve, a voz dela quando fala).

import * as THREE from 'three'

export type Estado = 'repouso' | 'ouvindo' | 'pensando' | 'falando' | 'alerta' | 'silenciada' | 'offline' | 'semMic'

interface Visual {
  a: string; b: string; flow: number; morph: number; width: number; jit: number; spin: number; scatter: number; dim: number; gap: number; sonar: number; rotulo: string
}

export const ESTADOS: Record<Estado, Visual> = {
  repouso: { a: '#4E8FE8', b: '#BFDCFF', flow: 0.1, morph: 0, width: 0.42, jit: 0, spin: 0.1, scatter: 0, dim: 1, gap: 0, sonar: 0, rotulo: 'EM REPOUSO' },
  ouvindo: { a: '#6FB8FF', b: '#EAF4FF', flow: 0.22, morph: 0, width: 0.58, jit: 0, spin: 0.16, scatter: 0, dim: 1, gap: 0, sonar: 0.35, rotulo: 'OUVINDO' },
  pensando: { a: '#8E7CFF', b: '#E2DCFF', flow: 1.1, morph: 1, width: 0.36, jit: 0, spin: 0.45, scatter: 0, dim: 1, gap: 0, sonar: 0, rotulo: 'PENSANDO' },
  falando: { a: '#36D6EE', b: '#E4FEFF', flow: 0.34, morph: 0, width: 0.5, jit: 0, spin: 0.18, scatter: 0, dim: 1, gap: 0, sonar: 1, rotulo: 'FALANDO' },
  alerta: { a: '#FF8A3D', b: '#FFD8BC', flow: 0.12, morph: 0, width: 0.46, jit: 0.05, spin: 0.08, scatter: 0, dim: 1, gap: 0, sonar: 0, rotulo: 'CONFIRMAÇÃO' },
  silenciada: { a: '#5E6A86', b: '#9AA6C2', flow: 0.03, morph: 0, width: 0.3, jit: 0, spin: 0.03, scatter: 0, dim: 0.42, gap: 0, sonar: 0, rotulo: 'SILENCIADA' },
  offline: { a: '#E5566B', b: '#FFB3BE', flow: 0.05, morph: 0, width: 0.42, jit: 0.02, spin: 0.04, scatter: 0.55, dim: 0.75, gap: 0, sonar: 0, rotulo: 'SEM CONEXÃO' },
  semMic: { a: '#F2C14E', b: '#FFE7A8', flow: 0.08, morph: 0, width: 0.42, jit: 0, spin: 0.06, scatter: 0, dim: 0.85, gap: 0.22, sonar: 0, rotulo: 'SEM MICROFONE' }
}

const SHAPE = /* glsl */ `
  attribute float aU, aV, aSeed;
  uniform float uTime, uPhase, uAmp, uMorph, uWidth, uJit, uScatter, uGap;
  varying float vHide;
  vec3 mobius(float u, float v){
    float w = uWidth*v, c = cos(u*.5);
    return vec3((1.35 + w*c)*cos(u), w*sin(u*.5), (1.35 + w*c)*sin(u));
  }
  vec3 knot(float u, float v, float s){
    float r = .5*(2.0 + cos(3.0*u));
    vec3 c = vec3(r*cos(2.0*u), .5*sin(3.0*u), r*sin(2.0*u));
    float a = s*6.283;
    return c + vec3(cos(2.0*u),0.0,sin(2.0*u))*cos(a)*.13*abs(v) + vec3(0.0,1.0,0.0)*sin(a)*.13*abs(v);
  }
  vec3 shape(out float u){
    u = aU + uPhase;
    vec3 p = mix(mobius(u, aV), knot(u, aV, aSeed), uMorph);
    p.y += sin(u*6.0 - uTime*6.0)*uAmp*.11*(.4 + abs(aV));
    p.xz *= 1.0 + uAmp*.035*sin(u*3.0 + uTime*4.0);
    p += (vec3(fract(aSeed*91.7), fract(aSeed*53.3), fract(aSeed*27.1)) - .5)*uJit*(.5 + .5*sin(uTime*40.0 + aSeed*20.0));
    p += normalize(p + vec3(.0001))*uScatter*(.25 + aSeed*1.3)*(.6 + .4*sin(uTime*1.5 + aSeed*40.0));
    vHide = step(mod(u, 6.2832), uGap*6.2832);
    return p;
  }`

export class Nucleo {
  private renderer: THREE.WebGLRenderer
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  private scene = new THREE.Scene()
  private tilt = new THREE.Group()
  private holo = new THREE.Group()
  private uni = {
    uTime: { value: 0 }, uPhase: { value: 0 }, uAmp: { value: 0 }, uMorph: { value: 0 }, uWidth: { value: 0.42 }, uJit: { value: 0 },
    uScatter: { value: 0 }, uDim: { value: 1 }, uGap: { value: 0 }, uSize: { value: 15 }, uPixel: { value: 1 },
    uColA: { value: new THREE.Color(ESTADOS.repouso.a) }, uColB: { value: new THREE.Color(ESTADOS.repouso.b) }
  }
  private sonarU = { uColA: this.uni.uColA, uWave: { value: 0 }, uSonar: { value: 0 }, uAmp: this.uni.uAmp }
  private mats: { cor: THREE.Color[]; brilhoBase: THREE.SpriteMaterial; brilhoCentro: THREE.SpriteMaterial; poeira: THREE.PointsMaterial }
  private grid: THREE.PolarGridHelper
  private aneis: THREE.Group[] = []
  private orbitas: THREE.Points[] = []
  private estado: Estado = 'repouso'
  private nivel = 0
  private compacto = true
  private raf = 0
  private amp = 0; private flow = 0.1; private spin = 0.1; private t = 0; private phase = 0; private ultimo = 0; private anterior = performance.now()
  private reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(private el: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.uni.uPixel.value = this.renderer.getPixelRatio()
    el.prepend(this.renderer.domElement)
    this.scene.add(this.tilt)
    this.holo.position.y = 0.15
    this.tilt.add(this.holo)

    this.criarFita()
    const { grid, brilhoBase } = this.criarBase()
    this.grid = grid
    const brilhoCentro = this.sprite(0.25, 1.2)
    this.holo.add(brilhoCentro.sprite)
    const poeira = new THREE.PointsMaterial({ color: ESTADOS.repouso.b, size: 0.024, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
    this.orbitas = [this.orbita(220, 2.42, 0.03, poeira), this.orbita(140, 2.62, 0.02, poeira)]
    const anel = this.anel(2.15)
    this.mats = { cor: [anel], brilhoBase, brilhoCentro: brilhoCentro.mat, poeira }

    new ResizeObserver(() => this.redimensionar()).observe(el)
    this.redimensionar()
    this.raf = requestAnimationFrame(this.loop)
  }

  setEstado(e: Estado): void { this.estado = e }
  /** Nível RMS do áudio atual (0 a ~0.3). */
  setNivel(n: number): void { this.nivel = n }
  setCompacto(c: boolean): void { this.compacto = c }

  private criarFita(): void {
    const N = 9000
    const aU = new Float32Array(N), aV = new Float32Array(N), aS = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      aU[i] = Math.random() * Math.PI * 2
      aS[i] = Math.random()
      const k = Math.random()
      aV[i] = k < 0.25 ? (Math.random() < 0.5 ? -1 : 1) * (0.96 + Math.random() * 0.04) : k < 0.35 ? (Math.random() - 0.5) * 0.04 : Math.random() * 2 - 1
    }
    const g = this.geometria(aU, aV, aS)
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: SHAPE + `
        uniform float uSize, uPixel; varying float vG;
        void main(){
          float u; vec3 p = shape(u);
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          gl_Position = projectionMatrix*mv;
          float edge = smoothstep(.75, 1.0, abs(aV));
          float bx = (p.x - sin(uTime*.6)*1.9)*2.2; float band = exp(-bx*bx);
          gl_PointSize = uSize*uPixel*(.5 + aSeed*.7 + edge*.5)*(1.0 + uAmp*.6)/(-mv.z);
          vG = clamp(.32 + edge*.45 + band*.5 + uAmp*.3, 0.0, 1.2);
        }`,
      fragmentShader: `
        uniform vec3 uColA, uColB; uniform float uDim; varying float vG; varying float vHide;
        void main(){
          float r = length(gl_PointCoord - .5); if (r > .5) discard;
          gl_FragColor = vec4(mix(uColA, uColB, clamp(vG, 0.0, 1.0)), smoothstep(.5, .0, r)*vG*.85*uDim*(1.0 - vHide));
        }`
    })
    this.holo.add(new THREE.Points(g, mat))

    const linha = (alpha: number) => new THREE.ShaderMaterial({
      uniforms: { ...this.uni, uA: { value: alpha } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: SHAPE + `varying float vB; void main(){ float u; vec3 p = shape(u); float bx = (p.x - sin(uTime*.6)*1.9)*2.2; vB = exp(-bx*bx); gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform vec3 uColA; uniform float uA, uDim; varying float vB; varying float vHide; void main(){ gl_FragColor = vec4(uColA, uA*(.6 + vB)*uDim*(1.0 - vHide)); }`
    })
    const ribU: number[] = [], ribV: number[] = []
    for (let k = 0; k < 72; k++) { const u = (k / 72) * Math.PI * 2; ribU.push(u, u); ribV.push(-1, 1) }
    this.holo.add(new THREE.LineSegments(this.geometria(new Float32Array(ribU), new Float32Array(ribV)), linha(0.16)))
    const bordaU: number[] = [], bordaV: number[] = []
    for (let k = 0; k <= 720; k++) { bordaU.push((k / 720) * Math.PI * 4); bordaV.push(1) }
    this.holo.add(new THREE.Line(this.geometria(new Float32Array(bordaU), new Float32Array(bordaV)), linha(0.5)))
  }

  private geometria(aU: Float32Array, aV: Float32Array, aS?: Float32Array): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(aU.length * 3), 3))
    g.setAttribute('aU', new THREE.BufferAttribute(aU, 1))
    g.setAttribute('aV', new THREE.BufferAttribute(aV, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(aS ?? new Float32Array(aU.length).fill(0.5), 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
    return g
  }

  private criarBase(): { grid: THREE.PolarGridHelper; brilhoBase: THREE.SpriteMaterial } {
    const base = new THREE.Group()
    base.position.y = -1.4
    this.tilt.add(base)
    const grid = new THREE.PolarGridHelper(1.9, 16, 6, 96)
    ;(grid as unknown as { material: THREE.Material }).material = new THREE.ShaderMaterial({
      uniforms: { uColA: this.uni.uColA, uDim: this.uni.uDim }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying float vR; void main(){ vR = length(position.xz); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColA; uniform float uDim; varying float vR; void main(){ gl_FragColor = vec4(uColA, (1.0 - smoothstep(.35, 1.9, vR))*.38*uDim); }`
    })
    base.add(grid)

    const sonar = new THREE.Mesh(new THREE.CircleGeometry(1.9, 96), new THREE.ShaderMaterial({
      uniforms: this.sonarU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColA; uniform float uWave, uSonar, uAmp; varying vec2 vP;
        void main(){ float r = length(vP); float ring = smoothstep(.97, 1.0, sin(r*8.0 - uWave));
          gl_FragColor = vec4(uColA, ring*smoothstep(.12, .55, r)*(1.0 - smoothstep(.5, 1.9, r))*uSonar*(.35 + uAmp*.6)); }`
    }))
    sonar.rotation.x = -Math.PI / 2
    sonar.position.y = 0.002
    base.add(sonar)

    const feixe = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 0.2, 1.45, 96, 1, true), new THREE.ShaderMaterial({
      uniforms: { uTime: this.uni.uTime, uColA: this.uni.uColA, uAmp: this.uni.uAmp, uDim: this.uni.uDim },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime, uAmp, uDim; uniform vec3 uColA; varying vec2 vUv;
        void main(){ float a = pow(1.0 - vUv.y, 1.6)*(.10 + uAmp*.1)*(.55 + .45*sin(vUv.x*140.0 + uTime*2.0)); gl_FragColor = vec4(uColA, a*uDim); }`
    }))
    feixe.position.y = 0.72
    base.add(feixe)

    const brilho = this.sprite(0.7, 1)
    brilho.sprite.scale.set(1.1, 0.55, 1)
    base.add(brilho.sprite)
    return { grid, brilhoBase: brilho.mat }
  }

  private texturaBrilho: THREE.CanvasTexture | null = null
  private sprite(opacidade: number, escala: number): { sprite: THREE.Sprite; mat: THREE.SpriteMaterial } {
    if (!this.texturaBrilho) {
      const c = document.createElement('canvas')
      c.width = c.height = 128
      const g = c.getContext('2d')!
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
      this.texturaBrilho = new THREE.CanvasTexture(c)
    }
    const mat = new THREE.SpriteMaterial({ map: this.texturaBrilho, color: ESTADOS.repouso.a, transparent: true, opacity: opacidade, blending: THREE.AdditiveBlending, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(escala, escala, 1)
    return { sprite, mat }
  }

  private anel(raio: number): THREE.Color {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * raio, 0, Math.sin(a) * raio)) }
    const m = new THREE.LineDashedMaterial({ color: ESTADOS.repouso.a, dashSize: 0.5, gapSize: 0.14, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m)
    l.computeLineDistances()
    const g = new THREE.Group()
    g.add(l)
    this.holo.add(g)
    this.aneis.push(g)
    return m.color
  }

  private orbita(n: number, raio: number, espalhar: number, mat: THREE.PointsMaterial): THREE.Points {
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.01, r = raio + (Math.random() - 0.5) * espalhar
      p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = (Math.random() - 0.5) * 0.015; p[i * 3 + 2] = Math.sin(a) * r
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    const pts = new THREE.Points(g, mat)
    this.holo.add(pts)
    return pts
  }

  private redimensionar(): void {
    const w = this.el.clientWidth, h = this.el.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    const d = this.camera.aspect < 1.1 ? 6.3 / Math.max(this.camera.aspect / 1.1, 0.5) : 6.3
    this.camera.position.set(0, d * 0.3, d)
    this.camera.lookAt(0, -0.25, 0)
    this.camera.updateProjectionMatrix()
  }

  private alvoAmp(): number {
    const t = this.t, n = this.nivel
    switch (this.estado) {
      case 'falando': return Math.min(1, 0.15 + n * 3.2)
      case 'ouvindo': return Math.min(0.8, 0.08 + n * 4)
      case 'pensando': return 0.15 + Math.sin(t * 3) * 0.06
      case 'alerta': return 0.2 + (Math.sin(t * 5) > 0 ? 0.12 : 0)
      case 'offline': return Math.random() < 0.08 ? 0.3 : 0.02
      case 'silenciada': case 'semMic': return 0
      default: return Math.min(0.4, 0.05 + Math.sin(t * 0.8) * 0.03 + n * 2)
    }
  }

  private loop = (agora: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    // Economia de GPU: 30 fps no HUD aberto, 15 fps parada no canto
    const fps = this.compacto && (this.estado === 'repouso' || this.estado === 'silenciada') ? 15 : 30
    if (document.hidden || agora - this.ultimo < 1000 / fps) return
    this.ultimo = agora
    const mov = this.reduzido ? 0.3 : 1
    const dt = Math.min((agora - this.anterior) / 1000, 0.1)
    this.anterior = agora
    this.t += dt * mov

    const v = ESTADOS[this.estado]
    const cA = new THREE.Color(v.a), cB = new THREE.Color(v.b), u = this.uni
    u.uColA.value.lerp(cA, 0.07); u.uColB.value.lerp(cB, 0.07)
    for (const c of this.mats.cor) c.lerp(cA, 0.07)
    this.mats.brilhoBase.color.lerp(cA, 0.07); this.mats.brilhoCentro.color.lerp(cA, 0.07); this.mats.poeira.color.lerp(cB, 0.07)
    this.flow += (v.flow - this.flow) * 0.05
    this.spin += (v.spin - this.spin) * 0.05
    u.uMorph.value += (v.morph - u.uMorph.value) * 0.07
    u.uWidth.value += (v.width - u.uWidth.value) * 0.06
    u.uJit.value += (v.jit - u.uJit.value) * 0.1
    u.uScatter.value += (v.scatter - u.uScatter.value) * 0.04
    u.uDim.value += (v.dim - u.uDim.value) * 0.06
    u.uGap.value += (v.gap - u.uGap.value) * 0.06
    this.amp += (this.alvoAmp() - this.amp) * 0.25

    this.phase += dt * this.flow * mov
    u.uTime.value = this.t; u.uPhase.value = this.phase; u.uAmp.value = this.amp * mov
    this.holo.rotation.y += dt * this.spin * mov
    this.holo.position.y = 0.15 + Math.sin(this.t * 0.9) * 0.04
    this.aneis[0].rotation.y -= dt * this.spin * 0.8 * mov
    this.orbitas[0].rotation.y -= dt * this.spin * 0.5 * mov
    this.orbitas[1].rotation.y += dt * this.spin * 0.3 * mov
    this.grid.rotation.y += dt * 0.05 * mov
    this.sonarU.uSonar.value += (v.sonar - this.sonarU.uSonar.value) * 0.08
    this.sonarU.uWave.value += dt * (2.5 + this.amp * 6) * mov
    this.mats.brilhoCentro.opacity = (0.18 + this.amp * 0.35) * u.uDim.value
    this.mats.brilhoBase.opacity = (0.55 + this.amp * 0.4) * u.uDim.value
    this.animarCena(agora)
    this.renderer.render(this.scene, this.camera)
  }

  /** Valores para as leituras matemáticas nos cantos do HUD. */
  // ---------- Cena holográfica em partículas ----------
  private cena: {
    pontos: THREE.Points
    mat: THREE.ShaderMaterial
    centro: THREE.Vector3
    largura: number
    altura: number
    inicio: number
    saidaEm: number
    aoSair: () => void
  } | null = null
  private deslocamento = 0
  private static readonly GIRO = -0.42

  /**
   * A foto vira partículas: cada uma pega o brilho de um pixel, sai da fita de Möbius,
   * voa em espiral até o seu lugar e monta a imagem em relevo. Na saída, volta para a fita.
   */
  mostrarCena(dataUrl: string, duracaoMs: number, aoSair: () => void = () => {}): void {
    this.esconderCena(true)
    const img = new Image()
    img.onload = () => {
      const largura = 2.1
      const amostraL = 170
      const amostraA = Math.max(40, Math.min(200, Math.round(amostraL * img.height / Math.max(1, img.width))))
      const tela = document.createElement('canvas')
      tela.width = amostraL
      tela.height = amostraA
      const g = tela.getContext('2d', { willReadFrequently: true })
      if (!g) return
      g.drawImage(img, 0, 0, amostraL, amostraA)
      const px = g.getImageData(0, 0, amostraL, amostraA).data
      const altura = largura * amostraA / amostraL
      const centro = new THREE.Vector3(1.55 + largura / 2, 0.35, 0.35)
      const cs = Math.cos(Nucleo.GIRO), sn = Math.sin(Nucleo.GIRO)
      const alvo: number[] = [], origem: number[] = [], lum: number[] = [], semente: number[] = []
      for (let y = 0; y < amostraA; y++) {
        for (let x = 0; x < amostraL; x++) {
          const i = (y * amostraL + x) * 4
          const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255
          if (l < 0.07 && Math.random() > 0.15) continue
          const lx = (x / amostraL - 0.5 + (Math.random() - 0.5) / amostraL) * largura
          const ly = (0.5 - y / amostraA + (Math.random() - 0.5) / amostraA) * altura
          const lz = (l - 0.35) * 0.38
          alvo.push(centro.x + lx * cs + lz * sn, centro.y + ly, centro.z - lx * sn + lz * cs)
          // Ponto de partida: um lugar aleatório da fita
          const u = Math.random() * Math.PI * 2, v = Math.random() * 2 - 1, w = 0.42 * v, cu = Math.cos(u * 0.5)
          origem.push((1.35 + w * cu) * Math.cos(u), w * Math.sin(u * 0.5) + 0.15, (1.35 + w * cu) * Math.sin(u))
          lum.push(l)
          semente.push(Math.random())
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(alvo), 3))
      geo.setAttribute('aOrigem', new THREE.BufferAttribute(new Float32Array(origem), 3))
      geo.setAttribute('aLum', new THREE.BufferAttribute(new Float32Array(lum), 1))
      geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(semente), 1))
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6)
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: this.uni.uTime, uColA: this.uni.uColA, uColB: this.uni.uColB, uDim: this.uni.uDim, uPixel: this.uni.uPixel,
          uProg: { value: 0 }, uSaida: { value: 0 }, uVarre: { value: 0 }
        },
        vertexShader: /* glsl */ `
          attribute vec3 aOrigem; attribute float aLum, aSeed;
          uniform float uTime, uProg, uSaida, uPixel, uVarre; varying float vLum, vA, vBrilho;
          float suave(float x){ return x*x*(3.0 - 2.0*x); }
          vec3 voo(vec3 de, vec3 para, float t, float s){
            vec3 meio = mix(de, para, .5) + vec3(sin(s*40.0)*.6, .9 + s*.8, cos(s*37.0)*.6);
            return mix(mix(de, meio, t), mix(meio, para, t), t);
          }
          void main(){
            float ida = suave(clamp(uProg*1.6 - aSeed*.6, 0.0, 1.0));
            float volta = suave(clamp(uSaida*1.6 - (1.0 - aSeed)*.6, 0.0, 1.0));
            vec3 p = voo(aOrigem, position, ida, aSeed);
            p.z += sin(position.x*5.0 + uTime*2.2) * .03 * ida;
            p.y += sin(position.x*3.0 - uTime*1.6 + aSeed*6.0) * .006 * ida;
            p = mix(p, voo(aOrigem, position, 1.0 - volta, aSeed), step(.0001, uSaida));
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float voando = 1.0 - smoothstep(.85, 1.0, ida) + volta;
            gl_PointSize = uPixel * (5.0 + aLum*9.0 + voando*6.0) / -mv.z;
            vLum = aLum;
            vA = (.25 + aLum*.95) * (1.0 - smoothstep(.85, 1.0, volta));
            float dx = (position.x - uVarre)*2.5;
            vBrilho = exp(-dx*dx) * ida * (1.0 - volta) + voando*.6;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColA, uColB; uniform float uDim; varying float vLum, vA, vBrilho;
          void main(){
            float r = length(gl_PointCoord - .5); if (r > .5) discard;
            vec3 cor = mix(uColA, uColB, clamp(vLum*1.15 + vBrilho*.5, 0.0, 1.0));
            gl_FragColor = vec4(cor, smoothstep(.5, .0, r) * (vA + vBrilho*.6) * uDim);
          }`
      })
      const pontos = new THREE.Points(geo, mat)
      this.tilt.add(pontos)
      const agora = performance.now()
      this.cena = { pontos, mat, centro, largura, altura, inicio: agora, saidaEm: agora + duracaoMs, aoSair }
    }
    img.src = dataUrl
  }

  /** Some com a cena (as partículas voltam para a fita, ou na hora). */
  esconderCena(naHora = false): void {
    if (!this.cena) return
    if (naHora) {
      const c = this.cena
      this.tilt.remove(c.pontos)
      c.pontos.geometry.dispose()
      c.mat.dispose()
      this.cena = null
      c.aoSair()
      return
    }
    this.cena.saidaEm = Math.min(this.cena.saidaEm, performance.now())
  }

  /** Posição (em px, dentro do núcleo) do canto inferior esquerdo da imagem, para a legenda. */
  ancoraCena(): { x: number; y: number; visivel: boolean } | null {
    const c = this.cena
    if (!c) return null
    const canto = new THREE.Vector3(
      c.centro.x - Math.cos(Nucleo.GIRO) * c.largura / 2,
      c.centro.y - c.altura / 2,
      c.centro.z + Math.sin(Nucleo.GIRO) * c.largura / 2
    ).applyMatrix4(this.tilt.matrixWorld).project(this.camera)
    const u = c.mat.uniforms
    return { x: (canto.x * 0.5 + 0.5) * this.el.clientWidth, y: (-canto.y * 0.5 + 0.5) * this.el.clientHeight, visivel: u.uProg.value > 0.75 && u.uSaida.value < 0.15 }
  }

  private animarCena(agora: number): void {
    this.deslocamento += ((this.cena ? -0.75 : 0) - this.deslocamento) * 0.05
    this.tilt.position.x = this.deslocamento
    const c = this.cena
    if (!c) return
    const u = c.mat.uniforms
    u.uProg.value = Math.min(1, (agora - c.inicio) / (this.reduzido ? 300 : 2200))
    u.uSaida.value = agora > c.saidaEm ? Math.min(1, (agora - c.saidaEm) / (this.reduzido ? 300 : 1800)) : 0
    const vao = c.largura * Math.cos(Nucleo.GIRO) + 0.8
    u.uVarre.value = c.centro.x + ((((agora - c.inicio) / 3800) % 1) - 0.5) * vao
    if (u.uSaida.value >= 1) this.esconderCena(true)
  }

  leituras(): { fase: number; tempo: number; lambda: number } {
    return { fase: this.phase % (Math.PI * 2), tempo: this.t, lambda: this.amp * this.uni.uWidth.value }
  }

  destruir(): void { cancelAnimationFrame(this.raf); this.renderer.dispose() }
}
