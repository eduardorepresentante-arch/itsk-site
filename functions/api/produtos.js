// Vitrine pública: produtos ativos, na ordem definida na administração
import { banco, json, tratar, produtoDoBanco } from "../_comum.js";

export const onRequestGet = ({ env }) => tratar(async () => {
  const db = await banco(env);
  const { results } = await db.prepare("SELECT * FROM produtos WHERE ativo = 1 ORDER BY ordem, criado").all();
  // Para o público: tamanhos cadastrados e quais estão esgotados (sem mostrar quantidades nem custo)
  const lista = results.map(produtoDoBanco).map(({ custo, ativo, ordem, estoque, ...p }) =>
    ({ ...p, esgotados: p.tam.filter(t => !estoque[t]) }));
  // sem cache: estoque e preço mudam na hora em que a loja altera
  return json(lista, 200, { "Cache-Control": "no-cache" });
});
