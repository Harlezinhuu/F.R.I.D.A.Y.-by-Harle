// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// O celular ligou (ou o app foi atualizado): se ele é a central do quarto, ela volta sozinha.
// O Android só deixa um serviço usar o microfone se o app estiver na frente, então ela abre o app
// por um instante (com a permissão de "abrir por cima") ou mostra uma notificação para você tocar.
package dev.harle.friday;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

public class FridayInicio extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        try {
            String a = intent.getAction();
            if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a) && !"android.intent.action.QUICKBOOT_POWERON".equals(a)) return;
            if (!FridayCentral.config(c).optBoolean("ligada", false)) return;
            Intent abrir = new Intent(c, MainActivity.class)
                .putExtra(MainActivity.EXTRA_LIGAR_CENTRAL, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(c)) {
                c.startActivity(abrir);
                return;
            }
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(new NotificationChannel(FridayCentral.CANAL, "Central do quarto", NotificationManager.IMPORTANCE_LOW));
            }
            int imutavel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
            nm.notify(FridayCentral.ID, new NotificationCompat.Builder(c, FridayCentral.CANAL)
                .setSmallIcon(R.drawable.ic_stat_friday)
                .setContentTitle("FRIDAY · central do quarto")
                .setContentText("Toque para ela voltar a ouvir")
                .setContentIntent(PendingIntent.getActivity(c, 14, abrir, imutavel | PendingIntent.FLAG_UPDATE_CURRENT))
                .setAutoCancel(true)
                .build());
        } catch (Exception ignorado) {
            // nunca derruba a inicialização do celular
        }
    }
}
