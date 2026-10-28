// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Teste do lacre em Java contra o mesmo formato do PC (src/shared/elo.ts).
// Modo 1: java TesteLacre lacrar <segredo> <json>   → imprime o envelope
// Modo 2: java TesteLacre abrir <segredo> <envelope> → imprime o JSON aberto
// Modo 3: java TesteLacre http <url> <codigo>        → pareia pelo código e manda um aviso ao servidor do PC
package dev.harle.friday;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class TesteLacre {
    static String post(String url, String corpo) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        try (OutputStream os = c.getOutputStream()) { os.write(corpo.getBytes(StandardCharsets.UTF_8)); }
        if (c.getResponseCode() != 200) throw new IllegalStateException("status " + c.getResponseCode());
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        try (InputStream is = c.getInputStream()) { is.transferTo(b); }
        return b.toString(StandardCharsets.UTF_8);
    }

    public static void main(String[] a) throws Exception {
        switch (a[0]) {
            case "lacrar": System.out.println(Lacre.lacrar(Lacre.chave(a[1]), a[2])); break;
            case "abrir": System.out.println(Lacre.abrir(Lacre.chave(a[1]), a[2])); break;
            case "http": {
                byte[] kc = Lacre.chaveDoCodigo(a[2]);
                String r = Lacre.abrir(kc, post(a[1] + "/parear", Lacre.lacrar(kc, "{\"acao\":\"parear\",\"aparelho\":\"Java\"}")));
                String texto = r.replaceAll("(?s).*\"pareamento\":\"([^\"]+)\".*", "$1");
                String segredo = texto.split("\\|")[3];
                byte[] k = Lacre.chave(segredo);
                String resp = Lacre.abrir(k, post(a[1] + "/elo", Lacre.lacrar(k, "{\"acao\":\"aviso\",\"texto\":\"Senhor, a Mãe está te ligando.\",\"ligacao\":true}")));
                System.out.println(resp.contains("\"falou\":true") ? "http ok" : "http FALHOU: " + resp);
                break;
            }
            default: throw new IllegalArgumentException(a[0]);
        }
    }
}
