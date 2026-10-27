// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Fala os avisos com a voz da FRIDAY mesmo com o app fechado: a frase vai para o TTS do Gemini
// (a mesma voz escolhida nos Ajustes, com a chave guardada só neste celular). Sem internet ou se
// demorar, usa a voz do próprio Android. Durante uma ligação tocando, o toque fica mudo enquanto ela fala.
package dev.harle.friday;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

final class Locutor {
    private Locutor() {
    }

    /** Modelos de voz do Gemini, do mais rápido para o de reserva. */
    private static final String[] MODELOS = { "gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts" };
    private static final int TAXA = 24000;
    private static final ExecutorService FILA = Executors.newSingleThreadExecutor();
    private static TextToSpeech tts;
    private static volatile boolean ttsPronto;

    static JSONObject lerJson(Context c, String chave) {
        SharedPreferences sp = c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String v = sp.getString(chave, null);
        if (v == null) return new JSONObject();
        try {
            return new JSONObject(v);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static AudioAttributes atributos() {
        AudioAttributes.Builder b = new AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_SPEECH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setUsage(AudioAttributes.USAGE_ASSISTANT);
        else b.setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE);
        return b.build();
    }

    /** Fala a frase na fila (um aviso de cada vez). `ligacao`: deixa o toque mudo enquanto fala. */
    static void falar(Context contexto, String frase, boolean ligacao) {
        final Context c = contexto.getApplicationContext();
        FILA.execute(() -> {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            boolean mutei = false;
            Object foco = null;
            try {
                if (ligacao) {
                    try {
                        if (!am.isStreamMute(AudioManager.STREAM_RING)) {
                            am.adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_MUTE, 0);
                            mutei = true;
                        }
                    } catch (Exception ignorado) {
                        // Sem acesso ao Não perturbe o Android não deixa mexer no toque: ela fala por cima
                    }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    AudioFocusRequest pedido = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(atributos()).build();
                    am.requestAudioFocus(pedido);
                    foco = pedido;
                }
                byte[] pcm = vozDoGemini(c, frase);
                if (pcm != null && pcm.length > 0) tocar(pcm);
                else vozDoAndroid(c, frase);
            } catch (Exception e) {
                vozDoAndroid(c, frase);
            } finally {
                if (foco != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) am.abandonAudioFocusRequest((AudioFocusRequest) foco);
                if (mutei) {
                    try {
                        am.adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_UNMUTE, 0);
                    } catch (Exception ignorado) {
                        // nada a desfazer
                    }
                }
            }
        });
    }

    // ---------- Voz do Gemini ----------

    private static byte[] vozDoGemini(Context c, String frase) {
        JSONObject ajustes = lerJson(c, "ajustes");
        String chave = ajustes.optString("chave", "");
        if (chave.isEmpty()) return null;
        String voz = ajustes.optString("voz", "Kore");
        for (String modelo : MODELOS) {
            try {
                byte[] audio = pedir(chave, modelo, voz, frase);
                if (audio != null) return audio;
            } catch (Exception e) {
                // tenta o próximo modelo; no fim cai na voz do Android
            }
        }
        return null;
    }

    private static byte[] pedir(String chave, String modelo, String voz, String frase) throws Exception {
        JSONObject anotacao = new JSONObject().put("type", "speech_metadata")
            .put("style", "calma, rápida e eficiente, como uma assistente de IA; português do Brasil");
        JSONObject parte = new JSONObject().put("type", "text").put("text", frase).put("annotations", new JSONArray().put(anotacao));
        JSONObject entrada = new JSONObject().put("type", "user_input").put("content", new JSONArray().put(parte));
        JSONObject corpo = new JSONObject()
            .put("model", modelo)
            .put("input", new JSONArray().put(entrada))
            .put("response_format", new JSONObject().put("type", "audio"))
            .put("generation_config", new JSONObject().put("speech_config", new JSONArray().put(new JSONObject().put("voice", voz))));

        HttpURLConnection con = (HttpURLConnection) new URL("https://generativelanguage.googleapis.com/v1beta/interactions").openConnection();
        con.setConnectTimeout(3000);
        con.setReadTimeout(6000);
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setRequestProperty("Content-Type", "application/json");
        con.setRequestProperty("x-goog-api-key", chave);
        try (OutputStream os = con.getOutputStream()) {
            os.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
        }
        if (con.getResponseCode() != 200) {
            con.disconnect();
            return null;
        }
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        try (InputStream is = con.getInputStream()) {
            byte[] b = new byte[16384];
            int n;
            while ((n = is.read(b)) > 0) buf.write(b, 0, n);
        }
        con.disconnect();
        String dados = acharAudio(new JSONObject(buf.toString("UTF-8")));
        if (dados == null) return null;
        return semCabecalho(Base64.decode(dados, Base64.DEFAULT));
    }

    /** Procura o áudio em base64 na resposta (steps[].content[] com type "audio"). */
    private static String acharAudio(Object no) {
        String achado = null;
        if (no instanceof JSONObject) {
            JSONObject o = (JSONObject) no;
            if ("audio".equals(o.optString("type")) && o.optString("data", "").length() > 100) return o.optString("data");
            JSONArray nomes = o.names();
            for (int i = 0; nomes != null && i < nomes.length(); i++) {
                String r = acharAudio(o.opt(nomes.optString(i)));
                if (r != null) achado = r;
            }
        } else if (no instanceof JSONArray) {
            JSONArray a = (JSONArray) no;
            for (int i = 0; i < a.length(); i++) {
                String r = acharAudio(a.opt(i));
                if (r != null) achado = r;
            }
        }
        return achado;
    }

    /** WAV vira PCM puro (pula o cabeçalho até o bloco "data"); PCM puro passa direto. */
    private static byte[] semCabecalho(byte[] b) {
        if (b.length < 44 || b[0] != 'R' || b[1] != 'I' || b[2] != 'F' || b[3] != 'F') return b;
        int i = 12;
        while (i + 8 <= b.length) {
            int tam = (b[i + 4] & 0xff) | (b[i + 5] & 0xff) << 8 | (b[i + 6] & 0xff) << 16 | (b[i + 7] & 0xff) << 24;
            if (b[i] == 'd' && b[i + 1] == 'a' && b[i + 2] == 't' && b[i + 3] == 'a') {
                int ini = i + 8;
                int fim = Math.min(b.length, ini + Math.max(0, tam));
                byte[] pcm = new byte[fim - ini];
                System.arraycopy(b, ini, pcm, 0, pcm.length);
                return pcm;
            }
            i += 8 + Math.max(0, tam);
        }
        return b;
    }

    private static void tocar(byte[] pcm) throws InterruptedException {
        int bytes = pcm.length - (pcm.length % 2);
        AudioTrack t = new AudioTrack.Builder()
            .setAudioAttributes(atributos())
            .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(TAXA).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(bytes)
            .build();
        try {
            t.write(pcm, 0, bytes);
            t.play();
            Thread.sleep(bytes * 1000L / (TAXA * 2) + 250);
        } finally {
            t.release();
        }
    }

    // ---------- Voz do Android (reserva) ----------

    private static void vozDoAndroid(Context c, String frase) {
        try {
            if (tts == null || !ttsPronto) {
                CountDownLatch pronto = new CountDownLatch(1);
                tts = new TextToSpeech(c, status -> {
                    ttsPronto = status == TextToSpeech.SUCCESS;
                    pronto.countDown();
                });
                pronto.await(4, TimeUnit.SECONDS);
                if (!ttsPronto) return;
                tts.setLanguage(new Locale("pt", "BR"));
                tts.setAudioAttributes(atributos());
            }
            CountDownLatch fim = new CountDownLatch(1);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { fim.countDown(); }
                @Override public void onError(String id) { fim.countDown(); }
            });
            tts.speak(frase, TextToSpeech.QUEUE_FLUSH, new Bundle(), "friday-aviso");
            fim.await(20, TimeUnit.SECONDS);
        } catch (Exception ignorado) {
            // sem voz nenhuma: o aviso padrão do celular continua lá
        }
    }
}
