// Login do administrador (e-mail em ADMIN_EMAIL, senha em ADMIN_SENHA, ambos configurados na Cloudflare).
// Proteção contra adivinhar a senha: 5 erros seguidos bloqueiam aquele endereço por 15 minutos, e
// 30 erros no total (de qualquer endereço) em 15 minutos bloqueiam o login de todos por 15 minutos.
import { banco, json, erro, tratar, iguais, criarSessao, apagarSessao, sessaoValida, senhaFraca } from "../../_comum.js";

const LIMITE_IP = 5;
const LIMITE_GERAL = 30;
const JANELA = 15 * 60e3;
const espera = ms => new Promise(r => setTimeout(r, ms));

async function bloqueado(db, chave, limite) {
  const t = await db.prepare("SELECT n, ate FROM tentativas WHERE ip = ?").bind(chave).first();
  return t && t.ate > Date.now() && t.n >= limite ? t : null;
}
const somarErro = (db, chave) => db.prepare(`INSERT INTO tentativas (ip, n, ate) VALUES (?1, 1, ?2)
  ON CONFLICT(ip) DO UPDATE SET n = CASE WHEN ate > ?3 THEN n + 1 ELSE 1 END, ate = ?2`).bind(chave, Date.now() + JANELA, Date.now());

export const onRequestPost = ({ request, env }) => tratar(async () => {
  if (!env.ADMIN_SENHA) return erro("Senha da administração não configurada na Cloudflare (variável ADMIN_SENHA).", 503);
  const db = await banco(env);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const b = (await bloqueado(db, "ip:" + ip, LIMITE_IP)) || (await bloqueado(db, "geral", LIMITE_GERAL));
  if (b) return erro(`Muitas tentativas. Tente de novo em ${Math.ceil((b.ate - Date.now()) / 60e3)} min.`, 429);
  let senha = "", email = "";
  try {
    const corpo = await request.json();
    senha = String(corpo.senha || "").slice(0, 200);
    email = String(corpo.email || "").trim().toLowerCase().slice(0, 200);
  } catch { /* corpo inválido */ }
  const emailOk = !env.ADMIN_EMAIL || await iguais(email, String(env.ADMIN_EMAIL).trim().toLowerCase());
  const senhaOk = !!senha && await iguais(senha, env.ADMIN_SENHA);
  if (!emailOk || !senhaOk) {
    await db.batch([somarErro(db, "ip:" + ip), somarErro(db, "geral")]);
    await espera(800); // deixa cada tentativa errada mais lenta
    return erro("E-mail ou senha incorretos.", 401);
  }
  await db.prepare("DELETE FROM tentativas WHERE ip = ?").bind("ip:" + ip).run();
  return json({ ok: true }, 200, { "Set-Cookie": await criarSessao(db, env, ip) });
});

// Confere se a sessão ainda vale (a página de administração chama ao abrir)
export const onRequestGet = ({ request, env }) => tratar(async () => {
  const ok = await sessaoValida(request, env);
  return json(ok ? { ok, senhaFraca: senhaFraca(env) } : { ok });
});

// Sair: apaga a sessão no banco e o cookie no navegador
export const onRequestDelete = ({ request, env }) => tratar(async () => {
  const db = await banco(env);
  return json({ ok: true }, 200, { "Set-Cookie": await apagarSessao(db, request) });
});
