// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// "Órbita": um mundo 3D só, atrás de todas as telas do celular. A fita de Möbius iridescente
// muda de papel em cada tela (grande na voz, auréola no chat, vista de cima nas conversas e
// nos ajustes), reage à voz e acompanha a inclinação do celular (giroscópio).

import * as THREE from 'three'
import { Projecao } from '../../src/renderer/src/hud/projecao'

export type Tela = 'voz' | 'chat' | 'conversas' | 'ajustes'
export type EstadoFita = 'repouso' | 'ouvindo' | 'falando' | 'pensando' | 'alerta' | 'offline' | 'semMic'

interface Visual { largura: number; fluxo: number; giro: number; matiz: number; brilho: number; espalhar: number }
const VISUAIS: Record<EstadoFita, Visual> = {
  repouso: { largura: 0.42, fluxo: 0.08, giro: 0.12, matiz: 0, brilho: 0.85, espalhar: 0 },
  ouvindo: { largura: 0.5, fluxo: 0.18, giro: 0.18, matiz: 0.05, brilho: 1, espalhar: 0 },
  falando: { largura: 0.54, fluxo: 0.3, giro: 0.22, matiz: 0.35, brilho: 1.2, espalhar: 0 },
  pensando: { largura: 0.34, fluxo: 1.0, giro: 0.6, matiz: 0.5, brilho: 1.05, espalhar: 0 },
  alerta: { largura: 0.46, fluxo: 0.1, giro: 0.1, matiz: 0.75, brilho: 1, espalhar: 0 },
  offline: { largura: 0.42, fluxo: 0.04, giro: 0.04, matiz: 0.85, brilho: 0.6, espalhar: 0.5 },
  semMic: { largura: 0.42, fluxo: 0.06, giro: 0.06, matiz: 0.65, brilho: 0.7, espalhar: 0.2 }
}

/**
 * Pose da fita em cada tela: posição vertical (fração da altura da tela), largura (fração da
 * largura da tela), inclinação (0 = deitada vista de lado, ~1.3 = vista de cima) e opacidade.
 */
interface Pose { y: number; largura: number; incl: number; rolar: number; alfa: number; chao: number }
const POSES: Record<Tela | 'emissor', Pose> = {
  voz: { y: 0.5, largura: 0.86, incl: 0.72, rolar: -0.25, alfa: 1, chao: 1 },
  emissor: { y: 0.78, largura: 0.3, incl: 0.25, rolar: 0, alfa: 1, chao: 1 },
  chat: { y: 0.065, largura: 0.44, incl: 0.22, rolar: 0, alfa: 0.95, chao: 0 },
  conversas: { y: 0.27, largura: 0.5, incl: 1.25, rolar: 0.35, alfa: 0.5, chao: 0 },
  ajustes: { y: 0.135, largura: 0.32, incl: 1.25, rolar: 0.35, alfa: 0.9, chao: 0 }
}

const FORMA = /* glsl */ `
  attribute float aU, aV, aSeed;
  uniform float uTime, uFase, uAmp, uLargura, uEspalhar;
  varying float vU, vBorda;
  vec3 mobius(float u, float v){
    float w = uLargura*v, c = cos(u*.5);
    return vec3((1.0 + w*c)*cos(u), w*sin(u*.5), (1.0 + w*c)*sin(u));
  }
  vec3 forma(){
    float u = aU + uFase;
    vec3 p = mobius(u, aV);
    // A voz ondula a fita
    p.y += sin(u*5.0 - uTime*7.0)*uAmp*.09*(.4 + abs(aV));
    p.xz *= 1.0 + uAmp*.04*sin(u*3.0 + uTime*5.0);
    p += normalize(p + vec3(.0001))*uEspalhar*(.2 + aSeed)*(.6 + .4*sin(uTime*1.3 + aSeed*30.0));
    vU = u; vBorda = smoothstep(.8, 1.0, abs(aV));
    return p;
  }`

