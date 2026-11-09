// Funções compartilhadas pelas rotas do servidor (Cloudflare Pages Functions).
// Precisa de: banco D1 ligado como "DB" e a variável secreta ADMIN_SENHA.

export const CATEGORIAS = ["studio", "second", "vestidos", "alfaiataria", "blusas", "saias", "tricot", "vintage", "premium", "bolsas", "acessorios"];
export const TIPOS_FOTO = ["image/jpeg", "image/webp", "image/png"];
export const MAX_FOTO = 1_800_000; // o banco D1 aceita no máximo ~2 MB por registro
const SESSAO_HORAS = 12;
export const COOKIE = "__Host-adm"; // __Host-: só HTTPS, só este site, sem subdomínios

// Respostas do servidor: JSON, sem cache, e sem poder ser interpretadas como página
const SEGURANCA = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY"
};
export function json(dados, status = 200, extra = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SEGURANCA, ...extra }
  });
}
export const erro = (mensagem, status = 400) => json({ erro: mensagem }, status);

/* Banco: cria as tabelas na primeira vez que cada servidor acorda */
let tabelasProntas = false;
export async function banco(env) {
  if (!env.DB) throw new Resposta(erro("Banco de dados não configurado na Cloudflare (ligação D1 com o nome DB).", 503));
  if (!tabelasProntas) {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS produtos (
        id TEXT PRIMARY KEY, nome TEXT NOT NULL, cats TEXT NOT NULL DEFAULT '[]', preco INTEGER NOT NULL,
        de INTEGER, estoque TEXT NOT NULL DEFAULT '{}', tag TEXT, foto TEXT, custo INTEGER,
        ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1, criado TEXT NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS fotos (
        id TEXT PRIMARY KEY, tipo TEXT NOT NULL, dados BLOB NOT NULL, criado TEXT NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS lancamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
        categoria TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '', pagamento TEXT NOT NULL DEFAULT '',
        valor INTEGER NOT NULL, quantidade INTEGER NOT NULL DEFAULT 1, produto_id TEXT, tamanho INTEGER, criado TEXT NOT NULL)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS lancamentos_data ON lancamentos (data)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS tentativas (ip TEXT PRIMARY KEY, n INTEGER NOT NULL, ate INTEGER NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessoes (
        id TEXT PRIMARY KEY, credencial TEXT NOT NULL, expira INTEGER NOT NULL, criado TEXT NOT NULL, ip TEXT)`)
    ]);
    tabelasProntas = true;
  }
  return env.DB;
}

// Erro que já carrega a resposta HTTP pronta
export class Resposta extends Error {
  constructor(resposta) { super("resposta"); this.resposta = resposta; }
}
export async function tratar(fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof Resposta) return e.resposta;
    console.error(e);
    return erro("Erro no servidor. Tente de novo.", 500);
  }
}

/* Sessão do administrador: guardada no banco (sair apaga de verdade).
   O cookie leva só um código aleatório; o banco guarda o hash dele. Trocar o e-mail ou a senha na
   Cloudflare derruba todas as sessões abertas. */
const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hash = async t => b64url(await crypto.subtle.digest("SHA-256", enc.encode(t)));
const credencial = env => hash("itsk-studio-second|" + String(env.ADMIN_EMAIL || "").trim().toLowerCase() + "|" + env.ADMIN_SENHA);

export async function iguais(a, b) {
  // compara em tempo constante usando o hash dos dois textos
  const k = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [x, y] = await Promise.all([a, b].map(t => crypto.subtle.sign("HMAC", k, enc.encode(String(t)))));
  const ua = new Uint8Array(x), ub = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < ua.length; i++) d |= ua[i] ^ ub[i];
  return d === 0;
}

function lerCookie(request) {
  const c = (request.headers.get("Cookie") || "").split(/;\s*/).find(p => p.startsWith(COOKIE + "="));
  const v = c ? c.slice(COOKIE.length + 1) : "";
  return /^[A-Za-z0-9_-]{40,60}$/.test(v) ? v : "";
}

export async function criarSessao(db, env, ip) {
  const codigo = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const expira = Date.now() + SESSAO_HORAS * 3600e3;
  await db.batch([
    db.prepare("DELETE FROM sessoes WHERE expira < ?").bind(Date.now()),
    db.prepare("INSERT INTO sessoes (id, credencial, expira, criado, ip) VALUES (?, ?, ?, ?, ?)")
      .bind(await hash(codigo), await credencial(env), expira, agora(), ip)
  ]);
  return `${COOKIE}=${codigo}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSAO_HORAS * 3600}`;
}

export async function apagarSessao(db, request) {
  const codigo = lerCookie(request);
  if (codigo) await db.prepare("DELETE FROM sessoes WHERE id = ?").bind(await hash(codigo)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function sessaoValida(request, env) {
  if (!env.ADMIN_SENHA) return false;
  const codigo = lerCookie(request);
  if (!codigo) return false;
  const db = await banco(env);
  const r = await db.prepare("SELECT credencial, expira FROM sessoes WHERE id = ?").bind(await hash(codigo)).first();
  if (!r || r.expira < Date.now()) return false;
  return iguais(r.credencial, await credencial(env));
}

// Senha fraca: menos de 12 caracteres ou sem letra maiúscula, minúscula, número e símbolo
export function senhaFraca(env) {
  const s = String(env.ADMIN_SENHA || "");
  return s.length < 12 || !/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s) || !/[^A-Za-z0-9]/.test(s);
}

/* Validação dos dados que chegam */
export const texto = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
export function centavos(v, { min = 0, max = 100_000_000, opcional = false } = {}) {
  if (opcional && (v === null || v === undefined || v === "")) return null;
  const n = Math.round(Number(v) * 100);
  if (!Number.isFinite(n) || n < min * 100 || n > max) throw new Resposta(erro("Valor inválido: " + v));
  return n;
}
export const dataValida = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));
export const agora = () => new Date().toISOString();
export const idNovo = () => b64url(crypto.getRandomValues(new Uint8Array(12))).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);

export function produtoDoBanco(r) {
  const estoque = JSON.parse(r.estoque || "{}");
  return {
    id: r.id, nome: r.nome, cats: JSON.parse(r.cats), preco: r.preco / 100, de: r.de == null ? null : r.de / 100,
    estoque, tam: Object.keys(estoque).map(Number).sort((a, b) => a - b),
    tag: r.tag || "", foto: r.foto || "", custo: r.custo == null ? null : r.custo / 100,
    ordem: r.ordem, ativo: !!r.ativo
  };
}

/* Estoque: { "36": 10, "37": 8 } com tamanhos de 15 a 50 e quantidades inteiras */
export function estoqueValido(e) {
  const out = {};
  if (!e || typeof e !== "object" || Array.isArray(e)) return out;
  for (const [k, v] of Object.entries(e)) {
    const t = Number(k), q = Number(v);
    if (Number.isInteger(t) && t >= 15 && t <= 50 && Number.isInteger(q) && q >= 0 && q <= 100000) out[t] = q;
  }
  return out;
}
