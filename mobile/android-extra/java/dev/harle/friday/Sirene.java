// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// "Cadê meu celular?": toca o som de alarme no volume máximo (o canal de alarme toca mesmo no
// silencioso), vibra e pisca a lanterna por até um minuto. Para quando você abre o app ou toca
// na notificação. O volume do alarme volta ao que era.
package dev.harle.friday;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.hardware.camera2.CameraManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;

final class Sirene {
    private Sirene() {
    }

    private static final int AVISO = 4401;
    private static final long DURACAO = 60_000L;
    private static final Handler PRINCIPAL = new Handler(Looper.getMainLooper());

    private static MediaPlayer player;
    private static int volumeAntes = -1;
    private static boolean piscando;
    private static Context appCtx;

    static synchronized boolean tocando() {
        return player != null;
    }

    /** Toca a sirene. `texto` aparece na notificação. */
    static synchronized void tocar(Context ctx, String texto) {
        parar();
        appCtx = ctx.getApplicationContext();
        try {
            AudioManager am = (AudioManager) appCtx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                volumeAntes = am.getStreamVolume(AudioManager.STREAM_ALARM);
                am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            }
            Uri som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (som == null) som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            mp.setDataSource(appCtx, som);
            mp.setLooping(true);
            mp.prepare();
            mp.start();
            player = mp;
        } catch (Exception e) {
            player = null;
        }
        vibrar(appCtx, true);
        piscando = true;
        piscar(appCtx, true, 0);
        avisar(appCtx, texto);
        PRINCIPAL.postDelayed(Sirene::parar, DURACAO);
    }

    /** Para tudo e devolve o volume do alarme. */
    static synchronized void parar() {
        PRINCIPAL.removeCallbacksAndMessages(null);
        piscando = false;
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception ignorado) {
                // já parado
            }
            player = null;
        }
        if (appCtx == null) return;
        try {
            AudioManager am = (AudioManager) appCtx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && volumeAntes >= 0) am.setStreamVolume(AudioManager.STREAM_ALARM, volumeAntes, 0);
        } catch (Exception ignorado) {
            // sem permissão para mexer no volume: fica como está
        }
        volumeAntes = -1;
        vibrar(appCtx, false);
        lanterna(appCtx, false);
        NotificationManager nm = (NotificationManager) appCtx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(AVISO);
    }

    @SuppressWarnings("deprecation")
    private static void vibrar(Context ctx, boolean ligar) {
        try {
            Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (!ligar) {
                v.cancel();
                return;
            }
            long[] padrao = { 0, 800, 400 };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(padrao, 0));
            else v.vibrate(padrao, 0);
        } catch (Exception ignorado) {
            // sem vibração
        }
    }

    private static void lanterna(Context ctx, boolean ligar) {
        try {
            CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
            if (cm == null) return;
            for (String id : cm.getCameraIdList()) {
                Boolean flash = cm.getCameraCharacteristics(id).get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (flash != null && flash) {
                    cm.setTorchMode(id, ligar);
                    return;
                }
            }
        } catch (Exception ignorado) {
            // câmera ocupada ou sem flash
        }
    }

    /** Pisca a lanterna a cada meio segundo enquanto toca. */
    private static void piscar(Context ctx, boolean ligar, int vezes) {
        if (!piscando || vezes > 120) {
            lanterna(ctx, false);
            return;
        }
        lanterna(ctx, ligar);
        PRINCIPAL.postDelayed(() -> piscar(ctx, !ligar, vezes + 1), 500);
    }

    private static void avisar(Context ctx, String texto) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel c = new NotificationChannel("friday_achar", "Cadê meu celular", NotificationManager.IMPORTANCE_HIGH);
                c.setSound(null, null);
                nm.createNotificationChannel(c);
            }
            Intent abrir = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            abrir.putExtra(MainActivity.EXTRA_ACHEI, true);
            PendingIntent pi = PendingIntent.getActivity(ctx, AVISO, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            nm.notify(AVISO, new NotificationCompat.Builder(ctx, "friday_achar")
                .setSmallIcon(R.drawable.ic_stat_friday)
                .setContentTitle("Estou aqui!")
                .setContentText(texto == null || texto.isEmpty() ? "Toque para parar o som." : texto)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setContentIntent(pi)
                .setFullScreenIntent(pi, true)
                .setAutoCancel(true)
                .addAction(R.drawable.ic_stat_friday, "Achei", pi)
                .build());
        } catch (Exception ignorado) {
            // sem permissão de notificação: o som já está tocando
        }
    }
}
