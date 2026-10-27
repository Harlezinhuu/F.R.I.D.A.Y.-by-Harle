// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Projeção 3D: as partículas saem da fita de Möbius e montam o objeto em cima da base,
// com o wireframe por cima, como o holograma da máquina do tempo. Tudo é controlado por voz
// (e, na onda da câmera, pelas mãos): girar, aproximar, explodir as peças, inverter, cortar,
// renderizar a superfície, medir e salvar.

import * as THREE from 'three'
import type { Modelo3D, Parte } from '../projetor/tipos'

export type AcaoProjecao =
  | 'girar' | 'parar' | 'esquerda' | 'direita' | 'virar' | 'frente' | 'cima' | 'lado'
  | 'aproximar' | 'afastar' | 'explodir' | 'juntar' | 'inverter' | 'desinverter'
  | 'cortar' | 'tirar_corte' | 'renderizar' | 'so_linhas' | 'particulas' | 'medir' | 'fechar'

export interface Compartilhados {
  uTime: { value: number }
  uColA: { value: THREE.Color }
  uColB: { value: THREE.Color }
  uDim: { value: number }
  uPixel: { value: number }
}

export interface Rotulo { nome: string; x: number; y: number; ax: number; ay: number }

/** Tamanho do holograma (maior lado), em unidades da cena */
const TAMANHO = 2.9
const ALTURA_CENTRO = 0.6
const MAX_PARTICULAS = 16_000
const MAX_ARESTAS = 9_000
const MAX_TRIANGULOS = 120_000
const LARANJA = new THREE.Color('#FF9A4A')

const INVERSAO = /* glsl */ `
  // "Inverter": inversão esférica, a forma vira do avesso em relação ao centro (o "inverted" do filme)
  vec3 inverter(vec3 p){
    float r2 = max(dot(p, p), .05);
    vec3 q = p * (.9 / r2);
    float l = length(q);
    return l > 2.2 ? q * (2.2 / l) : q;
  }`

const suaveAte = (atual: number, alvo: number, k: number) => atual + (alvo - atual) * k

export class Projecao {
  private raiz = new THREE.Group()
  private orient = new THREE.Group()
  private giro = new THREE.Group()
  private modelo: Modelo3D | null = null
  private pontos: THREE.Points | null = null
  private linhas: THREE.LineSegments | null = null
  private malha: THREE.Mesh | null = null
  private caixa: THREE.LineSegments | null = null
  private centros: THREE.Vector3[] = []
  private explosoes: THREE.Vector3[] = []
  private inicio = 0
  private saindo = 0
  private aoSair: () => void = () => {}
  private girando = true
  private giroY = 0
  private alvoY = 0
  private alvoOrient = new THREE.Euler()
  private escala = 1
  private alvoEscala = 1
  private alvo = { explode: 0, inverte: 0, corte: 9, render: 0, part: 1, linhas: 1 }
  private cortando = false
  private medindo = false
  private dims = new THREE.Vector3(1, 1, 1)
  /** Ampliação das formas animadas (que não são reescaladas ponto a ponto) */
  private ampliar = 1
  private relInv = new THREE.Matrix4()
  private tiltInv = new THREE.Matrix4()
  private uni = {
    uProg: { value: 0 }, uSaida: { value: 0 }, uExplode: { value: 0 }, uInverte: { value: 0 }, uCorte: { value: 9 },
    uRender: { value: 0 }, uVarre: { value: 0 }, uPart: { value: 1 }, uLinhas: { value: 1 }, uInv: { value: new THREE.Matrix4() },
    uLaranja: { value: LARANJA }, uSelecao: { value: -1 }
  }

  constructor(private pai: THREE.Group, private comp: Compartilhados, private camera: THREE.Camera, private el: HTMLElement, private origemNaFita: () => THREE.Vector3) {
    this.raiz.position.y = ALTURA_CENTRO
    this.raiz.add(this.orient)
    this.orient.add(this.giro)
  }

  get ativa(): boolean { return !!this.modelo }
  get nome(): string { return this.modelo?.nome ?? '' }
  get explodida(): boolean { return this.alvo.explode > 0 }

