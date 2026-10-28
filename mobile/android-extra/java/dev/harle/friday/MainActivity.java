// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Atividade do app: registra a ponte com o Android antes de abrir a interface. Quando a central do
// quarto ouve "Friday", ela abre por cima da tela de bloqueio e acende a tela.
package dev.harle.friday;

import android.app.KeyguardManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Aberta pela central (ouviu "Friday") */
    static final String EXTRA_CENTRAL = "friday_central";
    /** Aberta para religar a central (o celular reiniciou) */
    static final String EXTRA_LIGAR_CENTRAL = "friday_ligar_central";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CelularPlugin.class);
        super.onCreate(savedInstanceState);
        tratar(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        tratar(intent);
        super.onNewIntent(intent);
    }

    private void tratar(Intent i) {
        if (i == null) return;
        if (i.getBooleanExtra(EXTRA_CENTRAL, false)) mostrarPorCima(true);
        if (i.getBooleanExtra(EXTRA_LIGAR_CENTRAL, false)) {
            i.removeExtra(EXTRA_LIGAR_CENTRAL);
            try {
                ContextCompat.startForegroundService(this, new Intent(this, FridayCentral.class));
            } catch (Exception ignorado) {
                // o app religa quando abrir
            }
            // Ligou a central: o app sai da frente
            new Handler(Looper.getMainLooper()).postDelayed(() -> moveTaskToBack(true), 2500);
        }
    }

    /** Abre por cima da tela de bloqueio e acende a tela (só na chamada da central). */
    @SuppressWarnings("deprecation")
    void mostrarPorCima(boolean ligar) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(ligar);
                setTurnScreenOn(ligar);
            } else {
                int f = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
                if (ligar) getWindow().addFlags(f);
                else getWindow().clearFlags(f);
            }
            if (ligar && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
                // Sem senha na tela de bloqueio, ela some; com senha, a FRIDAY aparece por cima mesmo assim
                if (km != null && !km.isKeyguardSecure()) km.requestDismissKeyguard(this, null);
            }
        } catch (Exception ignorado) {
            // aparelho estranho: segue normal
        }
    }
}
