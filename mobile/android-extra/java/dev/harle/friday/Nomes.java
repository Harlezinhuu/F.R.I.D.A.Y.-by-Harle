// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Regras dos avisos por voz que não dependem do Android (por isso têm teste): comparar nomes de
// contatos, reconhecer número desconhecido e montar a frase que a FRIDAY fala.
package dev.harle.friday;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

final class Nomes {
    private Nomes() {
    }

    /** Minúsculas, sem acento, sem emoji e sem símbolos: "Mãe ❤️" → "mae". */
    static String normalizar(String s) {
        if (s == null) return "";
        String t = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
        return t.replaceAll("[^a-z0-9]+", " ").trim();
    }

    /** O nome da notificação é de um dos contatos importantes? */
    static boolean ehImportante(String nome, List<String> importantes) {
        String n = normalizar(nome);
        if (n.isEmpty()) return false;
        for (String i : importantes) {
            String imp = normalizar(i);
            if (imp.isEmpty()) continue;
            if (n.equals(imp) || n.startsWith(imp + " ") || imp.startsWith(n + " ")) return true;
        }
        return false;
    }

    /** Título que é só um número (quem liga não está nos contatos). */
    static boolean ehNumero(String titulo) {
        if (titulo == null) return false;
        String digitos = titulo.replaceAll("\\D", "");
        String letras = titulo.replaceAll("[^\\p{L}]", "");
        return digitos.length() >= 6 && letras.length() <= 2;
    }

    /** Nome para falar: sem emoji e símbolos ("Mãe ❤️" → "Mãe"). */
    static String limpo(String s) {
        if (s == null) return "";
        return s.replaceAll("[^\\p{L}\\p{N}\\s.'-]", "").replaceAll("\\s+", " ").trim();
    }

    private static String inicio(String tratamento) {
        String t = tratamento == null ? "" : tratamento.trim();
        return t.isEmpty() ? "" : t + ", ";
    }

    private static String maiuscula(String s) {
        return s.isEmpty() ? s : s.substring(0, 1).toUpperCase(Locale.ROOT) + s.substring(1);
    }

    static String fraseLigacao(String tratamento, String quem, String app) {
        String q = limpo(quem).isEmpty() || ehNumero(quem) ? "um número desconhecido" : limpo(quem);
        String por = app == null || app.isEmpty() ? "" : " pelo " + app;
        return maiuscula(inicio(tratamento) + q + " está te ligando" + por + ".");
    }

    static String fraseMensagem(String tratamento, String quem, String app, String grupo, String texto) {
        StringBuilder b = new StringBuilder(inicio(tratamento)).append(limpo(quem)).append(" mandou mensagem");
        if (grupo != null && !grupo.trim().isEmpty() && !normalizar(grupo).equals(normalizar(quem))) b.append(" no grupo ").append(limpo(grupo));
        if (app != null && !app.isEmpty()) b.append(" no ").append(app);
        if (texto != null && !texto.trim().isEmpty()) {
            String t = texto.trim().replaceAll("\\s+", " ");
            if (t.length() > 160) t = t.substring(0, 157) + "...";
            b.append(": ").append(t);
        } else {
            b.append('.');
        }
        return maiuscula(b.toString());
    }
}
