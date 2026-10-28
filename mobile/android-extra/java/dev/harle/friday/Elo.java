// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Elo com a FRIDAY do PC, do lado do celular: manda pedidos lacrados para o servidor do PC (rede de
// casa ou Tailscale), pareia pelo código de 8 dígitos e liga o PC pela rede (Wake-on-LAN).
// Funciona com o app fechado (os avisos usam), por isso fica no Java e não no JavaScript.
package dev.harle.friday;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class Elo {
    private Elo() {
    }

    /** Último endereço do PC que respondeu (tentado primeiro). */
    private static volatile String ipBom;

    /** Pareamento salvo pelo app ({nome, porta, segredo, ips, macs}), ou null. */
    static JSONObject config(Context c) {
        JSONObject j = Locutor.lerJson(c, "elo");
        return j.optString("segredo", "").length() >= 20 && j.optJSONArray("ips") != null ? j : null;
    }

    static boolean pareado(Context c) {
        return config(c) != null;
    }

    static String post(String url, String corpo, int conectarMs, int lerMs) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        try {
            con.setConnectTimeout(conectarMs);
            con.setReadTimeout(lerMs);
            con.setRequestMethod("POST");
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            try (OutputStream os = con.getOutputStream()) {
                os.write(corpo.getBytes(StandardCharsets.UTF_8));
            }
            int status = con.getResponseCode();
            if (status == 403) throw new SecurityException("O PC recusou o pedido. Pareie de novo.");
            if (status != 200) throw new IOException("O PC respondeu " + status);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            try (InputStream is = con.getInputStream()) {
                byte[] b = new byte[8192];
                int n;
                while ((n = is.read(b)) > 0) buf.write(b, 0, n);
            }
            return buf.toString("UTF-8");
        } finally {
            con.disconnect();
        }
    }

    private static JSONObject dentro(String aberto) throws Exception {
        JSONObject m = new JSONObject(aberto);
        if (Math.abs(System.currentTimeMillis() - m.optLong("t", 0)) > 120_000L) {
            throw new SecurityException("O relógio do celular e o do PC estão muito diferentes.");
        }
        Object d = m.opt("d");
        return d instanceof JSONObject ? (JSONObject) d : new JSONObject().put("valor", d);
    }

    /** Manda um pedido ao PC e devolve a resposta. `limiteMs`: quanto espera a resposta. */
    static JSONObject pedir(Context c, JSONObject dados, int limiteMs) throws Exception {
        JSONObject cfg = config(c);
        if (cfg == null) throw new IllegalStateException("O celular não está pareado com o PC.");
        byte[] chave = Lacre.chave(cfg.getString("segredo"));
        int porta = cfg.optInt("porta", 47923);
        JSONArray lista = cfg.getJSONArray("ips");
        List<String> ips = new ArrayList<>();
        if (ipBom != null) ips.add(ipBom);
        for (int i = 0; i < lista.length(); i++) if (!lista.getString(i).equals(ipBom)) ips.add(lista.getString(i));
        String envelope = Lacre.lacrar(chave, dados.toString());
        SecurityException recusa = null;
        for (String ip : ips) {
            try {
                String r = post("http://" + ip + ":" + porta + "/elo", envelope, Math.min(limiteMs, 1800), limiteMs);
                JSONObject d = dentro(Lacre.abrir(chave, r));
                ipBom = ip;
                return d;
            } catch (SecurityException e) {
                recusa = e;
            } catch (Exception e) {
                // tenta o próximo endereço
            }
            // Cada tentativa precisa de um envelope novo (o PC recusa repetidos)
            envelope = Lacre.lacrar(chave, dados.toString());
        }
        if (recusa != null) throw recusa;
        throw new IOException("O PC não respondeu: está desligado, dormindo ou em outra rede.");
    }

    /** Pareia pelo código de 8 dígitos que aparece no PC. Devolve o texto do pareamento (o mesmo do QR). */
    static String parearCodigo(String ip, int porta, String codigo, String aparelho) throws Exception {
        byte[] k = Lacre.chaveDoCodigo(codigo);
        String pedido = new JSONObject().put("acao", "parear").put("aparelho", aparelho).toString();
        String r = post("http://" + ip.trim() + ":" + porta + "/parear", Lacre.lacrar(k, pedido), 4000, 6000);
        return dentro(Lacre.abrir(k, r)).getString("pareamento");
    }

    /** Liga o PC pela rede (Wake-on-LAN). Devolve quantos pacotes saíram. */
    static int acordar(Context c) throws Exception {
        JSONObject cfg = config(c);
        if (cfg == null) throw new IllegalStateException("O celular não está pareado com o PC.");
        JSONArray macs = cfg.optJSONArray("macs");
        if (macs == null || macs.length() == 0) throw new IllegalStateException("Não sei a placa de rede do PC. Pareie de novo com o PC ligado no cabo.");
        List<String> destinos = new ArrayList<>();
        destinos.add("255.255.255.255");
        JSONArray ips = cfg.getJSONArray("ips");
        for (int i = 0; i < ips.length(); i++) {
            String ip = ips.getString(i);
            if (ip.startsWith("100.")) continue; // Tailscale não repassa o pacote mágico
            destinos.add(ip.substring(0, ip.lastIndexOf('.')) + ".255");
        }
        int enviados = 0;
        try (DatagramSocket s = new DatagramSocket()) {
            s.setBroadcast(true);
            for (int i = 0; i < macs.length(); i++) {
                String[] partes = macs.getString(i).split("[:-]");
                if (partes.length != 6) continue;
                byte[] mac = new byte[6];
                for (int k = 0; k < 6; k++) mac[k] = (byte) Integer.parseInt(partes[k], 16);
                // Pacote mágico: 6 bytes 0xFF e o endereço da placa repetido 16 vezes
                byte[] p = new byte[6 + 16 * 6];
                for (int k = 0; k < 6; k++) p[k] = (byte) 0xff;
                for (int k = 6; k < p.length; k += 6) System.arraycopy(mac, 0, p, k, 6);
                for (String d : destinos) {
                    for (int portaWol : new int[] { 9, 7 }) {
                        try {
                            s.send(new DatagramPacket(p, p.length, InetAddress.getByName(d), portaWol));
                            enviados++;
                        } catch (Exception ignorado) {
                            // rede que não aceita esse destino
                        }
                    }
                }
            }
        }
        return enviados;
    }
}
