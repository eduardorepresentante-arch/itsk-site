// Caixa: entradas e saídas. GET ?de=AAAA-MM-DD&ate=AAAA-MM-DD lista o período.
// Ligado ao estoque: venda com produto e tamanho tira pares; "Compra de mercadoria" com produto e tamanho soma.
// Editar ou excluir um lançamento desfaz o efeito antigo no estoque.
import { banco, json, erro, tratar, texto, centavos, dataValida, agora, Resposta } from "../../_comum.js";

const CATS_ENTRADA = ["Venda", "Venda online", "Outras entradas"];
const CATS_SAIDA = ["Compra de mercadoria", "Frete", "Aluguel", "Contas (luz, água, internet)", "Funcionários", "Marketing", "Taxas e impostos", "Embalagens", "Outras saídas"];
const PAGAMENTOS = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência", "Outro"];

const paraTela = r => ({ ...r, valor: r.valor / 100 });

function validar(b) {
  const tipo = b.tipo === "saida" ? "saida" : b.tipo === "entrada" ? "entrada" : null;
  if (!tipo) throw new Resposta(erro("Escolha entrada ou saída."));
  if (!dataValida(b.data)) throw new Resposta(erro("Data inválida."));
  const cats = tipo === "entrada" ? CATS_ENTRADA : CATS_SAIDA;
  const categoria = cats.includes(b.categoria) ? b.categoria : cats[cats.length - 1];
  const quantidade = Math.min(Math.max(parseInt(b.quantidade, 10) || 1, 1), 10000);
  const produto_id = /^[a-z0-9-]{3,60}$/.test(b.produto_id || "") ? b.produto_id : null;
  const t = parseInt(b.tamanho, 10);
  return {
    tipo, categoria, quantidade, data: b.data, produto_id,
    tamanho: produto_id && t >= 15 && t <= 50 ? t : null,
    descricao: texto(b.descricao, 160),
    pagamento: PAGAMENTOS.includes(b.pagamento) ? b.pagamento : "",
    valor: centavos(b.valor, { min: 0.01 })
  };
}

// Quanto o lançamento mexe no estoque daquele produto/tamanho (negativo = sai da loja)
function efeito(l) {
  if (!l || !l.produto_id || !l.tamanho) return 0;
  if (l.tipo === "entrada" && l.categoria.startsWith("Venda")) return -l.quantidade;
  if (l.tipo === "saida" && l.categoria === "Compra de mercadoria") return l.quantidade;
  return 0;
}

// Aplica os efeitos no estoque e devolve os comandos para gravar junto com o lançamento
async function mexerEstoque(db, mudancas) {
  const porProduto = new Map();
  for (const { produto_id, tamanho, delta } of mudancas) {
    if (!delta) continue;
    if (!porProduto.has(produto_id)) {
      const r = await db.prepare("SELECT nome, estoque FROM produtos WHERE id = ?").bind(produto_id).first();
      if (!r) continue; // produto apagado: o lançamento continua valendo, só não mexe em estoque
      const estoque = JSON.parse(r.estoque || "{}");
      porProduto.set(produto_id, { nome: r.nome, estoque, antes: { ...estoque } });
    }
    const p = porProduto.get(produto_id);
    p.estoque[tamanho] = (p.estoque[tamanho] || 0) + delta;
  }
  const ops = [];
  for (const [id, p] of porProduto) {
    for (const [t, q] of Object.entries(p.estoque)) {
      if (q < 0) {
        const tinha = p.antes[t] || 0;
        throw new Resposta(erro(`Estoque insuficiente: ${p.nome} tamanho ${t} tem ${tinha} ${tinha === 1 ? "par" : "pares"}. Ajuste o estoque na aba Produtos se precisar.`, 409));
      }
    }
    ops.push(db.prepare("UPDATE produtos SET estoque = ? WHERE id = ?").bind(JSON.stringify(p.estoque), id));
  }
  return ops;
}

async function corpo(request) {
  try { return await request.json(); } catch { throw new Resposta(erro("Dados inválidos.")); }
}

export const onRequestGet = ({ request, env }) => tratar(async () => {
  const u = new URL(request.url);
  const de = u.searchParams.get("de"), ate = u.searchParams.get("ate");
  if (!dataValida(de) || !dataValida(ate) || de > ate) return erro("Período inválido.");
  const db = await banco(env);
  const { results } = await db.prepare("SELECT * FROM lancamentos WHERE data BETWEEN ? AND ? ORDER BY data DESC, id DESC").bind(de, ate).all();
  return json({ lancamentos: results.map(paraTela), categorias: { entrada: CATS_ENTRADA, saida: CATS_SAIDA }, pagamentos: PAGAMENTOS });
});

export const onRequestPost = ({ request, env }) => tratar(async () => {
  const l = validar(await corpo(request));
  const db = await banco(env);
  const ops = await mexerEstoque(db, [{ produto_id: l.produto_id, tamanho: l.tamanho, delta: efeito(l) }]);
  const ins = db.prepare(`INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, quantidade, produto_id, tamanho, criado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(l.data, l.tipo, l.categoria, l.descricao, l.pagamento, l.valor, l.quantidade, l.produto_id, l.tamanho, agora());
  const res = await db.batch([...ops, ins]);
  return json(paraTela(res[res.length - 1].results[0]), 201);
});

export const onRequestPut = ({ request, env }) => tratar(async () => {
  const id = parseInt(new URL(request.url).searchParams.get("id"), 10);
  if (!id) return erro("Lançamento não informado.");
  const l = validar(await corpo(request));
  const db = await banco(env);
  const antigo = await db.prepare("SELECT * FROM lancamentos WHERE id = ?").bind(id).first();
  if (!antigo) return erro("Lançamento não encontrado.", 404);
  const ops = await mexerEstoque(db, [
    { produto_id: antigo.produto_id, tamanho: antigo.tamanho, delta: -efeito(antigo) },
    { produto_id: l.produto_id, tamanho: l.tamanho, delta: efeito(l) }
  ]);
  const upd = db.prepare(`UPDATE lancamentos SET data = ?, tipo = ?, categoria = ?, descricao = ?, pagamento = ?, valor = ?, quantidade = ?, produto_id = ?, tamanho = ?
    WHERE id = ? RETURNING *`)
    .bind(l.data, l.tipo, l.categoria, l.descricao, l.pagamento, l.valor, l.quantidade, l.produto_id, l.tamanho, id);
  const res = await db.batch([...ops, upd]);
  return json(paraTela(res[res.length - 1].results[0]));
});

export const onRequestDelete = ({ request, env }) => tratar(async () => {
  const id = parseInt(new URL(request.url).searchParams.get("id"), 10);
  if (!id) return erro("Lançamento não informado.");
  const db = await banco(env);
  const antigo = await db.prepare("SELECT * FROM lancamentos WHERE id = ?").bind(id).first();
  if (!antigo) return json({ ok: true });
  const ops = await mexerEstoque(db, [{ produto_id: antigo.produto_id, tamanho: antigo.tamanho, delta: -efeito(antigo) }]);
  await db.batch([...ops, db.prepare("DELETE FROM lancamentos WHERE id = ?").bind(id)]);
  return json({ ok: true });
});
