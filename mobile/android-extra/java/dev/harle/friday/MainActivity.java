// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Atividade do app: registra a ponte com o Android antes de abrir a interface.
package dev.harle.friday;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CelularPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
