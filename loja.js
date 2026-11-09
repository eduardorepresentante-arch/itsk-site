/* ITSK Studio and Second · vitrine, abas, sacola, favoritas e busca.
   Os dados (WhatsApp, peças de exemplo, categorias) ficam em dados.js. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...filhos.flat().filter(f => f !== null && f !== undefined && f !== false));
  return n;
}
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const reais = v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const semAcento = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navegador sem armazenamento */ } };
const ler = (k, padrao) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } };
const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Peças ---------- */
const normalizar = p => ({
  id: p.id, nome: p.nome, cats: p.cats || [], preco: Number(p.preco ?? p.por) || 0, de: p.de || null,
  tag: p.tag || "", tam: p.tam || [], esgotados: p.esgotados || [], foto: p.foto || "", forma: p.forma, tom: p.tom
});
let PECAS = PRODUTOS_PADRAO.map(normalizar);
const colecaoDe = p => (p.cats.includes("second") ? "second" : "studio");
const acha = id => PECAS.find(p => p.id === id);
const unica = p => colecaoDe(p) === "second";

/* Desenho elegante usado enquanto a peça não tem foto */
const FORMAS = {
  vestido: ["M39 8 L45 6 Q50 15 55 6 L61 8 L63 30 Q59 35 61 41 L82 110 Q50 117 18 110 L39 41 Q41 35 37 30 Z", "M50 41 L50 112"],
  blazer: ["M33 10 L50 18 L67 10 L86 22 L91 100 L77 102 L74 52 L72 112 L28 112 L26 52 L23 102 L9 100 L14 22 Z", "M50 18 L41 52 L50 74 L59 52 Z"],
  blusa: ["M35 14 L44 10 Q50 18 56 10 L65 14 L86 30 L78 44 L68 37 L68 100 L32 100 L32 37 L22 44 L14 30 Z", "M50 18 L50 100"],
  saia: ["M34 20 L66 20 L68 30 L85 108 Q50 116 15 108 L32 30 Z", "M32 30 L68 30 M43 30 L38 112 M50 30 L50 114 M57 30 L62 112"],
  calca: ["M29 10 L71 10 L75 112 L56 112 L50 42 L44 112 L25 112 Z", "M29 20 L71 20"],
  bolsa: ["M18 46 L82 46 L88 104 Q50 110 12 104 Z", "M34 46 Q34 18 50 18 Q66 18 66 46 M18 60 L82 60"],
  tricot: ["M40 6 L60 6 L60 15 L72 17 L90 35 L82 96 L74 96 L72 46 L72 104 L28 104 L28 46 L26 96 L18 96 L10 35 L28 17 L40 15 Z", "M28 96 L72 96 M40 10 L60 10 M34 30 L34 90 M42 30 L42 90 M50 30 L50 90 M58 30 L58 90 M66 30 L66 90"],
  acessorio: ["M50 14 L86 50 L50 86 L14 50 Z", "M50 26 L74 50 L50 74 L26 50 Z M86 50 L92 56 M50 86 L46 94 M14 50 L8 56"]
};
function arte(p) {
  const [corpo, detalhe] = FORMAS[p.forma] || FORMAS.vestido;
  const escuro = /^#([0-3])/.test(p.tom || "");
  const s = svgEl("svg", { viewBox: "0 0 100 120", "aria-hidden": "true" });
  s.append(
    svgEl("path", { d: corpo, fill: p.tom || "#E4D9C8", stroke: escuro ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.16)", "stroke-width": ".8", "stroke-linejoin": "round" }),
    svgEl("path", { d: detalhe, fill: "none", stroke: escuro ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.14)", "stroke-width": ".7", "stroke-linecap": "round" })
  );
  return el("div", { class: "arte" }, s, el("span", { class: "arte__rotulo", text: "ITSK" }));
}
const foto = (p, lazy = true) => p.foto
  ? el("img", { src: p.foto, alt: p.nome, loading: lazy ? "lazy" : "eager", decoding: "async" })
  : arte(p);

/* ---------- Estado ---------- */
const estado = {
  aba: /second/.test(location.hash) ? "second" : ler("itsk-aba", "studio"),
  cat: "todas", tam: "", ordem: ""
};
let sacola = ler("itsk-sacola", []).filter(i => i && typeof i.id === "string");
let favoritas = new Set(ler("itsk-favoritas", []));

/* ---------- WhatsApp ---------- */
function linkWhats(texto) {
  return LOJA.whatsapp ? `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(texto)}` : "#";
}
function semWhats(e) {
  if (LOJA.whatsapp) return false;
  e.preventDefault();
  avisar("O WhatsApp da loja ainda vai ser configurado.");
  return true;
}

/* ---------- Aviso flutuante ---------- */
let tAviso;
function avisar(t) {
  const a = $("#aviso");
  a.textContent = t; a.classList.add("ver");
  clearTimeout(tAviso); tAviso = setTimeout(() => a.classList.remove("ver"), 2600);
}

/* ---------- Abas (Studio / Second) ---------- */
function moverPilula() {
  const ativo = $(`.abas__item[data-aba="${estado.aba}"]`), p = $(".abas__pilula");
  if (!ativo || !p) return;
  p.style.width = ativo.offsetWidth + "px";
  p.style.transform = `translateX(${ativo.offsetLeft}px)`;
}
function marcarAba() {
  $$(".abas__item").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.aba === estado.aba)));
  $$(".troca__item").forEach(b => { b.setAttribute("aria-selected", String(b.dataset.aba === estado.aba)); b.tabIndex = b.dataset.aba === estado.aba ? 0 : -1; });
  $("#grade").setAttribute("aria-labelledby", "tab-" + estado.aba);
  const c = COLECOES[estado.aba];
  $("#vitrine-sobre").textContent = `${c.nome} · ${c.sub}`;
  $("#vitrine-titulo").textContent = c.titulo;
  $("#vitrine-intro").textContent = c.intro;
  moverPilula();
}
function trocarAba(aba, rolar = false) {
  if (!COLECOES[aba]) return;
  const mudou = aba !== estado.aba;
  const aplicar = () => {
    estado.aba = aba; estado.cat = "todas"; estado.tam = "";
    guardar("itsk-aba", aba);
    history.replaceState(null, "", "#" + aba);
    marcarAba(); montarFiltros(); mostrar();
  };
  if (mudou && document.startViewTransition && !calmo) document.startViewTransition(aplicar);
  else aplicar();
  if (rolar) $("#vitrine").scrollIntoView({ behavior: calmo ? "auto" : "smooth" });
}

