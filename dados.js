/* ============================================================
   DADOS DA ITSK: troque aqui e o site inteiro se atualiza.
   Campo vazio ("") esconde o link ou a informação no site.
   ============================================================ */
const LOJA = {
  nome: "ITSK Studio and Second",
  // WhatsApp com DDI 55 + DDD + número, só dígitos  (PREENCHER COM O NÚMERO DA LOJA)
  whatsapp: "",
  whatsappTexto: "",
  instagram: "", // ex.: "https://instagram.com/itsk"
  endereco: "",
  referencia: "",
  horario: "",
  mapa: "",
  cnpj: "",
  parcelas: 3 // parcelas sem juros mostradas nas peças (0 esconde)
};

/* As duas abas do site. Toda peça leva "studio" ou "second" nas categorias. */
const COLECOES = {
  studio: {
    nome: "Studio",
    sub: "New collection",
    titulo: "A nova coleção",
    intro: "Lançamentos femininos, alfaiataria, vestidos e peças-chave da estação."
  },
  second: {
    nome: "Second",
    sub: "Pre-loved collection",
    titulo: "Brechó premium",
    intro: "Seminovas selecionadas, vintage, bolsas e marcas premium. Cada peça é única: quando sai, não volta."
  }
};

/* Categorias (a chave é usada no banco; o nome aparece no site).
   Para mudar, troque aqui, em functions/_comum.js (CATEGORIAS) e em admin/admin.js (NOMES_CAT). */
const CATEGORIAS = {
  studio: "Studio (nova coleção)",
  second: "Second (brechó)",
  vestidos: "Vestidos",
  alfaiataria: "Alfaiataria",
  blusas: "Blusas e camisas",
  saias: "Saias e calças",
  tricot: "Tricot",
  vintage: "Vintage",
  premium: "Marcas premium",
  bolsas: "Bolsas",
  acessorios: "Acessórios"
};

/* Tamanhos: o banco guarda números; o site mostra as letras.
   15 = Tamanho único (bolsas e acessórios). Outros números aparecem como número. */
const TAMANHOS = { 15: "Único", 36: "PP", 38: "P", 40: "M", 42: "G", 44: "GG", 46: "XG" };
const rotuloTam = t => TAMANHOS[t] || String(t);

/* VITRINE DE DEMONSTRAÇÃO: aparece enquanto o painel (admin) não tiver peças cadastradas.
   PREÇOS, NOMES E MARCAS DE EXEMPLO: troque pelas peças reais no painel antes de divulgar.
   "forma" escolhe o desenho usado enquanto a peça não tem foto: vestido, blazer, blusa, saia, calca, bolsa, tricot, acessorio. */
const U = [15], GRADE = [36, 38, 40, 42, 44];
const PRODUTOS_PADRAO = [
  // STUDIO
  { id: "st-vestido-midi-off", nome: "Vestido Midi Off-White", cats: ["studio", "vestidos"], por: 459.9, tag: "Nova coleção", tam: GRADE, forma: "vestido", tom: "#EFE8DC" },
  { id: "st-blazer-alongado", nome: "Blazer Alongado Areia", cats: ["studio", "alfaiataria"], por: 589.9, tag: "Mais desejado", tam: GRADE, forma: "blazer", tom: "#D9CBB5" },
  { id: "st-camisa-seda", nome: "Camisa de Seda Preta", cats: ["studio", "blusas"], por: 329.9, tam: [36, 38, 40, 42], forma: "blusa", tom: "#2A2826" },
  { id: "st-calca-pantalona", nome: "Calça Pantalona Alfaiataria", cats: ["studio", "alfaiataria", "saias"], por: 389.9, tam: GRADE, forma: "calca", tom: "#BFAE96" },
  { id: "st-saia-plissada", nome: "Saia Midi Plissada Bege", cats: ["studio", "saias"], por: 299.9, tag: "Nova coleção", tam: [36, 38, 40, 42], forma: "saia", tom: "#E3D5C0" },
  { id: "st-tricot-gola", nome: "Tricot Gola Alta Off", cats: ["studio", "tricot"], por: 349.9, tam: [38, 40, 42], forma: "tricot", tom: "#F1ECE3" },
  { id: "st-vestido-longo-preto", nome: "Vestido Longo Preto Fluido", cats: ["studio", "vestidos"], por: 529.9, tam: GRADE, forma: "vestido", tom: "#1E1C1B" },
  { id: "st-colete-alfaiataria", nome: "Colete Alfaiataria Cru", cats: ["studio", "alfaiataria", "blusas"], por: 279.9, tam: [36, 38, 40], forma: "blusa", tom: "#E8DFD0" },
  // SECOND
  { id: "sc-bolsa-couro-caramelo", nome: "Bolsa de Couro Caramelo", cats: ["second", "bolsas", "premium"], por: 890, de: 2400, tag: "Seminova · Excelente estado", tam: U, forma: "bolsa", tom: "#B48A62" },
  { id: "sc-blazer-vintage-xadrez", nome: "Blazer Vintage Anos 90", cats: ["second", "vintage", "alfaiataria"], por: 240, tag: "Vintage · Peça única", tam: [40], forma: "blazer", tom: "#8E8578" },
  { id: "sc-vestido-seda-floral", nome: "Vestido de Seda Estampado", cats: ["second", "vestidos", "premium"], por: 420, de: 1290, tag: "Seminova · Marca premium", tam: [38], forma: "vestido", tom: "#D8C6AE" },
  { id: "sc-lenco-seda", nome: "Lenço de Seda Vintage", cats: ["second", "acessorios", "vintage"], por: 160, tag: "Vintage · Peça única", tam: U, forma: "acessorio", tom: "#C9B08E" },
  { id: "sc-camisa-linho", nome: "Camisa de Linho Off", cats: ["second", "blusas"], por: 130, tag: "Seminova", tam: [40], forma: "blusa", tom: "#F0E9DD" },
  { id: "sc-bolsa-preta-classica", nome: "Bolsa Preta Clássica", cats: ["second", "bolsas", "premium"], por: 1450, de: 3800, tag: "Seminova · Com dust bag", tam: U, forma: "bolsa", tom: "#1F1D1C" },
  { id: "sc-saia-couro", nome: "Saia Midi de Couro", cats: ["second", "saias", "vintage"], por: 210, tag: "Vintage · Peça única", tam: [38], forma: "saia", tom: "#3A2F28" },
  { id: "sc-cardigan-tricot", nome: "Cardigan Tricot Bege", cats: ["second", "tricot"], por: 150, tag: "Seminova", tam: [42], forma: "tricot", tom: "#D7C7AF" }
];
