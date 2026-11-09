# ITSK Studio and Second: site + administração

Boutique 100% feminina com duas abas: **STUDIO** (nova coleção) e **SECOND** (brechó).
Feito a partir da base de loja (Cloudflare Pages + banco D1), com o painel em `seusite/admin/`.

## O que trocar antes de divulgar
1. `dados.js` → `LOJA`: WhatsApp (55 + DDD + número, só dígitos), Instagram, endereço, horário, CNPJ.
   Sem WhatsApp preenchido, os botões avisam que o número ainda vai ser configurado.
2. As peças que aparecem hoje são **de demonstração** (nomes, preços e desenhos de exemplo).
   Assim que houver peças cadastradas no painel, o site mostra só as reais.

## Cadastrar peças no painel
- Envie as fotos (em pé, 3:4). Em cada peça marque **Studio** ou **Second** e a categoria
  (Vestidos, Alfaiataria, Bolsas, Vintage...).
- Tamanhos: PP, P, M, G, GG, XG ou **Único** (bolsas e acessórios). Digite quantas peças tem.
- No Second, use a "etiqueta" para o estado: ex. "Seminova · Excelente estado", "Vintage · Peça única".
- "Preço anterior" no Second aparece como "Original R$ ..." (preço da peça nova na loja de origem).

## Vídeo de fundo
`video/itsk-fundo.mp4` e `.webm`, sem áudio, tocando atrás do site inteiro.

## Publicar (igual às outras lojas)
GitHub + Cloudflare Pages + banco D1 com o nome `DB` + segredos `ADMIN_EMAIL` e `ADMIN_SENHA`.