/* ---------- Filtros ---------- */
const daAba = () => PECAS.filter(p => colecaoDe(p) === estado.aba);
function montarFiltros() {
  const lista = daAba();
  const cats = Object.keys(CATEGORIAS).filter(c => c !== "studio" && c !== "second" && lista.some(p => p.cats.includes(c)));
  $("#chips").replaceChildren(...["todas", ...cats].map(c => el("button", {
    type: "button", class: "chip", "aria-pressed": String(c === estado.cat), text: c === "todas" ? "Tudo" : CATEGORIAS[c],
    onclick: e => { estado.cat = c; $$(".chip").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); mostrar(); }
  })));
  const tams = [...new Set(lista.flatMap(p => p.tam))].sort((a, b) => a - b);
  $("#filtro-tam").replaceChildren(el("option", { value: "", text: "Todos" }), ...tams.map(t => el("option", { value: t, text: rotuloTam(t) })));
  $("#filtro-tam").value = estado.tam;
}
function filtradas() {
  let l = daAba();
  if (estado.cat !== "todas") l = l.filter(p => p.cats.includes(estado.cat));
  if (estado.tam) l = l.filter(p => p.tam.includes(Number(estado.tam)) && !p.esgotados.includes(Number(estado.tam)));
  const esgotada = p => p.tam.length > 0 && p.tam.every(t => p.esgotados.includes(t));
  if (estado.ordem === "menor") l = [...l].sort((a, b) => a.preco - b.preco);
  else if (estado.ordem === "maior") l = [...l].sort((a, b) => b.preco - a.preco);
  else if (estado.ordem === "az") l = [...l].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return [...l.filter(p => !esgotada(p)), ...l.filter(esgotada)];
}

