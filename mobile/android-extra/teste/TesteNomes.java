// F.R.I.D.A.Y — © 2026 Ahmad Mourad (Harle). Todos os direitos reservados. Veja LICENSE.
// Teste das regras dos avisos por voz (roda no CI antes de gerar o APK).
package dev.harle.friday;
import java.util.Arrays;
import java.util.List;
public class TesteNomes {
  static int falhas = 0;
  static void ok(boolean c, String n) { if (!c) { falhas++; System.out.println("FALHOU: " + n); } }
  static void igual(String a, String b, String n) { if (!a.equals(b)) { falhas++; System.out.println("FALHOU: " + n + " -> " + a); } }
  public static void main(String[] a) {
    List<String> imp = Arrays.asList("Mãe ❤️", "Pedro Silva", "Amor");
    ok(Nomes.ehImportante("Mãe ❤️", imp), "mae com emoji");
    ok(Nomes.ehImportante("mae", imp), "mae sem acento");
    ok(Nomes.ehImportante("Pedro Silva", imp), "pedro");
    ok(!Nomes.ehImportante("Pedro Souza", imp), "outro pedro");
    ok(!Nomes.ehImportante("Amora Doces", imp), "amora nao e amor");
    ok(Nomes.ehNumero("+55 11 98888-7777"), "numero");
    ok(!Nomes.ehNumero("Mãe"), "nome nao e numero");
    igual(Nomes.fraseLigacao("Senhor", "Mãe ❤️", ""), "Senhor, Mãe está te ligando.", "ligacao");
    igual(Nomes.fraseLigacao("", "+55 11 98888-7777", "WhatsApp"), "Um número desconhecido está te ligando pelo WhatsApp.", "desconhecido");
    igual(Nomes.fraseMensagem("Senhor", "Pedro Silva", "WhatsApp", "Família", ""), "Senhor, Pedro Silva mandou mensagem no grupo Família no WhatsApp.", "grupo");
    igual(Nomes.fraseMensagem("Senhor", "Amor", "WhatsApp", null, "Chego às 8"), "Senhor, Amor mandou mensagem no WhatsApp: Chego às 8", "texto");
    System.out.println(falhas == 0 ? "tudo certo" : falhas + " falhas");
    System.exit(falhas);
  }
}
