// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
import { contextBridge, ipcRenderer } from 'electron'
import type { FridayApi } from './api'

const api: FridayApi = {
  config: () => ipcRenderer.invoke('config'),
  log: (nivel, texto) => ipcRenderer.send('log', nivel, texto),
  ferramenta: (nome, args) => ipcRenderer.invoke('ferramenta', nome, args),
  avisarSilencio: (valor) => ipcRenderer.send('silencio-local', valor),
  aoSilenciar: (cb) => { ipcRenderer.on('silenciar', (_e, v: boolean) => cb(v)) },
  aoLembrete: (cb) => { ipcRenderer.on('lembrete', (_e, l, atrasado: boolean) => cb(l, atrasado)) },
  aoTarefa: (cb) => { ipcRenderer.on('tarefa', (_e, t) => cb(t)) },
  aoAviso: (cb) => { ipcRenderer.on('aviso', (_e, texto: string, ok: boolean) => cb(texto, ok)) },
  fishFalar: (id, texto) => ipcRenderer.invoke('fish-falar', id, texto),
  fishCancelar: () => ipcRenderer.send('fish-cancelar'),
  aoFishAudio: (cb) => { ipcRenderer.on('fish-audio', (_e, id: number, b64: string, taxa: number) => cb(id, b64, taxa)) }
}

contextBridge.exposeInMainWorld('friday', api)