/** Paleta iridescente (ciano → azul → violeta → magenta suave), deslocada pelo estado. */
const PALETA = /* glsl */ `
  uniform float uMatiz, uBrilho;
  vec3 paleta(float t){
    t = fract(t + uMatiz*.35);
    vec3 a = vec3(.37,.88,.95), b = vec3(.44,.63,1.0), c = vec3(.61,.55,1.0), d = vec3(.80,.55,1.0);
    if (t < .25) return mix(a, b, t*4.0);
    if (t < .5) return mix(b, c, (t - .25)*4.0);
    if (t < .75) return mix(c, d, (t - .5)*4.0);
    return mix(d, a, (t - .75)*4.0);
  }`

const suave = (a: number, b: number, k: number) => a + (b - a) * k

export class Mundo {
  readonly projecao: Projecao
  private renderer: THREE.WebGLRenderer
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  private cena = new THREE.Scene()
  private pose = new THREE.Group()
  private giro = new THREE.Group()
  private palco = new THREE.Group()
  private chao: THREE.Mesh
  private uni = {
    uTime: { value: 0 }, uFase: { value: 0 }, uAmp: { value: 0 }, uLargura: { value: 0.42 }, uEspalhar: { value: 0 },
    uMatiz: { value: 0 }, uBrilho: { value: 0.85 }, uAlfa: { value: 1 }, uPixel: { value: 1 }, uTam: { value: 14 },
    // Para a projeção 3D (mesmos nomes da FRIDAY do PC)
    uColA: { value: new THREE.Color('#5FE1F2') }, uColB: { value: new THREE.Color('#E7ECF7') }, uDim: { value: 1 }
  }
  private uniChao = { uTime: this.uni.uTime, uAlfa: { value: 1 }, uMatiz: this.uni.uMatiz }
  private tela: Tela = 'voz'
  private estado: EstadoFita = 'repouso'
  private nivel = 0
  private amp = 0
  private fluxo = 0.08
  private giroVel = 0.12
  private atual: Pose = { ...POSES.voz }
  private inclinacao = { x: 0, y: 0 }
  private alvoInclinacao = { x: 0, y: 0 }
  private usarGiroscopio = true
  private ultimo = 0
  private anterior = performance.now()
  private reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(private el: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.uni.uPixel.value = this.renderer.getPixelRatio()
    el.prepend(this.renderer.domElement)
    // A fita e o palco da projeção são irmãos: o palco acompanha a fita, mas sem herdar a escala dela
    this.cena.add(this.palco)
    this.cena.add(this.pose)
    this.pose.add(this.giro)
    this.criarFita()
    this.chao = this.criarChao()
    this.projecao = new Projecao(this.palco, this.uni, this.camera, el, () => this.pontoNaFita())
    new ResizeObserver(() => this.redimensionar()).observe(el)
    this.redimensionar()
    // Giroscópio: só as inclinações rápidas contam. A posição "normal" do celular vai se ajustando
    // sozinha (deitado na mesa, em pé na mão...), então a fita nunca sai do lugar.
    let base: { b: number; g: number } | null = null
    window.addEventListener('deviceorientation', (e) => {
      if (!this.usarGiroscopio || e.beta === null || e.gamma === null) return
      base ??= { b: e.beta, g: e.gamma }
      base.b += (e.beta - base.b) * 0.02
      base.g += (e.gamma - base.g) * 0.02
      this.alvoInclinacao.x = Math.max(-1, Math.min(1, (e.gamma - base.g) / 20))
      this.alvoInclinacao.y = Math.max(-1, Math.min(1, (e.beta - base.b) / 20))
    })
    document.addEventListener('visibilitychange', () => { this.anterior = performance.now() })
    requestAnimationFrame(this.quadro)
  }

  setTela(t: Tela): void { this.tela = t }
  setEstado(e: EstadoFita): void { this.estado = e }
  setNivel(n: number): void { this.nivel = n }
  /** Nível de áudio atual (para as barrinhas da tela de voz). */
  nivelAtual(): number { return this.nivel }
  setGiroscopio(ligado: boolean): void { this.usarGiroscopio = ligado; if (!ligado) this.alvoInclinacao = { x: 0, y: 0 } }

  // ---------- Construção ----------

