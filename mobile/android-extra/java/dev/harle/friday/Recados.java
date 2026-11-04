// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Recados do PC que chegam mesmo com o app fechado e o celular longe de casa: "cadê meu celular"
// (toca a sirene) e os alertas do modo sentinela. Usa o mesmo serviço público de avisos do
// porteiro (ntfy), com tudo lacrado com a chave do pareamento: ninguém de fora manda um recado
// válido e o serviço só vê texto embaralhado. Roda dentro do serviço dos avisos por voz, que o
// Android já mantém vivo.
package dev.harle.friday;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

final class Recados {
    private Recados() {
    }

    private static volatile Thread linha;
    private static volatile boolean ligado;
    private static volatile String ultimoId = "";

    static synchronized void ligar(Context ctx) {
        if (linha != null && linha.isAlive()) return;
        ligado = true;
        Context app = ctx.getApplicationContext();
        linha = new Thread(() -> rodar(app), "friday-recados");
        linha.setDaemon(true);
        linha.start();
    }

    static synchronized void desligar() {
        ligado = false;
        if (linha != null) linha.interrupt();
        linha = null;
    }

    private static void rodar(Context ctx) {
        long espera = 5000;
        while (ligado) {
            try {
                JSONObject cfg = Elo.config(ctx);
                if (cfg == null) {
                    Thread.sleep(60_000);
                    continue;
                }
                String segredo = cfg.getString("segredo");
                byte[] chave = Lacre.chave(segredo);
                String topico = Porteiro.topicoCelular(segredo);
                // Na primeira conexão, pega só o que chegou no último minuto (nada de sirene velha)
                String desde = ultimoId.isEmpty() ? "1m" : ultimoId;
                Porteiro.escutar(chave, topico, desde, (r) -> {
                    if (!r.id.isEmpty()) ultimoId = r.id;
                    if (Porteiro.primeiraVez(r)) tratar(ctx, r.dados);
                });
                espera = 5000;
                Thread.sleep(1000); // a conexão fechou normalmente: reconecta já
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                // sem internet ou o serviço caiu: tenta de novo, cada vez esperando um pouco mais
                try {
                    Thread.sleep(espera);
                } catch (InterruptedException fim) {
                    return;
                }
                espera = Math.min(espera * 2, 120_000);
            }
        }
    }

    private static void tratar(Context ctx, JSONObject d) {
        String acao = d.optString("acao", "");
        String texto = d.optString("texto", "");
        if ("tocar".equals(acao)) Sirene.tocar(ctx, texto.isEmpty() ? "A FRIDAY do PC está te procurando. Toque para parar." : texto);
        else if ("parar".equals(acao)) Sirene.parar();
        else if ("alerta".equals(acao)) avisar(ctx, texto);
    }

    /** Alerta urgente (modo sentinela): notificação de prioridade máxima, que abre o app. */
    private static void avisar(Context ctx, String texto) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || texto.isEmpty()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(new NotificationChannel("friday_alerta", "Alertas da FRIDAY do PC", NotificationManager.IMPORTANCE_HIGH));
            }
            Intent abrir = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 4402, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            nm.notify((int) (System.currentTimeMillis() % 100000) + 5000, new NotificationCompat.Builder(ctx, "friday_alerta")
                .setSmallIcon(R.drawable.ic_stat_friday)
                .setContentTitle("FRIDAY · alerta do PC")
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build());
        } catch (Exception ignorado) {
            // sem permissão de notificação
        }
    }
}
