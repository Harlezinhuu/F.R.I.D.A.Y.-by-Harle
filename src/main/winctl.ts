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
# Controle de janelas (UI Automation): compilado à parte, para o volume continuar funcionando se isto falhar
$uiaOk = $false
try {
Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
using System.Windows.Automation;

public static class FridayUia {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint f, int dx, int dy, int data, UIntPtr extra);
  static List<AutomationElement> itens = new List<AutomationElement>();
  static IntPtr janela = IntPtr.Zero;

  static string J(string s) {
    if (s == null) return "";
    var sb = new StringBuilder();
    foreach (char c in s) {
      if (c == '\\') sb.Append("\\\\"); else if (c == '"') sb.Append("\\\""); else if (c < 32) sb.Append(' '); else sb.Append(c);
    }
    return sb.ToString();
  }
  static string Corta(string s, int n) { s = (s ?? "").Replace("\r", " ").Replace("\n", " ").Trim(); return s.Length > n ? s.Substring(0, n) : s; }

  static bool Interessa(AutomationElement.AutomationElementInformation c) {
    var t = c.ControlType;
    bool temNome = !string.IsNullOrWhiteSpace(c.Name);
    if (t == ControlType.Edit || t == ControlType.ComboBox) return true;
    if (!temNome) return false;
    return t == ControlType.Button || t == ControlType.MenuItem || t == ControlType.Hyperlink || t == ControlType.ListItem || t == ControlType.TabItem ||
      t == ControlType.CheckBox || t == ControlType.RadioButton || t == ControlType.TreeItem || t == ControlType.SplitButton || t == ControlType.DataItem ||
      t == ControlType.Text || t == ControlType.Document || t == ControlType.MenuBar || t == ControlType.Header || t == ControlType.HeaderItem;
  }

  public static string Listar(int limite) {
    janela = GetForegroundWindow();
    var raiz = AutomationElement.FromHandle(janela);
    itens.Clear();
    var sb = new StringBuilder("{\"titulo\":\"" + J(raiz.Current.Name) + "\",\"itens\":[");
    var fila = new Queue<KeyValuePair<AutomationElement, int>>();
    fila.Enqueue(new KeyValuePair<AutomationElement, int>(raiz, 0));
    var walker = TreeWalker.ControlViewWalker;
    int visitados = 0; bool primeiro = true;
    while (fila.Count > 0 && itens.Count < limite && visitados < 4000) {
      var par = fila.Dequeue(); var e = par.Key; visitados++;
      AutomationElement.AutomationElementInformation c;
      try { c = e.Current; } catch { continue; }
      if (par.Value > 0 && !c.IsOffscreen && Interessa(c)) {
        itens.Add(e);
        string valor = "";
        if ((c.ControlType == ControlType.Edit || c.ControlType == ControlType.ComboBox) && !c.IsPassword) {
          object p; if (e.TryGetCurrentPattern(ValuePattern.Pattern, out p)) { try { valor = ((ValuePattern)p).Current.Value; } catch {} }
        }
        bool clica = c.ControlType != ControlType.Text && c.ControlType != ControlType.Document;
        if (!primeiro) sb.Append(','); primeiro = false;
        sb.Append("{\"i\":" + itens.Count + ",\"tipo\":\"" + J(c.ControlType.ProgrammaticName.Replace("ControlType.", "")) + "\",\"nome\":\"" + J(Corta(c.Name, 90)) +
          "\",\"valor\":\"" + J(Corta(valor, 70)) + "\",\"senha\":" + (c.IsPassword ? "true" : "false") + ",\"ativo\":" + (c.IsEnabled ? "true" : "false") +
          ",\"clica\":" + (clica ? "true" : "false") + "}");
      }
      if (par.Value < 30) {
        try { var f = walker.GetFirstChild(e); while (f != null) { fila.Enqueue(new KeyValuePair<AutomationElement, int>(f, par.Value + 1)); f = walker.GetNextSibling(f); } } catch {}
      }
    }
    sb.Append("]}");
    return sb.ToString();
  }

  static AutomationElement Pegar(int i) {
    if (i < 1 || i > itens.Count) throw new Exception("esse número não está na janela (leia a janela de novo)");
    if (GetForegroundWindow() != janela) throw new Exception("a janela mudou (leia a janela de novo)");
    return itens[i - 1];
  }

  static void Clique(int x, int y) { SetCursorPos(x, y); mouse_event(0x02, 0, 0, 0, UIntPtr.Zero); mouse_event(0x04, 0, 0, 0, UIntPtr.Zero); }

  public static string Clicar(int i) {
    var e = Pegar(i);
    if (e.Current.IsPassword) throw new Exception("campo de senha");
    object p;
    if (e.TryGetCurrentPattern(InvokePattern.Pattern, out p)) { ((InvokePattern)p).Invoke(); return "{\"ok\":true}"; }
    if (e.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p)) { ((SelectionItemPattern)p).Select(); return "{\"ok\":true}"; }
    if (e.TryGetCurrentPattern(TogglePattern.Pattern, out p)) { ((TogglePattern)p).Toggle(); return "{\"ok\":true}"; }
    if (e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out p)) {
      var ec = (ExpandCollapsePattern)p;
      if (ec.Current.ExpandCollapseState == ExpandCollapseState.Expanded) ec.Collapse(); else ec.Expand();
      return "{\"ok\":true}";
    }
    var r = e.Current.BoundingRectangle;
    if (r.IsEmpty) throw new Exception("não dá para tocar nesse item");
    SetForegroundWindow(janela);
    Clique((int)(r.X + r.Width / 2), (int)(r.Y + r.Height / 2));
    return "{\"ok\":true}";
  }

  static string EscaparTeclas(string t) {
    var sb = new StringBuilder();
    foreach (char c in t) { if ("+^%~(){}[]".IndexOf(c) >= 0) sb.Append("{" + c + "}"); else if (c == '\n') sb.Append("{ENTER}"); else sb.Append(c); }
    return sb.ToString();
  }

  public static string Digitar(int i, string texto) {
    AutomationElement e = i > 0 ? Pegar(i) : AutomationElement.FocusedElement;
    if (e == null) throw new Exception("nenhum campo em foco");
    if (e.Current.IsPassword) throw new Exception("campo de senha");
    if (i > 0) { SetForegroundWindow(janela); try { e.SetFocus(); } catch {} }
    object p;
    if (e.TryGetCurrentPattern(ValuePattern.Pattern, out p) && !((ValuePattern)p).Current.IsReadOnly) {
      try { ((ValuePattern)p).SetValue(texto); return "{\"ok\":true}"; } catch {}
    }
    System.Windows.Forms.SendKeys.SendWait(EscaparTeclas(texto));
    return "{\"ok\":true}";
  }

  public static string Tecla(string combo) {
    if (janela != IntPtr.Zero) SetForegroundWindow(janela);
    System.Windows.Forms.SendKeys.SendWait(combo);
    return "{\"ok\":true}";
  }

  public static string Rolar(bool baixo) {
    var r = AutomationElement.FromHandle(GetForegroundWindow()).Current.BoundingRectangle;
    SetCursorPos((int)(r.X + r.Width / 2), (int)(r.Y + r.Height / 2));
    mouse_event(0x0800, 0, 0, baixo ? -480 : 480, UIntPtr.Zero);
    return "{\"ok\":true}";
  }
}
"@
$uiaOk = $true
} catch { $uiaErro = $_.Exception.Message }
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
      'uia'     { if (-not $uiaOk) { throw "controle de janelas indisponível: $uiaErro" }; $out = [FridayUia]::Listar([int]$arg) }
      'clicar'  { if (-not $uiaOk) { throw 'controle de janelas indisponível' }; $out = [FridayUia]::Clicar([int]$arg) }
      'digitar' { if (-not $uiaOk) { throw 'controle de janelas indisponível' }; $q = $arg.Split(','); $out = [FridayUia]::Digitar([int]$q[0], [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($q[1]))) }
      'tecla'   { if (-not $uiaOk) { throw 'controle de janelas indisponível' }; $out = [FridayUia]::Tecla([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($arg))) }
      'rolar'   { if (-not $uiaOk) { throw 'controle de janelas indisponível' }; $out = [FridayUia]::Rolar($arg -eq 'baixo') }
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

