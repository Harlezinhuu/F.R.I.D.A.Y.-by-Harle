// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ajusta o projeto Android gerado pelo Capacitor (npx cap add android):
// permissões (microfone, câmera, notificações, localização), ícone das notificações,
// número da versão e assinatura do APK (a chave vem dos segredos do GitHub, nunca do repositório).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = join(raiz, 'android', 'app')
const pacote = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))

// Permissões
const manifesto = join(app, 'src', 'main', 'AndroidManifest.xml')
let m = readFileSync(manifesto, 'utf8')
const permissoes = ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'WAKE_LOCK']
const linhas = permissoes.filter((p) => !m.includes(`android.permission.${p}"`)).map((p) => `    <uses-permission android:name="android.permission.${p}" />`).join('\n')
if (linhas) m = m.replace('</manifest>', `${linhas}\n</manifest>`)
writeFileSync(manifesto, m)

// Ícone pequeno das notificações (hexágono da FRIDAY, branco como o Android pede)
const drawable = join(app, 'src', 'main', 'res', 'drawable')
mkdirSync(drawable, { recursive: true })
writeFileSync(join(drawable, 'ic_stat_friday.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="30" android:viewportHeight="30">
  <path android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:fillColor="#00000000" android:pathData="M15,3 L26,9.5 L26,20.5 L15,27 L4,20.5 L4,9.5 Z"/>
  <path android:fillColor="#FFFFFFFF" android:pathData="M15,9.5 L20,12.3 L20,17.7 L15,20.5 L10,17.7 L10,12.3 Z"/>
</vector>
`)

// Versão e assinatura
const gradle = join(app, 'build.gradle')
let g = readFileSync(gradle, 'utf8')
const codigo = Number(process.env.GITHUB_RUN_NUMBER || 1)
g = g.replace(/versionCode\s+\d+/, `versionCode ${codigo}`).replace(/versionName\s+"[^"]*"/, `versionName "${pacote.version}"`)
if (existsSync(join(app, 'friday.keystore')) && !g.includes('signingConfigs')) {
  g = g.replace(/(\n\s*buildTypes\s*\{)/, `
    signingConfigs {
        release {
            storeFile file('friday.keystore')
            storePassword System.getenv('KEYSTORE_SENHA')
            keyAlias 'friday'
            keyPassword System.getenv('KEYSTORE_SENHA')
        }
    }$1`)
  g = g.replace(/(release\s*\{)(?![\s\S]*storeFile)/, '$1\n            signingConfig signingConfigs.release')
  // A troca acima pega o primeiro "release {" depois de signingConfigs: o de buildTypes
  console.log('Assinatura configurada.')
} else console.log('Sem chave de assinatura: o APK sai assinado com a chave de depuração.')
writeFileSync(gradle, g)
console.log(`Android pronto: versão ${pacote.version} (${codigo}).`)
