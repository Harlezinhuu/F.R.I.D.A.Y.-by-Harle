// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Teste do porteiro contra um ntfy de mentira (roda no CI, fora do Android):
// o celular da rua pede "liga o PC", o porteiro responde, e recados forjados ou repetidos são ignorados.
package dev.harle.friday;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class TestePorteiro {
    static final List<String[]> RECADOS = new ArrayList<>(); // {id, hora, topico, mensagem}
    static final AtomicInteger PROXIMO = new AtomicInteger(1);

    static void verificar(boolean ok, String o) {
        if (!ok) throw new AssertionError(o);
        System.out.println("ok - " + o);
    }

    static List<String[]> desde(String topico, String desde) {
        List<String[]> l = new ArrayList<>();
        synchronized (RECADOS) {
            boolean depoisDoId = !desde.matches("\\d+") && !desde.endsWith("m") && !desde.endsWith("s");
            boolean achou = !depoisDoId;
            for (String[] r : RECADOS) {
                if (!r[2].equals(topico)) continue;
                if (depoisDoId) {
                    if (r[0].equals(desde)) { achou = true; continue; }
                    if (achou) l.add(r);
                } else if (desde.matches("\\d+")) {
                    if (Long.parseLong(r[1]) >= Long.parseLong(desde)) l.add(r);
                } else l.add(r);
            }
        }
        return l;
    }

    static String linha(String[] r) throws Exception {
        return new JSONObject().put("id", r[0]).put("time", Long.parseLong(r[1])).put("event", "message").put("topic", r[2]).put("message", r[3]).toString() + "\n";
    }

    static void ntfy(HttpExchange t) {
        try {
            String caminho = t.getRequestURI().getPath().substring(1);
            String q = t.getRequestURI().getQuery() == null ? "" : t.getRequestURI().getQuery();
            if ("POST".equals(t.getRequestMethod())) {
                String corpo = new String(t.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                String[] r = { "m" + PROXIMO.getAndIncrement(), String.valueOf(System.currentTimeMillis() / 1000), caminho, corpo };
                synchronized (RECADOS) { RECADOS.add(r); }
                byte[] b = linha(r).getBytes(StandardCharsets.UTF_8);
                t.sendResponseHeaders(200, b.length);
                t.getResponseBody().write(b);
                t.close();
                return;
            }
            String topico = caminho.replace("/json", "");
            String since = q.replaceAll(".*since=([^&]*).*", "$1");
            t.sendResponseHeaders(200, 0);
            OutputStream os = t.getResponseBody();
            os.write("{\"event\":\"open\"}\n".getBytes(StandardCharsets.UTF_8));
            List<String[]> enviados = new ArrayList<>(desde(topico, since));
            for (String[] r : enviados) os.write(linha(r).getBytes(StandardCharsets.UTF_8));
            os.flush();
            if (!q.contains("poll=1")) {
                // Conexão aberta: entrega o que chegar nos próximos 3 s
                long fim = System.currentTimeMillis() + 3000;
                while (System.currentTimeMillis() < fim) {
                    Thread.sleep(100);
                    for (String[] r : desde(topico, since)) {
                        if (enviados.contains(r)) continue;
                        enviados.add(r);
                        os.write(linha(r).getBytes(StandardCharsets.UTF_8));
                        os.flush();
                    }
                }
            }
            t.close();
        } catch (Exception e) {
            t.close();
        }
    }

    public static void main(String[] a) throws Exception {
        try {
            testar();
        } catch (Throwable e) {
            e.printStackTrace();
            System.exit(1);
        }
        System.exit(0);
    }

    static void testar() throws Exception {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", TestePorteiro::ntfy);
        s.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        s.start();
        Porteiro.servidor = "http://127.0.0.1:" + s.getAddress().getPort() + "/";

        String segredo = "segredo-de-teste-com-mais-de-20";
        String topico = Porteiro.topico(segredo);
        verificar(topico.matches("friday-[0-9a-f]{32}"), "tópico tirado do segredo: " + topico);
        verificar(topico.equals(Porteiro.topico(segredo)) && !topico.equals(Porteiro.topico("outro-segredo-qualquer-123")), "tópico estável e diferente para outro segredo");
        byte[] chave = Lacre.chave(segredo);

        // Um intruso que sabe o tópico mas não a chave
        Porteiro.publicar(Lacre.chave("chave-errada-do-intruso-1234"), topico, new JSONObject().put("acao", "acordar").put("de", "intruso"));

        // O porteiro (a central em casa)
        AtomicBoolean rodando = new AtomicBoolean(true);
        List<String> pedidos = new ArrayList<>();
        Thread porteiro = new Thread(() -> {
            String desde = "1m";
            while (rodando.get()) {
                try {
                    final String[] ultimo = { null };
                    Porteiro.escutar(chave, topico, desde, (r) -> {
                        ultimo[0] = r.id;
                        if (!"acordar".equals(r.acao()) || !Porteiro.primeiraVez(r)) return;
                        synchronized (pedidos) { pedidos.add(r.dados.optString("de")); }
                        try {
                            Porteiro.publicar(chave, topico, new JSONObject().put("acao", "acordei").put("de", "A51").put("enviados", 6));
                            Thread.sleep(500);
                            Porteiro.publicar(chave, topico, new JSONObject().put("acao", "pc_ligado").put("de", "A51"));
                        } catch (Exception e) { throw new RuntimeException(e); }
                    });
                    if (ultimo[0] != null) desde = ultimo[0];
                } catch (Exception e) {
                    try { Thread.sleep(200); } catch (InterruptedException ignorado) { return; }
                }
            }
        });
        porteiro.start();
        Thread.sleep(300);

        long desde = System.currentTimeMillis() / 1000 - 2;
        Porteiro.Recado r = Porteiro.pedirParaAcordar(chave, topico, "Galaxy da rua", 8000);
        verificar(r != null && "A51".equals(r.dados.optString("de")), "o porteiro respondeu \"acordei\"");
        verificar("pc_ligado".equals(Porteiro.esperarResultado(chave, topico, String.valueOf(desde), 8000)), "e depois avisou que o PC ligou");
        synchronized (pedidos) {
            verificar(pedidos.size() == 1 && pedidos.get(0).equals("Galaxy da rua"), "o recado do intruso foi ignorado: " + pedidos);
        }

        // O pedido "acordar" copiado e mandado de novo (o mesmo envelope) não liga o PC outra vez
        String copiado = null;
        synchronized (RECADOS) {
            for (String[] x : RECADOS) {
                Porteiro.Recado y = Porteiro.abrir(x[0], chave, x[3]);
                if (y != null && "acordar".equals(y.acao())) copiado = x[3];
            }
        }
        verificar(copiado != null, "achei o pedido original");
        java.net.HttpURLConnection con = (java.net.HttpURLConnection) new java.net.URL(Porteiro.servidor + topico).openConnection();
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.getOutputStream().write(copiado.getBytes(StandardCharsets.UTF_8));
        verificar(con.getResponseCode() == 200, "recado copiado mandado de novo");
        Thread.sleep(1500);
        synchronized (pedidos) {
            verificar(pedidos.size() == 1, "o recado repetido foi ignorado");
        }

        rodando.set(false);
        s.stop(0);
        System.out.println("Porteiro OK");
    }
}
