// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Resumo da manhã: quando você desliga o alarme, ela fala a hora, o clima, a agenda, os lembretes
// do dia e quem te mandou mensagem enquanto você dormia. Uma vez por dia. Se você já estiver no
// PC, quem fala é o PC.
package dev.harle.friday;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

final class Resumo {
    private Resumo() {
    }

    static void falarUmaVezPorDia(Context c) {
        SharedPreferences sp = c.getSharedPreferences("friday_nativo", Context.MODE_PRIVATE);
        String hoje = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
        if (hoje.equals(sp.getString("resumo", ""))) return;
        sp.edit().putString("resumo", hoje).apply();
        falar(c);
    }

    static void falar(Context contexto) {
        final Context c = contexto.getApplicationContext();
        new Thread(() -> {
            String texto;
            try {
                texto = montar(c);
            } catch (Exception e) {
                texto = "Bom dia. Não consegui montar o resumo agora.";
            }
            Locutor.falar(c, texto, false);
        }, "friday-resumo").start();
    }

    private static JSONObject pegar(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(4000);
        con.setReadTimeout(5000);
        con.setRequestProperty("User-Agent", "FRIDAY-celular/0.5 (projeto pessoal)");
        try {
            if (con.getResponseCode() != 200) throw new IllegalStateException("HTTP " + con.getResponseCode());
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            try (InputStream is = con.getInputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) b.write(buf, 0, n);
            }
            return new JSONObject(b.toString("UTF-8"));
        } finally {
            con.disconnect();
        }
    }

    private static String ceu(int codigo) {
        if (codigo == 0) return "céu limpo";
        if (codigo <= 3) return "algumas nuvens";
        if (codigo <= 48) return "neblina";
        if (codigo <= 67) return "chuva";
        if (codigo <= 77) return "neve";
        if (codigo <= 82) return "pancadas de chuva";
        return "tempestade";
    }

    private static String clima(Context c) {
        try {
            String cidade = Locutor.lerJson(c, "ajustes").optString("cidade", "").trim();
            double lat, lon;
            String nome;
            if (!cidade.isEmpty()) {
                JSONObject g = pegar("https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=" + Uri.encode(cidade));
                JSONObject r = g.getJSONArray("results").getJSONObject(0);
                lat = r.getDouble("latitude");
                lon = r.getDouble("longitude");
                nome = r.optString("name", cidade);
            } else {
                JSONObject ip = pegar("https://ipwho.is/?fields=success,city,latitude,longitude");
                lat = ip.getDouble("latitude");
                lon = ip.getDouble("longitude");
                nome = ip.optString("city", "");
            }
            JSONObject p = pegar(String.format(Locale.ROOT,
                "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1",
                lat, lon));
            JSONObject agora = p.getJSONObject("current");
            JSONObject dia = p.getJSONObject("daily");
            long temp = Math.round(agora.getDouble("temperature_2m"));
            long max = Math.round(dia.getJSONArray("temperature_2m_max").getDouble(0));
            long min = Math.round(dia.getJSONArray("temperature_2m_min").getDouble(0));
            int chuva = dia.getJSONArray("precipitation_probability_max").optInt(0, 0);
            StringBuilder s = new StringBuilder();
            s.append(nome.isEmpty() ? "Lá fora" : "Em " + nome).append(", ").append(temp).append(" graus agora, ").append(ceu(agora.optInt("weather_code", 0)));
            s.append(". Máxima de ").append(max).append(" e mínima de ").append(min);
            if (chuva >= 30) s.append(", com ").append(chuva).append(" por cento de chance de chuva");
            return s.append(". ").toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String agenda(Context c) {
        if (c.checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) return "";
        Calendar ini = Calendar.getInstance();
        Calendar fim = Calendar.getInstance();
        fim.set(Calendar.HOUR_OF_DAY, 23);
        fim.set(Calendar.MINUTE, 59);
        List<String> itens = new ArrayList<>();
        String[] proj = { CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.ALL_DAY };
        try (Cursor cur = CalendarContract.Instances.query(c.getContentResolver(), proj, ini.getTimeInMillis(), fim.getTimeInMillis())) {
            while (cur != null && cur.moveToNext() && itens.size() < 4) {
                String titulo = cur.getString(0);
                if (titulo == null || titulo.isEmpty()) continue;
                if (cur.getInt(2) == 1) itens.add(titulo);
                else itens.add(titulo + " às " + new SimpleDateFormat("H:mm", Locale.ROOT).format(new Date(cur.getLong(1))).replace(":00", "h"));
            }
        } catch (Exception e) {
            return "";
        }
        return itens.isEmpty() ? "Agenda livre hoje. " : "Na agenda: " + juntar(itens) + ". ";
    }

    private static String lembretes(Context c) {
        try {
            String v = c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("lembretes", "[]");
            JSONArray a = new JSONArray(v);
            String hoje = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
            List<String> itens = new ArrayList<>();
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT);
            iso.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            for (int i = 0; i < a.length() && itens.size() < 3; i++) {
                JSONObject l = a.getJSONObject(i);
                String q = l.optString("quandoIso", "");
                if (q.length() < 19) continue;
                Date d = iso.parse(q.substring(0, 19));
                boolean diario = "diario".equals(l.optString("repetir")) || "dias_uteis".equals(l.optString("repetir"));
                if (d == null) continue;
                if (!diario && !hoje.equals(new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(d))) continue;
                itens.add(l.optString("texto") + " às " + new SimpleDateFormat("H:mm", Locale.ROOT).format(d).replace(":00", "h"));
            }
            return itens.isEmpty() ? "" : "Lembretes: " + juntar(itens) + ". ";
        } catch (Exception e) {
            return "";
        }
    }

    private static String juntar(List<String> l) {
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < l.size(); i++) {
            if (i > 0) s.append(i == l.size() - 1 ? " e " : ", ");
            s.append(l.get(i));
        }
        return s.toString();
    }

    static String montar(Context c) {
        String tratamento = Locutor.lerJson(c, "avisos").optString("tratamento", "Senhor").trim();
        Calendar agora = Calendar.getInstance();
        int h = agora.get(Calendar.HOUR_OF_DAY), m = agora.get(Calendar.MINUTE);
        StringBuilder s = new StringBuilder("Bom dia");
        if (!tratamento.isEmpty()) s.append(", ").append(tratamento);
        s.append(". São ").append(h).append(m == 0 ? " em ponto" : " e " + m).append(". ");
        s.append(clima(c)).append(agenda(c)).append(lembretes(c));
        List<String> noite = FridayAvisos.naoAvisadasDesde(System.currentTimeMillis() - 12 * 3600_000L);
        if (!noite.isEmpty()) s.append("Enquanto você dormia, ").append(juntar(noite)).append(noite.size() > 1 ? " mandaram mensagem. " : " mandou mensagem. ");
        return s.append("Tenha um bom dia.").toString();
    }
}
