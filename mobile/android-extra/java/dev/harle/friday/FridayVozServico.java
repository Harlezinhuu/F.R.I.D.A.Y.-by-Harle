// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Mantém o microfone da conversa por voz ligado quando a FRIDAY abre outro app (o Android corta o
// microfone de apps em segundo plano). Fica uma notificação fixa com "Encerrar" enquanto ela ouve.
package dev.harle.friday;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

public class FridayVozServico extends Service {

    static final String CANAL = "friday_voz";
    static final String ENCERRAR = "dev.harle.friday.ENCERRAR_VOZ";
    static final int ID = 4242;
    /** A conversa por voz está aberta (os avisos viram cartão em vez de falar por cima). */
    static volatile boolean ativo;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ENCERRAR.equals(intent.getAction())) {
            if (CelularPlugin.instancia != null) CelularPlugin.instancia.avisarEncerrarVoz();
            parar();
            return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel canal = new NotificationChannel(CANAL, "FRIDAY ouvindo", NotificationManager.IMPORTANCE_LOW);
            canal.setDescription("Aparece enquanto a conversa por voz está aberta");
            canal.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(canal);
        }
        int imutavel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent voltar = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent abrir = PendingIntent.getActivity(this, 0, voltar, imutavel | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent encerrar = PendingIntent.getService(this, 1, new Intent(this, FridayVozServico.class).setAction(ENCERRAR), imutavel | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_friday)
            .setContentTitle("FRIDAY está ouvindo")
            .setContentText("Toque para voltar à conversa")
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(abrir)
            .addAction(0, "Encerrar", encerrar)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(ID, n);
            ativo = true;
        } catch (Exception e) {
            // Sem permissão do microfone ou aberto com o app em segundo plano: segue sem o serviço
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void parar() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        ativo = false;
        super.onDestroy();
    }
}
