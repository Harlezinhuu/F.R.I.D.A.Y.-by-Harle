// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Porteiro: o celular que fica em casa (a central do quarto) recebe da rua o pedido "liga o PC" e
// manda o pacote mágico pela rede de casa. Funciona até com CGNAT, porque quem abre a conexão é o
// próprio porteiro: ele fica conectado num serviço público de avisos (ntfy) esperando recados.
//
// Os recados vão lacrados com a chave do pareamento (o mesmo AES-GCM do elo), com hora e número
// único: o ntfy só vê texto embaralhado, ninguém de fora consegue mandar um recado válido, e um
// recado copiado não vale de novo. O tópico também sai do segredo do pareamento.
//
// Java + org.json, sem nada do Android, para o teste rodar fora do celular.
package dev.harle.friday;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class Porteiro {
    private Porteiro() {
    }

    /** Servidor de avisos (trocável no teste). */
    static volatile String servidor = "https://ntfy.sh/";

    /** Um recado aberto: o id do ntfy e o que veio dentro do lacre. */
    static final class Recado {
        final String id;
        final String unico;
        final JSONObject dados;

        Recado(String id, String unico, JSONObject dados) {
            this.id = id;
            this.unico = unico;
            this.dados = dados;
        }

        String acao() {
            return dados.optString("acao", "");
        }
    }

    interface Ouvinte {
        void recado(Recado r);
    }

    private static final Set<String> VISTOS = new LinkedHashSet<>();

    /** Tópico tirado do segredo do pareamento: só quem pareou com o mesmo PC sabe qual é. */
    static String topico(String segredo) throws Exception {
        byte[] h = MessageDigest.getInstance("SHA-256").digest(("friday-porteiro|" + segredo).getBytes(StandardCharsets.UTF_8));
        StringBuilder s = new StringBuilder("friday-");
        for (int i = 0; i < 16; i++) s.append(String.format("%02x", h[i] & 0xff));
        return s.toString();
    }

    /**
     * Primeira vez que este recado aparece? Só o pedido "acordar" (que faz algo) passa por aqui:
     * o mesmo recado copiado e mandado de novo não liga o PC duas vezes.
     */
    static boolean primeiraVez(Recado r) {
        String unico = r.unico;
        synchronized (VISTOS) {
            if (unico.isEmpty() || VISTOS.contains(unico)) return false;
            VISTOS.add(unico);
            if (VISTOS.size() > 300) {
                Iterator<String> it = VISTOS.iterator();
                it.next();
                it.remove();
            }
            return true;
        }
    }

    /** Abre um recado: só vale se foi lacrado com a chave e é recente (2 min). */
    static Recado abrir(String id, byte[] chave, String envelope) {
        try {
            JSONObject m = new JSONObject(Lacre.abrir(chave, envelope.trim()));
            if (Math.abs(System.currentTimeMillis() - m.optLong("t", 0)) > 120_000L) return null;
            JSONObject d = m.optJSONObject("d");
            return d == null ? null : new Recado(id, m.optString("n", ""), d);
        } catch (Exception e) {
            return null;
        }
    }

    static void publicar(byte[] chave, String topico, JSONObject dados) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(servidor + topico).openConnection();
        try {
            con.setConnectTimeout(8000);
            con.setReadTimeout(8000);
            con.setRequestMethod("POST");
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            try (OutputStream os = con.getOutputStream()) {
                os.write(Lacre.lacrar(chave, dados.toString()).getBytes(StandardCharsets.UTF_8));
            }
            int s = con.getResponseCode();
            if (s != 200) throw new IOException("O serviço de avisos respondeu " + s);
        } finally {
            con.disconnect();
        }
    }

    private static void ler(HttpURLConnection con, byte[] chave, Ouvinte ouvinte) throws IOException {
        int s = con.getResponseCode();
        if (s != 200) throw new IOException("O serviço de avisos respondeu " + s);
        try (BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8))) {
            String linha;
            while ((linha = r.readLine()) != null) {
                if (linha.trim().isEmpty()) continue;
                try {
                    JSONObject e = new JSONObject(linha);
                    if (!"message".equals(e.optString("event"))) continue; // "open" e "keepalive"
                    Recado rec = abrir(e.optString("id", ""), chave, e.optString("message", ""));
                    if (rec != null) ouvinte.recado(rec);
                } catch (Exception ignorado) {
                    // linha estranha: pula
                }
            }
        }
    }

    /** Recados desde `desde` (id do ntfy, hora em segundos ou "2m"), sem ficar conectado. */
    static List<Recado> buscar(byte[] chave, String topico, String desde) throws Exception {
        List<Recado> lista = new ArrayList<>();
        HttpURLConnection con = (HttpURLConnection) new URL(servidor + topico + "/json?poll=1&since=" + desde).openConnection();
        try {
            con.setConnectTimeout(8000);
            con.setReadTimeout(10000);
            ler(con, chave, lista::add);
        } finally {
            con.disconnect();
        }
        return lista;
    }

    /** Fica conectado recebendo recados até a conexão cair (o ntfy manda sinal de vida a cada ~45 s). */
    static void escutar(byte[] chave, String topico, String desde, Ouvinte ouvinte) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(servidor + topico + "/json?since=" + desde).openConnection();
        try {
            con.setConnectTimeout(10000);
            con.setReadTimeout(120_000);
            ler(con, chave, ouvinte);
        } finally {
            con.disconnect();
        }
    }

    /**
     * Do celular da rua: pede para ligar o PC e espera o porteiro responder.
     * Devolve o recado "acordei" (com o nome do porteiro) ou null se ninguém respondeu.
     */
    static Recado pedirParaAcordar(byte[] chave, String topico, String de, int esperaMs) throws Exception {
        long desde = System.currentTimeMillis() / 1000 - 2;
        publicar(chave, topico, new JSONObject().put("acao", "acordar").put("de", de));
        long fim = System.currentTimeMillis() + esperaMs;
        while (System.currentTimeMillis() < fim) {
            Thread.sleep(1200);
            for (Recado r : buscar(chave, topico, String.valueOf(desde))) {
                if ("acordei".equals(r.acao())) return r;
            }
        }
        return null;
    }

    /** Depois do "acordei": espera o porteiro dizer se o PC ligou. Devolve "pc_ligado", "pc_nao_ligou" ou "". */
    static String esperarResultado(byte[] chave, String topico, String desde, int esperaMs) throws Exception {
        long fim = System.currentTimeMillis() + esperaMs;
        while (System.currentTimeMillis() < fim) {
            Thread.sleep(4000);
            try {
                for (Recado r : buscar(chave, topico, desde)) {
                    if ("pc_ligado".equals(r.acao()) || "pc_nao_ligou".equals(r.acao())) return r.acao();
                }
            } catch (IOException ignorado) {
                // sem rede por um instante: tenta de novo
            }
        }
        return "";
    }
}
