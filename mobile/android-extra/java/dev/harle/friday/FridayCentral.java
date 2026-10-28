// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Central do quarto: o celular que fica em casa, na tomada, vira um "Echo Dot" da FRIDAY.
//
// - Ouvido: escuta o microfone o tempo todo e procura a palavra "Friday" AQUI, no aparelho (Vosk,
//   sem internet). Nada sai do celular até ela ouvir a palavra. Supressão de ruído e cancelamento
//   de eco do Android ligados; um nível mínimo de voz evita disparos com sons distantes.
// - Ao ouvir: acende a tela e abre a FRIDAY já conversando. O áudio dito logo depois do "Friday"
//   ("Friday, que horas são?") fica guardado e vai junto para a conversa.
// - Elo: avisa o PC a cada 30 s que a central está no ar; enquanto isso o PC não ouve "Friday"
//   (fica só nas mãos), para as duas não responderem juntas.
// - Porteiro: recebe da rua o pedido "liga o PC" e manda o pacote mágico pela rede de casa.
package dev.harle.friday;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class FridayCentral extends Service {

    static final String CANAL = "friday_central";
    static final String CANAL_CHAMADA = "friday_central_chamada";
    static final int ID = 4343;
    static final int ID_CHAMADA = 4344;
    static final String SILENCIAR = "dev.harle.friday.CENTRAL_SILENCIAR";
    static final String DESLIGAR = "dev.harle.friday.CENTRAL_DESLIGAR";
    static final String MODELO = "vosk-model-small-en-us-0.15";
    private static final int TAXA = 16000;

    static volatile FridayCentral instancia;
    static volatile boolean rodando;
    /** Microfone com ela: "ouvindo", "pausada" (conversa aberta), "sem modelo", "microfone ocupado" */
    static volatile String estado = "desligada";
    static volatile long silenciadaAte;
    static volatile long ultimoDisparo;
    /** Últimas vezes que ela ouviu "friday" (para calibrar a sensibilidade nos testes). */
    private static final List<String> REGISTRO = new ArrayList<>();

    private volatile boolean ligada;
    private volatile boolean pausada;
    private volatile boolean microfoneSolto = true;
    private volatile boolean gravandoDepois;
    private final ByteArrayOutputStream depois = new ByteArrayOutputStream();
    private Thread ouvido;
    private Thread elo;
    private Thread porteiro;

    static File pastaModelo(Context c) {
        return new File(c.getFilesDir(), MODELO);
    }

    static boolean temModelo(Context c) {
        return new File(pastaModelo(c), "am/final.mdl").exists();
    }

    static JSONObject config(Context c) {
        return Locutor.lerJson(c, "central");
    }

    /** Muda um campo da configuração que o app guarda (mesmo lugar das Preferences do Capacitor). */
    static void salvarCampo(Context c, String campo, Object valor) {
        try {
            JSONObject j = config(c).put(campo, valor);
            SharedPreferences sp = c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            sp.edit().putString("central", j.toString()).apply();
        } catch (Exception ignorado) {
            // fica como estava
        }
    }

    static JSONArray registro() {
        synchronized (REGISTRO) {
            return new JSONArray(REGISTRO);
        }
    }

    private static void registrar(String linha) {
        synchronized (REGISTRO) {
            REGISTRO.add(new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()) + " " + linha);
            while (REGISTRO.size() > 15) REGISTRO.remove(0);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String acao = intent == null ? null : intent.getAction();
        if (DESLIGAR.equals(acao)) {
            salvarCampo(this, "ligada", false);
            desligar();
            return START_NOT_STICKY;
        }
        if (SILENCIAR.equals(acao)) {
            silenciadaAte = System.currentTimeMillis() < silenciadaAte ? 0 : System.currentTimeMillis() + 3600_000L;
        }
        try {
            Notification n = notificacao();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(ID, n);
        } catch (Exception e) {
            // Aberto sem o app na frente (Android 14+ não deixa usar o microfone assim): o app religa
            estado = "precisa abrir o app";
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!ligada) {
            ligada = true;
            rodando = true;
            instancia = this;
            ouvido = new Thread(this::ouvir, "friday-ouvido");
            ouvido.start();
            elo = new Thread(this::avisarPc, "friday-central-elo");
            elo.start();
            porteiro = new Thread(this::serPorteiro, "friday-porteiro");
            porteiro.start();
        }
        return START_STICKY;
    }

    void atualizarNotificacao() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null && ligada) nm.notify(ID, notificacao());
    }

    private Notification notificacao() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel canal = new NotificationChannel(CANAL, "Central do quarto", NotificationManager.IMPORTANCE_LOW);
            canal.setDescription("Aparece enquanto este celular é a central que ouve \"Friday\"");
            canal.setShowBadge(false);
            nm.createNotificationChannel(canal);
        }
        int imutavel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent abrir = PendingIntent.getActivity(this, 10, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT), imutavel | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent silenciar = PendingIntent.getService(this, 11, new Intent(this, FridayCentral.class).setAction(SILENCIAR), imutavel | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent desligar = PendingIntent.getService(this, 12, new Intent(this, FridayCentral.class).setAction(DESLIGAR), imutavel | PendingIntent.FLAG_UPDATE_CURRENT);
        boolean quieta = System.currentTimeMillis() < silenciadaAte;
        String texto = quieta
            ? "Quieta até " + new SimpleDateFormat("HH:mm", Locale.US).format(new Date(silenciadaAte))
            : "Ouvindo \"Friday\" só aqui no aparelho";
        return new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_friday)
            .setContentTitle("FRIDAY · central do quarto")
            .setContentText(texto)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(abrir)
            .addAction(0, quieta ? "Voltar a ouvir" : "Quieta por 1 h", silenciar)
            .addAction(0, "Desligar", desligar)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    // ---------- Ouvido ----------

    private float limiar() {
        switch (config(this).optString("sensibilidade", "normal")) {
            case "sensivel": return 0.008f;
            case "exigente": return 0.03f;
            default: return 0.015f;
        }
    }

    private static String campo(String json, String nome) {
        try {
            return new JSONObject(json).optString(nome, "");
        } catch (Exception e) {
            return "";
        }
    }

    private void ouvir() {
        if (!temModelo(this)) {
            estado = "sem modelo";
            registrar("sem o modelo da palavra: baixe nos Ajustes");
            return;
        }
        Model modelo;
        try {
            LibVosk.setLogLevel(LogLevel.WARNINGS);
            modelo = new Model(pastaModelo(this).getAbsolutePath());
        } catch (Throwable e) {
            estado = "sem modelo";
            registrar("o modelo não abriu: " + e.getMessage());
            return;
        }
        short[] bloco = new short[1600]; // 100 ms
        float[] niveis = new float[10]; // último 1 s
        while (ligada) {
            if (pausada) {
                dormir(150);
                continue;
            }
            AudioRecord rec = null;
            NoiseSuppressor ns = null;
            AcousticEchoCanceler aec = null;
            Recognizer r = null;
            try {
                int minimo = AudioRecord.getMinBufferSize(TAXA, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, TAXA, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimo, 6400));
                if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("microfone ocupado");
                if (NoiseSuppressor.isAvailable()) {
                    ns = NoiseSuppressor.create(rec.getAudioSessionId());
                    if (ns != null) ns.setEnabled(true);
                }
                if (AcousticEchoCanceler.isAvailable()) {
                    aec = AcousticEchoCanceler.create(rec.getAudioSessionId());
                    if (aec != null) aec.setEnabled(true);
                }
                // Gramática restrita: só "friday"; o resto vira [unk]
                r = new Recognizer(modelo, TAXA, "[\"friday\", \"[unk]\"]");
                rec.startRecording();
                microfoneSolto = false;
                estado = "ouvindo";
                long ignorarAte = System.currentTimeMillis() + 800;
                int iNivel = 0;
                while (ligada && !pausada) {
                    int n = rec.read(bloco, 0, bloco.length);
                    if (n < 0) throw new IllegalStateException("o microfone parou (" + n + ")");
                    if (n == 0) continue;
                    long agora = System.currentTimeMillis();
                    if (gravandoDepois) {
                        // Logo depois do "Friday": guarda o que você disse até o app pegar o microfone
                        if (agora - ultimoDisparo < 4500) {
                            synchronized (depois) {
                                for (int i = 0; i < n; i++) {
                                    depois.write(bloco[i] & 0xff);
                                    depois.write((bloco[i] >> 8) & 0xff);
                                }
                            }
                        } else if (agora - ultimoDisparo > 10_000) {
                            // O app não abriu: volta a procurar a palavra
                            gravandoDepois = false;
                            r.reset();
                            ignorarAte = agora + 800;
                        }
                        continue;
                    }
                    double soma = 0;
                    for (int i = 0; i < n; i++) {
                        double v = bloco[i] / 32768.0;
                        soma += v * v;
                    }
                    niveis[iNivel++ % niveis.length] = (float) Math.sqrt(soma / n);
                    boolean fim = r.acceptWaveForm(bloco, n);
                    String texto = fim ? campo(r.getResult(), "text") : campo(r.getPartialResult(), "partial");
                    if (!texto.contains("friday") || agora < ignorarAte || agora - ultimoDisparo < 2500) continue;
                    float pico = 0;
                    for (float x : niveis) pico = Math.max(pico, x);
                    r.reset();
                    String nivel = String.format(Locale.US, "%.3f", pico);
                    if (pico < limiar()) {
                        registrar("ouvi \"friday\" baixo demais (" + nivel + "): ignorei");
                        ignorarAte = agora + 1500;
                    } else if (agora < silenciadaAte) {
                        registrar("ouvi \"friday\" (" + nivel + "), mas estou quieta");
                        ignorarAte = agora + 1500;
                    } else if (FridayVozServico.ativo) {
                        ignorarAte = agora + 1500;
                    } else {
                        registrar("ouvi \"friday\" (" + nivel + "): chamando");
                        disparar();
                    }
                }
            } catch (Throwable e) {
                estado = "microfone ocupado";
                dormir(2000);
            } finally {
                try { if (rec != null) { rec.stop(); } } catch (Exception ignorado) { /* já parado */ }
                if (rec != null) rec.release();
                if (ns != null) ns.release();
                if (aec != null) aec.release();
                if (r != null) r.close();
                microfoneSolto = true;
            }
        }
        modelo.close();
        estado = "desligada";
    }

    private static void dormir(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignorado) {
            Thread.currentThread().interrupt();
        }
    }

    /** Ouviu "Friday": acende a tela e abre a FRIDAY já conversando. */
    private void disparar() {
        ultimoDisparo = System.currentTimeMillis();
        synchronized (depois) {
            depois.reset();
        }
        gravandoDepois = true;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "friday:central");
            wl.acquire(8000);
        } catch (Exception ignorado) {
            // sem acender a tela: a atividade acende sozinha
        }
        Intent i = new Intent(this, MainActivity.class)
            .putExtra(MainActivity.EXTRA_CENTRAL, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        boolean abriu = false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(this)) {
            try {
                startActivity(i);
                abriu = true;
            } catch (Exception ignorado) {
                // cai para a notificação
            }
        }
        if (!abriu) chamarPorNotificacao(i);
    }

    /** Sem a permissão de abrir por cima: notificação de tela cheia (abre sozinha com a tela apagada). */
    private void chamarPorNotificacao(Intent i) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CANAL_CHAMADA, "Central: chamada", NotificationManager.IMPORTANCE_HIGH));
        }
        int imutavel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent p = PendingIntent.getActivity(this, 13, i, imutavel | PendingIntent.FLAG_UPDATE_CURRENT);
        nm.notify(ID_CHAMADA, new NotificationCompat.Builder(this, CANAL_CHAMADA)
            .setSmallIcon(R.drawable.ic_stat_friday)
            .setContentTitle("FRIDAY")
            .setContentText("Pode falar")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(p, true)
            .setContentIntent(p)
            .setAutoCancel(true)
            .setTimeoutAfter(15_000)
            .build());
    }

    /**
     * O app vai usar o microfone (a conversa abriu): solta o microfone e devolve, em base64, o áudio
     * dito logo depois do "Friday" (PCM 16 bits, 16 kHz). Vazio se não foi a central que chamou.
     */
    String soltar() {
        pausada = true;
        long fim = System.currentTimeMillis() + 900;
        while (!microfoneSolto && System.currentTimeMillis() < fim) dormir(30);
        estado = "pausada";
        boolean recente = gravandoDepois && System.currentTimeMillis() - ultimoDisparo < 10_000;
        gravandoDepois = false;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID_CHAMADA);
        if (!recente) return "";
        synchronized (depois) {
            String b64 = Base64.encodeToString(depois.toByteArray(), Base64.NO_WRAP);
            depois.reset();
            return b64;
        }
    }

    /** A conversa terminou: volta a procurar "Friday". */
    void retomar() {
        gravandoDepois = false;
        pausada = false;
    }

    // ---------- Elo com o PC ----------

    private void avisarPc() {
        while (ligada) {
            if (Elo.pareado(this)) {
                try {
                    Elo.pedir(this, new JSONObject().put("acao", "central").put("ativa", true).put("aparelho", Build.MODEL), 3000);
                } catch (Exception ignorado) {
                    // PC desligado: tudo bem
                }
            }
            for (int i = 0; i < 30 && ligada; i++) dormir(1000);
        }
    }

    // ---------- Porteiro ----------

    private void serPorteiro() {
        String desde = "1m";
        int espera = 3000;
        while (ligada) {
            JSONObject cfg = Elo.config(this);
            if (cfg == null || !config(this).optBoolean("porteiro", true)) {
                dormir(15_000);
                continue;
            }
            try {
                byte[] chave = Lacre.chave(cfg.getString("segredo"));
                String topico = Porteiro.topico(cfg.getString("segredo"));
                final String[] ultimo = { null };
                Porteiro.escutar(chave, topico, desde, (r) -> {
                    ultimo[0] = r.id;
                    if ("acordar".equals(r.acao()) && Porteiro.primeiraVez(r)) new Thread(() -> acordarPc(chave, topico, r.dados.optString("de", "celular")), "friday-acordar").start();
                });
                if (ultimo[0] != null) desde = ultimo[0];
                espera = 3000;
                dormir(1000); // a conexão fechou normalmente: reconecta
            } catch (Exception e) {
                // Sem internet ou o serviço caiu: tenta de novo com calma
                dormir(espera);
                espera = Math.min(60_000, espera * 2);
                desde = "2m";
            }
        }
    }

    private boolean pcResponde() {
        try {
            Elo.pedir(this, new JSONObject().put("acao", "ping"), 2500);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void acordarPc(byte[] chave, String topico, String de) {
        try {
            registrar("porteiro: " + de + " pediu para ligar o PC");
            boolean jaLigado = pcResponde();
            int enviados = jaLigado ? 0 : Elo.acordar(this, null, 0);
            Porteiro.publicar(chave, topico, new JSONObject().put("acao", "acordei").put("de", Build.MODEL).put("enviados", enviados).put("jaLigado", jaLigado));
            if (!jaLigado) {
                // O Windows leva um tempo para subir e abrir a FRIDAY do PC
                boolean ligou = false;
                for (int i = 0; i < 30 && ligada && !ligou; i++) {
                    dormir(5000);
                    ligou = pcResponde();
                    if (i == 3 && !ligou) Elo.acordar(this, null, 0); // manda de novo, por garantia
                }
                Porteiro.publicar(chave, topico, new JSONObject().put("acao", ligou ? "pc_ligado" : "pc_nao_ligou").put("de", Build.MODEL));
                registrar(ligou ? "porteiro: o PC ligou" : "porteiro: o PC não respondeu em 2 min e meio");
            } else {
                Porteiro.publicar(chave, topico, new JSONObject().put("acao", "pc_ligado").put("de", Build.MODEL));
            }
        } catch (Exception e) {
            registrar("porteiro: " + e.getMessage());
        }
    }

    // ---------- Fim ----------

    private void desligar() {
        ligada = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        ligada = false;
        rodando = false;
        if (instancia == this) instancia = null;
        estado = "desligada";
        // O PC volta a ouvir "Friday" na hora
        final Context c = getApplicationContext();
        new Thread(() -> {
            try {
                if (Elo.pareado(c)) Elo.pedir(c, new JSONObject().put("acao", "central").put("ativa", false).put("aparelho", Build.MODEL), 3000);
            } catch (Exception ignorado) {
                // PC desligado
            }
        }).start();
        super.onDestroy();
    }
}
