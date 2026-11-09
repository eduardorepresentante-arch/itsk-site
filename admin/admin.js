/* Administração da ITSK Studio and Second: caixa (entradas e saídas) e produtos com fotos.
   Conversa com o servidor em /api/admin/* (Cloudflare Pages Functions + banco D1). */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reais = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const NOMES_CAT = { studio: "Studio (nova coleção)", second: "Second (brechó)", vestidos: "Vestidos", alfaiataria: "Alfaiataria", blusas: "Blusas e camisas", saias: "Saias e calças", tricot: "Tricot", vintage: "Vintage", premium: "Marcas premium", bolsas: "Bolsas", acessorios: "Acessórios" };
// Tamanhos: o número guardado vira letra no site (36 = PP, 38 = P, 40 = M, 42 = G, 44 = GG, 15 = Único)
const rotulo = t => (typeof rotuloTam === "function" ? rotuloTam(Number(t)) : String(t));
const SVGNS = "http://www.w3.org/2000/svg";
const MAX_FOTOS = 100;

function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  filhos.forEach(f => f !== null && f !== undefined && f !== false && n.append(f));
  return n;
}
function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
// Aceita "139,90", "139.90" ou "1.299,90"
function lerPreco(t) {
  let s = String(t ?? "").trim().replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const precoTexto = v => v == null || v === "" ? "" : Number(v).toFixed(2).replace(".", ",");
const semAcento = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let avisoTempo;
function aviso(msg) {
  const a = $("#aviso-rapido");
  a.textContent = msg;
  a.hidden = false;
  clearTimeout(avisoTempo);
  avisoTempo = setTimeout(() => { a.hidden = true; }, 3200);
}

/* ---------- Conversa com o servidor ---------- */
async function api(caminho, { metodo = "GET", corpo } = {}) {
  const op = { method: metodo, credentials: "same-origin", headers: { Accept: "application/json" } };
  if (corpo instanceof Blob) { op.body = corpo; op.headers["Content-Type"] = corpo.type; }
  else if (corpo !== undefined) { op.body = JSON.stringify(corpo); op.headers["Content-Type"] = "application/json"; }
  let r;
  try { r = await fetch(caminho, op); }
  catch { throw new Error("Sem conexão com o servidor. Confira a internet e tente de novo."); }
  let dados = null;
  try { dados = await r.json(); } catch { /* resposta sem JSON */ }
  if (r.status === 401 && caminho !== "/api/admin/entrar") { mostrarEntrar("Sua sessão terminou. Entre de novo."); throw new Error("Sessão terminou."); }
  if (!r.ok) throw new Error((dados && dados.erro) || "O servidor não respondeu como esperado (" + r.status + ").");
  return dados;
}

/* ---------- Entrar e sair ---------- */
function mostrarEntrar(msg) {
  $("#tela-painel").hidden = true;
  $("#tela-entrar").hidden = false;
  $("#entrar-erro").hidden = !msg;
  $("#entrar-erro").textContent = msg || "";
  ($("#email").value ? $("#senha") : $("#email")).focus();
}
$("#form-entrar").addEventListener("submit", async e => {
  e.preventDefault();
  const b = e.submitter || $("#form-entrar button");
  b.disabled = true;
  try {
    await api("/api/admin/entrar", { metodo: "POST", corpo: { email: $("#email").value, senha: $("#senha").value } });
    $("#senha").value = "";
    abrirPainel();
    api("/api/admin/entrar").then(s => avisoSenha(s && s.senhaFraca)).catch(() => {});
  } catch (err) {
    $("#entrar-erro").textContent = err.message;
    $("#entrar-erro").hidden = false;
  } finally { b.disabled = false; }
});
$("#sair").addEventListener("click", async () => {
  try { await api("/api/admin/entrar", { metodo: "DELETE" }); } catch { /* sai mesmo assim */ }
  mostrarEntrar();
});

function avisoSenha(fraca) { $("#aviso-senha").hidden = !fraca; }

let painelAberto = false;
async function abrirPainel() {
  $("#tela-entrar").hidden = true;
  $("#tela-painel").hidden = false;
  if (!painelAberto) { painelAberto = true; ligarPainel(); }
  await carregarProdutos();
  await carregarCaixa();
}

/* ---------- Abas ---------- */
function mostrarAba(nome) {
  for (const n of ["caixa", "produtos", "estoque"]) {
    $("#aba-" + n).setAttribute("aria-selected", String(n === nome));
    $("#sec-" + n).hidden = n !== nome;
  }
  if (nome === "estoque") desenharEstoque();
  if (nome === "produtos") desenharProdutos();
  try { sessionStorage.setItem("adm-aba", nome); } catch { /* sem armazenamento */ }
}

/* =====================================================================
   CAIXA
   ===================================================================== */
const caixa = {
  periodo: "mes", ref: new Date(), tipo: "todos", busca: "",
  atual: [], anterior: [],
  categorias: {
    entrada: ["Venda", "Venda online", "Outras entradas"],
    saida: ["Compra de mercadoria", "Frete", "Aluguel", "Contas (luz, água, internet)", "Funcionários", "Marketing", "Taxas e impostos", "Embalagens", "Outras saídas"]
  },
  pagamentos: ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência", "Outro"]
};

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dataBR = s => s.split("-").reverse().join("/");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const NOME_ANTERIOR = { dia: "dia anterior", mes: "mês anterior", semestre: "semestre anterior", ano: "ano anterior" };

function deslocar(periodo, ref, n) {
  const y = ref.getFullYear(), m = ref.getMonth();
  if (periodo === "dia") return new Date(y, m, ref.getDate() + n);
  if (periodo === "mes") return new Date(y, m + n, 1);
  if (periodo === "semestre") return new Date(y, m + 6 * n, 1);
  return new Date(y + n, 0, 1);
}

function intervalo(periodo, ref) {
  const y = ref.getFullYear(), m = ref.getMonth();
  if (periodo === "dia") {
    const nome = ref.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    return { de: ref, ate: ref, nome, baldes: [] };
  }
  const meses = (inicio, qtd) => Array.from({ length: qtd }, (_, i) => {
    const d = new Date(y, inicio + i, 1);
    return { chave: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, rotulo: MESES[d.getMonth()], longo: `${MESES_LONGOS[d.getMonth()]} de ${d.getFullYear()}` };
  });
  if (periodo === "mes") {
    const fim = new Date(y, m + 1, 0);
    const baldes = Array.from({ length: fim.getDate() }, (_, i) => {
      const d = new Date(y, m, i + 1);
      return { chave: iso(d), rotulo: String(i + 1), longo: d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) };
    });
    return { de: new Date(y, m, 1), ate: fim, nome: `${MESES_LONGOS[m]} de ${y}`, baldes };
  }
  if (periodo === "semestre") {
    const s = m < 6 ? 0 : 6;
    return { de: new Date(y, s, 1), ate: new Date(y, s + 6, 0), nome: `${s ? 2 : 1}º semestre de ${y}`, baldes: meses(s, 6) };
  }
  return { de: new Date(y, 0, 1), ate: new Date(y, 11, 31), nome: String(y), baldes: meses(0, 12) };
}