  // ---------- Montar ----------

  mostrar(m: Modelo3D, aoSair: () => void = () => {}): void {
    this.descartar()
    const partes = this.prepararPartes(m)
    if (!partes.length) throw new Error('O modelo veio vazio.')
    this.modelo = { ...m, partes }
    this.aoSair = aoSair
    this.calcularExplosoes(partes)
    this.criarPontos(partes)
    this.criarLinhas(partes)
    this.criarMalha(partes)
    this.criarCaixa()
    // Estado inicial de cada nova projeção
    Object.assign(this.alvo, { explode: 0, inverte: 0, corte: 9, render: 0, part: 1, linhas: 1 })
    this.uni.uExplode.value = 0; this.uni.uInverte.value = 0; this.uni.uCorte.value = 9; this.uni.uRender.value = 0
    this.uni.uPart.value = 1; this.uni.uLinhas.value = 1; this.uni.uSaida.value = 0; this.uni.uProg.value = 0
    this.uni.uSelecao.value = -1
    this.selecionada = -1
    this.cortando = false
    this.medindo = false
    this.girando = true
    this.giroY = this.alvoY = 0
    this.alvoOrient.set(0, 0, 0)
    this.orient.rotation.set(0, 0, 0)
    this.escala = this.alvoEscala = 1
    this.giro.scale.setScalar(this.ampliar)
    this.pai.add(this.raiz)
    this.inicio = performance.now()
    this.saindo = 0
  }

  /** Centraliza e ajusta o tamanho; corta partículas e linhas demais para não pesar. */
  private prepararPartes(m: Modelo3D): Parte[] {
    let partes = m.partes.filter((p) => p.pontos.length >= 3)
    this.ampliar = 1
    if (!m.normalizado) {
      const caixa = new THREE.Box3()
      const v = new THREE.Vector3()
      for (const p of partes) for (let i = 0; i < p.pontos.length; i += 3) caixa.expandByPoint(v.set(p.pontos[i], p.pontos[i + 1], p.pontos[i + 2]))
      const centro = caixa.getCenter(new THREE.Vector3())
      const tam = caixa.getSize(new THREE.Vector3())
      const k = TAMANHO / Math.max(tam.x, tam.y, tam.z, 1e-6)
      const ajustar = (a: Float32Array | undefined) => {
        if (!a) return
        for (let i = 0; i < a.length; i += 3) { a[i] = (a[i] - centro.x) * k; a[i + 1] = (a[i + 1] - centro.y) * k; a[i + 2] = (a[i + 2] - centro.z) * k }
      }
      for (const p of partes) { ajustar(p.pontos); ajustar(p.arestas); ajustar(p.triangulos) }
      this.dims.copy(tam).multiplyScalar(k)
    } else {
      // Formas animadas já vêm centradas: em vez de mexer nos números (que mudam a cada quadro),
      // o grupo inteiro é ampliado para o tamanho do holograma
      const caixa = new THREE.Box3()
      const v = new THREE.Vector3()
      for (const p of partes) for (let i = 0; i < p.pontos.length; i += 3) caixa.expandByPoint(v.set(p.pontos[i], p.pontos[i + 1], p.pontos[i + 2]))
      caixa.getSize(this.dims)
      this.ampliar = TAMANHO / Math.max(this.dims.x, this.dims.y, this.dims.z, 1e-6)
    }
    // Orçamento: no máximo MAX_PARTICULAS no total, divididas entre as partes
    const total = partes.reduce((s, p) => s + p.pontos.length / 3, 0)
    if (total > MAX_PARTICULAS && !m.animar) {
      const f = MAX_PARTICULAS / total
      partes = partes.map((p) => ({ ...p, pontos: amostrar(p.pontos, 3, Math.max(1, Math.round((p.pontos.length / 3) * f))) }))
    }
    const totalArestas = partes.reduce((s, p) => s + p.arestas.length / 6, 0)
    if (totalArestas > MAX_ARESTAS && !m.animar) {
      const f = MAX_ARESTAS / totalArestas
      partes = partes.map((p) => ({ ...p, arestas: amostrar(p.arestas, 6, Math.round((p.arestas.length / 6) * f)) }))
    }
    const totalTri = partes.reduce((s, p) => s + (p.triangulos?.length ?? 0) / 9, 0)
    if (totalTri > MAX_TRIANGULOS) partes = partes.map((p) => ({ ...p, triangulos: undefined }))
    return partes
  }

