// Serve as fotos enviadas pela administração. O endereço de cada foto nunca muda, então pode ficar em cache.
import { banco, tratar } from "../_comum.js";

export const onRequestGet = ({ params, env, request, waitUntil }) => tratar(async () => {
  const id = String(params.id || "");
  if (!/^[a-z0-9]{8,32}$/.test(id)) return new Response("Foto não encontrada", { status: 404 });
  const cache = caches.default;
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  const db = await banco(env);
  const r = await db.prepare("SELECT tipo, dados FROM fotos WHERE id = ?").bind(id).first();
  if (!r) return new Response("Foto não encontrada", { status: 404 });
  const resp = new Response(new Uint8Array(r.dados), {
    headers: {
      "Content-Type": ["image/jpeg", "image/png", "image/webp"].includes(r.tipo) ? r.tipo : "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-site"
    }
  });
  waitUntil(cache.put(request, resp.clone()));
  return resp;
});
