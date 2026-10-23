// Leitura de uso do sistema: CPU e RAM pelo Node, placa de vídeo pelo nvidia-smi (placas NVIDIA).

import { cpus, totalmem, freemem } from 'node:os'
import { execFile } from 'node:child_process'

function amostraCpu(): { ocioso: number; total: number } {
  let ocioso = 0, total = 0
  for (const c of cpus()) {
    const t = c.times
    ocioso += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { ocioso, total }
}

async function usoCpu(): Promise<number> {
  const a = amostraCpu()
  await new Promise((r) => setTimeout(r, 400))
  const b = amostraCpu()
  const total = b.total - a.total
  return total > 0 ? Math.round((1 - (b.ocioso - a.ocioso) / total) * 100) : 0
}

function usoGpu(): Promise<{ gpu: number; vramUsadaGb: number; vramTotalGb: number } | null> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 3000 },
      (erro, saida) => {
        if (erro) return resolve(null)
        const [gpu, usada, total] = saida.split('\n')[0].split(',').map((v) => Number(v.trim()))
        if ([gpu, usada, total].some((v) => Number.isNaN(v))) return resolve(null)
        resolve({ gpu, vramUsadaGb: +(usada / 1024).toFixed(1), vramTotalGb: +(total / 1024).toFixed(1) })
      }
    )
  })
}

export async function statusSistema() {
  const [cpu, gpu] = await Promise.all([usoCpu(), usoGpu()])
  const total = totalmem()
  return {
    cpu,
    ram: Math.round((1 - freemem() / total) * 100),
    ramTotalGb: Math.round(total / 1024 ** 3),
    gpu: gpu?.gpu ?? null,
    vramUsadaGb: gpu?.vramUsadaGb ?? null,
    vramTotalGb: gpu?.vramTotalGb ?? null
  }
}