  private atributos(n: number, f: (i: number) => [number, number, number]): THREE.BufferGeometry {
    const aU = new Float32Array(n), aV = new Float32Array(n), aS = new Float32Array(n)
    for (let i = 0; i < n; i++) { const [u, v, s] = f(i); aU[i] = u; aV[i] = v; aS[i] = s }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aU', new THREE.BufferAttribute(aU, 1))
    g.setAttribute('aV', new THREE.BufferAttribute(aV, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(aS, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
    return g
  }

  private criarFita(): void {
    // Partículas: mais nas bordas, que é o que desenha a forma
    const pontos = this.atributos(9000, () => {
      const k = Math.random()
      const v = k < 0.3 ? (Math.random() < 0.5 ? -1 : 1) * (0.95 + Math.random() * 0.05) : Math.random() * 2 - 1
      return [Math.random() * Math.PI * 2, v, Math.random()]
    })
    this.giro.add(new THREE.Points(pontos, new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: FORMA + `
        uniform float uTam, uPixel; varying float vS;
        void main(){
          vec3 p = forma();
          vec4 mv = modelViewMatrix*vec4(p, 1.0);
          gl_Position = projectionMatrix*mv;
          gl_PointSize = uTam*uPixel*(.45 + aSeed*.7 + vBorda*.6)*(1.0 + uAmp*.5)/(-mv.z);
          vS = aSeed;
        }`,
      fragmentShader: PALETA + `
        uniform float uAlfa; varying float vU, vBorda, vS;
        void main(){
          float r = length(gl_PointCoord - .5); if (r > .5) discard;
          vec3 cor = paleta(vU/6.2832 + vS*.08);
          gl_FragColor = vec4(cor*uBrilho, smoothstep(.5, .0, r)*(.35 + vBorda*.55)*uAlfa);
        }`
    })))
    const linha = (alfa: number) => new THREE.ShaderMaterial({
      uniforms: { ...this.uni, uA: { value: alfa } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: FORMA + `void main(){ vec3 p = forma(); gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.0); }`,
      fragmentShader: PALETA + `uniform float uA, uAlfa; varying float vU, vBorda; void main(){ gl_FragColor = vec4(paleta(vU/6.2832)*uBrilho, uA*uAlfa); }`
    })
    // Bordas (uma linha só que dá duas voltas: é a graça da Möbius) e as costelas
    const borda = this.atributos(900, (i) => [(i / 899) * Math.PI * 4, 1, 0.5])
    this.giro.add(new THREE.Line(borda, linha(0.8)))
    const costelas = this.atributos(160, (i) => [(Math.floor(i / 2) / 80) * Math.PI * 2, i % 2 ? 1 : -1, 0.5])
    this.giro.add(new THREE.LineSegments(costelas, linha(0.14)))
    const meio = this.atributos(400, (i) => [(i / 399) * Math.PI * 2, 0, 0.5])
    this.giro.add(new THREE.Line(meio, linha(0.18)))
  }

  /** Chão holográfico em perspectiva, que só aparece na tela de voz. */
  private criarChao(): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShaderMaterial({
      uniforms: this.uniChao, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uAlfa, uMatiz, uTime; varying vec2 vP;
        void main(){
          vec2 g = abs(fract(vP*1.4) - .5)/fwidth(vP*1.4);
          float linhaG = 1.0 - min(min(g.x, g.y), 1.0);
          float r = length(vP);
          float onda = smoothstep(.06, .0, abs(fract(r*.35 - uTime*.12) - .5) - .45);
          vec3 cor = mix(vec3(.37,.88,.95), vec3(.61,.55,1.0), uMatiz);
          gl_FragColor = vec4(cor, (linhaG*.22 + onda*.08)*smoothstep(6.5, 1.0, r)*uAlfa);
        }`
    }))
    m.rotation.x = -Math.PI / 2
    this.cena.add(m)
    return m
  }

  private pontoNaFita(): THREE.Vector3 {
    const u = Math.random() * Math.PI * 2, v = Math.random() * 2 - 1, w = this.uni.uLargura.value * v, c = Math.cos(u * 0.5)
    this.giro.updateWorldMatrix(true, false)
    const p = new THREE.Vector3((1 + w * c) * Math.cos(u), w * Math.sin(u * 0.5), (1 + w * c) * Math.sin(u)).applyMatrix4(this.giro.matrixWorld)
    // A projeção vive no "palco": converte para as coordenadas dele
    return this.palco.worldToLocal(p)
  }

  private redimensionar(): void {
    const w = this.el.clientWidth, h = this.el.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Tamanho visível (largura e altura do mundo) na distância da fita. */
  private visivel(dist: number): { w: number; h: number } {
    const h = 2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)
    return { w: h * this.camera.aspect, h }
  }

  // ---------- A cada quadro ----------

  private quadro = (agora: number): void => {
    requestAnimationFrame(this.quadro)
    const parada = this.tela !== 'voz' && this.estado === 'repouso' && !this.projecao.ativa
    if (document.hidden || agora - this.ultimo < 1000 / (parada ? 20 : 30)) return
    this.ultimo = agora
    const dt = Math.min((agora - this.anterior) / 1000, 0.1)
    this.anterior = agora
    const mov = this.reduzido ? 0.3 : 1
    const u = this.uni
    u.uTime.value += dt * mov

    // Estado: largura, fluxo, cor e brilho
    const v = VISUAIS[this.estado]
    u.uLargura.value = suave(u.uLargura.value, v.largura, 0.06)
    u.uMatiz.value = suave(u.uMatiz.value, v.matiz, 0.05)
    u.uBrilho.value = suave(u.uBrilho.value, v.brilho, 0.06)
    u.uEspalhar.value = suave(u.uEspalhar.value, v.espalhar, 0.04)
    this.fluxo = suave(this.fluxo, v.fluxo, 0.05)
    this.giroVel = suave(this.giroVel, v.giro, 0.05)
    const alvoAmp = this.estado === 'falando' ? Math.min(1, 0.15 + this.nivel * 3.2) : this.estado === 'ouvindo' ? Math.min(0.8, 0.06 + this.nivel * 4) : 0.04 + Math.sin(u.uTime.value * 0.8) * 0.02
    this.amp = suave(this.amp, alvoAmp, 0.25)
    u.uAmp.value = this.amp * mov
    u.uFase.value += dt * this.fluxo * mov
    this.giro.rotation.y += dt * this.giroVel * mov

    // Pose da tela atual (com a projeção na tela, a fita vira o emissor na base)
    const alvo = this.tela === 'voz' && this.projecao.ativa ? POSES.emissor : POSES[this.tela]
    const p = this.atual
    for (const k of Object.keys(p) as (keyof Pose)[]) p[k] = suave(p[k], alvo[k], 0.075)
    const dist = 8
    const vis = this.visivel(dist)
    const escala = (p.largura * vis.w) / 2.9
    this.pose.position.set(0, (0.5 - p.y) * vis.h, 0)
    this.pose.scale.setScalar(escala)
    this.pose.rotation.set(p.incl, 0, p.rolar)
    u.uAlfa.value = p.alfa
    u.uTam.value = 14 * Math.min(1.4, Math.max(0.45, escala * 0.9))
    this.uniChao.uAlfa.value = p.chao * (this.tela === 'voz' ? 1 : 0)
    this.chao.position.set(0, (0.5 - p.y) * vis.h - escala * 1.25, 0)
    // A projeção fica acima do emissor
    this.palco.position.set(0, this.pose.position.y + 0.3, 0)
    this.palco.scale.setScalar(Math.min(1, (vis.w * 0.7) / 2.9))

    // Giroscópio: a fita gira junto com a inclinação do celular (sem sair do lugar na tela)
    this.inclinacao.x = suave(this.inclinacao.x, this.alvoInclinacao.x, 0.08)
    this.inclinacao.y = suave(this.inclinacao.y, this.alvoInclinacao.y, 0.08)
    this.pose.rotation.x += this.inclinacao.y * 0.35
    this.pose.rotation.y += this.inclinacao.x * 0.45
    this.chao.rotation.z = this.inclinacao.x * 0.12
    this.camera.position.set(0, 0, dist)
    this.camera.lookAt(0, 0, 0)

    this.projecao.animar(agora, dt, this.reduzido)
    this.renderer.render(this.cena, this.camera)
  }

  /** Retângulo da fita na tela (para o botão invisível de tocar para falar). */
  areaDaFita(): { x: number; y: number; w: number; h: number } {
    const p = POSES.voz, W = this.el.clientWidth, H = this.el.clientHeight
    const w = p.largura * W
    return { x: (W - w) / 2, y: p.y * H - w * 0.55, w, h: w * 1.1 }
  }
}
