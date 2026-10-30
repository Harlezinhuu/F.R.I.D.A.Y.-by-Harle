// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// A FRIDAY em miniatura, andando em cima da mesa holográfica. Visual próprio: uma figura de luz, sem
// rosto, feita de partículas, com a fita de Möbius dela girando em volta da cintura como uma aura.
// Anda até o que está na mesa, vira para lá e, quando ela fala, aponta para o objeto.

import * as THREE from 'three'

const VERT = /* glsl */ `
  attribute vec3 aCor;
  uniform float uTam, uPixel;
  varying vec3 vCor;
  void main(){
    vCor = aCor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uTam * uPixel / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`
const FRAG = /* glsl */ `
  uniform float uOpac;
  varying vec3 vCor;
  void main(){
    float d = length(gl_PointCoord - .5);
    if (d > .5) discard;
    gl_FragColor = vec4(vCor, (1.0 - d * 2.0) * uOpac);
  }`

const BAIXO = new THREE.Color('#5FE1F2'), ALTO = new THREE.Color('#C9C1FF')

export class MiniFriday {
  readonly raiz = new THREE.Group()
  private corpo = new THREE.Group()
  private bracoE = new THREE.Group()
  private bracoD = new THREE.Group()
  private pernaE = new THREE.Group()
  private pernaD = new THREE.Group()
  private fita = new THREE.Group()
  private uni = { uTam: { value: 11 }, uPixel: { value: Math.min(devicePixelRatio || 1, 1.75) }, uOpac: { value: 0.9 } }
  private alvo = new THREE.Vector3()
  private olhar = new THREE.Vector3()
  private fase = 0
  private andando = false
  private giroFita = 0