/* ---------- Vitrine ---------- */
const coracao = () => {
  const s = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
  s.append(svgEl("path", { d: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" }));
  return s;
};
function precoBloco(p, cls) {
  return el("div", { class: cls },
    el("b", { text: reais(p.preco) }),
    p.de && p.de > p.preco ? el("s", { text: unica(p) ? "Original " + reais(p.de) : reais(p.de) }) : null,
    LOJA.parcelas > 1 && p.preco >= 100 ? el("small", { text: `ou ${LOJA.parcelas}x de ${reais(p.preco / LOJA.parcelas)} sem juros` }) : null);
}
function card(p, i) {
  const esgotada = p.tam.length > 0 && p.tam.every(t => p.esgotados.includes(t));
  const fav = el("button", {
    type: "button", class: "card__fav", "aria-label": `Favoritar ${p.nome}`, "aria-pressed": String(favoritas.has(p.id)),
    onclick: e => { e.stopPropagation(); alternarFavorita(p.id, e.currentTarget); }
  }, coracao());
  const selo = esgotada ? el("span", { class: "card__selo card__selo--escuro", text: unica(p) ? "Vendida" : "Esgotada" })
    : p.tag ? el("span", { class: "card__selo" + (unica(p) ? " card__selo--escuro" : ""), text: p.tag }) : null;
  const c = el("article", { class: "card" + (esgotada ? " esgotado" : "") },
    el("div", { class: "card__foto", onclick: () => abrirPeca(p.id) },
      foto(p), selo, fav,
      el("button", { type: "button", class: "card__rapido", text: esgotada ? "Ver peça" : "Ver e escolher", onclick: e => { e.stopPropagation(); abrirPeca(p.id); } })),
    el("div", { class: "card__info" },
      el("h3", { class: "card__nome" }, el("button", { type: "button", text: p.nome, onclick: () => abrirPeca(p.id) })),
      precoBloco(p, "card__preco"),
      el("div", { class: "card__tams" }, p.tam.map(t => el("span", { class: p.esgotados.includes(t) ? "fora" : "", text: rotuloTam(t) })))));
  c.style.setProperty("--i", Math.min(i, 12));
  return c;
}
function mostrar() {
  const l = filtradas();
  $("#grade").replaceChildren(...l.map(card));
  $("#vazio").hidden = l.length > 0;
}

/* ---------- Peça aberta ---------- */
let pecaAtual = null, tamEscolhido = null;
function abrirPeca(id) {
  const p = acha(id); if (!p) return;
  pecaAtual = p; tamEscolhido = null;
  const disp = p.tam.filter(t => !p.esgotados.includes(t));
  if (disp.length === 1) tamEscolhido = disp[0];
  $("#peca-foto").replaceChildren(foto(p, false));
  $("#peca-colecao").textContent = `${COLECOES[colecaoDe(p)].nome} · ${COLECOES[colecaoDe(p)].sub}`;
  $("#peca-nome").textContent = p.nome;
  $("#peca-tag").textContent = p.tag;
  $("#peca-preco").replaceChildren(reais(p.preco),
    p.de && p.de > p.preco ? el("s", { text: (unica(p) ? "original " : "") + reais(p.de) }) : "",
    LOJA.parcelas > 1 && p.preco >= 100 ? el("small", { text: `ou ${LOJA.parcelas}x de ${reais(p.preco / LOJA.parcelas)} sem juros` }) : "");
  desenharTams();
  $("#peca-aviso").hidden = true;
  $("#peca-sacola").disabled = !disp.length;
  $("#peca-sacola").textContent = disp.length ? "Adicionar à sacola" : (unica(p) ? "Peça vendida" : "Esgotada");
  $("#peca-nota").textContent = unica(p) ? "Peça única do Second: existe só esta. Garantimos assim que o pedido for confirmado." : "";
  $("#peca-whats").href = linkWhats(`Olá! Tenho interesse na peça "${p.nome}" (${COLECOES[colecaoDe(p)].nome}) que vi no site da ITSK.`);
  abrir($("#peca"));
}
function desenharTams() {
  const p = pecaAtual;
  $("#peca-tams").replaceChildren(...p.tam.map(t => el("button", {
    type: "button", class: "tam", role: "radio", "aria-checked": String(t === tamEscolhido), disabled: p.esgotados.includes(t),
    "aria-label": `Tamanho ${rotuloTam(t)}${p.esgotados.includes(t) ? ", esgotado" : ""}`, text: rotuloTam(t),
    onclick: () => { tamEscolhido = t; $("#peca-aviso").hidden = true; desenharTams(); }
  })));
}
$("#peca-sacola").addEventListener("click", () => {
  if (!pecaAtual) return;
  if (tamEscolhido == null) { $("#peca-aviso").hidden = false; return; }
  colocarNaSacola(pecaAtual, tamEscolhido);
  fechar($("#peca"));
  abrir($("#sacola"));
});
$("#peca-whats").addEventListener("click", semWhats);

/* ---------- Sacola ---------- */
function colocarNaSacola(p, t) {
  const item = sacola.find(i => i.id === p.id && i.tam === t);
  if (item) {
    if (unica(p)) { avisar("Essa peça única já está na sua sacola."); return; }
    item.qtd++;
  } else sacola.push({ id: p.id, tam: t, qtd: 1 });
  salvarSacola();
  avisar(`${p.nome} na sacola.`);
}
function salvarSacola() {
  sacola = sacola.filter(i => acha(i.id));
  guardar("itsk-sacola", sacola);
  desenharSacola();
}
function contar(id, n) {
  const c = $(id); const antes = c.textContent;
  c.textContent = n; c.hidden = !n;
  if (antes !== String(n) && n) { c.classList.remove("pulsa"); void c.offsetWidth; c.classList.add("pulsa"); }
}
function desenharSacola() {
  const itens = sacola.map(i => ({ ...i, p: acha(i.id) })).filter(i => i.p);
  contar("#cont-sacola", itens.reduce((s, i) => s + i.qtd, 0));
  const total = itens.reduce((s, i) => s + i.qtd * i.p.preco, 0);
  $("#sacola-total").textContent = reais(total);
  $("#sacola-lista").replaceChildren(...(itens.length ? itens.map(i => el("div", { class: "item" },
    el("div", { class: "item__foto" }, foto(i.p)),
    el("div", {},
      el("h3", { text: i.p.nome }),
      el("p", { text: `${COLECOES[colecaoDe(i.p)].nome} · Tam. ${rotuloTam(i.tam)} · ${reais(i.p.preco)}` }),
      unica(i.p) ? el("p", { text: "Peça única" }) : el("div", { class: "item__qtd" },
        el("button", { type: "button", "aria-label": "Menos uma", text: "−", onclick: () => { i.qtd > 1 ? mudarQtd(i, -1) : tirar(i); } }),
        el("span", { text: i.qtd }),
        el("button", { type: "button", "aria-label": "Mais uma", text: "+", onclick: () => mudarQtd(i, 1) }))),
    el("button", { type: "button", class: "item__tirar", text: "Tirar", onclick: () => tirar(i) })))
    : [el("p", { class: "gaveta__vazia", text: "Sua sacola está vazia. Que tal começar pelo Studio ou pelo Second?" })]));
  $("#sacola-finalizar").hidden = !itens.length;
  const linhas = itens.map(i => `• ${i.qtd}x ${i.p.nome} (${COLECOES[colecaoDe(i.p)].nome}) · Tam. ${rotuloTam(i.tam)} · ${reais(i.p.preco * i.qtd)}`);
  $("#sacola-finalizar").href = linkWhats(`Olá, ITSK! Quero fazer este pedido pelo site:\n\n${linhas.join("\n")}\n\nTotal: ${reais(total)}`);
}
const mudarQtd = (i, d) => { const s = sacola.find(x => x.id === i.id && x.tam === i.tam); if (s) s.qtd = Math.max(1, s.qtd + d); salvarSacola(); };
const tirar = i => { sacola = sacola.filter(x => !(x.id === i.id && x.tam === i.tam)); salvarSacola(); };
$("#sacola-finalizar").addEventListener("click", semWhats);

/* ---------- Favoritas ---------- */
function alternarFavorita(id, botao) {
  favoritas.has(id) ? favoritas.delete(id) : favoritas.add(id);
  guardar("itsk-favoritas", [...favoritas]);
  if (botao) botao.setAttribute("aria-pressed", String(favoritas.has(id)));
  if (favoritas.has(id)) avisar("Salva nas favoritas.");
  desenharFavoritas();
}
function desenharFavoritas() {
  favoritas = new Set([...favoritas].filter(acha));
  contar("#cont-favoritos", favoritas.size);
  const l = [...favoritas].map(acha);
  $("#fav-lista").replaceChildren(...(l.length ? l.map(p => el("div", { class: "item" },
    el("div", { class: "item__foto" }, foto(p)),
    el("div", {}, el("h3", { text: p.nome }), el("p", { text: `${COLECOES[colecaoDe(p)].nome} · ${reais(p.preco)}` }),
      el("button", { type: "button", class: "link", text: "Ver peça", onclick: () => { fechar($("#favoritos")); abrirPeca(p.id); } })),
    el("button", { type: "button", class: "item__tirar", text: "Tirar", onclick: () => { alternarFavorita(p.id); mostrar(); } })))
    : [el("p", { class: "gaveta__vazia", text: "Toque no coração das peças para guardar as suas favoritas aqui." })]));
}

/* ---------- Busca ---------- */
function buscar() {
  const q = semAcento($("#busca-texto").value.trim());
  const caixa = $("#busca-resultados");
  if (!q) { caixa.replaceChildren(el("p", { class: "busca__dica", text: "Digite o nome de uma peça, uma categoria ou “vintage”." })); return; }
  const l = PECAS.filter(p => semAcento(`${p.nome} ${p.tag} ${p.cats.map(c => CATEGORIAS[c] || c).join(" ")}`).includes(q)).slice(0, 12);
  caixa.replaceChildren(...(l.length ? l.map(p => el("div", {
    class: "item", tabindex: "0", role: "button",
    onclick: () => { fechar($("#busca")); abrirPeca(p.id); },
    onkeydown: e => { if (e.key === "Enter") { fechar($("#busca")); abrirPeca(p.id); } }
  }, el("div", { class: "item__foto" }, foto(p)),
    el("div", {}, el("h3", { text: p.nome }), el("p", { text: `${COLECOES[colecaoDe(p)].nome} · ${reais(p.preco)}` })), el("span", { text: "→" })))
    : [el("p", { class: "busca__dica", text: "Nada encontrado com esse nome." })]));
}
$("#busca-texto").addEventListener("input", buscar);

/* ---------- Janelas ---------- */
function abrir(d) {
  if (d.open) return;
  d.showModal(); document.body.classList.add("travado");
}
function fechar(d) { if (d.open) d.close(); }
$$("dialog").forEach(d => {
  d.addEventListener("close", () => { if (!$$("dialog").some(x => x.open)) document.body.classList.remove("travado"); });
  d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-fechar]")) fechar(d); });
});
$("#abrir-sacola").addEventListener("click", () => abrir($("#sacola")));
$("#abrir-favoritos").addEventListener("click", () => abrir($("#favoritos")));
$("#abrir-busca").addEventListener("click", () => { abrir($("#busca")); buscar(); $("#busca-texto").focus(); });
addEventListener("keydown", e => {
  if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName) && !$$("dialog").some(x => x.open)) {
    e.preventDefault(); $("#abrir-busca").click();
  }
});

