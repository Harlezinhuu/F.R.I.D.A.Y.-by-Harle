import { contextBridge, ipcRenderer } from 'electron'
import type { FridayApi } from './api'

const api: FridayApi = {
  config: () => ipcRenderer.invoke('config'),
  ferramenta: (nome, args) => ipcRenderer.invoke('ferramenta', nome, args),
  avisarSilencio: (valor) => ipcRenderer.send('silencio-local', valor),
  aoSilenciar: (cb) => { ipcRenderer.on('silenciar', (_e, v: boolean) => cb(v)) },
  aoLembrete: (cb) => { ipcRenderer.on('lembrete', (_e, l) => cb(l)) }
}

contextBridge.exposeInMainWorld('friday', api)
