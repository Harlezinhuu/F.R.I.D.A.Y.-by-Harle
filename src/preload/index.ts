import { contextBridge, ipcRenderer } from 'electron'
import type { FridayApi } from './api'

const api: FridayApi = {
  config: () => ipcRenderer.invoke('config'),
  ferramenta: (nome, args) => ipcRenderer.invoke('ferramenta', nome, args),
  avisarSilencio: (valor) => ipcRenderer.send('silencio-local', valor),
  aoSilenciar: (cb) => { ipcRenderer.on('silenciar', (_e, v: boolean) => cb(v)) },
  aoLembrete: (cb) => { ipcRenderer.on('lembrete', (_e, l) => cb(l)) },
  fishFalar: (id, texto) => ipcRenderer.invoke('fish-falar', id, texto),
  fishCancelar: () => ipcRenderer.send('fish-cancelar'),
  aoFishAudio: (cb) => { ipcRenderer.on('fish-audio', (_e, id: number, b64: string, taxa: number) => cb(id, b64, taxa)) }
}

contextBridge.exposeInMainWorld('friday', api)