async function carregarCaixa() {
  const atual = intervalo(caixa.periodo, caixa.ref);
  const anterior = intervalo(caixa.periodo, deslocar(caixa.periodo, caixa.ref, -1));
  $("#per-nome").textContent = atual.nome.charAt(0).toUpperCase() + atual.nome.slice(1);
  $$("[data-periodo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.periodo === caixa.periodo)));
  $("#caixa-erro").hidden = true;
  try {
    const r = await api(`/api/admin/lancamentos?de=${iso(anterior.de)}&ate=${iso(atual.ate)}`);
    if (r.categorias) caixa.categorias = r.categorias;
    if (r.pagamentos) caixa.pagamentos = r.pagamentos;
    const de = iso(atual.de);
    caixa.atual = r.lancamentos.filter(l => l.data >= de);
    caixa.anterior = r.lancamentos.filter(l => l.data < de);
  } catch (e) {
    caixa.atual = []; caixa.anterior = [];
    $("#caixa-erro").textContent = e.message;
    $("#caixa-erro").hidden = false;
  }
  desenharCaixa(atual);
}

const ehVenda = l => l.tipo === "entrada" && l.categoria.startsWith("Venda");

function resumo(lista) {
  const r = { entradas: 0, saidas: 0, peças: 0, vendas: 0, valorVendas: 0, lucro: 0, comCusto: 0 };
  for (const l of lista) {
    if (l.tipo === "entrada") r.entradas += l.valor; else r.saidas += l.valor;
    if (ehVenda(l)) {
      r.pares += l.quantidade; r.vendas++; r.valorVendas += l.valor;
      const p = produtos.lista.find(x => x.id === l.produto_id);
      if (p && p.custo != null) { r.lucro += l.valor - p.custo * l.quantidade; r.comCusto++; }
    }
  }
  r.saldo = r.entradas - r.saidas;
  r.ticket = r.vendas ? r.valorVendas / r.vendas : 0;
  return r;
}

function comparar(id, atual, anterior, { maiorEhBom = true, dinheiro = true } = {}) {
  const alvo = $(id);
  alvo.className = "";
  const nome = "vs " + NOME_ANTERIOR[caixa.periodo];
  if (!anterior) { alvo.textContent = atual ? "sem lançamentos no " + NOME_ANTERIOR[caixa.periodo] : ""; return; }
  const dif = (atual - anterior) / Math.abs(anterior) * 100;
  if (Math.abs(dif) < 0.5) { alvo.textContent = "igual ao " + NOME_ANTERIOR[caixa.periodo]; return; }
  const sobe = dif > 0;
  alvo.textContent = `${sobe ? "▲" : "▼"} ${Math.abs(dif).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% ${nome}` +
    (dinheiro ? ` (${reais(anterior)})` : ` (${anterior})`);
  alvo.className = sobe === maiorEhBom ? "sobe" : "desce";
}

function desenharCaixa(per) {
  const a = resumo(caixa.atual), b = resumo(caixa.anterior);
  $("#k-entradas").textContent = reais(a.entradas);
  $("#k-saidas").textContent = reais(a.saidas);
  $("#k-saldo").textContent = reais(a.saldo);
  $("#k-saldo").className = a.saldo < 0 ? "negativo" : "";
  $("#k-pares").textContent = a.pares.toLocaleString("pt-BR");
  $("#k-ticket").textContent = reais(a.ticket);
  $("#k-vendas").textContent = a.vendas === 1 ? "1 venda" : a.vendas + " vendas";
  $("#k-lucro").textContent = a.comCusto ? reais(a.lucro) : "—";
  $("#k-lucro-nota").textContent = a.comCusto
    ? `em ${a.comCusto} de ${a.vendas} vendas com custo cadastrado`
    : "cadastre o custo nos produtos para ver";
  comparar("#c-entradas", a.entradas, b.entradas);
  comparar("#c-saidas", a.saidas, b.saidas, { maiorEhBom: false });
  comparar("#c-saldo", a.saldo, b.saldo);
  comparar("#c-pares", a.pares, b.pares, { dinheiro: false });

  $("#cartao-grafico").hidden = !per.baldes.length;
  if (per.baldes.length) desenharGrafico(per);
  desenharCategorias();
  desenharPagamentos();
  desenharTop();
  desenharLancamentos();
}

/* Gráfico de barras agrupadas: entradas e saídas por dia (mês) ou por mês (semestre/ano) */
// Teto do eixo: 4 faixas com passo redondo (1, 2, 2,5 ou 5 × 10ⁿ)
function arredondarTeto(v) {
  if (v <= 0) return 400;
  const bruto = v / 4, p = Math.pow(10, Math.floor(Math.log10(bruto)));
  for (const m of [1, 2, 2.5, 5, 10]) if (bruto <= m * p) return m * p * 4;
  return 40 * p;
}
const reaisCurto = v => v >= 1000
  ? "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil"
  : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function barraArredondada(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function desenharGrafico(per) {
  const porDia = caixa.periodo === "mes";
  $("#graf-titulo").textContent = porDia ? "Entradas e saídas por dia" : "Entradas e saídas por mês";
  const soma = new Map(per.baldes.map(b => [b.chave, { e: 0, s: 0 }]));
  for (const l of caixa.atual) {
    const k = porDia ? l.data : l.data.slice(0, 7);
    const v = soma.get(k);
    if (v) { if (l.tipo === "entrada") v.e += l.valor; else v.s += l.valor; }
  }
  const W = 960, H = 300, ml = 72, mr = 12, mt = 14, mb = 30;
  const pw = W - ml - mr, ph = H - mt - mb;
  const teto = arredondarTeto(Math.max(0, ...[...soma.values()].flatMap(v => [v.e, v.s])));
  const y = v => mt + ph - v / teto * ph;
  const n = per.baldes.length, gw = pw / n;
  const bw = Math.max(3, Math.min(22, (gw - 8) / 2));
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": $("#graf-titulo").textContent });
  for (let i = 0; i <= 4; i++) {
    const v = teto / 4 * i, yy = y(v);
    s.append(svg("line", { x1: ml, x2: W - mr, y1: yy, y2: yy, class: i ? "grade" : "base" }));
    const t = svg("text", { x: ml - 8, y: yy + 4, "text-anchor": "end" });
    t.textContent = reaisCurto(v);
    s.append(t);
  }
  const passo = n > 16 ? (gw < 20 ? 5 : 2) : 1;
  per.baldes.forEach((b, i) => {
    const v = soma.get(b.chave), cx = ml + gw * i + gw / 2;
    if (v.e > 0) s.append(svg("path", { d: barraArredondada(cx - bw - 1, y(v.e), bw, mt + ph - y(v.e)), class: "b-entrada" }));
    if (v.s > 0) s.append(svg("path", { d: barraArredondada(cx + 1, y(v.s), bw, mt + ph - y(v.s)), class: "b-saida" }));
    if (i % passo === 0 || i === n - 1) {
      const t = svg("text", { x: cx, y: H - 10, "text-anchor": "middle" });
      t.textContent = b.rotulo;
      s.append(t);
    }
    const alvo = svg("rect", { x: ml + gw * i, y: mt, width: gw, height: ph, class: "alvo", tabindex: "0",
      "aria-label": `${b.longo}: entradas ${reais(v.e)}, saídas ${reais(v.s)}` });
    const mostrar = () => mostrarDica(alvo, b, v);
    alvo.addEventListener("mouseenter", mostrar);
    alvo.addEventListener("focus", mostrar);
    alvo.addEventListener("mouseleave", esconderDica);
    alvo.addEventListener("blur", esconderDica);
    s.append(alvo);
  });
  $("#grafico").replaceChildren(s);
}

function mostrarDica(alvo, b, v) {
  $$("#grafico .alvo.ativo").forEach(x => x.classList.remove("ativo"));
  alvo.classList.add("ativo");
  const d = $("#dica");
  const saldo = v.e - v.s;
  d.replaceChildren(
    el("b", { text: b.longo }),
    el("div", {}, el("span", {}, el("i", { class: "cor-entrada" }), "Entradas"), el("span", { text: reais(v.e) })),
    el("div", {}, el("span", {}, el("i", { class: "cor-saida" }), "Saídas"), el("span", { text: reais(v.s) })),
    el("div", {}, el("span", { text: "Saldo" }), el("strong", { text: reais(saldo) }))
  );
  d.hidden = false;
  const c = $("#cartao-grafico").getBoundingClientRect(), r = alvo.getBoundingClientRect();
  let x = r.left - c.left + r.width / 2 + 12;
  if (x + d.offsetWidth > c.width - 8) x = r.left - c.left + r.width / 2 - d.offsetWidth - 12;
  d.style.left = Math.max(8, x) + "px";
  d.style.top = (r.top - c.top + 8) + "px";
}
function esconderDica() {
  $("#dica").hidden = true;
  $$("#grafico .alvo.ativo").forEach(x => x.classList.remove("ativo"));
}

function agrupar(lista, chave) {
  const m = new Map();
  for (const l of lista) {
    const k = chave(l);
    const v = m.get(k) || { valor: 0, qtd: 0, tipo: l.tipo };
    v.valor += l.valor; v.qtd += l.quantidade;
    m.set(k, v);
  }
  return [...m.entries()].sort((a, b) => b[1].valor - a[1].valor);
}

function linhaBarra(nome, valor, total, tipo) {
  const pct = total ? valor / total * 100 : 0;
  const barra = el("span", { class: "barrinha" + (tipo === "saida" ? " saida" : "") });
  barra.style.width = Math.max(2, pct) + "%";
  return el("tr", {},
    el("td", {}, el("span", { class: "pilula " + tipo, text: tipo === "entrada" ? "Entrada" : "Saída" }), " ", nome, barra),
    el("td", { class: "num", text: reais(valor) }),
    el("td", { class: "num", text: pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" })
  );
}

function desenharCategorias() {
  const linhas = [];
  for (const tipo of ["entrada", "saida"]) {
    const lista = caixa.atual.filter(l => l.tipo === tipo);
    const total = lista.reduce((s, l) => s + l.valor, 0);
    for (const [nome, v] of agrupar(lista, l => l.categoria)) linhas.push(linhaBarra(nome, v.valor, total, tipo));
  }
  $("#t-categorias tbody").replaceChildren(...(linhas.length ? linhas : [el("tr", {}, el("td", { colspan: "3", class: "vazio", text: "Sem lançamentos no período." }))]));
}

function desenharPagamentos() {
  const lista = caixa.atual.filter(l => l.tipo === "entrada");
  const total = lista.reduce((s, l) => s + l.valor, 0);
  const linhas = agrupar(lista, l => l.pagamento || "Não informado").map(([nome, v]) => linhaBarra(nome, v.valor, total, "entrada"));
  $("#t-pagamentos tbody").replaceChildren(...(linhas.length ? linhas : [el("tr", {}, el("td", { colspan: "3", class: "vazio", text: "Sem entradas no período." }))]));
}

function desenharTop() {
  const vendas = caixa.atual.filter(ehVenda);
  const nomeDe = l => (produtos.lista.find(p => p.id === l.produto_id) || {}).nome || l.descricao || "Venda sem produto";
  const top = agrupar(vendas, nomeDe).sort((a, b) => b[1].qtd - a[1].qtd || b[1].valor - a[1].valor).slice(0, 10);
  $("#t-top tbody").replaceChildren(...(top.length
    ? top.map(([nome, v]) => el("tr", {}, el("td", { text: nome }), el("td", { class: "num", text: String(v.qtd) }), el("td", { class: "num", text: reais(v.valor) })))
    : [el("tr", {}, el("td", { colspan: "3", class: "vazio", text: "Nenhuma venda registrada no período." }))]));
}

function desenharLancamentos() {
  const q = semAcento(caixa.busca.trim());
  const lista = caixa.atual.filter(l =>
    (caixa.tipo === "todos" || l.tipo === caixa.tipo) &&
    (!q || semAcento(`${l.descricao} ${l.categoria} ${l.pagamento}`).includes(q)));
  $("#lanc-vazio").hidden = lista.length > 0;
  $("#t-lanc").hidden = !lista.length;
  $("#t-lanc tbody").replaceChildren(...lista.map(l => {
    const editar = el("button", { type: "button", class: "link", text: "Editar" });
    editar.addEventListener("click", () => abrirLancamento(l.tipo, l));
    const apagar = el("button", { type: "button", class: "link", text: "Excluir" });
    apagar.addEventListener("click", () => excluirLancamento(l));
    return el("tr", {},
      el("td", { text: dataBR(l.data) }),
      el("td", {}, el("span", { class: "pilula " + l.tipo, text: l.tipo === "entrada" ? "Entrada" : "Saída" })),
      el("td", { text: l.categoria }),
      el("td", { text: (l.descricao || (produtos.lista.find(p => p.id === l.produto_id) || {}).nome || "—") + (l.tamanho ? ` · tam. ${rotulo(l.tamanho)}` : ""), title: l.descricao || "" }),
      el("td", { text: l.pagamento || "—" }),
      el("td", { class: "num", text: String(l.quantidade) }),
      el("td", { class: "num" + (l.tipo === "saida" ? " valor-saida" : ""), text: (l.tipo === "saida" ? "− " : "") + reais(l.valor) }),
      el("td", { class: "num" }, editar, apagar)
    );
  }));
}

async function excluirLancamento(l) {
  if (!window.confirm(`Excluir o lançamento de ${reais(l.valor)} do dia ${dataBR(l.data)}?`)) return;
  try {
    await api("/api/admin/lancamentos?id=" + l.id, { metodo: "DELETE" });
    aviso("Lançamento excluído.");
    carregarCaixa();
    if (l.produto_id && l.tamanho) atualizarEstoques();
  } catch (e) { aviso(e.message); }
}

/* Planilha (CSV que abre no Excel e no Google Planilhas) */
function exportar() {
  const per = intervalo(caixa.periodo, caixa.ref);
  const num = v => v.toFixed(2).replace(".", ",");
  // texto que começa com = + - @ vira fórmula no Excel: um apóstrofo na frente impede
  const cel = t => { let s = String(t ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const linhas = [["Data", "Tipo", "Categoria", "Descrição", "Pagamento", "Quantidade", "Valor (R$)"].map(cel).join(";")];
  for (const l of [...caixa.atual].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)) {
    linhas.push([dataBR(l.data), l.tipo === "entrada" ? "Entrada" : "Saída", l.categoria, l.descricao, l.pagamento, l.quantidade,
      num(l.tipo === "saida" ? -l.valor : l.valor)].map(cel).join(";"));
  }
  const r = resumo(caixa.atual);
  linhas.push("", [cel("Total de entradas"), "", "", "", "", "", cel(num(r.entradas))].join(";"),
    [cel("Total de saídas"), "", "", "", "", "", cel(num(-r.saidas))].join(";"),
    [cel("Saldo do período"), "", "", "", "", "", cel(num(r.saldo))].join(";"));
  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `caixa-itsk-${semAcento(per.nome).replace(/[^a-z0-9]+/g, "-")}.csv` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* Janela de lançamento */
let lancEditando = null;
let lancTipo = "entrada";

function preencherCategorias(tipo, atual) {
  const lista = caixa.categorias[tipo];
  $("#l-cat").replaceChildren(...lista.map(c => el("option", { value: c, text: c, selected: c === atual })));
}
function escolherTipo(tipo, categoria) {
  lancTipo = tipo;
  $$("[data-ltipo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ltipo === tipo)));
  preencherCategorias(tipo, categoria);
  if (!lancEditando) $("#lanc-titulo").textContent = tipo === "entrada" ? "Nova venda / entrada" : "Nova saída";
}
function atualizarTotal() {
  const t = (lerPreco($("#l-unit").value) || 0) * (parseInt($("#l-qtd").value, 10) || 0);
  $("#l-total").textContent = reais(Math.round(t * 100) / 100);
}

function abrirLancamento(tipo, l = null) {
  lancEditando = l;
  $("#lanc-titulo").textContent = l ? "Editar lançamento" : "";
  escolherTipo(tipo, l ? l.categoria : undefined);
  $("#l-prod").replaceChildren(el("option", { value: "", text: "—" }),
    ...produtos.lista.map(p => el("option", { value: p.id, text: `${p.nome} · ${reais(p.preco)}`, selected: l && l.produto_id === p.id })));
  $("#l-pag").replaceChildren(el("option", { value: "", text: "—" }),
    ...caixa.pagamentos.map(p => el("option", { value: p, text: p, selected: l ? l.pagamento === p : (tipo === "entrada" && p === "Pix") })));
  preencherTamanhos(l ? l.tamanho : null);
  $("#l-data").value = l ? l.data : iso(new Date());
  $("#l-desc").value = l ? l.descricao : "";
  $("#l-qtd").value = l ? l.quantidade : 1;
  $("#l-unit").value = l ? precoTexto(l.valor / l.quantidade) : "";
  $("#l-excluir").hidden = !l;
  $("#lanc-erro").hidden = true;
  atualizarTotal();
  $("#camada-lanc").hidden = false;
  $("#l-data").focus();
}
function fecharLancamento() { $("#camada-lanc").hidden = true; }

function preencherTamanhos(atual) {
  const p = produtos.lista.find(x => x.id === $("#l-prod").value);
  const sel = $("#l-tam");
  sel.disabled = !p;
  sel.replaceChildren(el("option", { value: "", text: "—" }),
    ...(p ? tamanhosDe(p) : []).map(t => el("option", { value: String(t), text: `${rotulo(t)} · ${p.estoque[t]} em estoque`, selected: atual === t })));
}

async function salvarLancamento(e) {
  e.preventDefault();
  const qtd = parseInt($("#l-qtd").value, 10) || 1;
  const unit = lerPreco($("#l-unit").value);
  const erro = $("#lanc-erro");
  if (!(unit > 0)) { erro.textContent = "Informe o valor."; erro.hidden = false; return; }
  const corpo = {
    tipo: lancTipo, data: $("#l-data").value, categoria: $("#l-cat").value, descricao: $("#l-desc").value,
    pagamento: $("#l-pag").value, quantidade: qtd, valor: Math.round(unit * qtd * 100) / 100, produto_id: $("#l-prod").value || null,
    tamanho: parseInt($("#l-tam").value, 10) || null
  };
  const b = $("#l-salvar");
  b.disabled = true;
  try {
    if (lancEditando) await api("/api/admin/lancamentos?id=" + lancEditando.id, { metodo: "PUT", corpo });
    else await api("/api/admin/lancamentos", { metodo: "POST", corpo });
    fecharLancamento();
    aviso(lancEditando ? "Lançamento atualizado." : lancTipo === "entrada" ? "Entrada registrada." : "Saída registrada.");
    // mostra o período do lançamento salvo
    caixa.ref = daIso(corpo.data);
    carregarCaixa();
    if (corpo.produto_id && corpo.tamanho) atualizarEstoques();
  } catch (err) {
    erro.textContent = err.message;
    erro.hidden = false;
  } finally { b.disabled = false; }
}

/* =====================================================================
   PRODUTOS E FOTOS
   ===================================================================== */
const produtos = { lista: [], sujo: false, busca: "", trocando: null };
const padraoCats = new Set(["studio"]);

const srcFoto = f => !f ? "" : f.startsWith("/") ? f : "../" + f;

function lerTamanhos(t) {
  // aceita letras (PP, P, M, G, GG, XG, U/Único) e números de 15 a 50 (ex.: 38 ou 36-40)
  const LETRAS = { PP: 36, P: 38, M: 40, G: 42, GG: 44, XG: 46, U: 15, UNICO: 15, UN: 15 };
  const out = new Set();
  for (const parte of semAcento(String(t)).toUpperCase().split(/[,;\s]+/)) {
    if (LETRAS[parte]) { out.add(LETRAS[parte]); continue; }
    const m = parte.match(/^(\d{2})(?:-(\d{2}))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i <= 50; i++) if (i >= 15) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

const totalPares = p => Object.values(p.estoque || {}).reduce((s, q) => s + q, 0);
const tamanhosDe = p => Object.keys(p.estoque || {}).map(Number).sort((a, b) => a - b);
const classeQtd = q => q === 0 ? "q-zero" : q <= 2 ? "q-baixo" : "";


function mudarEstoque(p, t, valor) {
  p.estoque = { ...(p.estoque || {}) };
  if (valor === null) delete p.estoque[t];
  else p.estoque[t] = valor;
  p._estoque = true;
  marcarSujo();
}

/* Editor de estoque dentro do cartão do produto */
function editorEstoque(p) {
  const total = el("b");
  const caixaTams = el("div", { class: "tams" });
  const atualizar = () => {
    const n = totalPares(p);
    total.textContent = n === 1 ? "1 peça" : n + " peças";
  };
  const desenhar = () => {
    caixaTams.replaceChildren(...tamanhosDe(p).map(t => {
      const q = p.estoque[t];
      const i = el("input", { type: "number", min: "0", step: "1", inputmode: "numeric", id: "c" + (++seqCampo), "aria-label": `Peças no tamanho ${t}` });
      i.value = q;
      const box = el("div", { class: "tam " + classeQtd(q) }, el("span", { text: rotulo(t) }), i);
      i.addEventListener("input", () => {
        const v = Math.max(0, parseInt(i.value, 10) || 0);
        mudarEstoque(p, t, v);
        box.className = "tam " + classeQtd(v);
        atualizar();
      });
      const x = el("button", { type: "button", "aria-label": `Tirar o tamanho ${t}`, text: "×" });
      x.addEventListener("click", () => { mudarEstoque(p, t, null); desenhar(); });
      box.append(x);
      return box;
    }));
    atualizar();
  };
  const novoTam = el("input", { type: "text", placeholder: "Ex.: P, M, G ou Único", id: "c" + (++seqCampo), "aria-label": "Tamanhos para adicionar" });
  const novaQtd = el("input", { type: "number", min: "0", step: "1", placeholder: "peças", id: "c" + (++seqCampo), "aria-label": "Peças em cada tamanho novo" });
  novaQtd.style.width = "80px";
  const add = el("button", { type: "button", class: "btn btn--contorno", text: "Adicionar" });
  add.addEventListener("click", () => {
    const tams = lerTamanhos(novoTam.value);
    if (!tams.length) { novoTam.focus(); return; }
    const q = Math.max(0, parseInt(novaQtd.value, 10) || 0);
    for (const t of tams) mudarEstoque(p, t, q);
    novoTam.value = ""; novaQtd.value = "";
    desenhar();
  });
  desenhar();
  return el("div", { class: "estoque" },
    el("div", { class: "estoque__topo" }, el("span", { class: "rotulo", text: "Estoque por tamanho" }), total),
    caixaTams,
    el("div", { class: "add-tam" }, novoTam, novaQtd, add));
}

/* Aba Estoque: planilha produto × tamanho */
const estoqueVista = { filtro: "todos", busca: "" };
function desenharEstoque() {
  const lista = produtos.lista;
  let peças = 0, baixo = 0, zero = 0, venda = 0, custo = 0, comCusto = 0;
  for (const p of lista) {
    for (const q of Object.values(p.estoque || {})) {
      peças += q; venda += q * p.preco;
      if (q === 0) zero++; else if (q <= 2) baixo++;
      if (p.custo != null) custo += q * p.custo;
    }
    if (p.custo != null) comCusto++;
  }
  $("#e-pares").textContent = peças.toLocaleString("pt-BR");
  $("#e-modelos").textContent = `${lista.length} ${lista.length === 1 ? "modelo" : "modelos"}`;
  $("#e-baixo").textContent = String(baixo);
  $("#e-zero").textContent = String(zero);
  $("#e-venda").textContent = reais(venda);
  $("#e-custo").textContent = comCusto ? reais(custo) : "—";
  $("#e-custo-nota").textContent = comCusto ? `${comCusto} de ${lista.length} modelos com custo` : "cadastre o custo nos produtos";

  const q = semAcento(estoqueVista.busca.trim());
  const filtrados = lista.filter(p => {
    if (q && !semAcento(p.nome).includes(q)) return false;
    const qs = Object.values(p.estoque || {});
    if (estoqueVista.filtro === "baixo") return qs.some(v => v > 0 && v <= 2);
    if (estoqueVista.filtro === "zero") return qs.some(v => v === 0);
    return true;
  });
  const todos = lista.flatMap(tamanhosDe);
  // grade PP a GG, mais qualquer tamanho que já tenha sido cadastrado (Único fica no fim)
  const cols = [...new Set([36, 38, 40, 42, 44, ...todos])].sort((a, b) => (a === 15) - (b === 15) || a - b);
  $("#matriz thead").replaceChildren(el("tr", {}, el("th", { text: "Produto" }), ...cols.map(t => el("th", { text: rotulo(t) })), el("th", { class: "total", text: "Total" })));
  const somaCol = Object.fromEntries(cols.map(t => [t, 0]));
  $("#matriz tbody").replaceChildren(...filtrados.map(p => {
    const tot = el("td", { class: "total", text: String(totalPares(p)) });
    const foto = p.foto ? el("img", { src: srcFoto(p.foto), alt: "", loading: "lazy" }) : el("em");
    return el("tr", {},
      el("td", {}, el("div", { class: "prodcel" }, foto, el("span", { text: p.nome }))),
      ...cols.map(t => {
        const v = p.estoque && p.estoque[t];
        if (v !== undefined) somaCol[t] += v;
        const i = el("input", { type: "number", min: "0", step: "1", inputmode: "numeric", "aria-label": `${p.nome}, tamanho ${t}`, class: v === undefined ? "" : classeQtd(v) });
        i.value = v === undefined ? "" : v;
        i.addEventListener("input", () => {
          const n = i.value === "" ? null : Math.max(0, parseInt(i.value, 10) || 0);
          mudarEstoque(p, t, n);
          i.className = n === null ? "" : classeQtd(n);
          tot.textContent = String(totalPares(p));
        });
        return el("td", {}, i);
      }),
      tot);
  }));
  $("#matriz tfoot").replaceChildren(filtrados.length ? el("tr", {}, el("td", { text: "Total por tamanho" }),
    ...cols.map(t => el("td", { text: String(somaCol[t]) })),
    el("td", { class: "total", text: String(Object.values(somaCol).reduce((s, v) => s + v, 0)) })) : "");
  $("#est-vazio").hidden = filtrados.length > 0;
}

/* Depois de uma venda ou compra: traz o estoque novo sem perder edições que ainda não foram salvas */
async function atualizarEstoques() {
  try {
    const novos = await api("/api/admin/produtos");
    for (const n of novos) {
      const p = produtos.lista.find(x => x.id === n.id);
      if (p && !p._estoque) p.estoque = n.estoque;
    }
    if (!produtos.sujo) produtos.lista = novos;
    if (!$("#sec-estoque").hidden) desenharEstoque();
    if (!$("#sec-produtos").hidden) desenharProdutos();
  } catch { /* fica com o que já tem */ }
}

async function carregarProdutos() {
  try {
    produtos.lista = await api("/api/admin/produtos");
    produtos.sujo = false;
  } catch (e) { aviso(e.message); }
  desenharProdutos();
}

function marcarSujo() {
  produtos.sujo = true;
  $("#barra-salvar").hidden = false;
}

function chipsCategorias(selecionadas, aoMudar) {
  const box = el("div", { class: "chips" });
  for (const [c, nome] of Object.entries(NOMES_CAT)) {
    const b = el("button", { type: "button", "aria-pressed": String(selecionadas.has(c)), text: nome });
    b.addEventListener("click", () => {
      selecionadas.has(c) ? selecionadas.delete(c) : selecionadas.add(c);
      b.setAttribute("aria-pressed", String(selecionadas.has(c)));
      aoMudar && aoMudar();
    });
    box.append(b);
  }
  return box;
}

function campo(rotulo, input) {
  return el("div", { class: "campo" }, el("label", { for: input.id, text: rotulo }), input);
}

let seqCampo = 0;
function entrada(tipo, valor, aoMudar, extra = {}) {
  const i = el("input", { type: tipo, id: "c" + (++seqCampo), ...extra });
  i.value = valor ?? "";
  i.addEventListener("input", () => { aoMudar(i.value); marcarSujo(); });
  return i;
}

function cartaoProduto(p, idx) {
  const fotoBtn = el("button", { type: "button", class: "prod__foto", "aria-label": "Trocar a foto de " + p.nome },
    p.foto ? el("img", { src: srcFoto(p.foto), alt: "", loading: "lazy" }) : el("em", { text: "Sem foto" }),
    el("span", { text: "Trocar foto" }));
  fotoBtn.addEventListener("click", () => { produtos.trocando = p; $("#trocar-foto").click(); });

  const cats = new Set(p.cats);
  const ativo = el("input", { type: "checkbox", id: "c" + (++seqCampo) });
  ativo.checked = p.ativo;
  ativo.addEventListener("change", () => { p.ativo = ativo.checked; cartao.classList.toggle("oculto", !p.ativo); marcarSujo(); });

  const subir = el("button", { type: "button", class: "icone", "aria-label": "Subir na vitrine", text: "↑", disabled: idx === 0 });
  subir.addEventListener("click", () => mover(idx, -1));
  const descer = el("button", { type: "button", class: "icone", "aria-label": "Descer na vitrine", text: "↓", disabled: idx === produtos.lista.length - 1 });
  descer.addEventListener("click", () => mover(idx, 1));
  const apagar = el("button", { type: "button", class: "link apagar", text: "Excluir" });
  apagar.addEventListener("click", () => {
    if (!window.confirm(`Excluir "${p.nome}" da vitrine?`)) return;
    produtos.lista.splice(produtos.lista.indexOf(p), 1);
    marcarSujo();
    desenharProdutos();
  });

  const cartao = el("article", { class: "prod" + (p.ativo ? "" : " oculto") },
    fotoBtn,
    el("div", { class: "prod__corpo" },
      campo("Nome", entrada("text", p.nome, v => { p.nome = v; }, { maxlength: "80" })),
      el("div", { class: "prod__linha" },
        campo("Preço", entrada("text", precoTexto(p.preco), v => { p.preco = lerPreco(v) || 0; }, { inputmode: "decimal", autocomplete: "off" })),
        campo("Preço antigo", entrada("text", precoTexto(p.de), v => { p.de = v.trim() === "" ? null : lerPreco(v); }, { inputmode: "decimal", autocomplete: "off", placeholder: "opcional" })),
        campo("Custo", entrada("text", precoTexto(p.custo), v => { p.custo = v.trim() === "" ? null : lerPreco(v); }, { inputmode: "decimal", autocomplete: "off", placeholder: "opcional" }))
      ),
      el("div", { class: "prod__linha" },
        el("div", { class: "campo" }, ...(() => { const i = entrada("text", p.tag, v => { p.tag = v; }, { maxlength: "24", placeholder: "Ex.: Mais vendido" }); return [el("label", { for: i.id, text: "Etiqueta" }), i]; })()),
        el("div", { class: "campo" }, el("span", { class: "rotulo", text: "Na vitrine" }), el("label", { class: "alternar", for: ativo.id }, ativo, "Mostrar"))
      ),
      editorEstoque(p),
      el("div", { class: "campo" }, el("span", { class: "rotulo", text: "Categorias" }),
        chipsCategorias(cats, () => { p.cats = [...cats]; marcarSujo(); })),
      el("div", { class: "prod__acoes" }, subir, descer, apagar)
    )
  );
  return cartao;
}

function desenharProdutos() {
  const q = semAcento(produtos.busca.trim());
  const itens = produtos.lista.map((p, i) => [p, i]).filter(([p]) => !q || semAcento(p.nome).includes(q));
  $("#lista-prod").replaceChildren(...itens.map(([p, i]) => cartaoProduto(p, i)));
  const ativos = produtos.lista.filter(p => p.ativo).length;
  $("#prod-qtd").textContent = produtos.lista.length ? `(${ativos} na vitrine${ativos < produtos.lista.length ? `, ${produtos.lista.length - ativos} escondidos` : ""})` : "";
  $("#prod-vazio").hidden = produtos.lista.length > 0;
  // mostra o botão enquanto faltar alguma peça da vitrine antiga (que ainda não foi cadastrado nem está na fila)
  $("#importar").hidden = !faltandoDaVitrine().length;
  $("#barra-salvar").hidden = !produtos.sujo;
}

function mover(i, d) {
  const j = i + d;
  if (j < 0 || j >= produtos.lista.length) return;
  [produtos.lista[i], produtos.lista[j]] = [produtos.lista[j], produtos.lista[i]];
  marcarSujo();
  desenharProdutos();
}

async function salvarProdutos() {
  const b = $("#salvar");
  b.disabled = true;
  try {
    // estoque só vai quando foi editado aqui; senão o servidor mantém o atual (vendas podem ter mudado)
    const corpo = produtos.lista.map(({ ordem, tam, _estoque, estoque, ...p }) => _estoque ? { ...p, estoque } : p);
    produtos.lista = await api("/api/admin/produtos", { metodo: "PUT", corpo });
    produtos.sujo = false;
    desenharProdutos();
    if (!$("#sec-estoque").hidden) desenharEstoque();
    aviso("Salvo. O site já mostra as mudanças.");
    return true;
  } catch (e) {
    aviso(e.message);
    return false;
  } finally { b.disabled = false; }
}

// Traz a vitrine padrão do site para a fila "aguardando tamanhos" (cada uma recebe os tamanhos reais antes de publicar)
function faltandoDaVitrine() {
  return []; // ITSK: as peças de demonstração do site não são importadas (cadastre as reais com foto)
  return PRODUTOS_PADRAO.filter(p => !produtos.lista.some(x => x.id === p.id) && !pendentes.some(x => x.id === p.id));
}
function importarVitrine() {
  const faltam = faltandoDaVitrine();
  for (const p of faltam) {
    pendentes.push({ chave: ++seqPend, id: p.id, nome: p.nome, preco: p.por, cats: [...p.cats], estoque: {}, tag: p.tag || "",
      previa: "../img/produtos/" + p.id + ".jpg", foto: "img/produtos/" + p.id + ".jpg", estado: "pronta" });
  }
  desenharPendentes();
  desenharProdutos();
  aviso(`${faltam.length} ${faltam.length === 1 ? "modelo da vitrine antiga está" : "modelos da vitrine antiga estão"} em “Fotos aguardando tamanhos”. Marque os tamanhos e publique.`);
  $("#pendentes").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Fotos: reduz no próprio aparelho (máx. 1400 px) antes de enviar */
async function reduzir(arquivo) {
  let bmp;
  try { bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" }); }
  catch { throw new Error("formato não suportado, envie em JPG ou PNG"); }
  // tenta tamanhos menores até a foto ficar abaixo do limite do servidor (1,8 MB)
  let blob = null;
  for (const [lado, q] of [[1400, 0.82], [1200, 0.75], [1000, 0.7], [800, 0.65]]) {
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    blob = await new Promise(r => c.toBlob(r, "image/webp", q));
    if (!blob || blob.type !== "image/webp") blob = await new Promise(r => c.toBlob(r, "image/jpeg", q));
    if (blob && blob.size < 1_700_000) break;
  }
  if (bmp.close) bmp.close();
  if (!blob) throw new Error("não foi possível preparar a foto");
  if (blob.size >= 1_700_000) throw new Error("foto grande demais mesmo depois de reduzida");
  return blob;
}
async function enviarFoto(arquivo) {
  const r = await api("/api/admin/fotos", { metodo: "POST", corpo: await reduzir(arquivo) });
  return r.url;
}

function nomeDoArquivo(nome, n) {
  const base = nome.replace(/\.[^.]+$/, "").trim();
  if (!base || /^(img|dsc|dcim|whatsapp|photo|foto|image|imagem|screenshot|captura|pxl|mvimg)[\W_]|^[\d\W_]+$/i.test(base)) return "Peça nova " + n;
  const limpo = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}
function idPara(nome) {
  const base = semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "peca";
  return base + "-" + Math.random().toString(36).slice(2, 7);
}

/* Fotos novas: sobem na hora e ficam na fila "aguardando tamanhos" até serem publicadas */
const TAMANHOS_GRADE = [36, 38, 40, 42, 44, 46, 15]; // PP, P, M, G, GG, XG, Único
let pendentes = [];
let seqPend = 0;

async function receberFotos(arquivos) {
  let lista = [...arquivos].filter(f => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
  $("#falhas").replaceChildren();
  if (!lista.length) { aviso("Nenhuma foto encontrada. Envie arquivos JPG, PNG ou WEBP."); return; }
  if (lista.length > MAX_FOTOS) {
    aviso(`Enviando as primeiras ${MAX_FOTOS} fotos. Envie o resto em seguida.`);
    lista = lista.slice(0, MAX_FOTOS);
  }
  const preco = lerPreco($("#pad-preco").value);
  if (!(preco > 0)) { $("#pad-preco").focus(); aviso("Informe o preço das novas (ex.: 139,90)."); return; }
  const cats = [...padraoCats];
  const base = produtos.lista.length + pendentes.length;
  const novos = lista.map((arq, i) => {
    const nome = nomeDoArquivo(arq.name, base + i + 1);
    return { chave: ++seqPend, arquivo: arq, id: idPara(nome), nome, preco, cats: [...cats], estoque: {},
      previa: URL.createObjectURL(arq), foto: "", estado: "enviando" };
  });
  pendentes.push(...novos);
  desenharPendentes();
  $("#pendentes").scrollIntoView({ behavior: "smooth", block: "start" });

  let feitos = 0, falhas = 0;
  const prog = () => {
    $("#progresso").hidden = false;
    $("#progresso-i").style.width = (feitos / novos.length * 100) + "%";
    $("#progresso-texto").textContent = (feitos < novos.length ? `Enviando fotos: ${feitos} de ${novos.length}` : `Fotos enviadas: ${novos.length - falhas} de ${novos.length}. Agora marque os tamanhos e publique.`) +
      (falhas ? ` · ${falhas} com problema` : "");
  };
  prog();
  let proxima = 0;
  async function trabalhador() {
    while (proxima < novos.length) {
      const item = novos[proxima++];
      try {
        item.foto = await enviarFoto(item.arquivo);
        item.estado = "pronta";
      } catch (e) {
        falhas++;
        item.estado = "erro";
        item.erro = e.message;
      }
      feitos++;
      prog();
      atualizarEstadoPend(item);
    }
  }
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
}

const paresDe = item => Object.values(item.estoque).reduce((s, q) => s + q, 0);

function atualizarEstadoPend(item) {
  if (!item.el) return;
  const st = item.el.querySelector(".pend__estado");
  st.className = "pend__estado " + (item.estado === "pronta" ? "ok" : item.estado === "erro" ? "ruim" : "");
  st.textContent = item.estado === "pronta" ? "Foto pronta" : item.estado === "erro" ? "Erro: " + item.erro : "Enviando foto...";
  item.el.classList.toggle("erro", item.estado === "erro");
}

function cartaoPendente(item) {
  const total = el("b");
  const atualizarTotal = () => { const n = paresDe(item); total.textContent = n === 1 ? "1 peça" : `${n} peças`; };
  const grade = el("div", { class: "grade-tam", role: "group", "aria-label": "Tamanhos e peças" });
  // Clica no número para marcar o tamanho e digita quantos peças tem dele
  const desenharGrade = foco => {
    let alvo = null;
    grade.replaceChildren(...TAMANHOS_GRADE.map(t => {
      if (item.estoque[t] === undefined) {
        const b = el("button", { type: "button", class: "btn-tam", "aria-label": `Marcar o tamanho ${rotulo(t)}` }, rotulo(t), el("small", { text: "—" }));
        b.addEventListener("click", () => { item.estoque[t] = 1; desenharGrade(t); });
        return el("div", { class: "tam-cel" }, b);
      }
      const q = el("input", { type: "text", inputmode: "numeric", class: "qtd-tam", "aria-label": `Peças no tamanho ${t}`, autocomplete: "off" });
      q.value = String(item.estoque[t]);
      q.addEventListener("input", () => {
        q.value = q.value.replace(/\D/g, "").slice(0, 4);
        item.estoque[t] = parseInt(q.value, 10) || 0;
        atualizarTotal();
      });
      q.addEventListener("blur", () => { if (!item.estoque[t]) { delete item.estoque[t]; desenharGrade(); } });
      q.addEventListener("keydown", e => { if (e.key === "Enter") q.blur(); });
      const x = el("button", { type: "button", class: "menos", "aria-label": `Tirar o tamanho ${t}`, text: "×" });
      x.addEventListener("mousedown", e => e.preventDefault());
      x.addEventListener("click", () => { delete item.estoque[t]; desenharGrade(); });
      const cel = el("div", { class: "tam-cel tem" }, el("span", { class: "num-tam", text: rotulo(t) }), q, el("small", { text: "peças" }), x);
      if (foco === t) alvo = q;
      return cel;
    }));
    // a caixinha já recebe o cursor na hora do clique, pronta para digitar os peças
    if (alvo) { alvo.focus(); alvo.select(); }
    atualizarTotal();
  };
  desenharGrade();

  const nome = el("input", { type: "text", maxlength: "80", id: "c" + (++seqCampo), "aria-label": "Nome do produto" });
  nome.value = item.nome;
  nome.addEventListener("input", () => { item.nome = nome.value; });
  const preco = el("input", { type: "text", inputmode: "decimal", autocomplete: "off", id: "c" + (++seqCampo), "aria-label": "Preço" });
  preco.value = precoTexto(item.preco);
  preco.addEventListener("input", () => { item.preco = lerPreco(preco.value); });

  const publicar = el("button", { type: "button", class: "btn btn--rosa", text: "Publicar" });
  publicar.addEventListener("click", () => publicarPendentes([item]));
  const descartar = el("button", { type: "button", class: "link", text: "Descartar" });
  descartar.addEventListener("click", () => { pendentes = pendentes.filter(x => x !== item); desenharPendentes(); });

  item.el = el("article", { class: "pend" },
    el("div", { class: "pend__foto" }, el("img", { src: item.previa, alt: "" }), el("span", { class: "pend__estado" })),
    el("div", { class: "pend__corpo" },
      el("div", { class: "pend__linha" },
        el("div", { class: "campo" }, el("label", { for: nome.id, text: "Nome" }), nome),
        el("div", { class: "campo" }, el("label", { for: preco.id, text: "Preço (R$)" }), preco)),
      el("div", { class: "campo" }, el("span", { class: "rotulo", text: "Tamanhos e peças" }), grade),
      el("div", { class: "pend__rodape" }, el("span", {}, "Total: ", total), publicar, descartar)));
  atualizarEstadoPend(item);
  return item.el;
}

function desenharPendentes() {
  $("#pendentes").hidden = !pendentes.length;
  $("#pend-qtd").textContent = pendentes.length ? `(${pendentes.length})` : "";
  $("#lista-pend").replaceChildren(...pendentes.map(cartaoPendente));
  $("#importar").hidden = !faltandoDaVitrine().length;
}

async function publicarPendentes(itens) {
  const prontos = [], faltando = [];
  for (const it of itens) {
    if (it.estado !== "pronta") continue;
    if (!paresDe(it) || !(it.preco > 0) || !it.nome.trim()) faltando.push(it); else prontos.push(it);
  }
  if (!prontos.length) {
    const it = faltando[0];
    if (!it) { aviso("Espere as fotos terminarem de enviar."); return; }
    aviso(!paresDe(it) ? `Marque pelo menos um tamanho em “${it.nome}”.` : !(it.preco > 0) ? `Confira o preço de “${it.nome}”.` : "Dê um nome ao produto.");
    it.el && it.el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const novos = prontos.map(it => ({ id: it.id, nome: it.nome.trim(), cats: [...it.cats], preco: it.preco, de: null,
    estoque: { ...it.estoque }, _estoque: true, tag: it.tag || "", foto: it.foto, custo: null, ativo: true }));
  const antes = produtos.lista;
  produtos.lista = [...novos, ...produtos.lista.filter(p => !novos.some(n => n.id === p.id))];
  marcarSujo();
  if (await salvarProdutos()) {
    pendentes = pendentes.filter(x => !prontos.includes(x));
    desenharPendentes();
    const extra = faltando.length ? ` ${faltando.length} ainda sem tamanho marcado.` : "";
    aviso(`${novos.length} ${novos.length === 1 ? "produto publicado" : "produtos publicados"} no site.${extra}`);
  } else {
    produtos.lista = antes;
    desenharProdutos();
  }
}

async function trocarFoto(arquivo) {
  const p = produtos.trocando;
  produtos.trocando = null;
  if (!p || !arquivo) return;
  aviso("Enviando a foto...");
  try {
    p.foto = await enviarFoto(arquivo);
    marcarSujo();
    desenharProdutos();
    await salvarProdutos();
  } catch (e) { aviso("Não foi possível trocar a foto: " + e.message); }
}

/* ---------- Ligações da tela ---------- */
function ligarPainel() {
  $("#aba-caixa").addEventListener("click", () => mostrarAba("caixa"));
  $("#aba-produtos").addEventListener("click", () => mostrarAba("produtos"));
  $("#aba-estoque").addEventListener("click", () => mostrarAba("estoque"));
  let aba = "caixa";
  try { aba = sessionStorage.getItem("adm-aba") || "caixa"; } catch { /* sem armazenamento */ }
  mostrarAba(["produtos", "estoque"].includes(aba) ? aba : "caixa");

  // Caixa
  $$("[data-periodo]").forEach(b => b.addEventListener("click", () => { caixa.periodo = b.dataset.periodo; carregarCaixa(); }));
  $("#per-ant").addEventListener("click", () => { caixa.ref = deslocar(caixa.periodo, caixa.ref, -1); carregarCaixa(); });
  $("#per-prox").addEventListener("click", () => { caixa.ref = deslocar(caixa.periodo, caixa.ref, 1); carregarCaixa(); });
  $("#per-hoje").addEventListener("click", () => { caixa.ref = new Date(); carregarCaixa(); });
  $("#nova-venda").addEventListener("click", () => abrirLancamento("entrada"));
  $("#nova-saida").addEventListener("click", () => abrirLancamento("saida"));
  $("#exportar").addEventListener("click", exportar);
  $$("[data-tipo]").forEach(b => b.addEventListener("click", () => {
    caixa.tipo = b.dataset.tipo;
    $$("[data-tipo]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    desenharLancamentos();
  }));
  $("#lanc-busca").addEventListener("input", e => { caixa.busca = e.target.value; desenharLancamentos(); });

  // Janela de lançamento
  $$("[data-ltipo]").forEach(b => b.addEventListener("click", () => escolherTipo(b.dataset.ltipo)));
  $("#l-qtd").addEventListener("input", atualizarTotal);
  $("#l-unit").addEventListener("input", atualizarTotal);
  $("#l-prod").addEventListener("change", () => {
    const p = produtos.lista.find(x => x.id === $("#l-prod").value);
    if (!p) return;
    if (lancTipo === "entrada") $("#l-unit").value = precoTexto(p.preco);
    else if (p.custo != null) $("#l-unit").value = precoTexto(p.custo);
    if (!$("#l-desc").value) $("#l-desc").value = p.nome;
    atualizarTotal();
  });
  $("#l-prod").addEventListener("change", () => preencherTamanhos(null));
  $("#form-lanc").addEventListener("submit", salvarLancamento);
  $("#l-excluir").addEventListener("click", async () => {
    const l = lancEditando;
    fecharLancamento();
    if (l) await excluirLancamento(l);
  });
  $("#camada-lanc").addEventListener("click", e => { if (e.target.id === "camada-lanc" || e.target.closest("[data-fechar]")) fecharLancamento(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#camada-lanc").hidden) fecharLancamento(); });

  // Produtos
  $("#pad-cats").replaceWith(Object.assign(chipsCategorias(padraoCats), { id: "pad-cats" }));
  const solta = $("#solta");
  $("#arquivos").addEventListener("change", e => { receberFotos(e.target.files); e.target.value = ""; });
  ["dragenter", "dragover"].forEach(t => solta.addEventListener(t, e => { e.preventDefault(); solta.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(t => solta.addEventListener(t, e => { e.preventDefault(); solta.classList.remove("sobre"); }));
  solta.addEventListener("drop", e => receberFotos(e.dataTransfer.files));
  // evita que uma foto solta fora da área abra no navegador
  ["dragover", "drop"].forEach(t => window.addEventListener(t, e => e.preventDefault()));
  $("#trocar-foto").addEventListener("change", e => { trocarFoto(e.target.files[0]); e.target.value = ""; });
  $("#salvar").addEventListener("click", salvarProdutos);
  $("#importar").addEventListener("click", importarVitrine);
  $("#publicar-todas").addEventListener("click", () => publicarPendentes(pendentes));
  $("#prod-busca").addEventListener("input", e => { produtos.busca = e.target.value; desenharProdutos(); });
  $$("[data-est]").forEach(b => b.addEventListener("click", () => {
    estoqueVista.filtro = b.dataset.est;
    $$("[data-est]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    desenharEstoque();
  }));
  $("#est-busca").addEventListener("input", e => { estoqueVista.busca = e.target.value; desenharEstoque(); });
  window.addEventListener("beforeunload", e => { if (produtos.sujo || pendentes.length) { e.preventDefault(); e.returnValue = ""; } });
}

/* ---------- Início ---------- */
(async function iniciar() {
  try {
    const s = await api("/api/admin/entrar");
    if (s && s.ok) { abrirPainel(); avisoSenha(s.senhaFraca); } else mostrarEntrar();
  } catch (e) { mostrarEntrar(e.message); }
})();
