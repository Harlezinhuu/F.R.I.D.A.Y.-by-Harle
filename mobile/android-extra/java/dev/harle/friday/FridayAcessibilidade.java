// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Serviço de acessibilidade: deixa a FRIDAY ler a tela e tocar, escrever e rolar em outros apps
// quando você pede por voz. Só age quando é chamada (não fica olhando a tela sozinha), nunca digita
// em campos de senha e não lê nem toca em apps de banco, pagamento, instalação ou permissões.
package dev.harle.friday;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class FridayAcessibilidade extends AccessibilityService {

    static FridayAcessibilidade instancia;

    interface Pronto {
        void pronto(boolean ok);
    }

    /** Apps em que a FRIDAY não mexe: bancos, carteiras, pagamento, instalador e permissões. */
    private static final String[] PROTEGIDOS = {
        "com.nu.production", "br.com.intermedium", "com.itau", "br.com.itau", "com.bradesco", "br.com.bradesco",
        "br.com.bb.android", "com.santander", "br.com.santander", "br.com.gabba.caixa", "br.gov.caixa", "com.caixa",
        "com.mercadopago", "com.picpay", "com.c6bank", "br.com.original", "br.com.neon", "com.neon", "br.com.inter",
        "com.btg", "br.com.btgpactual", "com.xp", "br.com.xp", "com.rico", "br.com.sicredi", "br.com.sicoob",
        "com.sicredi", "br.com.bancopan", "com.pagseguro", "br.com.uol.ps", "com.paypal", "com.google.android.apps.walletnfcrel",
        "com.samsung.android.spay", "com.binance", "com.coinbase", "com.nubank", "br.com.banrisul", "br.com.safra",
        "com.google.android.packageinstaller", "com.android.packageinstaller", "com.google.android.permissioncontroller",
        "com.android.permissioncontroller"
    };

    private final List<AccessibilityNodeInfo> ultimos = new ArrayList<>();
    private final Handler mao = new Handler(Looper.getMainLooper());

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instancia = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent evento) {
        // Nada: a FRIDAY só olha a tela quando você pede
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public boolean onUnbind(Intent intent) {
        instancia = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        instancia = null;
        super.onDestroy();
    }

    static boolean protegido(CharSequence pacote) {
        if (pacote == null) return false;
        String p = pacote.toString().toLowerCase(Locale.ROOT);
        for (String b : PROTEGIDOS) {
            if (p.equals(b) || p.startsWith(b + ".")) return true;
        }
        return p.contains("bank") || p.contains("banco") || p.contains("wallet") || p.contains("carteira");
    }

    private AccessibilityNodeInfo raiz() {
        AccessibilityNodeInfo r = getRootInActiveWindow();
        if (r == null) throw new IllegalStateException("Não consegui ler a tela agora. Tente de novo em um segundo.");
        if (protegido(r.getPackageName())) {
            throw new IllegalStateException("PROTEGIDO: esse app é de banco, pagamento ou sistema. A FRIDAY não lê nem toca nele.");
        }
        return r;
    }

    // ---------- Ler ----------

    private static String texto(CharSequence c) {
        return c == null ? "" : c.toString().replaceAll("\\s+", " ").trim();
    }

    private static String rotulo(AccessibilityNodeInfo n) {
        String t = texto(n.getText());
        if (t.isEmpty()) t = texto(n.getContentDescription());
        if (t.isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) t = texto(n.getHintText());
        if (t.isEmpty() && n.isClickable() && n.getViewIdResourceName() != null) {
            String id = n.getViewIdResourceName();
            t = "[" + id.substring(id.indexOf('/') + 1).replace('_', ' ') + "]";
        }
        return t.length() > 90 ? t.substring(0, 87) + "..." : t;
    }

    private static String tipo(AccessibilityNodeInfo n) {
        String c = n.getClassName() == null ? "" : n.getClassName().toString();
        if (n.isEditable() || c.endsWith("EditText")) return "campo";
        if (n.isCheckable() || c.endsWith("Switch") || c.endsWith("CheckBox") || c.endsWith("RadioButton")) return "opção";
        if (c.endsWith("Button") || c.endsWith("ImageButton")) return "botão";
        if (c.endsWith("ImageView")) return "imagem";
        if (c.endsWith("TabWidget") || c.contains("Tab")) return "aba";
        return n.isClickable() ? "botão" : "texto";
    }

    JSObject lerTela() {
        AccessibilityNodeInfo r = raiz();
        ultimos.clear();
        JSArray elementos = new JSArray();
        percorrer(r, elementos, 0, false);
        JSObject o = new JSObject();
        o.put("pacote", texto(r.getPackageName()));
        o.put("elementos", elementos);
        return o;
    }

    private void percorrer(AccessibilityNodeInfo n, JSArray saida, int profundidade, boolean paiToca) {
        if (n == null || saida.length() >= 130 || profundidade > 45) return;
        if (!n.isVisibleToUser()) return;
        boolean toca = paiToca || n.isClickable() || n.isLongClickable();
        String r = rotulo(n);
        if (!r.isEmpty() || n.isEditable()) {
            JSObject e = new JSObject();
            e.put("i", ultimos.size());
            e.put("texto", r);
            e.put("tipo", tipo(n));
            if (toca) e.put("toca", true);
            if (n.isEditable()) e.put("campo", true);
            if (n.isPassword()) e.put("senha", true);
            if (n.isCheckable()) e.put("marcado", n.isChecked());
            if (n.isScrollable()) e.put("rola", true);
            ultimos.add(n);
            saida.put(e);
        }
        for (int k = 0; k < n.getChildCount(); k++) percorrer(n.getChild(k), saida, profundidade + 1, toca);
    }

    // ---------- Agir ----------

    private AccessibilityNodeInfo pegar(int i) {
        raiz();
        if (i < 0 || i >= ultimos.size()) throw new IllegalArgumentException("Esse item não existe. Leia a tela de novo.");
        AccessibilityNodeInfo n = ultimos.get(i);
        if (!n.refresh() || !n.isVisibleToUser()) throw new IllegalStateException("A tela mudou. Leia a tela de novo.");
        return n;
    }

    private boolean clicar(AccessibilityNodeInfo n) {
        AccessibilityNodeInfo alvo = n;
        while (alvo != null && !alvo.isClickable()) alvo = alvo.getParent();
        if (alvo != null && alvo.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
        // Sem clique pela acessibilidade: toque de verdade no centro do item
        Rect b = new Rect();
        n.getBoundsInScreen(b);
        return toqueEm(b.exactCenterX(), b.exactCenterY());
    }

    private boolean toqueEm(float x, float y) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        Path p = new Path();
        p.moveTo(x, y);
        GestureDescription g = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(p, 0, 60)).build();
        return dispatchGesture(g, null, null);
    }

    String tocar(int i) {
        AccessibilityNodeInfo n = pegar(i);
        if (!clicar(n)) throw new IllegalStateException("Não consegui tocar nesse item.");
        return rotulo(n);
    }

    String tocarTexto(String procurado) {
        AccessibilityNodeInfo r = raiz();
        List<AccessibilityNodeInfo> achados = r.findAccessibilityNodeInfosByText(procurado);
        AccessibilityNodeInfo melhor = null;
        for (AccessibilityNodeInfo n : achados) {
            if (!n.isVisibleToUser()) continue;
            if (rotulo(n).equalsIgnoreCase(procurado)) { melhor = n; break; }
            if (melhor == null) melhor = n;
        }
        if (melhor == null) throw new IllegalStateException("Não achei \"" + procurado + "\" na tela.");
        if (!clicar(melhor)) throw new IllegalStateException("Não consegui tocar em \"" + procurado + "\".");
        return rotulo(melhor);
    }

    private AccessibilityNodeInfo primeiroCampo(AccessibilityNodeInfo r) {
        ArrayDeque<AccessibilityNodeInfo> fila = new ArrayDeque<>();
        fila.add(r);
        while (!fila.isEmpty()) {
            AccessibilityNodeInfo n = fila.poll();
            if (n == null) continue;
            if (n.isEditable() && n.isVisibleToUser()) return n;
            for (int k = 0; k < n.getChildCount(); k++) {
                AccessibilityNodeInfo f = n.getChild(k);
                if (f != null) fila.add(f);
            }
        }
        return null;
    }

    void escrever(int i, String conteudo) {
        AccessibilityNodeInfo r = raiz();
        AccessibilityNodeInfo n = i >= 0 ? pegar(i) : r.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (n == null || !n.isEditable()) n = i >= 0 && n != null ? n : primeiroCampo(r);
        if (n == null) throw new IllegalStateException("Não achei onde escrever nessa tela.");
        if (n.isPassword()) throw new IllegalStateException("Não digito senhas. Essa parte é com você.");
        if (!n.isEditable()) {
            clicar(n);
            SystemClock.sleep(250);
            AccessibilityNodeInfo foco = raiz().findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (foco == null) throw new IllegalStateException("Esse item não é um campo de texto.");
            n = foco;
        }
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, conteudo);
        if (!n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) throw new IllegalStateException("O app não aceitou o texto.");
    }

    void rolar(boolean paraBaixo) {
        AccessibilityNodeInfo r = raiz();
        AccessibilityNodeInfo melhor = null;
        long maiorArea = 0;
        ArrayDeque<AccessibilityNodeInfo> fila = new ArrayDeque<>();
        fila.add(r);
        Rect b = new Rect();
        while (!fila.isEmpty()) {
            AccessibilityNodeInfo n = fila.poll();
            if (n == null) continue;
            if (n.isScrollable() && n.isVisibleToUser()) {
                n.getBoundsInScreen(b);
                long area = (long) b.width() * b.height();
                if (area > maiorArea) { maiorArea = area; melhor = n; }
            }
            for (int k = 0; k < n.getChildCount(); k++) {
                AccessibilityNodeInfo f = n.getChild(k);
                if (f != null) fila.add(f);
            }
        }
        int acao = paraBaixo ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
        if (melhor != null && melhor.performAction(acao)) return;
        // Sem lista rolável: arrasta o dedo na tela
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            DisplayMetrics m = getResources().getDisplayMetrics();
            float x = m.widthPixels / 2f, y1 = m.heightPixels * (paraBaixo ? 0.72f : 0.3f), y2 = m.heightPixels * (paraBaixo ? 0.3f : 0.72f);
            Path p = new Path();
            p.moveTo(x, y1);
            p.lineTo(x, y2);
            if (dispatchGesture(new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(p, 0, 320)).build(), null, null)) return;
        }
        throw new IllegalStateException("Não tem nada para rolar nessa tela.");
    }

    boolean botao(String acao) {
        int g;
        switch (acao) {
            case "inicio": g = GLOBAL_ACTION_HOME; break;
            case "recentes": g = GLOBAL_ACTION_RECENTS; break;
            case "notificacoes": g = GLOBAL_ACTION_NOTIFICATIONS; break;
            case "ajustes_rapidos": g = GLOBAL_ACTION_QUICK_SETTINGS; break;
            case "bloquear":
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false;
                g = GLOBAL_ACTION_LOCK_SCREEN;
                break;
            case "print":
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false;
                g = GLOBAL_ACTION_TAKE_SCREENSHOT;
                break;
            default: g = GLOBAL_ACTION_BACK;
        }
        return performGlobalAction(g);
    }

    /** Espera um botão aparecer num app (ex.: "Enviar" do WhatsApp) e toca nele. */
    void tocarQuandoAparecer(String pacote, String[] ids, String[] textos, long limiteMs, Pronto pronto) {
        long fim = SystemClock.uptimeMillis() + limiteMs;
        Runnable tentar = new Runnable() {
            @Override
            public void run() {
                AccessibilityNodeInfo r = getRootInActiveWindow();
                if (r != null && pacote.equals(texto(r.getPackageName()))) {
                    for (String id : ids) {
                        for (AccessibilityNodeInfo n : r.findAccessibilityNodeInfosByViewId(id)) {
                            if (n.isVisibleToUser() && clicar(n)) { pronto.pronto(true); return; }
                        }
                    }
                    for (String t : textos) {
                        for (AccessibilityNodeInfo n : r.findAccessibilityNodeInfosByText(t)) {
                            if (n.isVisibleToUser() && t.equalsIgnoreCase(texto(n.getContentDescription())) && clicar(n)) { pronto.pronto(true); return; }
                        }
                    }
                }
                if (SystemClock.uptimeMillis() > fim) pronto.pronto(false);
                else mao.postDelayed(this, 350);
            }
        };
        mao.postDelayed(tentar, 700);
    }
}
