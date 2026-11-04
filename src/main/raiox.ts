// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Raio-X do PC: lê o que o próprio Windows informa (PowerShell, sem instalar nada e sem mudar
// nada) e a placa de vídeo pelo nvidia-smi. Só leitura: ela diz o que achou e o que fazer, quem
// decide é você. Uma vez por semana faz um check-up sozinha e só avisa se achar problema.

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { variavel } from './config'
import { analisar, resumoFalado, type Achado, type Leitura } from './logica/raiox'

const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$r = [ordered]@{}
$os = Get-CimInstance Win32_OperatingSystem
if ($os) {
  $r.ligadoDesde = $os.LastBootUpTime.ToUniversalTime().ToString('o')
  $r.ramTotalGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
  $r.ramLivreGb = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
}
$antes = @{}; Get-Process | ForEach-Object { $antes[$_.Id] = $_.CPU }
Start-Sleep -Milliseconds 1500
$n = [Environment]::ProcessorCount
$r.processos = @(Get-Process | ForEach-Object {
  $c = $null; if ($_.CPU -ne $null -and $antes.ContainsKey($_.Id) -and $antes[$_.Id] -ne $null) { $c = ($_.CPU - $antes[$_.Id]) / 1.5 / $n * 100 }
  [pscustomobject]@{ nome = $_.ProcessName; cpu = $c; ram = $_.WorkingSet64 }
} | Group-Object nome | ForEach-Object {
  [pscustomobject]@{ nome = $_.Name; cpu = [math]::Round((($_.Group | Measure-Object cpu -Sum).Sum), 1); ramMb = [math]::Round((($_.Group | Measure-Object ram -Sum).Sum) / 1MB); n = $_.Count }
} | Sort-Object ramMb -Descending | Select-Object -First 40)
$r.volumes = @(Get-Volume | Where-Object { $_.DriveLetter -and $_.Size -gt 0 -and $_.DriveType -eq 'Fixed' } | ForEach-Object {
  [pscustomobject]@{ letra = [string]$_.DriveLetter; rotulo = [string]$_.FileSystemLabel; totalGb = [math]::Round($_.Size / 1GB, 1); livreGb = [math]::Round($_.SizeRemaining / 1GB, 1) }
})
$conf = @{}; Get-PhysicalDisk | Get-StorageReliabilityCounter | ForEach-Object { $conf[[string]$_.DeviceId] = $_ }
$r.discos = @(Get-PhysicalDisk | ForEach-Object {
  $c = $conf[[string]$_.DeviceId]
  [pscustomobject]@{ nome = [string]$_.FriendlyName; tipo = [string]$_.MediaType; saude = [string]$_.HealthStatus; temperatura = $(if ($c -and $c.Temperature) { [int]$c.Temperature } else { $null }); desgaste = $(if ($c -and $c.Wear -ne $null) { [int]$c.Wear } else { $null }) }
})
$t = Get-CimInstance -Namespace root/wmi MSAcpi_ThermalZoneTemperature | Select-Object -First 1
$r.cpuTemp = $(if ($t) { [math]::Round($t.CurrentTemperature / 10 - 273.15) } else { $null })
$b = Get-CimInstance Win32_Battery | Select-Object -First 1
if ($b) {
  $p = Get-CimInstance -Namespace root/wmi BatteryStaticData | Select-Object -First 1
  $a = Get-CimInstance -Namespace root/wmi BatteryFullChargedCapacity | Select-Object -First 1
  $r.bateria = [pscustomobject]@{ carga = [int]$b.EstimatedChargeRemaining; projetadaMwh = $(if ($p) { [int]$p.DesignedCapacity } else { $null }); atualMwh = $(if ($a) { [int]$a.FullChargedCapacity } else { $null }) }
} else { $r.bateria = $null }
$r.inicializacao = @(Get-CimInstance Win32_StartupCommand | ForEach-Object { [string]$_.Name })
$m = Get-MpComputerStatus
$r.defender = $(if ($m) { [pscustomobject]@{ ligado = [bool]$m.AntivirusEnabled; tempoReal = [bool]$m.RealTimeProtectionEnabled; assinaturaDias = $(if ($m.AntivirusSignatureAge -ne $null -and $m.AntivirusSignatureAge -lt 60000) { [int]$m.AntivirusSignatureAge } else { $null }); varreduraDias = $(if ($m.QuickScanAge -ne $null -and $m.QuickScanAge -lt 60000) { [int]$m.QuickScanAge } else { $null }) } } else { $null })
$r.outrosAntivirus = @(Get-CimInstance -Namespace root/SecurityCenter2 AntiVirusProduct | ForEach-Object { [string]$_.displayName })
$r.firewall = @(Get-NetFirewallProfile | ForEach-Object { [pscustomobject]@{ nome = [string]$_.Name; ligado = [bool]($_.Enabled -eq 1 -or $_.Enabled -eq $true -or [string]$_.Enabled -eq 'True') } })
$h = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
$r.ultimaAtualizacao = $(if ($h) { $h.InstalledOn.ToUniversalTime().ToString('o') } else { $null })
$r.reinicioPendente = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$r | ConvertTo-Json -Depth 4 -Compress
`

function powershell(): Promise<Leitura> {
  if (process.platform !== 'win32') return Promise.reject(new Error('O raio-X funciona só no Windows.'))
  return new Promise((ok, erro) => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (e, out) => {
    const texto = String(out ?? '').trim()
    const inicio = texto.indexOf('{')
    if (inicio < 0) return erro(new Error(e ? `O Windows não respondeu ao raio-X (${e.message.slice(0, 80)}).` : 'O Windows não respondeu ao raio-X.'))
    try { ok(JSON.parse(texto.slice(inicio)) as Leitura) } catch { erro(new Error('Não entendi a resposta do Windows.')) }
  }))
}

function placaDeVideo(): Promise<Leitura['gpu']> {
  return new Promise((ok) => execFile('nvidia-smi', ['--query-gpu=name,temperature.gpu,utilization.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 4000 }, (e, out) => {
    if (e) return ok(null)
    const [nome, temp, uso] = String(out).split('\n')[0].split(',').map((x) => x.trim())
    ok(Number.isFinite(Number(temp)) ? { nome, temp: Number(temp), uso: Number(uso) || 0 } : null)
  }))
}

/** O raio-X completo: leitura + achados (do mais grave para o menos). */
export async function raioX(): Promise<{ leitura: Leitura; achados: Achado[] }> {
  const [leitura, gpu] = await Promise.all([powershell(), placaDeVideo()])
  leitura.gpu = gpu
  return { leitura, achados: analisar(leitura) }
}

export { resumoFalado }

// ---------- Check-up semanal ----------

const arquivo = (): string => join(app.getPath('userData'), 'checkup.json')
const ultimoCheckup = (): number => { try { return existsSync(arquivo()) ? Number(JSON.parse(readFileSync(arquivo(), 'utf8')).ultimo) || 0 : 0 } catch { return 0 } }

/** Uma vez por semana, com o PC à toa há um tempo: faz o raio-X e só avisa se tiver problema. */
export function iniciarCheckup(o: { avisar(texto: string): void; ocioso(): number; log(t: string): void }): void {
  if (variavel('FRIDAY_CHECKUP') === '0') return
  const tentar = async () => {
    if (Date.now() - ultimoCheckup() < 7 * 86_400_000) return
    if (o.ocioso() < 120) return // espera um momento em que você não esteja usando o PC
    try {
      const { achados } = await raioX()
      writeFileSync(arquivo(), JSON.stringify({ ultimo: Date.now() }))
      const problemas = achados.filter((a) => a.gravidade > 0)
      o.log(`check-up semanal: ${problemas.length} pontos de atenção`)
      if (problemas.length) o.avisar(`Fiz o check-up semanal do PC. ${problemas.slice(0, 3).map((a) => a.texto).join(' ')}${problemas.length > 3 ? ` E mais ${problemas.length - 3}; peça o raio-X para ver tudo.` : ''}`)
    } catch (e) {
      o.log(`check-up: ${(e as Error).message}`)
    }
  }
  setInterval(() => void tentar(), 30 * 60_000)
}
