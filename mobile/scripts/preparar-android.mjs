// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ajusta o projeto Android gerado pelo Capacitor (npx cap add android):
// código nativo da FRIDAY (controle do celular, acessibilidade, voz em segundo plano, assistente padrão),
// permissões, ícone das notificações, número da versão e assinatura do APK
// (a chave vem dos segredos do GitHub, nunca do repositório).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = join(raiz, 'android', 'app')
const pacote = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))

// Código nativo da FRIDAY (substitui a MainActivity gerada para registrar a ponte)
const extra = join(raiz, 'android-extra')
cpSync(join(extra, 'java'), join(app, 'src', 'main', 'java'), { recursive: true })
cpSync(join(extra, 'res'), join(app, 'src', 'main', 'res'), { recursive: true })

// Permissões
const manifesto = join(app, 'src', 'main', 'AndroidManifest.xml')
let m = readFileSync(manifesto, 'utf8')
if (!m.includes('xmlns:tools=')) m = m.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ')
const permissoes = [
  'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'WAKE_LOCK',
  // Controle do celular
  'READ_CONTACTS', 'WRITE_CONTACTS', 'CALL_PHONE', 'SEND_SMS', 'READ_CALENDAR', 'WRITE_CALENDAR', 'ACCESS_NOTIFICATION_POLICY',
  'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MICROPHONE'
]
const linhas = [
  ...permissoes.filter((p) => !m.includes(`android.permission.${p}"`)).map((p) => `    <uses-permission android:name="android.permission.${p}" />`),
  '    <uses-permission android:name="com.android.alarm.permission.SET_ALARM" />',
  '    <uses-permission android:name="android.permission.WRITE_SETTINGS" tools:ignore="ProtectedPermissions" />',
  // Sem câmera ou telefone o app ainda instala (tablets)
  '    <uses-feature android:name="android.hardware.telephony" android:required="false" />',
  '    <uses-feature android:name="android.hardware.camera.flash" android:required="false" />',
  // Apps que a FRIDAY pode listar e abrir (Android 11+ esconde os outros)
  '    <queries>',
  '        <intent><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent>',
  '        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>',
  '        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="geo" /></intent>',
  '        <package android:name="com.whatsapp" />',
  '        <package android:name="com.whatsapp.w4b" />',
  '        <package android:name="com.google.android.apps.maps" />',
  '    </queries>'
].join('\n')
if (!m.includes('FridayAcessibilidade')) {
  m = m.replace('</manifest>', `${linhas}\n</manifest>`)
  // Assistente padrão: segurar o botão de ligar (ou de início) abre a FRIDAY já ouvindo
  m = m.replace('</activity>', `    <intent-filter>
                <action android:name="android.intent.action.ASSIST" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VOICE_COMMAND" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </activity>`)
  m = m.replace('</application>', `    <service
            android:name=".FridayAcessibilidade"
            android:exported="true"
            android:label="@string/friday_acessibilidade_nome"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data android:name="android.accessibilityservice" android:resource="@xml/friday_acessibilidade" />
        </service>
        <service
            android:name=".FridayVozServico"
            android:exported="false"
            android:foregroundServiceType="microphone" />
    </application>`)
}
// Avisos por voz: lê as notificações de ligação e de mensagem (só com o acesso liberado pelo usuário)
if (!m.includes('FridayAvisos')) {
  m = m.replace('</application>', `    <service
            android:name=".FridayAvisos"
            android:exported="true"
            android:label="FRIDAY: avisos por voz"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
    </application>`)
}
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