  constructor() {
    const mat = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const nuvem = (pts: THREE.Vector3[]) => {
      const pos: number[] = [], cor: number[] = []
      for (const p of pts) {
        pos.push(p.x, p.y, p.z)
        // A cor vai do ciano (pés) ao lilás (cabeça), como a fita
        const c = BAIXO.clone().lerp(ALTO, Math.min(1, Math.max(0, p.y / 0.8 + 0.4)))
        const b = 0.7 + Math.random() * 0.3
        cor.push(c.r * b, c.g * b, c.b * b)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('aCor', new THREE.Float32BufferAttribute(cor, 3))
      return new THREE.Points(g, mat)
    }
    const rnd = () => Math.random()
    // Tronco: um perfil girado (quadril, cintura fina, peito, ombros)
    const perfil: [number, number][] = [[0.37, 0.085], [0.44, 0.07], [0.5, 0.058], [0.57, 0.075], [0.63, 0.088], [0.665, 0.07], [0.69, 0.028], [0.72, 0.024]]
    const raioEm = (y: number) => {
      for (let i = 1; i < perfil.length; i++) if (y <= perfil[i][0]) { const [y0, r0] = perfil[i - 1], [y1, r1] = perfil[i]; return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0) }
      return perfil[perfil.length - 1][1]
    }
    const tronco: THREE.Vector3[] = []
    for (let i = 0; i < 700; i++) { const y = 0.37 + rnd() * 0.35, a = rnd() * Math.PI * 2, r = raioEm(y) * (0.85 + rnd() * 0.15); tronco.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r * 0.75)) }
    const cabeca: THREE.Vector3[] = []
    for (let i = 0; i < 320; i++) { const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(); cabeca.push(new THREE.Vector3(v.x * 0.058, 0.79 + v.y * 0.07, v.z * 0.06)) }
    // Cabelo: uma calota atrás e em cima da cabeça
    for (let i = 0; i < 160; i++) { const v = new THREE.Vector3(rnd() * 2 - 1, Math.abs(rnd() * 2 - 1), -Math.abs(rnd() * 2 - 1)).normalize(); cabeca.push(new THREE.Vector3(v.x * 0.068, 0.8 + v.y * 0.075 - (v.z < -0.6 ? 0.06 : 0), v.z * 0.072)) }
    this.corpo.add(nuvem(tronco), nuvem(cabeca))
    const membro = (comprimento: number, r0: number, r1: number, n: number) => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < n; i++) { const t = rnd(), a = rnd() * Math.PI * 2, r = r0 + (r1 - r0) * t; pts.push(new THREE.Vector3(Math.cos(a) * r, -t * comprimento, Math.sin(a) * r)) }
      return nuvem(pts)
    }
    for (const [braco, x] of [[this.bracoE, -0.095], [this.bracoD, 0.095]] as const) { braco.position.set(x, 0.655, 0); braco.add(membro(0.29, 0.02, 0.013, 160)); this.corpo.add(braco) }
    for (const [perna, x] of [[this.pernaE, -0.042], [this.pernaD, 0.042]] as const) { perna.position.set(x, 0.385, 0); perna.add(membro(0.385, 0.036, 0.016, 260)); this.corpo.add(perna) }
    // A fita de Möbius em volta da cintura
    const fita: THREE.Vector3[] = []
    for (let i = 0; i < 520; i++) {
      const u = rnd() * Math.PI * 2, v = rnd() * 2 - 1, w = 0.035 * v, c = Math.cos(u / 2)
      fita.push(new THREE.Vector3((0.17 + w * c) * Math.cos(u), w * Math.sin(u / 2), (0.17 + w * c) * Math.sin(u)))
    }
    this.fita.add(nuvem(fita))
    this.fita.position.y = 0.5
    this.fita.rotation.x = 0.35
    this.corpo.add(this.fita)
    // Base: um anel de luz no tampo
    const anel = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * 0.17, 0.006, Math.sin(a) * 0.17) })),
      new THREE.LineBasicMaterial({ color: '#8FEFFF', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    const brilho = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1C5F88', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
    brilho.position.y = 0.004
    this.raiz.add(this.corpo, anel, brilho)
    this.raiz.scale.setScalar(1.35)
  }

  /** Tamanho das partículas (a mesa do celular é bem menor que a do PC). */
  escalaDasParticulas(f: number): void { this.uni.uTam.value = 11 * f }

  /** Põe direto num lugar (sem andar). */
  colocar(p: THREE.Vector3): void {
    this.raiz.position.copy(p)
    this.alvo.copy(p)
  }

  /** Anda até `p` e depois olha para `olhar`. */
  andarPara(p: THREE.Vector3, olhar: THREE.Vector3): void {
    this.alvo.copy(p)
    this.olhar.copy(olhar)
  }

  atualizar(dt: number, t: number, falando: boolean, camera: THREE.Vector3): void {
    const ate = this.alvo.clone().sub(this.raiz.position).setY(0)
    const dist = ate.length()
    this.andando = dist > 0.03
    let rumo: number
    if (this.andando) {
      const passo = Math.min(dist, dt * 0.95)
      this.raiz.position.addScaledVector(ate.normalize(), passo)
      rumo = Math.atan2(ate.x, ate.z)
      this.fase += dt * 9
    } else {
      // Parada: meio virada para o objeto, meio para você
      const paraObjeto = Math.atan2(this.olhar.x - this.raiz.position.x, this.olhar.z - this.raiz.position.z)
      const paraCamera = Math.atan2(camera.x - this.raiz.position.x, camera.z - this.raiz.position.z)
      rumo = falando ? paraObjeto + diferenca(paraObjeto, paraCamera) * 0.35 : paraObjeto + diferenca(paraObjeto, paraCamera) * 0.6
      this.fase += dt * 1.2
    }
    this.raiz.rotation.y += diferenca(this.raiz.rotation.y, rumo) * Math.min(1, dt * 6)
    const balanco = this.andando ? Math.sin(this.fase) : 0
    this.pernaE.rotation.x = balanco * 0.45
    this.pernaD.rotation.x = -balanco * 0.45
    this.corpo.position.y = this.andando ? Math.abs(Math.cos(this.fase)) * 0.012 : Math.sin(t * 1.6) * 0.004
    // Braços: balançam andando; falando, o direito aponta para o objeto
    const apontar = falando && !this.andando
    this.bracoE.rotation.set(this.andando ? -balanco * 0.35 : Math.sin(t * 1.1) * 0.04, 0, -0.08)
    this.bracoD.rotation.x += ((apontar ? -1.25 : this.andando ? balanco * 0.35 : Math.sin(t * 1.1 + 1) * 0.04) - this.bracoD.rotation.x) * Math.min(1, dt * 8)
    this.bracoD.rotation.z = apontar ? 0.35 : 0.08
    this.giroFita += dt * (falando ? 3.2 : 0.9)
    this.fita.rotation.y = this.giroFita
    this.uni.uOpac.value = falando ? 1 : 0.85
  }
}

/** Menor ângulo de a até b. */
function diferenca(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
