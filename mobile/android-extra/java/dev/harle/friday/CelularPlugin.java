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
        @Permission(alias = "agenda", strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR })
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

    private boolean permitido(String alias) {
        return getPermissionState(alias) == PermissionState.GRANTED;
    }

    static boolean ehAssistente(Intent i) {
        if (i == null || i.getAction() == null) return false;
        String a = i.getAction();
        return Intent.ACTION_ASSIST.equals(a) || Intent.ACTION_VOICE_COMMAND.equals(a);
    }

    // ---------- Abertura pelo botão de assistente ----------

    @PluginMethod
    public void abertura(PluginCall call) {
        JSObject r = new JSObject();
        r.put("assistente", !aberturaLida && getActivity() != null && ehAssistente(getActivity().getIntent()));
        aberturaLida = true;
        call.resolve(r);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (ehAssistente(intent)) notifyListeners("assistente", new JSObject());
    }

    void avisarEncerrarVoz() {
        notifyListeners("encerrarVoz", new JSObject());
    }

    @PluginMethod
    public void ehAssistentePadrao(PluginCall call) {
        boolean e = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager rm = ctx().getSystemService(RoleManager.class);
            e = rm != null && rm.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && rm.isRoleHeld(RoleManager.ROLE_ASSISTANT);
        }
        JSObject r = new JSObject();
        r.put("ativo", e);
        call.resolve(r);
    }

    @PluginMethod
    public void definirAssistente(PluginCall call) {
        try {
            iniciar(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS));
        } catch (ActivityNotFoundException e) {
            iniciar(new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS));
        }
        call.resolve();
    }

    // ---------- Serviço de voz (microfone com o app em segundo plano) ----------

    @PluginMethod
    public void servicoVoz(PluginCall call) {
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
    }

    // ---------- Apps ----------

    @PluginMethod
    public void apps(PluginCall call) {
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
    }

    @PluginMethod
    public void abrirApp(PluginCall call) {
        String pacote = call.getString("pacote", "");
        Intent i = ctx().getPackageManager().getLaunchIntentForPackage(pacote);
        if (i == null) {
            call.reject("Esse app não está instalado.");
            return;
        }
        iniciar(i);
        call.resolve();
    }

    // ---------- Sistema ----------

    @PluginMethod
    public void lanterna(PluginCall call) {
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
    }

    @PluginMethod
    public void midia(PluginCall call) {
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
    }

    @PluginMethod
    public void alarme(PluginCall call) {
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
        } catch (ActivityNotFoundException e) {
            call.reject("Não achei o app de relógio.");
        }
    }

    @PluginMethod
    public void bateria(PluginCall call) {
        BatteryManager bm = (BatteryManager) ctx().getSystemService(Context.BATTERY_SERVICE);
        JSObject r = new JSObject();
        r.put("nivel", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY));
        r.put("carregando", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && bm.isCharging());
        call.resolve(r);
    }

    @PluginMethod
    public void ajuste(PluginCall call) {
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
        } catch (ActivityNotFoundException e) {
            iniciar(new Intent(Settings.ACTION_SETTINGS));
        }
        call.resolve();
    }

    @PluginMethod
    public void brilho(PluginCall call) {
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
    }

    @PluginMethod
    public void naoPerturbe(PluginCall call) {
        NotificationManager nm = (NotificationManager) ctx().getSystemService(Context.NOTIFICATION_SERVICE);
        if (!nm.isNotificationPolicyAccessGranted()) {
            iniciar(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
            call.reject("PERMISSAO: libere o acesso ao Não perturbe para a FRIDAY na tela que abriu.");
            return;
        }
        boolean ligar = Boolean.TRUE.equals(call.getBoolean("ligar", true));
        nm.setInterruptionFilter(ligar ? NotificationManager.INTERRUPTION_FILTER_PRIORITY : NotificationManager.INTERRUPTION_FILTER_ALL);
        call.resolve();
    }

    @PluginMethod
    public void rota(PluginCall call) {
        String destino = call.getString("destino", "");
        String modo = call.getString("modo", "d");
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + Uri.encode(destino) + "&mode=" + modo));
        try {
            iniciar(i);
        } catch (ActivityNotFoundException e) {
            iniciar(new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(destino))));
        }
        call.resolve();
    }

    @PluginMethod
    public void abrirLink(PluginCall call) {
        try {
            iniciar(new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url", ""))));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Nenhum app abre esse link.");
        }
    }

    @PluginMethod
    public void infoDoApp(PluginCall call) {
        iniciar(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx().getPackageName())));
        call.resolve();
    }

    // ---------- Contatos, ligações e mensagens ----------

    @PluginMethod
    public void contatos(PluginCall call) {
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
    }

    @PluginMethod
    public void salvarContato(PluginCall call) {
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
    }

    @PluginMethod
    public void ligar(PluginCall call) {
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
    }

    @PluginMethod
    public void sms(PluginCall call) {
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
    }

    @PluginMethod
    public void eventos(PluginCall call) {
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
    }

    // ---------- Tela de outros apps (acessibilidade) ----------

    private FridayAcessibilidade servico(PluginCall call) {
        FridayAcessibilidade a = FridayAcessibilidade.instancia;
        if (a == null) call.reject("ACESSIBILIDADE: o controle da tela está desligado. Ative a FRIDAY em Ajustes > Acessibilidade.");
        return a;
    }

    @PluginMethod
    public void acessibilidade(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ativa", FridayAcessibilidade.instancia != null);
        call.resolve(r);
    }

    @PluginMethod
    public void abrirAcessibilidade(PluginCall call) {
        ComponentName comp = new ComponentName(ctx(), FridayAcessibilidade.class);
        try {
            Intent i = new Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS");
            i.putExtra(Intent.EXTRA_COMPONENT_NAME, comp.flattenToString());
            iniciar(i);
        } catch (ActivityNotFoundException e) {
            iniciar(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        }
        call.resolve();
    }

    @PluginMethod
    public void lerTela(PluginCall call) {
        FridayAcessibilidade a = servico(call);
        if (a == null) return;
        try {
            call.resolve(a.lerTela());
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void tocar(PluginCall call) {
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
    }

    @PluginMethod
    public void escrever(PluginCall call) {
        FridayAcessibilidade a = servico(call);
        if (a == null) return;
        try {
            Integer indice = call.getInt("indice");
            a.escrever(indice == null ? -1 : indice, call.getString("texto", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void rolar(PluginCall call) {
        FridayAcessibilidade a = servico(call);
        if (a == null) return;
        try {
            a.rolar(!"cima".equals(call.getString("direcao", "baixo")));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void botao(PluginCall call) {
        FridayAcessibilidade a = servico(call);
        if (a == null) return;
        if (a.botao(call.getString("acao", "voltar"))) call.resolve();
        else call.reject("Esse botão não funciona neste Android.");
    }
}
