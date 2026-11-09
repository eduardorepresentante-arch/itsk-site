// Toda rota /api/admin/* exige sessão de administrador, menos a de entrar.
// Pedidos que alteram dados também precisam vir do próprio site (cabeçalho Origin).
import { sessaoValida, erro, tratar } from "../../_comum.js";

export const onRequest = ctx => tratar(async () => {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("Origin") !== url.origin) return erro("Pedido recusado.", 403);
  }
  if (url.pathname === "/api/admin/entrar") return next();
  if (!env.ADMIN_SENHA) return erro("Senha da administração não configurada na Cloudflare (variável ADMIN_SENHA).", 503);
  if (!(await sessaoValida(request, env))) return erro("Entre com a senha para continuar.", 401);
  return next();
});
