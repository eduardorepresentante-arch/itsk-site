// Recebe uma foto por pedido (corpo = a imagem, já reduzida no navegador).
// O tipo é conferido pelos primeiros bytes do arquivo, não pelo que o navegador diz.
import { banco, json, erro, tratar, idNovo, agora, MAX_FOTO } from "../../_comum.js";

function tipoReal(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  const txt = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length > 12 && txt(0, 4) === "RIFF" && txt(8, 4) === "WEBP") return "image/webp";
  return null;
}

export const onRequestPost = ({ request, env }) => tratar(async () => {
  const tamanho = Number(request.headers.get("Content-Length") || 0);
  if (tamanho > MAX_FOTO) return erro("Foto grande demais (máximo 1,8 MB depois de reduzida).", 413);
  const dados = new Uint8Array(await request.arrayBuffer());
  if (!dados.byteLength) return erro("Foto vazia.");
  if (dados.byteLength > MAX_FOTO) return erro("Foto grande demais (máximo 1,8 MB depois de reduzida).", 413);
  const tipo = tipoReal(dados);
  if (!tipo) return erro("Envie fotos JPG, PNG ou WEBP.", 415);
  const db = await banco(env);
  const id = idNovo();
  await db.prepare("INSERT INTO fotos (id, tipo, dados, criado) VALUES (?, ?, ?, ?)").bind(id, tipo, dados.buffer, agora()).run();
  return json({ id, url: "/fotos/" + id }, 201);
});