/* ---------- Ligações dos botões e filtros ---------- */
$$("[data-aba]").forEach(b => b.addEventListener("click", () => trocarAba(b.dataset.aba, b.classList.contains("abas__item"))));
$$("[data-ir]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); trocarAba(a.dataset.ir, true); }));
$(".troca").addEventListener("keydown", e => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const outra = estado.aba === "studio" ? "second" : "studio";
  trocarAba(outra); $(`#tab-${outra}`).focus();
});
$("#filtro-tam").addEventListener("change", e => { estado.tam = e.target.value; mostrar(); });
$("#ordem").addEventListener("change", e => { estado.ordem = e.target.value; mostrar(); });
$("#limpar").addEventListener("click", () => { estado.cat = "todas"; estado.tam = ""; montarFiltros(); mostrar(); });
$("#link-consigne").href = linkWhats("Olá, ITSK! Tenho peças femininas para avaliar no Second (brechó). Como funciona?");
$("#link-consigne").addEventListener("click", semWhats);

/* ---------- Rodapé ---------- */
(function rodape() {
  const contato = $("#rodape-contato"), loja = $("#rodape-loja");
  if (LOJA.whatsapp) contato.append(el("a", { href: linkWhats("Olá, ITSK!"), target: "_blank", rel: "noopener", text: "WhatsApp " + (LOJA.whatsappTexto || "") }));
  if (LOJA.instagram) contato.append(el("a", { href: LOJA.instagram, target: "_blank", rel: "noopener", text: "Instagram " + (LOJA.instagramTexto || "") }));
  if (LOJA.grupoVip) {
    contato.append(el("a", { href: LOJA.grupoVip, target: "_blank", rel: "noopener", text: "Grupo VIP no WhatsApp" }));
    $("#link-vip").href = LOJA.grupoVip; $("#link-vip").hidden = false;
  }
  if (!LOJA.whatsapp && !LOJA.instagram) contato.append(el("p", { text: "Em breve: WhatsApp e Instagram." }));
  if (LOJA.endereco) loja.append(LOJA.mapa ? el("a", { href: LOJA.mapa, target: "_blank", rel: "noopener", text: LOJA.endereco }) : el("p", { text: LOJA.endereco }));
  if (LOJA.referencia) loja.append(el("p", { text: LOJA.referencia }));
  if (LOJA.horario) loja.append(el("p", { text: LOJA.horario }));
  if (loja.children.length === 1) loja.append(el("p", { text: "Moda feminina · Studio e Second" }));
  $("#rodape-fim").textContent = `© ${new Date().getFullYear()} ITSK Studio and Second${LOJA.cnpj ? " · CNPJ " + LOJA.cnpj : ""}. Moda exclusivamente feminina.`;
})();

