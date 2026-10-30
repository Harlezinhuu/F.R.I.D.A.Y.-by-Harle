// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Controle do Windows (volume e teclas de mídia) por um processo PowerShell que fica aberto.
// O C# é compilado uma vez só, então cada comando responde em milissegundos.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

public static class FridayAudio {
  static IAudioEndpointVolume Vol() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var epvid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
    return epv;
  }
  public static float Volume {
    get { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value, Guid.Empty)); }
  }
  public static bool Mute {
    get { bool mute; Marshal.ThrowExceptionForHR(Vol().GetMute(out mute)); return mute; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMute(value, Guid.Empty)); }
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  /** Título e processo da janela em primeiro plano (ex.: o arquivo aberto no VS Code) */
  public static string[] Janela() {
    IntPtr h = GetForegroundWindow();
    var sb = new System.Text.StringBuilder(512);
    GetWindowText(h, sb, 512);
    uint pid; GetWindowThreadProcessId(h, out pid);
    string nome = "";
    try { nome = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
    return new string[] { sb.ToString(), nome };
  }
  [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public static void Key(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
}
"@
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split('|')
  $id = $p[0]; $cmd = $p[1]; $arg = ''
  if ($p.Length -gt 2) { $arg = $p[2] }
  try {
    switch ($cmd) {
      'getvol' { $out = '{"nivel":' + [int][math]::Round([FridayAudio]::Volume * 100) + ',"mudo":' + ([FridayAudio]::Mute.ToString().ToLower()) + '}' }
      'setvol' { [FridayAudio]::Volume = [float]([int]$arg / 100.0); $out = '{"ok":true}' }
      'mute'   { [FridayAudio]::Mute = ($arg -eq '1'); $out = '{"ok":true}' }
      'key'    { [FridayAudio]::Key([byte][int]$arg); $out = '{"ok":true}' }
      'janela' { $j = [FridayAudio]::Janela(); $out = (@{ titulo = $j[0]; processo = $j[1] } | ConvertTo-Json -Compress) }
      default  { $out = '{"erro":"comando desconhecido"}' }
    }
  } catch { $out = '{"erro":"' + ($_.Exception.Message -replace '["\\]', ' ') + '"}' }
  [Console]::Out.WriteLine("$id|$out"); [Console]::Out.Flush()
}
`

type Pendente = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

let ps: ChildProcessWithoutNullStreams | null = null
let pronto: Promise<void> | null = null
let seq = 0
const pendentes = new Map<number, Pendente>()

function iniciar(): Promise<void> {
  if (pronto) return pronto
  if (process.platform !== 'win32') return Promise.reject(new Error('Controle do sistema só funciona no Windows.'))
  const arquivo = join(tmpdir(), 'friday-winctl.ps1')
  writeFileSync(arquivo, SCRIPT, 'utf8')
  ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', arquivo], { windowsHide: true })
  pronto = new Promise((resolve, reject) => {
    let buffer = ''
    const falhou = setTimeout(() => reject(new Error('PowerShell não respondeu.')), 15000)
    ps!.stdout.setEncoding('utf8')
    ps!.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let i: number
      while ((i = buffer.indexOf('\n')) >= 0) {
        const linha = buffer.slice(0, i).trim()
        buffer = buffer.slice(i + 1)
        if (linha === 'ready') { clearTimeout(falhou); resolve(); continue }
        const sep = linha.indexOf('|')
        const id = Number(linha.slice(0, sep))
        const p = pendentes.get(id)
        if (!p) continue
        pendentes.delete(id); clearTimeout(p.timer)
        try {
          const json = JSON.parse(linha.slice(sep + 1)) as Record<string, unknown>
          if (typeof json.erro === 'string') p.reject(new Error(json.erro)); else p.resolve(json)
        } catch (e) { p.reject(e as Error) }
      }
    })
    ps!.on('exit', () => {
      ps = null; pronto = null
      for (const p of pendentes.values()) p.reject(new Error('Controle do sistema encerrou.'))
      pendentes.clear()
    })
  })
  return pronto
}

async function comando(cmd: string, arg = ''): Promise<Record<string, unknown>> {
  await iniciar()
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendentes.delete(id); reject(new Error('Tempo esgotado no controle do sistema.')) }, 5000)
    pendentes.set(id, { resolve, reject, timer })
    ps!.stdin.write(`${id}|${cmd}|${arg}\n`)
  })
}

export async function lerVolume(): Promise<{ nivel: number; mudo: boolean }> {
  const r = await comando('getvol')
  return { nivel: Number(r.nivel), mudo: Boolean(r.mudo) }
}
export const definirVolume = (nivel: number) => comando('setvol', String(Math.round(Math.min(100, Math.max(0, nivel)))))
export const definirMudo = (mudo: boolean) => comando('mute', mudo ? '1' : '0')

const TECLAS = { tocar_pausar: 0xb3, proxima: 0xb0, anterior: 0xb1 } as const
export const teclaMidia = (acao: keyof typeof TECLAS) => comando('key', String(TECLAS[acao]))
/** A janela em primeiro plano: título (ex.: "app.ts - meu-projeto - Visual Studio Code") e processo ("Code"). */
export async function janelaAtiva(): Promise<{ titulo: string; processo: string }> {
  const r = await comando('janela')
  return { titulo: String(r.titulo ?? ''), processo: String(r.processo ?? '') }
}

/** Já deixa o PowerShell compilado para o primeiro comando ser rápido. */
export function aquecer(): void { iniciar().catch(() => {}) }
export function encerrar(): void { ps?.kill() }
