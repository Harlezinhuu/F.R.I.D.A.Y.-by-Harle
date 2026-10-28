// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Lacre das mensagens do elo com o PC: AES-256-GCM com a chave tirada do segredo do pareamento.
// É o mesmo formato de src/shared/elo.ts (base64 de iv + texto cifrado + etiqueta). Java puro,
// sem nada do Android, para o teste rodar no CI conversando com o servidor do PC.
package dev.harle.friday;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class Lacre {
    private Lacre() {
    }

    private static final SecureRandom SORTE = new SecureRandom();
    private static final char[] B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();

    static byte[] chave(String segredo) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(("friday-elo|" + segredo).getBytes(StandardCharsets.UTF_8));
    }

    /** Chave do pareamento por código: só os dígitos contam. */
    static byte[] chaveDoCodigo(String codigo) throws Exception {
        return chave("parear|" + codigo.replaceAll("\\D", ""));
    }

    /** Lacra `dadosJson` (já em JSON) com a hora e um número único. */
    static String lacrar(byte[] chave, String dadosJson) throws Exception {
        byte[] iv = new byte[12];
        byte[] unico = new byte[12];
        SORTE.nextBytes(iv);
        SORTE.nextBytes(unico);
        String claro = "{\"t\":" + System.currentTimeMillis() + ",\"n\":\"" + base64(unico) + "\",\"d\":" + dadosJson + "}";
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(chave, "AES"), new GCMParameterSpec(128, iv));
        byte[] cifrado = c.doFinal(claro.getBytes(StandardCharsets.UTF_8));
        byte[] tudo = new byte[iv.length + cifrado.length];
        System.arraycopy(iv, 0, tudo, 0, iv.length);
        System.arraycopy(cifrado, 0, tudo, iv.length, cifrado.length);
        return base64(tudo);
    }

    /** Abre o envelope e devolve o JSON inteiro ({"t":..., "n":..., "d":...}); quem chama confere a hora. */
    static String abrir(byte[] chave, String envelope) throws Exception {
        byte[] tudo = deBase64(envelope.trim());
        if (tudo.length < 28) throw new IllegalArgumentException("envelope curto");
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(chave, "AES"), new GCMParameterSpec(128, tudo, 0, 12));
        return new String(c.doFinal(tudo, 12, tudo.length - 12), StandardCharsets.UTF_8);
    }

    static String base64(byte[] b) {
        StringBuilder s = new StringBuilder((b.length + 2) / 3 * 4);
        for (int i = 0; i < b.length; i += 3) {
            int n = (b[i] & 0xff) << 16 | (i + 1 < b.length ? (b[i + 1] & 0xff) << 8 : 0) | (i + 2 < b.length ? b[i + 2] & 0xff : 0);
            s.append(B64[n >>> 18 & 63]).append(B64[n >>> 12 & 63]);
            s.append(i + 1 < b.length ? B64[n >>> 6 & 63] : '=');
            s.append(i + 2 < b.length ? B64[n & 63] : '=');
        }
        return s.toString();
    }

    static byte[] deBase64(String s) {
        int[] val = new int[128];
        java.util.Arrays.fill(val, -1);
        for (int i = 0; i < B64.length; i++) val[B64[i]] = i;
        val['-'] = 62;
        val['_'] = 63;
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(s.length() * 3 / 4);
        int buf = 0, bits = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '=' || ch >= 128 || val[ch] < 0) continue;
            buf = buf << 6 | val[ch];
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.write(buf >>> bits & 0xff);
            }
        }
        return out.toByteArray();
    }
}