/* ---------- Movimento: topo, revelar, vídeo, cursor ---------- */
(function movimento() {
  const topo = $("#topo"), hero = $(".hero"), filtros = $(".filtros");
  let ultimo = scrollY, pedido = false;
  function aoRolar() {
    pedido = false;
    const y = scrollY;
    topo.classList.toggle("solido", y > hero.offsetHeight - 90);
    document.body.classList.toggle("solido", topo.classList.contains("solido"));
    topo.classList.toggle("escondido", y > 500 && y > ultimo + 4 && !document.body.classList.contains("travado"));
    if (y < ultimo - 4 || y < 500) topo.classList.remove("escondido");
    document.body.classList.toggle("escondido", topo.classList.contains("escondido"));
    ultimo = y;
    document.documentElement.style.setProperty("--rolagem", Math.min(1, y / (document.body.scrollHeight - innerHeight || 1)).toFixed(3));
    filtros.classList.toggle("preso", filtros.getBoundingClientRect().top <= parseFloat(getComputedStyle(topo).height) + 1);
  }
  addEventListener("scroll", () => { if (!pedido) { pedido = true; requestAnimationFrame(aoRolar); } }, { passive: true });
  addEventListener("resize", moverPilula);
  aoRolar();

  // quando o topo some, os filtros sobem junto
  new MutationObserver(() => { filtros.style.top = topo.classList.contains("escondido") ? "0px" : ""; }).observe(topo, { attributes: true, attributeFilter: ["class"] });

  // revelar ao rolar
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visivel"); io.unobserve(e.target); } }), { threshold: .14, rootMargin: "0px 0px -6% 0px" });
  $$(".revelar").forEach(n => io.observe(n));

  // vídeo de fundo: sem som, pausa quando a aba do navegador está escondida ou com economia de dados
  const v = $("#fundo-video");
  v.muted = true; v.defaultMuted = true; v.volume = 0;
  if (navigator.connection && navigator.connection.saveData) { v.removeAttribute("autoplay"); v.pause(); }
  else v.play().catch(() => {});
  document.addEventListener("visibilitychange", () => { document.hidden ? v.pause() : (navigator.connection?.saveData || v.play().catch(() => {})); });

  // abertura: só na primeira visita da sessão
  const ab = $("#abertura");
  let viu = false; try { viu = sessionStorage.getItem("itsk-abertura") === "1"; sessionStorage.setItem("itsk-abertura", "1"); } catch { /* sem armazenamento */ }
  if (viu || calmo) ab.remove(); else setTimeout(() => ab.remove(), 3000);

  // cursor e botões magnéticos (só com mouse)
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches || calmo) return;
  const cur = $("#cursor");
  let cx = 0, cy = 0, tx = 0, ty = 0;
  addEventListener("pointermove", e => { tx = e.clientX; ty = e.clientY; cur.classList.add("ativo"); }, { passive: true });
  document.addEventListener("pointerleave", () => cur.classList.remove("ativo"));
  (function seguir() { cx += (tx - cx) * .22; cy += (ty - cy) * .22; cur.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(seguir); })();
  document.addEventListener("pointerover", e => cur.classList.toggle("grande", !!e.target.closest(".card__foto, .mundo")));
  $$(".magnetico").forEach(b => {
    b.addEventListener("pointermove", e => {
      const r = b.getBoundingClientRect();
      b.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) * .25).toFixed(1) + "px");
      b.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) * .35).toFixed(1) + "px");
    });
    b.addEventListener("pointerleave", () => { b.style.setProperty("--mx", "0px"); b.style.setProperty("--my", "0px"); });
  });
})();

