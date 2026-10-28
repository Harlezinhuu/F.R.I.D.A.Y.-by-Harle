// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Ponte entre a FRIDAY (JavaScript) e o Android: apps, lanterna, volume, mídia, alarmes, ligações,
// SMS, WhatsApp, agenda, contatos, ajustes e o que está na tela (pelo serviço de acessibilidade).
// Cada ação é uma função conhecida; nada de comando livre. Ligações e mensagens só saem depois que
// o usuário confirma por voz (a confirmação é feita antes, no JavaScript).
package dev.harle.friday;

import android.Manifest;
import android.app.NotificationManager;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.ContentProviderOperation;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.telephony.SmsManager;
import android.text.TextUtils;
import android.view.KeyEvent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "FridayCelular",
    permissions = {
        @Permission(alias = "contatos", strings = { Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS }),
        @Permission(alias = "telefone", strings = { Manifest.permission.CALL_PHONE }),
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }),
        @Permission(alias = "agenda", strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }),
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "microfone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class CelularPlugin extends Plugin {

    static CelularPlugin instancia;
    private boolean aberturaLida = false;

    @Override
    public void load() {
        instancia = this;
    }

    private Context ctx() {
        return getContext();
    }

    private void iniciar(Intent i) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx().startActivity(i);
    }

    private static void falhou(PluginCall call, Exception e) {
        String m = e.getMessage();
        call.reject(m == null || m.isEmpty() ? "Algo deu errado no Android (" + e.getClass().getSimpleName() + ")." : m);
    }

    private boolean permitido(String alias) {
        return getPermissionState(alias) == PermissionState.GRANTED;
    }

    static boolean ehAssistente(Intent i) {
        if (i == null) return false;
        if (i.getBooleanExtra(MainActivity.EXTRA_CENTRAL, false)) return true;
        if (i.getAction() == null) return false;
        String a = i.getAction();
        return Intent.ACTION_ASSIST.equals(a) || Intent.ACTION_VOICE_COMMAND.equals(a);
    }

    // ---------- Abertura pelo botão de assistente ----------

    @PluginMethod
    public void abertura(PluginCall call) {
        try {
            JSObject r = new JSObject();
            Intent i = getActivity() != null ? getActivity().getIntent() : null;
            r.put("assistente", !aberturaLida && ehAssistente(i));
            r.put("central", !aberturaLida && i != null && i.getBooleanExtra(MainActivity.EXTRA_CENTRAL, false));
            aberturaLida = true;
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (ehAssistente(intent)) {
            JSObject o = new JSObject();
            o.put("central", intent.getBooleanExtra(MainActivity.EXTRA_CENTRAL, false));
            notifyListeners("assistente", o);
        }
    }

    void avisarEncerrarVoz() {
        notifyListeners("encerrarVoz", new JSObject());
    }

    void avisarCarro(boolean ligado) {
        JSObject o = new JSObject();
        o.put("ativo", ligado);
        notifyListeners("carro", o);
    }

    // ---------- Elo com o PC ----------

    /** Rede em threads próprias: a escuta do PC segura a conexão por até 30 s e não pode travar as outras funções. */
    private static final java.util.concurrent.ExecutorService REDE = java.util.concurrent.Executors.newCachedThreadPool();

    @PluginMethod
    public void eloPedir(PluginCall call) {
        JSObject dados = call.getObject("dados", new JSObject());
        int limite = call.getInt("limite", 8000);
        REDE.execute(() -> {
            try {
                JSONObject r = Elo.pedir(ctx(), dados, limite);
                JSObject o = new JSObject();
                o.put("resposta", r);
                call.resolve(o);
            } catch (Exception e) {
                falhou(call, e);
            }
        });
    }

    @PluginMethod
    public void eloParearCodigo(PluginCall call) {
        REDE.execute(() -> {
            try {
                String p = Elo.parearCodigo(call.getString("ip", ""), call.getInt("porta", 47923), call.getString("codigo", ""), Build.MANUFACTURER + " " + Build.MODEL);
                JSObject o = new JSObject();
                o.put("pareamento", p);
                call.resolve(o);
            } catch (Exception e) {
                falhou(call, e);
            }
        });
    }

    @PluginMethod
    public void nomeDoAparelho(PluginCall call) {
        JSObject o = new JSObject();
        o.put("nome", Build.MANUFACTURER.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + Build.MANUFACTURER.substring(1) + " " + Build.MODEL);
        call.resolve(o);
    }

    @PluginMethod
    public void lerQR(PluginCall call) {
        try {
            com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions op = new com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(com.google.mlkit.vision.barcode.common.Barcode.FORMAT_QR_CODE)
                .build();
            com.google.mlkit.vision.codescanner.GmsBarcodeScanning.getClient(getActivity(), op).startScan()
                .addOnSuccessListener(b -> {
                    JSObject o = new JSObject();
                    o.put("texto", b.getRawValue() == null ? "" : b.getRawValue());
                    call.resolve(o);
                })
                .addOnCanceledListener(() -> call.reject("Leitura cancelada."))
                .addOnFailureListener(e -> call.reject("Não consegui abrir o leitor de QR (" + e.getMessage() + "). Use o código de 8 dígitos."));
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void acordarPC(PluginCall call) {
        REDE.execute(() -> {
            try {
                JSObject o = new JSObject();
                o.put("enviados", Elo.acordar(ctx(), call.getString("casa", ""), call.getData().optInt("porta", 0)));
                call.resolve(o);
            } catch (Exception e) {
                falhou(call, e);
            }
        });
    }

    // ---------- Central do quarto (o celular que fica em casa ouvindo "Friday") ----------

    @PluginMethod
    public void centralEstado(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("rodando", FridayCentral.rodando);
            r.put("estado", FridayCentral.estado);
            r.put("modelo", FridayCentral.temModelo(ctx()));
            r.put("sobreposicao", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx()));
            android.os.PowerManager pm = (android.os.PowerManager) ctx().getSystemService(Context.POWER_SERVICE);
            r.put("bateriaLivre", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || (pm != null && pm.isIgnoringBatteryOptimizations(ctx().getPackageName())));
            r.put("silenciadaAte", FridayCentral.silenciadaAte);
            r.put("registro", FridayCentral.registro());
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    /** Liga ou desliga a central (a configuração já foi salva pelo app). */
    @PluginMethod
    public void centralLigar(PluginCall call) {
        try {
            boolean ligar = Boolean.TRUE.equals(call.getBoolean("ligar", true));
            Intent i = new Intent(ctx(), FridayCentral.class);
            if (!ligar) {
                if (FridayCentral.rodando) ctx().startService(i.setAction(FridayCentral.DESLIGAR));
                call.resolve();
                return;
            }
            if (!permitido("microfone")) {
                call.reject("PERMISSAO: microfone");
                return;
            }
            if (!FridayCentral.temModelo(ctx())) {
                call.reject("Falta baixar o ouvido da central (o modelo da palavra \"Friday\").");
                return;
            }
            androidx.core.content.ContextCompat.startForegroundService(ctx(), i);
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    /** Baixa o modelo da palavra "Friday" (uns 40 MB, uma vez só). Avisa o progresso em "centralProgresso". */
    @PluginMethod
    public void centralBaixarModelo(PluginCall call) {
        REDE.execute(() -> {
            java.io.File zip = new java.io.File(ctx().getCacheDir(), "vosk.zip");
            try {
                java.net.HttpURLConnection con = (java.net.HttpURLConnection) new java.net.URL("https://alphacephei.com/vosk/models/" + FridayCentral.MODELO + ".zip").openConnection();
                con.setConnectTimeout(15000);
                con.setReadTimeout(30000);
                con.setInstanceFollowRedirects(true);
                if (con.getResponseCode() != 200) throw new java.io.IOException("O site do modelo respondeu " + con.getResponseCode());
                long total = con.getContentLength();
                long lido = 0;
                int ultimo = -1;
                try (java.io.InputStream in = con.getInputStream(); java.io.OutputStream out = new java.io.FileOutputStream(zip)) {
                    byte[] b = new byte[65536];
                    int n;
                    while ((n = in.read(b)) > 0) {
                        out.write(b, 0, n);
                        lido += n;
                        int pct = total > 0 ? (int) (lido * 100 / total) : -1;
                        if (pct != ultimo && pct % 5 == 0) {
                            ultimo = pct;
                            JSObject o = new JSObject();
                            o.put("pct", pct);
                            notifyListeners("centralProgresso", o);
                        }
                    }
                } finally {
                    con.disconnect();
                }
                // Abre o zip na pasta do app (só arquivos dentro dela)
                java.io.File base = ctx().getFilesDir();
                String raiz = base.getCanonicalPath() + java.io.File.separator;
                try (java.util.zip.ZipInputStream z = new java.util.zip.ZipInputStream(new java.io.FileInputStream(zip))) {
                    java.util.zip.ZipEntry e;
                    byte[] b = new byte[65536];
                    while ((e = z.getNextEntry()) != null) {
                        java.io.File f = new java.io.File(base, e.getName());
                        if (!f.getCanonicalPath().startsWith(raiz)) continue;
                        if (e.isDirectory()) {
                            f.mkdirs();
                            continue;
                        }
                        java.io.File pai = f.getParentFile();
                        if (pai != null) pai.mkdirs();
                        try (java.io.OutputStream out = new java.io.FileOutputStream(f)) {
                            int n;
                            while ((n = z.read(b)) > 0) out.write(b, 0, n);
                        }
                    }
                }
                if (!FridayCentral.temModelo(ctx())) throw new java.io.IOException("O modelo veio incompleto. Tente de novo.");
                call.resolve();
            } catch (Exception e) {
                falhou(call, e);
            } finally {
                //noinspection ResultOfMethodCallIgnored
                zip.delete();
            }
        });
    }

    /** A conversa vai abrir: a central solta o microfone e entrega o que você disse logo depois do "Friday". */
    @PluginMethod
    public void centralSoltar(PluginCall call) {
        REDE.execute(() -> {
            try {
                FridayCentral c = FridayCentral.instancia;
                JSObject r = new JSObject();
                r.put("audio", c == null ? "" : c.soltar());
                call.resolve(r);
            } catch (Exception e) {
                falhou(call, e);
            }
        });
    }

    /** A conversa terminou: a central volta a ouvir. `bloquear` apaga a tela (precisa do controle da tela). */
    @PluginMethod
    public void centralRetomar(PluginCall call) {
        try {
            FridayCentral c = FridayCentral.instancia;
            if (c != null) c.retomar();
            boolean bloquear = Boolean.TRUE.equals(call.getBoolean("bloquear", false));
            if (getActivity() instanceof MainActivity) {
                MainActivity a = (MainActivity) getActivity();
                a.runOnUiThread(() -> a.mostrarPorCima(false));
            }
            if (bloquear && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && FridayAcessibilidade.instancia != null) {
                FridayAcessibilidade.instancia.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN);
            }
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    /** "Friday, fica quieta": a central ignora a palavra por `minutos` (0 = volta a ouvir). */
    @PluginMethod
    public void centralSilenciar(PluginCall call) {
        try {
            double min = call.getData().optDouble("minutos", 60);
            FridayCentral.silenciadaAte = min <= 0 ? 0 : System.currentTimeMillis() + (long) (min * 60_000);
            FridayCentral c = FridayCentral.instancia;
            if (c != null) c.atualizarNotificacao();
            JSObject r = new JSObject();
            r.put("ate", FridayCentral.silenciadaAte);
            r.put("rodando", FridayCentral.rodando);
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    /** Permissão de abrir por cima (a central abre a FRIDAY sozinha quando ouve "Friday"). */
    @PluginMethod
    public void abrirSobreposicao(PluginCall call) {
        try {
            iniciar(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx().getPackageName())));
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    /** Tira a FRIDAY da economia de bateria (o Android não fecha a central). */
    @PluginMethod
    @android.annotation.SuppressLint("BatteryLife")
    public void abrirBateria(PluginCall call) {
        try {
            try {
                iniciar(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx().getPackageName())));
            } catch (ActivityNotFoundException e) {
                iniciar(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            }
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    // ---------- Porteiro: do celular da rua ----------

    /** Pede ao porteiro (a central em casa) para ligar o PC. Devolve quem respondeu, ou vazio. */
    @PluginMethod
    public void porteiroAcordar(PluginCall call) {
        REDE.execute(() -> {
            try {
                org.json.JSONObject cfg = Elo.config(ctx());
                if (cfg == null) throw new IllegalStateException("O celular não está pareado com o PC.");
                String segredo = cfg.getString("segredo");
                byte[] chave = Lacre.chave(segredo);
                String topico = Porteiro.topico(segredo);
                long desde = System.currentTimeMillis() / 1000 - 2;
                Porteiro.Recado r = Porteiro.pedirParaAcordar(chave, topico, Build.MODEL, 9000);
                JSObject o = new JSObject();
                o.put("porteiro", r == null ? "" : r.dados.optString("de", "porteiro"));
                o.put("jaLigado", r != null && r.dados.optBoolean("jaLigado", false));
                call.resolve(o);
                if (r != null && !r.dados.optBoolean("jaLigado", false)) esperarPcLigar(chave, topico, String.valueOf(desde));
            } catch (Exception e) {
                falhou(call, e);
            }
        });
    }

    /** Fica de olho por uns minutos e avisa quando o porteiro disser que o PC ligou (ou não). */
    private void esperarPcLigar(byte[] chave, String topico, String desde) {
        try {
            String res = Porteiro.esperarResultado(chave, topico, desde, 180_000);
            if (res.isEmpty()) return;
            String texto = "pc_ligado".equals(res) ? "O PC ligou." : "O PC não ligou. Confira se ele está no cabo e com o Wake on LAN ligado na BIOS.";
            JSObject o = new JSObject();
            o.put("texto", texto);
            notifyListeners("aviso", o);
            NotificationManager nm = (NotificationManager) ctx().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(new android.app.NotificationChannel("friday_porteiro", "Ligar o PC", NotificationManager.IMPORTANCE_DEFAULT));
            }
            nm.notify(4345, new androidx.core.app.NotificationCompat.Builder(ctx(), "friday_porteiro")
                .setSmallIcon(R.drawable.ic_stat_friday)
                .setContentTitle("FRIDAY")
                .setContentText(texto)
                .setAutoCancel(true)
                .build());
        } catch (Exception ignorado) {
            // sem rede: fica sem a confirmação
        }
    }

    // ---------- Mensagens recentes, resumo da manhã e modo carro ----------

    @PluginMethod
    public void mensagensRecentes(PluginCall call) {
        JSObject o = new JSObject();
        o.put("mensagens", FridayAvisos.recentes(Boolean.TRUE.equals(call.getBoolean("soImportantes", false))));
        o.put("ativo", FridayAvisos.conectado);
        call.resolve(o);
    }

    /** O agente de consultas passa a acompanhar (ou larga, com nome vazio) uma conversa do WhatsApp. */
    @PluginMethod
    public void vigiarConversa(PluginCall call) {
        try {
            FridayAvisos.vigiar(call.getString("nome", ""));
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void responderMensagem(PluginCall call) {
        try {
            JSObject o = new JSObject();
            o.put("para", FridayAvisos.responder(ctx(), call.getString("remetente", ""), call.getString("texto", "")));
            call.resolve(o);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void resumoTexto(PluginCall call) {
        REDE.execute(() -> {
            try {
                JSObject o = new JSObject();
                o.put("texto", Resumo.montar(ctx()));
                call.resolve(o);
            } catch (Exception e) {
                falhou(call, e);
            }
        });
    }

    @PluginMethod
    public void resumoAgora(PluginCall call) {
        Resumo.falar(ctx());
        call.resolve();
    }

    @PluginMethod
    public void modoCarro(PluginCall call) {
        JSObject o = new JSObject();
        o.put("ativo", FridayAvisos.modoCarro);
        call.resolve(o);
    }

    @PluginMethod
    public void religarAvisos(PluginCall call) {
        FridayAvisos a = FridayAvisos.instancia;
        if (a != null) a.ligarBluetooth();
        call.resolve();
    }

    void avisarAviso(String frase) {
        JSObject o = new JSObject();
        o.put("texto", frase);
        notifyListeners("aviso", o);
    }

    // ---------- Avisos por voz (ligações e mensagens) ----------

    @PluginMethod
    public void avisosAtivos(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("ativo", androidx.core.app.NotificationManagerCompat.getEnabledListenerPackages(ctx()).contains(ctx().getPackageName()));
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void abrirAvisos(PluginCall call) {
        try {
            ComponentName comp = new ComponentName(ctx(), FridayAvisos.class);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                    i.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, comp.flattenToString());
                    iniciar(i);
                } else {
                    iniciar(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"));
                }
            } catch (RuntimeException e) {
                iniciar(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"));
            }
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void testarAviso(PluginCall call) {
        try {
            Locutor.falar(ctx(), call.getString("texto", "Avisos por voz funcionando."), false, false);
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void ehAssistentePadrao(PluginCall call) {
        try {
            boolean e = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager rm = ctx().getSystemService(RoleManager.class);
                e = rm != null && rm.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && rm.isRoleHeld(RoleManager.ROLE_ASSISTANT);
            }
            JSObject r = new JSObject();
            r.put("ativo", e);
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void definirAssistente(PluginCall call) {
        try {
            try {
                iniciar(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS));
            } catch (RuntimeException e) {
                iniciar(new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS));
            }
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    // ---------- Serviço de voz (microfone com o app em segundo plano) ----------

    @PluginMethod
    public void servicoVoz(PluginCall call) {
        try {
            boolean ligar = Boolean.TRUE.equals(call.getBoolean("ligar", false));
            Intent i = new Intent(ctx(), FridayVozServico.class);
            try {
                if (ligar) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx().startForegroundService(i);
                    else ctx().startService(i);
                } else {
                    ctx().stopService(i);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Não consegui manter a voz ligada em segundo plano: " + e.getMessage());
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    // ---------- Apps ----------

    @PluginMethod
    public void apps(PluginCall call) {
        try {
            PackageManager pm = ctx().getPackageManager();
            Intent principal = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> lista = pm.queryIntentActivities(principal, 0);
            Map<String, String> vistos = new LinkedHashMap<>();
            for (ResolveInfo ri : lista) {
                String pacote = ri.activityInfo.packageName;
                if (vistos.containsKey(pacote)) continue;
                vistos.put(pacote, String.valueOf(ri.loadLabel(pm)));
            }
            JSArray arr = new JSArray();
            for (Map.Entry<String, String> e : vistos.entrySet()) {
                JSObject o = new JSObject();
                o.put("nome", e.getValue());
                o.put("pacote", e.getKey());
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("apps", arr);
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void abrirApp(PluginCall call) {
        try {
            String pacote = call.getString("pacote", "");
            Intent i = ctx().getPackageManager().getLaunchIntentForPackage(pacote);
            if (i == null) {
                call.reject("Esse app não está instalado.");
                return;
            }
            iniciar(i);
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    // ---------- Sistema ----------

    @PluginMethod
    public void lanterna(PluginCall call) {
        try {
            boolean ligar = Boolean.TRUE.equals(call.getBoolean("ligar", true));
            try {
                CameraManager cm = (CameraManager) ctx().getSystemService(Context.CAMERA_SERVICE);
                for (String id : cm.getCameraIdList()) {
                    Boolean flash = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    if (Boolean.TRUE.equals(flash)) {
                        cm.setTorchMode(id, ligar);
                        call.resolve();
                        return;
                    }
                }
                call.reject("Esse celular não tem lanterna.");
            } catch (Exception e) {
                call.reject("Não consegui mexer na lanterna (a câmera pode estar em uso).");
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    private static int fluxo(String nome) {
        switch (nome == null ? "" : nome) {
            case "toque": return AudioManager.STREAM_RING;
            case "alarme": return AudioManager.STREAM_ALARM;
            case "notificacao": return AudioManager.STREAM_NOTIFICATION;
            case "ligacao": return AudioManager.STREAM_VOICE_CALL;
            default: return AudioManager.STREAM_MUSIC;
        }
    }

    @PluginMethod
    public void volume(PluginCall call) {
        try {
            AudioManager am = (AudioManager) ctx().getSystemService(Context.AUDIO_SERVICE);
            int f = fluxo(call.getString("fluxo", "midia"));
            String acao = call.getString("acao", "");
            double nivelLido = call.getData().optDouble("nivel", Double.NaN);
            Double nivel = Double.isNaN(nivelLido) ? null : nivelLido;
            try {
                int max = am.getStreamMaxVolume(f);
                if (nivel != null) {
                    int v = (int) Math.round(Math.max(0, Math.min(100, nivel)) / 100.0 * max);
                    am.setStreamVolume(f, v, AudioManager.FLAG_SHOW_UI);
                } else if ("subir".equals(acao)) {
                    for (int k = 0; k < Math.max(1, max / 5); k++) am.adjustStreamVolume(f, AudioManager.ADJUST_RAISE, k == 0 ? AudioManager.FLAG_SHOW_UI : 0);
                } else if ("descer".equals(acao)) {
                    for (int k = 0; k < Math.max(1, max / 5); k++) am.adjustStreamVolume(f, AudioManager.ADJUST_LOWER, k == 0 ? AudioManager.FLAG_SHOW_UI : 0);
                } else if ("mudo".equals(acao)) {
                    am.adjustStreamVolume(f, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI);
                } else if ("som".equals(acao)) {
                    am.adjustStreamVolume(f, AudioManager.ADJUST_UNMUTE, AudioManager.FLAG_SHOW_UI);
                }
                JSObject r = new JSObject();
                r.put("nivel", Math.round(am.getStreamVolume(f) * 100.0 / Math.max(1, max)));
                call.resolve(r);
            } catch (SecurityException e) {
                call.reject("O modo Não perturbe está bloqueando o volume do toque.");
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void midia(PluginCall call) {
        try {
            AudioManager am = (AudioManager) ctx().getSystemService(Context.AUDIO_SERVICE);
            int codigo;
            switch (call.getString("acao", "alternar")) {
                case "tocar": codigo = KeyEvent.KEYCODE_MEDIA_PLAY; break;
                case "pausar": codigo = KeyEvent.KEYCODE_MEDIA_PAUSE; break;
                case "proxima": codigo = KeyEvent.KEYCODE_MEDIA_NEXT; break;
                case "anterior": codigo = KeyEvent.KEYCODE_MEDIA_PREVIOUS; break;
                default: codigo = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
            }
            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, codigo));
            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, codigo));
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void alarme(PluginCall call) {
        try {
            Intent i = new Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, call.getInt("hora", 7))
                .putExtra(AlarmClock.EXTRA_MINUTES, call.getInt("minuto", 0))
                .putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("rotulo", "FRIDAY"))
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true);
            JSArray dias = call.getArray("dias");
            if (dias != null && dias.length() > 0) {
                ArrayList<Integer> lista = new ArrayList<>();
                for (int k = 0; k < dias.length(); k++) lista.add(dias.optInt(k));
                i.putExtra(AlarmClock.EXTRA_DAYS, lista);
            }
            try {
                iniciar(i);
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("Não achei o app de relógio.");
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void bateria(PluginCall call) {
        try {
            BatteryManager bm = (BatteryManager) ctx().getSystemService(Context.BATTERY_SERVICE);
            JSObject r = new JSObject();
            r.put("nivel", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY));
            r.put("carregando", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && bm.isCharging());
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void ajuste(PluginCall call) {
        try {
            String qual = call.getString("qual", "");
            String acao;
            boolean painel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
            switch (qual) {
                case "wifi": acao = painel ? Settings.Panel.ACTION_WIFI : Settings.ACTION_WIFI_SETTINGS; break;
                case "internet": acao = painel ? Settings.Panel.ACTION_INTERNET_CONNECTIVITY : Settings.ACTION_WIRELESS_SETTINGS; break;
                case "volume": acao = painel ? Settings.Panel.ACTION_VOLUME : Settings.ACTION_SOUND_SETTINGS; break;
                case "nfc": acao = painel ? Settings.Panel.ACTION_NFC : Settings.ACTION_NFC_SETTINGS; break;
                case "bluetooth": acao = Settings.ACTION_BLUETOOTH_SETTINGS; break;
                case "brilho": case "tela": acao = Settings.ACTION_DISPLAY_SETTINGS; break;
                case "localizacao": acao = Settings.ACTION_LOCATION_SOURCE_SETTINGS; break;
                case "nao_perturbe": acao = Settings.ACTION_ZEN_MODE_PRIORITY_SETTINGS; break;
                case "bateria": acao = Intent.ACTION_POWER_USAGE_SUMMARY; break;
                case "som": acao = Settings.ACTION_SOUND_SETTINGS; break;
                case "apps": acao = Settings.ACTION_APPLICATION_SETTINGS; break;
                case "acessibilidade": acao = Settings.ACTION_ACCESSIBILITY_SETTINGS; break;
                case "dados_moveis": acao = Settings.ACTION_DATA_ROAMING_SETTINGS; break;
                case "aviao": acao = Settings.ACTION_AIRPLANE_MODE_SETTINGS; break;
                default: acao = Settings.ACTION_SETTINGS;
            }
            try {
                iniciar(new Intent(acao));
            } catch (RuntimeException e) {
                iniciar(new Intent(Settings.ACTION_SETTINGS));
            }
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void brilho(PluginCall call) {
        try {
            if (!Settings.System.canWrite(ctx())) {
                iniciar(new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + ctx().getPackageName())));
                call.reject("PERMISSAO: libere \"Modificar configurações do sistema\" para a FRIDAY na tela que abriu.");
                return;
            }
            double nivel = Math.max(0, Math.min(100, call.getData().optDouble("nivel", 50.0)));
            ContentResolver cr = ctx().getContentResolver();
            Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
            Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, (int) Math.round(nivel / 100.0 * 255));
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void naoPerturbe(PluginCall call) {
        try {
            NotificationManager nm = (NotificationManager) ctx().getSystemService(Context.NOTIFICATION_SERVICE);
            if (!nm.isNotificationPolicyAccessGranted()) {
                iniciar(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
                call.reject("PERMISSAO: libere o acesso ao Não perturbe para a FRIDAY na tela que abriu.");
                return;
            }
            boolean ligar = Boolean.TRUE.equals(call.getBoolean("ligar", true));
            nm.setInterruptionFilter(ligar ? NotificationManager.INTERRUPTION_FILTER_PRIORITY : NotificationManager.INTERRUPTION_FILTER_ALL);
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void rota(PluginCall call) {
        try {
            String destino = call.getString("destino", "");
            String modo = call.getString("modo", "d");
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + Uri.encode(destino) + "&mode=" + modo));
            try {
                iniciar(i);
            } catch (RuntimeException e) {
                iniciar(new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(destino))));
            }
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void abrirLink(PluginCall call) {
        try {
            try {
                iniciar(new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url", ""))));
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("Nenhum app abre esse link.");
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void infoDoApp(PluginCall call) {
        try {
            iniciar(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx().getPackageName())));
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    // ---------- Contatos, ligações e mensagens ----------

    @PluginMethod
    public void contatos(PluginCall call) {
        try {
            if (!permitido("contatos")) {
                call.reject("PERMISSAO: contatos");
                return;
            }
            String[] proj = {
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
                ContactsContract.CommonDataKinds.Phone.TYPE,
                ContactsContract.CommonDataKinds.Phone.LABEL
            };
            Map<String, JSArray> porNome = new LinkedHashMap<>();
            Map<String, List<String>> jaTem = new HashMap<>();
            try (Cursor c = ctx().getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, proj, null, null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
                while (c != null && c.moveToNext()) {
                    String nome = c.getString(0);
                    String numero = c.getString(1);
                    if (nome == null || numero == null) continue;
                    String limpo = numero.replaceAll("[^0-9+]", "");
                    List<String> vistos = jaTem.get(nome);
                    if (vistos == null) {
                        vistos = new ArrayList<>();
                        jaTem.put(nome, vistos);
                    }
                    if (vistos.contains(limpo)) continue;
                    vistos.add(limpo);
                    JSObject n = new JSObject();
                    n.put("numero", numero);
                    n.put("tipo", String.valueOf(ContactsContract.CommonDataKinds.Phone.getTypeLabel(ctx().getResources(), c.getInt(2), c.getString(3))));
                    n.put("celular", c.getInt(2) == ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE);
                    JSArray numeros = porNome.get(nome);
                    if (numeros == null) {
                        numeros = new JSArray();
                        porNome.put(nome, numeros);
                    }
                    numeros.put(n);
                }
            }
            JSArray arr = new JSArray();
            for (Map.Entry<String, JSArray> e : porNome.entrySet()) {
                JSObject o = new JSObject();
                o.put("nome", e.getKey());
                o.put("numeros", e.getValue());
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("contatos", arr);
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void salvarContato(PluginCall call) {
        try {
            if (!permitido("contatos")) {
                call.reject("PERMISSAO: contatos");
                return;
            }
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();
            ops.add(ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null)
                .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null).build());
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, call.getString("nome", "")).build());
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, call.getString("numero", ""))
                .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE).build());
            try {
                ctx().getContentResolver().applyBatch(ContactsContract.AUTHORITY, ops);
                call.resolve();
            } catch (Exception e) {
                call.reject("Não consegui salvar o contato.");
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void ligar(PluginCall call) {
        try {
            if (!permitido("telefone")) {
                call.reject("PERMISSAO: telefone");
                return;
            }
            String numero = call.getString("numero", "");
            try {
                iniciar(new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(numero))));
                call.resolve();
            } catch (Exception e) {
                call.reject("Não consegui ligar.");
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void sms(PluginCall call) {
        try {
            if (!permitido("sms")) {
                call.reject("PERMISSAO: sms");
                return;
            }
            String numero = call.getString("numero", "");
            String texto = call.getString("texto", "");
            try {
                SmsManager sm = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? ctx().getSystemService(SmsManager.class) : SmsManager.getDefault();
                ArrayList<String> partes = sm.divideMessage(texto);
                sm.sendMultipartTextMessage(numero, null, partes, null, null);
                call.resolve();
            } catch (Exception e) {
                call.reject("O SMS não saiu: " + e.getMessage());
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    private String pacoteWhatsapp() {
        PackageManager pm = ctx().getPackageManager();
        for (String p : new String[] { "com.whatsapp", "com.whatsapp.w4b" }) {
            if (pm.getLaunchIntentForPackage(p) != null) return p;
        }
        return null;
    }

    @PluginMethod
    public void whatsapp(PluginCall call) {
        try {
            String pacote = pacoteWhatsapp();
            if (pacote == null) {
                call.reject("O WhatsApp não está instalado.");
                return;
            }
            String numero = call.getString("numero", "");
            String texto = call.getString("texto", "");
            boolean enviar = Boolean.TRUE.equals(call.getBoolean("enviar", false));
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?phone=" + Uri.encode(numero) + "&text=" + Uri.encode(texto)));
            i.setPackage(pacote);
            iniciar(i);
            FridayAcessibilidade a = FridayAcessibilidade.instancia;
            if (!enviar || a == null) {
                JSObject r = new JSObject();
                r.put("enviado", false);
                call.resolve(r);
                return;
            }
            // Com a acessibilidade ligada, ela mesma toca em "Enviar" quando a conversa abrir
            a.tocarQuandoAparecer(pacote, new String[] { pacote + ":id/send" }, new String[] { "Enviar", "Send" }, 9000, ok -> {
                JSObject r = new JSObject();
                r.put("enviado", ok);
                call.resolve(r);
            });
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    // ---------- Agenda ----------

    private long agendaPrincipal() {
        String[] proj = { CalendarContract.Calendars._ID, CalendarContract.Calendars.IS_PRIMARY };
        String onde = CalendarContract.Calendars.VISIBLE + " = 1 AND " + CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + " >= " + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;
        long escolhida = -1;
        try (Cursor c = ctx().getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, proj, onde, null, null)) {
            while (c != null && c.moveToNext()) {
                if (escolhida < 0) escolhida = c.getLong(0);
                if (c.getInt(1) == 1) return c.getLong(0);
            }
        }
        return escolhida;
    }

    @PluginMethod
    public void criarEvento(PluginCall call) {
        try {
            if (!permitido("agenda")) {
                call.reject("PERMISSAO: agenda");
                return;
            }
            long agenda = agendaPrincipal();
            if (agenda < 0) {
                call.reject("Não achei nenhuma agenda no celular. Entre com uma conta Google no app Agenda.");
                return;
            }
            long inicio = call.getData().optLong("inicio", System.currentTimeMillis());
            long fim = call.getData().optLong("fim", inicio + 3600_000L);
            boolean diaInteiro = Boolean.TRUE.equals(call.getBoolean("diaInteiro", false));
            ContentValues v = new ContentValues();
            v.put(CalendarContract.Events.CALENDAR_ID, agenda);
            v.put(CalendarContract.Events.TITLE, call.getString("titulo", "Evento"));
            v.put(CalendarContract.Events.DTSTART, inicio);
            v.put(CalendarContract.Events.DTEND, fim);
            v.put(CalendarContract.Events.EVENT_TIMEZONE, diaInteiro ? "UTC" : TimeZone.getDefault().getID());
            if (diaInteiro) v.put(CalendarContract.Events.ALL_DAY, 1);
            String local = call.getString("local", "");
            if (!TextUtils.isEmpty(local)) v.put(CalendarContract.Events.EVENT_LOCATION, local);
            String desc = call.getString("descricao", "");
            if (!TextUtils.isEmpty(desc)) v.put(CalendarContract.Events.DESCRIPTION, desc);
            try {
                Uri u = ctx().getContentResolver().insert(CalendarContract.Events.CONTENT_URI, v);
                if (u == null) throw new IllegalStateException();
                long id = ContentUris.parseId(u);
                if (!diaInteiro) {
                    ContentValues lembrete = new ContentValues();
                    lembrete.put(CalendarContract.Reminders.EVENT_ID, id);
                    lembrete.put(CalendarContract.Reminders.MINUTES, 15);
                    lembrete.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                    ctx().getContentResolver().insert(CalendarContract.Reminders.CONTENT_URI, lembrete);
                }
                JSObject r = new JSObject();
                r.put("id", id);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Não consegui criar o evento.");
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void eventos(PluginCall call) {
        try {
            if (!permitido("agenda")) {
                call.reject("PERMISSAO: agenda");
                return;
            }
            long de = call.getData().optLong("de", System.currentTimeMillis());
            long ate = call.getData().optLong("ate", de + 86_400_000L);
            String[] proj = { CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.EVENT_LOCATION };
            JSArray arr = new JSArray();
            try (Cursor c = CalendarContract.Instances.query(ctx().getContentResolver(), proj, de, ate)) {
                while (c != null && c.moveToNext() && arr.length() < 40) {
                    JSObject o = new JSObject();
                    o.put("titulo", c.getString(0));
                    o.put("inicio", c.getLong(1));
                    o.put("fim", c.getLong(2));
                    o.put("diaInteiro", c.getInt(3) == 1);
                    o.put("local", c.getString(4) == null ? "" : c.getString(4));
                    arr.put(o);
                }
            }
            JSObject r = new JSObject();
            r.put("eventos", arr);
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    // ---------- Tela de outros apps (acessibilidade) ----------

    private FridayAcessibilidade servico(PluginCall call) {
        FridayAcessibilidade a = FridayAcessibilidade.instancia;
        if (a == null) call.reject("ACESSIBILIDADE: o controle da tela está desligado. Ative a FRIDAY em Ajustes > Acessibilidade.");
        return a;
    }

    @PluginMethod
    public void acessibilidade(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("ativa", FridayAcessibilidade.instancia != null);
            call.resolve(r);
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void abrirAcessibilidade(PluginCall call) {
        try {
            // A tela de detalhes ("ACCESSIBILITY_DETAILS_SETTINGS") é só para apps do sistema: abre a lista
            iniciar(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            call.resolve();
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void lerTela(PluginCall call) {
        try {
            FridayAcessibilidade a = servico(call);
            if (a == null) return;
            try {
                call.resolve(a.lerTela());
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void tocar(PluginCall call) {
        try {
            FridayAcessibilidade a = servico(call);
            if (a == null) return;
            try {
                Integer indice = call.getInt("indice");
                String r = indice != null ? a.tocar(indice) : a.tocarTexto(call.getString("texto", ""));
                JSObject o = new JSObject();
                o.put("rotulo", r);
                call.resolve(o);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void escrever(PluginCall call) {
        try {
            FridayAcessibilidade a = servico(call);
            if (a == null) return;
            try {
                Integer indice = call.getInt("indice");
                a.escrever(indice == null ? -1 : indice, call.getString("texto", ""));
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void rolar(PluginCall call) {
        try {
            FridayAcessibilidade a = servico(call);
            if (a == null) return;
            try {
                a.rolar(!"cima".equals(call.getString("direcao", "baixo")));
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        } catch (Exception e) {
            falhou(call, e);
        }
    }

    @PluginMethod
    public void botao(PluginCall call) {
        try {
            FridayAcessibilidade a = servico(call);
            if (a == null) return;
            if (a.botao(call.getString("acao", "voltar"))) call.resolve();
            else call.reject("Esse botão não funciona neste Android.");
        } catch (Exception e) {
            falhou(call, e);
        }
    }
}
