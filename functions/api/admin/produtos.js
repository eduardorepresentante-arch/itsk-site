// Catálogo completo (inclui produtos escondidos e custo). PUT troca a lista inteira de uma vez.
import { banco, json, erro, tratar, texto, centavos, agora, produtoDoBanco, estoqueValido, CATEGORIAS, Resposta } from "../../_comum.js";

const MAX_PRODUTOS = 1000;

export const onRequestGet = ({ env }) => tratar(async () => {
  const db = await banco(env);
  const { results } = await db.prepare("SELECT * FROM produtos ORDER BY ordem, criado").all();
  return json(results.map(produtoDoBanco));
});

function validar(p, i) {
  const id = String(p.id || "");
  if (!/^[a-z0-9-]{3,60}$/.test(id)) throw new Resposta(erro(`Produto ${i + 1}: código inválido.`));
  const nome = texto(p.nome, 80);
  if (!nome) throw new Resposta(erro(`Produto ${i + 1}: falta o nome.`));
  const cats = Array.isArray(p.cats) ? [...new Set(p.cats.filter(c => CATEGORIAS.includes(c)))] : [];
  // Sem "estoque" no pedido = mantém o que está no banco (vendas podem ter mudado desde que a tela abriu)
  const estoque = p.estoque === undefined ? undefined : estoqueValido(p.estoque);
  const foto = String(p.foto || "");
  if (foto && !/^(\/fotos\/[a-z0-9]{8,32}|img\/produtos\/[a-z0-9-]+\.(jpg|webp|png))$/.test(foto)) throw new Resposta(erro(`Produto ${i + 1}: foto inválida.`));
  return {
    id, nome, cats, estoque, foto,
    preco: centavos(p.preco, { min: 0.01 }),
    de: centavos(p.de, { opcional: true }),
    custo: centavos(p.custo, { opcional: true }),
    tag: texto(p.tag, 24),
    ativo: p.ativo === false ? 0 : 1,
    ordem: i
  };
}

export const onRequestPut = ({ request, env }) => tratar(async () => {
  let lista;
  try { lista = await request.json(); } catch { return erro("Dados inválidos."); }
  if (!Array.isArray(lista) || lista.length > MAX_PRODUTOS) return erro("Lista de produtos inválida.");
  const produtos = lista.map(validar);
  if (new Set(produtos.map(p => p.id)).size !== produtos.length) return erro("Há produtos com o mesmo código.");
  const db = await banco(env);
  const antigos = new Map((await db.prepare("SELECT id, criado, estoque FROM produtos").all()).results.map(r => [r.id, r]));
  const agoraIso = agora();
  const ins = db.prepare(`INSERT INTO produtos (id, nome, cats, preco, de, estoque, tag, foto, custo, ordem, ativo, criado)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`);
  const ops = [db.prepare("DELETE FROM produtos")];
  for (const p of produtos) {
    const antigo = antigos.get(p.id);
    const estoque = p.estoque !== undefined ? JSON.stringify(p.estoque) : antigo ? antigo.estoque : "{}";
    ops.push(ins.bind(p.id, p.nome, JSON.stringify(p.cats), p.preco, p.de, estoque, p.tag || null,
      p.foto || null, p.custo, p.ordem, p.ativo, antigo ? antigo.criado : agoraIso));
  }
  // Fotos que nenhum produto usa mais (e que já têm mais de um dia, para não apagar envios em andamento)
  const usadas = produtos.map(p => p.foto).filter(f => f.startsWith("/fotos/")).map(f => f.slice(7));
  const ontem = new Date(Date.now() - 864e5).toISOString();
  ops.push(db.prepare(`DELETE FROM fotos WHERE criado < ?1 AND id NOT IN (SELECT value FROM json_each(?2))`).bind(ontem, JSON.stringify(usadas)));
  await db.batch(ops);
  const { results } = await db.prepare("SELECT * FROM produtos ORDER BY ordem, criado").all();
  return json(results.map(produtoDoBanco));
});