/* ---------- Peças cadastradas no painel (quando o site está na Cloudflare) ---------- */
async function carregarCatalogo() {
  try {
    const r = await fetch("/api/produtos", { headers: { Accept: "application/json" } });
    if (!r.ok) return;
    const lista = await r.json();
    if (!Array.isArray(lista) || !lista.length) return;
    const fotoOk = f => typeof f === "string" && /^(\/fotos\/[a-z0-9]{8,32}|img\/[a-z0-9/-]+\.(jpg|webp|png))$/.test(f);
    PECAS = lista.map(p => {
      const exemplo = PRODUTOS_PADRAO.find(x => x.id === p.id) || {};
      const forma = exemplo.forma || (p.cats || []).map(c => ({ vestidos: "vestido", alfaiataria: "blazer", blusas: "blusa", saias: "saia", tricot: "tricot", bolsas: "bolsa", acessorios: "acessorio" })[c]).find(Boolean);
      return normalizar({ ...p, foto: fotoOk(p.foto) ? p.foto : "", forma, tom: exemplo.tom });
    });
    montarFiltros(); mostrar();
  } catch { /* sem servidor: segue com a vitrine de demonstração */ }
  finally { salvarSacola(); desenharFavoritas(); }
}

/* ---------- Começo ---------- */
marcarAba();
montarFiltros();
mostrar();
desenharSacola();
desenharFavoritas();
document.fonts?.ready.then(moverPilula);
if ("ResizeObserver" in window) new ResizeObserver(moverPilula).observe($(".abas"));
if (location.protocol.startsWith("http")) carregarCatalogo();

// "Instalar" o site no celular (funciona offline depois da primeira visita)
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