  private calcularExplosoes(partes: Parte[]): void {
    this.centros = partes.map((p) => {
      const c = new THREE.Vector3()
      const n = p.pontos.length / 3
      for (let i = 0; i < p.pontos.length; i += 3) c.x += p.pontos[i], c.y += p.pontos[i + 1], c.z += p.pontos[i + 2]
      return c.divideScalar(Math.max(1, n))
    })
    // Cada peça se afasta do centro na direção dela; peças no meio sobem
    this.explosoes = this.centros.map((c, i) => {
      if (partes.length === 1) return new THREE.Vector3()
      const d = c.length() < 0.05 ? new THREE.Vector3(0, 1, 0).multiplyScalar(0.25 + (i % 3) * 0.2) : c.clone()
      return d.normalize().multiplyScalar(0.55 + c.length() * 0.6)
    })
  }

  private criarPontos(partes: Parte[]): void {
    const n = partes.reduce((s, p) => s + p.pontos.length / 3, 0)
    const pos = new Float32Array(n * 3), orig = new Float32Array(n * 3), exp = new Float32Array(n * 3), cor = new Float32Array(n * 3), seed = new Float32Array(n), parte = new Float32Array(n)
    const unica = partes.length === 1
    let k = 0
    partes.forEach((p, ip) => {
      const e = this.explosoes[ip]
      const c = p.cor ?? [-1, -1, -1]
      for (let i = 0; i < p.pontos.length; i += 3, k++) {
        pos.set([p.pontos[i], p.pontos[i + 1], p.pontos[i + 2]], k * 3)
        const o = this.origemNaFita()
        orig.set([o.x, o.y, o.z], k * 3)
        // Uma peça só: "explodir" afasta as partículas do centro
        if (unica) exp.set([p.pontos[i] * 0.45, p.pontos[i + 1] * 0.45, p.pontos[i + 2] * 0.45], k * 3)
        else exp.set([e.x, e.y, e.z], k * 3)
        cor.set(c, k * 3)
        seed[k] = Math.random()
        parte[k] = ip
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aOrigem', new THREE.BufferAttribute(orig, 3))
    g.setAttribute('aExplode', new THREE.BufferAttribute(exp, 3))
    g.setAttribute('aCor', new THREE.BufferAttribute(cor, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aParte', new THREE.BufferAttribute(parte, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8)
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...this.comp, ...this.uni },
      vertexShader: INVERSAO + /* glsl */ `
        attribute vec3 aOrigem, aExplode, aCor; attribute float aSeed, aParte; uniform float uSelecao; varying float vSel;
        uniform float uTime, uProg, uSaida, uExplode, uInverte, uPixel, uVarre, uRender; uniform mat4 uInv;
        varying float vA, vBrilho, vY, vS; varying vec3 vCor;
        float suave(float x){ return x*x*(3.0 - 2.0*x); }
        vec3 voo(vec3 de, vec3 para, float t, float s){
          vec3 meio = mix(de, para, .5) + vec3(sin(s*40.0)*.7, .8 + s*.9, cos(s*37.0)*.7);
          return mix(mix(de, meio, t), mix(meio, para, t), t);
        }
        void main(){
          float ida = suave(clamp(uProg*1.6 - aSeed*.6, 0.0, 1.0));
          float volta = suave(clamp(uSaida*1.6 - (1.0 - aSeed)*.6, 0.0, 1.0));
          vec3 alvo = position + aExplode*uExplode;
          alvo = mix(alvo, inverter(alvo), uInverte);
          alvo += vec3(sin(uTime*2.1 + aSeed*60.0), cos(uTime*1.7 + aSeed*41.0), sin(uTime*1.3 + aSeed*23.0))*.005;
          vec3 origem = (uInv*vec4(aOrigem, 1.0)).xyz;
          vec3 p = uSaida > .0001 ? voo(origem, alvo, 1.0 - volta, aSeed) : voo(origem, alvo, ida, aSeed);
          vec4 mv = modelViewMatrix*vec4(p, 1.0);
          gl_Position = projectionMatrix*mv;
          float voando = 1.0 - smoothstep(.85, 1.0, ida) + volta;
          gl_PointSize = uPixel*(4.0 + aSeed*4.5 + voando*6.0)*(1.0 + uRender*.25) / -mv.z;
          float dy = (alvo.y - uVarre)*4.0;
          vBrilho = exp(-dy*dy)*ida*(1.0 - volta) + voando*.55;
          vA = (.35 + aSeed*.55)*(1.0 - smoothstep(.85, 1.0, volta));
          vY = alvo.y; vS = aSeed; vCor = aCor;
          // Peça selecionada (pela mira da mão) brilha; as outras apagam um pouco
          vSel = uSelecao < 0.0 ? 0.0 : (abs(aParte - uSelecao) < .5 ? 1.0 : -1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColA, uColB, uLaranja; uniform float uDim, uInverte, uCorte, uPart;
        varying float vA, vBrilho, vY, vS, vSel; varying vec3 vCor;
        void main(){
          if (vY > uCorte) discard;
          float r = length(gl_PointCoord - .5); if (r > .5) discard;
          vec3 cor = mix(uColA, uColB, clamp(vS*.6 + vBrilho*.6, 0.0, 1.0));
          if (vCor.r >= 0.0) cor = mix(cor, vCor, .45);
          cor = mix(cor, uLaranja, uInverte*.85);
          float faixa = exp(-pow((vY - uCorte)*28.0, 2.0));
          float sel = vSel > 0.0 ? 1.9 : vSel < 0.0 ? .3 : 1.0;
          gl_FragColor = vec4(cor + faixa*.6 + max(vSel, 0.0)*.25, smoothstep(.5, .0, r)*(vA + vBrilho*.55 + faixa)*uDim*uPart*sel);
        }`
    })
    this.pontos = new THREE.Points(g, mat)
    this.giro.add(this.pontos)
  }

  private criarLinhas(partes: Parte[]): void {
    const n = partes.reduce((s, p) => s + p.arestas.length / 3, 0)
    if (!n) return
    const pos = new Float32Array(n * 3), exp = new Float32Array(n * 3)
    const unica = partes.length === 1
    let k = 0
    partes.forEach((p, ip) => {
      const e = this.explosoes[ip]
      for (let i = 0; i < p.arestas.length; i += 3, k++) {
        pos.set([p.arestas[i], p.arestas[i + 1], p.arestas[i + 2]], k * 3)
        if (unica) exp.set([p.arestas[i] * 0.45, p.arestas[i + 1] * 0.45, p.arestas[i + 2] * 0.45], k * 3)
        else exp.set([e.x, e.y, e.z], k * 3)
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aExplode', new THREE.BufferAttribute(exp, 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8)
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...this.comp, ...this.uni },
      vertexShader: INVERSAO + /* glsl */ `
        attribute vec3 aExplode; uniform float uExplode, uInverte, uVarre; varying float vY, vB;
        void main(){
          vec3 p = position + aExplode*uExplode;
          p = mix(p, inverter(p), uInverte);
          vY = p.y; float dy = (p.y - uVarre)*4.0; vB = exp(-dy*dy);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColA, uColB, uLaranja; uniform float uDim, uProg, uSaida, uInverte, uCorte, uLinhas, uRender;
        varying float vY, vB;
        void main(){
          if (vY > uCorte) discard;
          float a = smoothstep(.7, 1.0, uProg)*(1.0 - smoothstep(0.0, .35, uSaida));
          vec3 cor = mix(mix(uColA, uColB, .35 + vB*.5), uLaranja, uInverte*.85);
          gl_FragColor = vec4(cor, a*(.22 + vB*.45 + uRender*.1)*uDim*uLinhas);
        }`
    })
    this.linhas = new THREE.LineSegments(g, mat)
    this.giro.add(this.linhas)
  }

  /** Superfície sólida (só aparece no "renderiza"). */
  private criarMalha(partes: Parte[]): void {
    const comTri = partes.filter((p) => p.triangulos?.length)
    if (!comTri.length) return
    const n = comTri.reduce((s, p) => s + p.triangulos!.length / 3, 0)
    const pos = new Float32Array(n * 3), exp = new Float32Array(n * 3)
    let k = 0
    const unica = partes.length === 1
    partes.forEach((p, ip) => {
      if (!p.triangulos?.length) return
      const e = this.explosoes[ip]
      for (let i = 0; i < p.triangulos.length; i += 3, k++) {
        pos.set([p.triangulos[i], p.triangulos[i + 1], p.triangulos[i + 2]], k * 3)
        if (unica) exp.set([p.triangulos[i] * 0.45, p.triangulos[i + 1] * 0.45, p.triangulos[i + 2] * 0.45], k * 3)
        else exp.set([e.x, e.y, e.z], k * 3)
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aExplode', new THREE.BufferAttribute(exp, 3))
    g.computeVertexNormals()
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8)
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { ...this.comp, ...this.uni },
      vertexShader: INVERSAO + /* glsl */ `
        attribute vec3 aExplode; uniform float uExplode, uInverte; varying vec3 vN, vV; varying float vY;
        void main(){
          vec3 p = position + aExplode*uExplode;
          p = mix(p, inverter(p), uInverte);
          vec4 mv = modelViewMatrix*vec4(p, 1.0);
          vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vY = p.y;
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColA, uColB, uLaranja; uniform float uDim, uRender, uInverte, uCorte, uVarre, uSaida;
        varying vec3 vN, vV; varying float vY;
        void main(){
          if (vY > uCorte) discard;
          float fresnel = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float luz = .25 + .75*max(dot(normalize(vN), normalize(vec3(.4, .8, .5))), 0.0);
          float dy = (vY - uVarre)*5.0; float faixa = exp(-dy*dy);
          vec3 cor = mix(mix(uColA, uColB, fresnel), uLaranja, uInverte*.85);
          gl_FragColor = vec4(cor*luz + faixa*.25, uRender*(.1 + fresnel*.55 + faixa*.14)*uDim*(1.0 - uSaida));
        }`
    })
    this.malha = new THREE.Mesh(g, mat)
    this.giro.add(this.malha)
  }

  /** Caixa de medidas (aparece no "mede"). */
  private criarCaixa(): void {
    const d = this.dims.clone().multiplyScalar(0.5)
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(d.x * 2 + 0.06, d.y * 2 + 0.06, d.z * 2 + 0.06))
    const m = new THREE.LineDashedMaterial({ color: '#EAF4FF', dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    this.caixa = new THREE.LineSegments(g, m)
    this.caixa.computeLineDistances()
    this.giro.add(this.caixa)
  }

  // ---------- Comandos ----------

  comando(acao: AcaoProjecao): string {
    if (!this.modelo) return 'Não tem nada projetado.'
    const PASSO = Math.PI / 2
    switch (acao) {
      case 'girar': this.girando = true; return 'Girando.'
      case 'parar': this.girando = false; this.alvoY = this.giroY; return 'Parado.'
      case 'esquerda': this.girando = false; this.alvoY = this.giroY - PASSO; return 'Girei para a esquerda.'
      case 'direita': this.girando = false; this.alvoY = this.giroY + PASSO; return 'Girei para a direita.'
      case 'virar': this.alvoOrient.x += Math.PI; return 'Virado.'
      case 'frente': this.girando = false; this.alvoOrient.set(0, 0, 0); this.alvoY = Math.round(this.giroY / (Math.PI * 2)) * Math.PI * 2; return 'De frente.'
      case 'cima': this.girando = false; this.alvoOrient.set(Math.PI / 2, 0, 0); return 'Vista de cima.'
      case 'lado': this.girando = false; this.alvoOrient.set(0, 0, 0); this.alvoY = Math.round(this.giroY / (Math.PI * 2)) * Math.PI * 2 + PASSO; return 'Vista de lado.'
      case 'aproximar': this.alvoEscala = Math.min(2.4, this.alvoEscala * 1.35); return 'Aproximei.'
      case 'afastar': this.alvoEscala = Math.max(0.35, this.alvoEscala / 1.35); return 'Afastei.'
      case 'explodir': this.alvo.explode = 1; return this.modelo.partes.length > 1 ? `Vista explodida: ${this.modelo.partes.length} peças.` : 'Vista explodida.'
      case 'juntar': this.alvo.explode = 0; return 'Peças juntas de novo.'
      case 'inverter': this.alvo.inverte = 1; return 'Modelo invertido.'
      case 'desinverter': this.alvo.inverte = 0; return 'Modelo de volta ao normal.'
      case 'cortar': this.cortando = true; return 'Corte transversal ligado.'
      case 'tirar_corte': this.cortando = false; this.alvo.corte = 9; return 'Corte desligado.'
      case 'renderizar':
        if (!this.malha) { this.alvo.part = 1.35; this.alvo.linhas = 1.6; this.uni.uRender.value = 0; this.alvo.render = 1; return 'Modelo renderizado (esta forma não tem superfície, então reforcei as partículas e as linhas).' }
        this.alvo.render = 1; return 'Modelo renderizado.'
      case 'so_linhas': this.alvo.part = 0.12; this.alvo.linhas = 1.8; this.alvo.render = 0; return 'Só o wireframe.'
      case 'particulas': this.alvo.part = 1; this.alvo.linhas = 1; this.alvo.render = 0; return 'Partículas e linhas.'
      case 'medir': this.medindo = !this.medindo; return this.medindo ? this.descreverMedidas() : 'Medidas escondidas.'
      case 'fechar': this.esconder(); return 'Projeção encerrada.'
    }
  }

  descreverMedidas(): string {
    const m = this.modelo?.medidaReal
    if (m) return `Medidas: ${fmt(m.largura)} de largura, ${fmt(m.altura)} de altura e ${fmt(m.profundidade)} de profundidade, em ${m.unidade}.`
    const d = this.dims, base = Math.max(d.x, d.y, d.z)
    return `Proporções: largura ${fmt((d.x / base) * 100)}, altura ${fmt((d.y / base) * 100)}, profundidade ${fmt((d.z / base) * 100)} (o maior lado vale 100). O tamanho real deste modelo não é conhecido.`
  }

  /** Movimento direto (para as mãos, na onda da câmera). */
  girarPor(radianosY: number, radianosX = 0): void { this.girando = false; this.alvoY += radianosY; this.alvoOrient.x += radianosX }
  escalarPor(fator: number): void { this.alvoEscala = Math.min(2.4, Math.max(0.35, this.alvoEscala * fator)) }

  esconder(aoTerminar?: () => void): void {
    if (!this.modelo || this.saindo) return
    if (aoTerminar) { const antes = this.aoSair; this.aoSair = () => { antes(); aoTerminar() } }
    this.saindo = performance.now()
  }

  private descartar(): void {
    for (const o of [this.pontos, this.linhas, this.malha, this.caixa]) {
      if (!o) continue
      this.giro.remove(o)
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    this.pontos = this.linhas = this.malha = this.caixa = null
    this.pai.remove(this.raiz)
    const estava = !!this.modelo
    this.modelo = null
    if (estava) { const f = this.aoSair; this.aoSair = () => {}; f() }
  }

  // ---------- A cada quadro ----------

  animar(agora: number, dt: number, reduzido: boolean): void {
    const m = this.modelo
    if (!m) return
    const u = this.uni
    u.uProg.value = Math.min(1, (agora - this.inicio) / (reduzido ? 300 : 2600))
    if (this.saindo) {
      u.uSaida.value = Math.min(1, (agora - this.saindo) / (reduzido ? 300 : 1900))
      if (u.uSaida.value >= 1) { this.descartar(); return }
    }
    // Formas animadas atualizam as próprias partículas e linhas
    if (m.animar && this.pontos) {
      m.animar(this.comp.uTime.value, m.partes)
      const pos = this.pontos.geometry.getAttribute('position') as THREE.BufferAttribute
      let k = 0
      for (const p of m.partes) { (pos.array as Float32Array).set(p.pontos, k); k += p.pontos.length }
      pos.needsUpdate = true
      if (this.linhas) {
        const lp = this.linhas.geometry.getAttribute('position') as THREE.BufferAttribute
        let j = 0
        for (const p of m.partes) { (lp.array as Float32Array).set(p.arestas, j); j += p.arestas.length }
        lp.needsUpdate = true
      }
    }
    const mov = reduzido ? 0.3 : 1
    if (this.girando) { this.giroY += dt * 0.32 * mov; this.alvoY = this.giroY } else this.giroY = suaveAte(this.giroY, this.alvoY, 0.08)
    this.giro.rotation.y = this.giroY
    this.orient.rotation.x = suaveAte(this.orient.rotation.x, this.alvoOrient.x, 0.07)
    this.escala = suaveAte(this.escala, this.alvoEscala, 0.08)
    this.raiz.scale.setScalar(this.escala)
    this.raiz.position.y = ALTURA_CENTRO + Math.sin(agora / 1100) * 0.025

    u.uExplode.value = suaveAte(u.uExplode.value, this.alvo.explode, 0.06)
    u.uInverte.value = suaveAte(u.uInverte.value, this.alvo.inverte, 0.045)
    u.uRender.value = suaveAte(u.uRender.value, this.alvo.render, 0.035)
    u.uPart.value = suaveAte(u.uPart.value, this.alvo.part, 0.06)
    u.uLinhas.value = suaveAte(u.uLinhas.value, this.alvo.linhas, 0.06)
    const meiaAltura = this.dims.y / 2 + 0.1
    // Corte: o plano desce e sobe devagar pelo objeto
    if (this.cortando) this.alvo.corte = Math.sin(agora / 2600) * meiaAltura * 0.8
    u.uCorte.value = this.cortando ? suaveAte(u.uCorte.value > 5 ? meiaAltura : u.uCorte.value, this.alvo.corte, 0.1) : 9
    // Varredura de luz: rápida enquanto monta ou renderiza, lenta depois
    const periodo = u.uProg.value < 1 || Math.abs(u.uRender.value - this.alvo.render) > 0.05 ? 1400 : 4200
    u.uVarre.value = (((agora - this.inicio) / periodo) % 1) * (meiaAltura * 2 + 0.6) - meiaAltura - 0.3
    if (this.caixa) (this.caixa.material as THREE.LineDashedMaterial).opacity = suaveAte((this.caixa.material as THREE.LineDashedMaterial).opacity, this.medindo ? 0.55 : 0, 0.1)

    // A origem do voo das partículas acompanha o giro do modelo
    this.pai.updateMatrixWorld()
    this.tiltInv.copy(this.pai.matrixWorld).invert()
    this.relInv.multiplyMatrices(this.tiltInv, this.giro.matrixWorld).invert()
    u.uInv.value.copy(this.relInv)
  }

  // ---------- Seleção pela mira da mão ----------
  private selecionada = -1

  /** Peça mais perto de um ponto da tela (px dentro do núcleo), ou -1. */
  parteEm(x: number, y: number, raio = 70): number {
    const m = this.modelo
    if (!m || m.partes.length < 2 || this.saindo) return -1
    const w = this.el.clientWidth, h = this.el.clientHeight
    let melhor = -1, menor = raio
    this.centros.forEach((c, i) => {
      const v = c.clone().addScaledVector(this.explosoes[i], this.uni.uExplode.value).applyMatrix4(this.giro.matrixWorld).project(this.camera)
      const d = Math.hypot((v.x * 0.5 + 0.5) * w - x, (-v.y * 0.5 + 0.5) * h - y)
      if (d < menor) { menor = d; melhor = i }
    })
    return melhor
  }

  /** Destaca uma peça (-1 tira o destaque). Devolve o nome dela. */
  selecionar(i: number): string | null {
    const m = this.modelo
    this.selecionada = m && i >= 0 && i < m.partes.length ? i : -1
    this.uni.uSelecao.value = this.selecionada
    return this.selecionada >= 0 ? m!.partes[this.selecionada].nome || `peça ${this.selecionada + 1}` : null
  }

  // ---------- Para o HUD ----------

  /** Etiquetas das peças (vista explodida), em px dentro do núcleo. */
  rotulos(): Rotulo[] {
    const m = this.modelo
    if (!m || m.partes.length < 2 || this.saindo || this.uni.uProg.value < 0.9) return []
    if (!m.rotulosSempre && this.uni.uExplode.value < 0.6) return []
    const w = this.el.clientWidth, h = this.el.clientHeight
    const centro = new THREE.Vector3().setFromMatrixPosition(this.giro.matrixWorld).project(this.camera)
    const cx = (centro.x * 0.5 + 0.5) * w, cy = (-centro.y * 0.5 + 0.5) * h
    return m.partes.slice(0, 12).flatMap((p, i) => {
      if (!p.nome) return []
      const v = this.centros[i].clone().addScaledVector(this.explosoes[i], this.uni.uExplode.value).applyMatrix4(this.giro.matrixWorld).project(this.camera)
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1
      return [{ nome: p.nome, x, y, ax: x + (dx / d) * 70, ay: y + (dy / d) * 40 }]
    })
  }

  /** Canto inferior esquerdo do holograma na tela, para a legenda. */
  ancora(): { x: number; y: number } | null {
    if (!this.modelo) return null
    const v = new THREE.Vector3(-TAMANHO * 0.5, -this.dims.y * this.ampliar * 0.5, 0).applyMatrix4(this.raiz.matrixWorld).project(this.camera)
    return { x: (v.x * 0.5 + 0.5) * this.el.clientWidth, y: (-v.y * 0.5 + 0.5) * this.el.clientHeight }
  }

  info(): { nome: string; fonte: string; detalhes: string[]; credito?: string; medidas: string | null; visivel: boolean } | null {
    const m = this.modelo
    if (!m) return null
    const particulas = this.pontos ? this.pontos.geometry.getAttribute('position').count : 0
    const linhas = this.linhas ? this.linhas.geometry.getAttribute('position').count / 2 : 0
    const sel = this.selecionada >= 0 ? m.partes[this.selecionada] : null
    const estados = [
      sel ? `PEÇA: ${(sel.nome || `peça ${this.selecionada + 1}`).toUpperCase()}` : '',
      this.uni.uInverte.value > 0.5 ? 'INVERTIDO' : '',
      this.alvo.explode ? 'EXPLODIDO' : '',
      this.cortando ? 'CORTE' : '',
      this.alvo.render ? 'RENDERIZADO' : ''
    ].filter(Boolean)
    return {
      nome: m.nome,
      fonte: m.fonte,
      detalhes: [...m.detalhes, `${particulas.toLocaleString('pt-BR')} partículas · ${Math.round(linhas).toLocaleString('pt-BR')} linhas${m.partes.length > 1 ? ` · ${m.partes.length} peças` : ''}`, ...(estados.length ? [estados.join(' · ')] : [])],
      credito: m.credito,
      medidas: this.medindo ? this.descreverMedidas() : null,
      visivel: this.uni.uProg.value > 0.6 && this.uni.uSaida.value < 0.1
    }
  }
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('pt-BR')

/** Pega `quantos` itens (de `passo` números cada) espalhados pelo array. */
function amostrar(a: Float32Array, passo: number, quantos: number): Float32Array {
  const n = a.length / passo
  if (quantos >= n) return a
  const out = new Float32Array(quantos * passo)
  for (let i = 0; i < quantos; i++) {
    const j = Math.floor((i + Math.random()) * (n / quantos))
    out.set(a.subarray(j * passo, j * passo + passo), i * passo)
  }
  return out
}