async function comando(cmd: string, arg = '', limiteMs = 5000): Promise<Record<string, unknown>> {
  await iniciar()
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendentes.delete(id); reject(new Error('Tempo esgotado no controle do sistema.')) }, limiteMs)
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
// ---------- Controle de janelas (UI Automation) ----------

export interface ItemJanela { i: number; tipo: string; nome: string; valor: string; senha: boolean; ativo: boolean; clica: boolean }

const b64 = (t: string): string => Buffer.from(t, 'utf8').toString('base64')

/** Os itens da janela em primeiro plano (botões, campos, textos), numerados. */
export async function lerJanela(limite = 150): Promise<{ titulo: string; itens: ItemJanela[] }> {
  const r = await comando('uia', String(limite), 15_000)
  return { titulo: String(r.titulo ?? ''), itens: Array.isArray(r.itens) ? (r.itens as ItemJanela[]) : [] }
}
export const clicarItem = (i: number) => comando('clicar', String(Math.round(i)), 10_000)
export const digitarItem = (i: number, texto: string) => comando('digitar', `${Math.round(i)},${b64(texto)}`, 10_000)
export const teclaJanela = (combinacao: string) => comando('tecla', b64(combinacao))
export const rolarJanela = (baixo: boolean) => comando('rolar', baixo ? 'baixo' : 'cima')

/** A janela em primeiro plano: título (ex.: "app.ts - meu-projeto - Visual Studio Code") e processo ("Code"). */
export async function janelaAtiva(): Promise<{ titulo: string; processo: string }> {
  const r = await comando('janela')
  return { titulo: String(r.titulo ?? ''), processo: String(r.processo ?? '') }
}

/** Já deixa o PowerShell compilado para o primeiro comando ser rápido. */
export function aquecer(): void { iniciar().catch(() => {}) }
export function encerrar(): void { ps?.kill() }
