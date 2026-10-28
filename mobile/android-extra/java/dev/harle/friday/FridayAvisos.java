// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Avisos por voz: quando chega uma ligação ("Senhor, a Mãe está te ligando") ou uma mensagem de um
// contato importante, a FRIDAY fala, mesmo com o app fechado (e, se você estiver no PC, quem fala é
// o PC). Também guarda por um tempo as últimas mensagens, só na memória, para você responder por
// voz; liga o modo carro quando o celular conecta no Bluetooth do carro; e faz o resumo da manhã
// quando você desliga o alarme. Fica quieta no modo silencioso e durante ligações; no Não perturbe,
// só os importantes passam.
package dev.harle.friday;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.Person;
import android.app.RemoteInput;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class FridayAvisos extends NotificationListenerService {

    static volatile boolean conectado;
    static volatile boolean modoCarro;
    static volatile FridayAvisos instancia;

    /**
     * Conversa que o agente de consultas está acompanhando (nome do contato no WhatsApp; vazio = nenhuma).
     * As mensagens dela são guardadas todas (não só a última) e não são anunciadas em voz alta.
     */
    static volatile String vigiado = "";
    static volatile long vigiadoDesde;

    static void vigiar(String nome) {
        vigiado = nome == null ? "" : nome.trim();
        vigiadoDesde = System.currentTimeMillis() - 5_000L;
    }

    private static boolean ehVigiado(String nome) {
        String v = vigiado;
        if (v.isEmpty() || nome == null || nome.isEmpty()) return false;
        String a = Nomes.normalizar(nome), b = Nomes.normalizar(v);
        return !a.isEmpty() && !b.isEmpty() && (a.contains(b) || b.contains(a));
    }

    /** Uma mensagem que chegou: guardada só na memória, por 2 horas, para responder por voz. */
    static final class Msg {
        String app;
        String pacote;
        String remetente;
        String grupo;
        String texto;
        long quando;
        Notification.Action resposta;
        boolean importante;
        boolean avisada;
    }

    private static final List<Msg> RECENTES = new ArrayList<>();
    /** A última mensagem que ela falou em voz alta ("responde que já vou" sem dizer para quem). */
    private static volatile Msg ultimaAvisada;

    /** Apps de mensagem e como a FRIDAY fala o nome deles ("" = SMS). */
    private static final Map<String, String> MENSAGENS = new HashMap<>();
    static {
        MENSAGENS.put("com.whatsapp", "WhatsApp");
        MENSAGENS.put("com.whatsapp.w4b", "WhatsApp Business");
        MENSAGENS.put("org.telegram.messenger", "Telegram");
        MENSAGENS.put("org.thunderdog.challegram", "Telegram");
        MENSAGENS.put("org.thoughtcrime.securesms", "Signal");
        MENSAGENS.put("com.facebook.orca", "Messenger");
        MENSAGENS.put("com.instagram.android", "Instagram");
        MENSAGENS.put("com.discord", "Discord");
        MENSAGENS.put("com.google.android.apps.messaging", "");
        MENSAGENS.put("com.samsung.android.messaging", "");
        MENSAGENS.put("com.android.mms", "");
    }

    /** Apps de relógio (o alarme sendo desligado dispara o resumo da manhã). */
    private static final String[] RELOGIOS = {
        "com.google.android.deskclock", "com.android.deskclock", "com.sec.android.app.clockpackage", "com.oneplus.deskclock",
        "com.miui.clock", "com.android.alarmclock", "com.coloros.alarmclock", "com.huawei.deskclock", "com.motorola.timeweatherwidget"
    };

    private final Map<String, Long> vistos = new HashMap<>();
    private BroadcastReceiver bluetooth;

    @Override
    public void onListenerConnected() {
        conectado = true;
        instancia = this;
        ligarBluetooth();
    }

    @Override
    public void onListenerDisconnected() {
        conectado = false;
        instancia = null;
        desligarBluetooth();
    }

    @Override
    public void onDestroy() {
        desligarBluetooth();
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            tratar(sbn);
        } catch (Exception ignorado) {
            // Uma notificação estranha nunca derruba o serviço
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        try {
            alarmeDesligado(sbn);
        } catch (Exception ignorado) {
            // idem
        }
    }

    private static String texto(CharSequence c) {
        return c == null ? "" : c.toString().trim();
    }

    /** Já avisou isso há pouco? */
    private boolean visto(String chave, long janelaMs) {
        long agora = System.currentTimeMillis();
        // Cada chave guarda até quando vale
        for (Iterator<Map.Entry<String, Long>> it = vistos.entrySet().iterator(); it.hasNext(); ) {
            if (it.next().getValue() < agora) it.remove();
        }
        Long ate = vistos.get(chave);
        if (ate != null && ate > agora) return true;
        vistos.put(chave, agora + janelaMs);
        return false;
    }

    private static List<String> lista(JSONArray a) {
        List<String> l = new ArrayList<>();
        for (int i = 0; a != null && i < a.length(); i++) l.add(a.optString(i));
        return l;
    }

    /** Pode falar agora? Modo silencioso e ligação em andamento calam; o Não perturbe só deixa os importantes. No carro, fala sempre (menos em ligação). */
    private boolean podeFalar(boolean importante) {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        int modo = am.getMode();
        if (modo == AudioManager.MODE_IN_CALL || modo == AudioManager.MODE_IN_COMMUNICATION) return false;
        if (modoCarro) return true;
        if (am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return false;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        return importante || nm.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL;
    }

    private void anunciar(String frase, boolean ligacao) {
        // Com a conversa por voz aberta, ela não fala por cima: o aviso vira um cartão na tela
        if (FridayVozServico.ativo && CelularPlugin.instancia != null) {
            CelularPlugin.instancia.avisarAviso(frase);
            return;
        }
        Locutor.falar(this, frase, ligacao);
    }

    // ---------- Mensagens guardadas (para responder por voz) ----------

    private static void guardar(Msg m) {
        synchronized (RECENTES) {
            long agora = System.currentTimeMillis();
            for (Iterator<Msg> it = RECENTES.iterator(); it.hasNext(); ) if (agora - it.next().quando > 2 * 3600_000L) it.remove();
            RECENTES.add(m);
            while (RECENTES.size() > 40) RECENTES.remove(0);
        }
    }

    /** As últimas mensagens (mais nova por último), sem nada do que dá para responder. */
    static JSONArray recentes(boolean soImportantes) {
        JSONArray a = new JSONArray();
        synchronized (RECENTES) {
            for (Msg m : RECENTES) {
                if (soImportantes && !m.importante) continue;
                try {
                    a.put(new JSONObject().put("app", m.app.isEmpty() ? "SMS" : m.app).put("remetente", m.remetente)
                        .put("grupo", m.grupo == null ? "" : m.grupo).put("texto", m.texto).put("quando", m.quando)
                        .put("responder", m.resposta != null));
                } catch (Exception ignorado) {
                    // pula
                }
            }
        }
        return a;
    }

    /** Responde pelo botão "Responder" da notificação. `remetente` vazio = a última mensagem que ela avisou. Devolve para quem foi. */
    static String responder(Context c, String remetente, String resposta) throws Exception {
        Msg alvo = null;
        String procurado = Nomes.normalizar(remetente);
        synchronized (RECENTES) {
            for (int i = RECENTES.size() - 1; i >= 0; i--) {
                Msg m = RECENTES.get(i);
                if (m.resposta == null) continue;
                if (procurado.isEmpty()) {
                    if (ultimaAvisada != null && m != ultimaAvisada && !Nomes.normalizar(m.remetente).equals(Nomes.normalizar(ultimaAvisada.remetente))) continue;
                    alvo = m;
                    break;
                }
                List<String> um = new ArrayList<>();
                um.add(remetente);
                if (Nomes.ehImportante(m.remetente, um) || (m.grupo != null && Nomes.ehImportante(m.grupo, um))) {
                    alvo = m;
                    break;
                }
            }
        }
        if (alvo == null) throw new IllegalStateException(procurado.isEmpty() ? "Não tenho nenhuma mensagem recente para responder." : "Não achei mensagem recente de " + remetente + " para responder.");
        RemoteInput[] entradas = alvo.resposta.getRemoteInputs();
        Bundle valores = new Bundle();
        for (RemoteInput r : entradas) valores.putCharSequence(r.getResultKey(), resposta);
        Intent i = new Intent().addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        RemoteInput.addResultsToIntent(entradas, i, valores);
        alvo.resposta.actionIntent.send(c, 0, i);
        alvo.resposta = null; // o app troca a notificação depois de responder
        return alvo.grupo != null && !alvo.grupo.isEmpty() ? alvo.grupo : alvo.remetente;
    }

    private static Notification.Action acaoDeResposta(Notification n) {
        if (n.actions == null) return null;
        for (Notification.Action a : n.actions) {
            RemoteInput[] r = a.getRemoteInputs();
            if (r != null && r.length > 0 && a.actionIntent != null) return a;
        }
        return null;
    }

    // ---------- Notificações ----------

    private void tratar(StatusBarNotification sbn) {
        String pacote = sbn.getPackageName();
        if (pacote.equals(getPackageName())) return;
        Notification n = sbn.getNotification();
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        JSONObject cfg = Locutor.lerJson(this, "avisos");
        String tratamento = cfg.optString("tratamento", "Senhor");
        List<String> importantes = lista(cfg.optJSONArray("importantes"));
        Bundle ex = n.extras;
        String titulo = texto(ex.getCharSequence(Notification.EXTRA_TITLE));

        // ---------- Ligação chegando ----------
        if (Notification.CATEGORY_CALL.equals(n.category)) {
            if (!cfg.optBoolean("ligacoes", true)) return;
            if (ex.containsKey("android.callType")) {
                if (ex.getInt("android.callType") != 1) return; // 1 = chamada recebida (CallStyle)
            } else if (n.fullScreenIntent == null || ex.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER)) {
                return; // ligação em andamento, não chegando
            }
            String quem = titulo;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                Object pessoa = ex.get("android.callPerson");
                if (pessoa instanceof Person && ((Person) pessoa).getName() != null) quem = ((Person) pessoa).getName().toString();
            }
            if (visto("ligacao:" + sbn.getKey(), 60_000L)) return;
            boolean importante = Nomes.ehImportante(quem, importantes);
            if (cfg.optBoolean("soImportantes", false) && !importante && !modoCarro) return;
            if (!podeFalar(importante)) return;
            String app = MENSAGENS.containsKey(pacote) ? MENSAGENS.get(pacote) : "";
            anunciar(Nomes.fraseLigacao(tratamento, quem, app), true);
            return;
        }

        // ---------- Mensagens ----------
        if (!MENSAGENS.containsKey(pacote)) return;
        String remetente = titulo;
        String mensagem = texto(ex.getCharSequence(Notification.EXTRA_TEXT));
        String grupo = null;
        long quando = sbn.getPostTime();
        NotificationCompat.MessagingStyle estilo = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n);

        // Conversa do agente de consultas: guarda todas as mensagens novas, em silêncio
        if (estilo != null && !estilo.isGroupConversation() && (ehVigiado(titulo) || (estilo.getConversationTitle() != null && ehVigiado(estilo.getConversationTitle().toString())))) {
            Notification.Action acao = acaoDeResposta(n);
            for (NotificationCompat.MessagingStyle.Message mm : estilo.getMessages()) {
                if (mm.getPerson() == null || mm.getTimestamp() < vigiadoDesde) continue; // as suas ficam de fora
                String t = texto(mm.getText());
                if (t.isEmpty() || visto("vig:" + mm.getTimestamp() + "|" + t.hashCode(), 6 * 3600_000L)) continue;
                Msg m = new Msg();
                m.app = MENSAGENS.get(pacote);
                m.pacote = pacote;
                m.remetente = mm.getPerson().getName() != null ? mm.getPerson().getName().toString() : titulo;
                m.texto = t.length() > 1500 ? t.substring(0, 1500) : t;
                m.quando = mm.getTimestamp();
                m.resposta = acao;
                guardar(m);
            }
            return;
        }

        if (estilo != null && !estilo.getMessages().isEmpty()) {
            List<NotificationCompat.MessagingStyle.Message> msgs = estilo.getMessages();
            NotificationCompat.MessagingStyle.Message ultima = msgs.get(msgs.size() - 1);
            if (ultima.getPerson() == null) return; // mensagem sua
            if (ultima.getPerson().getName() != null) remetente = ultima.getPerson().getName().toString();
            mensagem = texto(ultima.getText());
            quando = ultima.getTimestamp();
            if (estilo.isGroupConversation() && estilo.getConversationTitle() != null) grupo = estilo.getConversationTitle().toString();
        }
        if (remetente.isEmpty() || System.currentTimeMillis() - quando > 2 * 60_000L) return;
        if (visto("msg:" + pacote + "|" + Nomes.normalizar(remetente) + "|" + quando + "|" + mensagem.hashCode(), 10 * 60_000L)) return;

        Msg m = new Msg();
        m.app = MENSAGENS.get(pacote);
        m.pacote = pacote;
        m.remetente = remetente;
        m.grupo = grupo;
        m.texto = mensagem.length() > 500 ? mensagem.substring(0, 500) : mensagem;
        m.quando = quando;
        m.resposta = acaoDeResposta(n);
        m.importante = Nomes.ehImportante(remetente, importantes) || (grupo != null && Nomes.ehImportante(grupo, importantes));
        guardar(m);

        // No carro, toda mensagem é lida; fora dele, só as dos importantes
        if (!modoCarro && (!cfg.optBoolean("mensagens", true) || !m.importante)) return;
        if (!podeFalar(m.importante)) return;
        m.avisada = true;
        ultimaAvisada = m;
        boolean lerTexto = modoCarro || cfg.optBoolean("lerTexto", false);
        anunciar(Nomes.fraseMensagem(tratamento, remetente, m.app, grupo, lerTexto ? mensagem : null), false);
    }

    /** Mensagens dos importantes que chegaram sem ela poder falar (dormindo, silencioso). Para o resumo da manhã. */
    static List<String> naoAvisadasDesde(long desde) {
        List<String> nomes = new ArrayList<>();
        synchronized (RECENTES) {
            for (Msg m : RECENTES) {
                if (m.importante && !m.avisada && m.quando >= desde && !nomes.contains(Nomes.limpo(m.remetente))) nomes.add(Nomes.limpo(m.remetente));
            }
        }
        return nomes;
    }

    // ---------- Resumo da manhã ----------

    private void alarmeDesligado(StatusBarNotification sbn) {
        Notification n = sbn.getNotification();
        boolean relogio = false;
        for (String r : RELOGIOS) if (r.equals(sbn.getPackageName())) relogio = true;
        if (!Notification.CATEGORY_ALARM.equals(n.category) && !relogio) return;
        if (relogio && !Notification.CATEGORY_ALARM.equals(n.category) && (n.flags & Notification.FLAG_ONGOING_EVENT) == 0) return;
        int hora = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        if (hora < 4 || hora >= 12) return;
        JSONObject cfg = Locutor.lerJson(this, "avisos");
        if (!cfg.optBoolean("resumoManha", true)) return;
        Resumo.falarUmaVezPorDia(this);
    }

    // ---------- Modo carro (Bluetooth do carro) ----------

    private boolean podeBluetooth() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    void ligarBluetooth() {
        if (bluetooth != null || !podeBluetooth()) return;
        bluetooth = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                try {
                    carroMudou(i);
                } catch (Exception ignorado) {
                    // sem permissão ou aparelho estranho
                }
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(bluetooth, f, Context.RECEIVER_EXPORTED);
        else registerReceiver(bluetooth, f);
    }

    private void desligarBluetooth() {
        if (bluetooth == null) return;
        try {
            unregisterReceiver(bluetooth);
        } catch (Exception ignorado) {
            // já estava fora
        }
        bluetooth = null;
    }

    @SuppressLint("MissingPermission")
    private void carroMudou(Intent i) {
        JSONObject cfg = Locutor.lerJson(this, "avisos");
        if (!cfg.optBoolean("modoCarro", false)) return;
        BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
        if (d == null || !podeBluetooth()) return;
        String nome = d.getName() == null ? "" : d.getName();
        String procurado = cfg.optString("carroNome", "").trim();
        boolean carro;
        if (!procurado.isEmpty()) {
            carro = Nomes.normalizar(nome).contains(Nomes.normalizar(procurado));
        } else {
            BluetoothClass classe = d.getBluetoothClass();
            int tipo = classe == null ? 0 : classe.getDeviceClass();
            carro = tipo == BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO || tipo == BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE;
        }
        if (!carro) return;
        boolean ligou = BluetoothDevice.ACTION_ACL_CONNECTED.equals(i.getAction());
        if (ligou == modoCarro) return;
        modoCarro = ligou;
        if (CelularPlugin.instancia != null) CelularPlugin.instancia.avisarCarro(ligou);
        if (ligou) Locutor.falar(this, "Modo carro ligado. Eu leio as mensagens e você responde falando.", false, false);
    }
}
