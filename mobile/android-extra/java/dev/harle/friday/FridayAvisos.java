// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Avisos por voz: quando chega uma ligação ("Senhor, a Mãe está te ligando") ou uma mensagem de um
// contato importante, a FRIDAY fala, mesmo com o app fechado. Lê só notificações de ligação e de apps
// de mensagem; não guarda nada. Fica quieta no modo silencioso, durante ligações e, no Não perturbe,
// para quem não é importante.
package dev.harle.friday;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Person;
import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class FridayAvisos extends NotificationListenerService {

    static volatile boolean conectado;

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

    private final Map<String, Long> vistos = new HashMap<>();

    @Override
    public void onListenerConnected() {
        conectado = true;
    }

    @Override
    public void onListenerDisconnected() {
        conectado = false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            tratar(sbn);
        } catch (Exception ignorado) {
            // Uma notificação estranha nunca derruba o serviço
        }
    }

    private static String texto(CharSequence c) {
        return c == null ? "" : c.toString().trim();
    }

    /** Já avisou isso há pouco? */
    private boolean visto(String chave, long janelaMs) {
        long agora = System.currentTimeMillis();
        for (Iterator<Map.Entry<String, Long>> it = vistos.entrySet().iterator(); it.hasNext(); ) {
            if (agora - it.next().getValue() > 10 * 60_000L) it.remove();
        }
        Long antes = vistos.get(chave);
        if (antes != null && agora - antes < janelaMs) return true;
        vistos.put(chave, agora);
        return false;
    }

    private static List<String> lista(JSONArray a) {
        List<String> l = new ArrayList<>();
        for (int i = 0; a != null && i < a.length(); i++) l.add(a.optString(i));
        return l;
    }

    /** Pode falar agora? Modo silencioso e ligação em andamento calam; o Não perturbe só deixa os importantes. */
    private boolean podeFalar(boolean importante) {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return false;
        int modo = am.getMode();
        if (modo == AudioManager.MODE_IN_CALL || modo == AudioManager.MODE_IN_COMMUNICATION) return false;
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
            if (cfg.optBoolean("soImportantes", false) && !importante) return;
            if (!podeFalar(importante)) return;
            String app = MENSAGENS.containsKey(pacote) ? MENSAGENS.get(pacote) : "";
            anunciar(Nomes.fraseLigacao(tratamento, quem, app), true);
            return;
        }

        // ---------- Mensagem de um contato importante ----------
        if (!MENSAGENS.containsKey(pacote) || !cfg.optBoolean("mensagens", true) || importantes.isEmpty()) return;
        String remetente = titulo;
        String mensagem = texto(ex.getCharSequence(Notification.EXTRA_TEXT));
        String grupo = null;
        long quando = sbn.getPostTime();
        NotificationCompat.MessagingStyle estilo = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n);
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
        if (!Nomes.ehImportante(remetente, importantes)) return;
        if (visto("msg:" + pacote + "|" + Nomes.normalizar(remetente) + "|" + quando + "|" + mensagem.hashCode(), 10 * 60_000L)) return;
        if (!podeFalar(true)) return;
        String app = MENSAGENS.get(pacote);
        anunciar(Nomes.fraseMensagem(tratamento, remetente, app, grupo, cfg.optBoolean("lerTexto", false) ? mensagem : null), false);
    }
}
