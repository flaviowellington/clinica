// Desenho das arcadas (permanente e decídua) no documento que o paciente assina. Cada dente do
// plano é coberto pelo seu recorte pintado (shared/arcadas/dentes/<n>.png, gerado por
// shared/arcadas/gerar.mjs), posto na caixa abaixo: [x, y, largura, altura] em pixels da imagem.
// Dentição mista funciona sozinha: os permanentes vão na primeira arcada e os decíduos na segunda.
// ponytail: o 18, 28, 38 e 48 não estão no desenho; aparecem só no texto dos procedimentos.

type Caixa = [number, number, number, number]

export const ARCADAS = {
  permanente: {
    nome: 'Dentição permanente',
    largura: 411,
    altura: 577,
    dentes: {
      11: [164, 38, 39, 51],
      12: [131, 43, 40, 49],
      13: [105, 62, 41, 46],
      14: [77, 82, 47, 45],
      15: [58, 113, 42, 42],
      16: [44, 146, 40, 42],
      17: [30, 181, 38, 44],
      21: [198, 39, 37, 52],
      22: [226, 44, 39, 48],
      23: [251, 64, 42, 45],
      24: [274, 84, 45, 45],
      25: [297, 114, 41, 42],
      26: [313, 147, 37, 43],
      27: [326, 182, 39, 45],
      31: [196, 499, 33, 39],
      32: [222, 498, 35, 39],
      33: [251, 492, 34, 38],
      34: [275, 475, 37, 43],
      35: [292, 450, 45, 45],
      36: [313, 410, 42, 46],
      37: [319, 364, 48, 54],
      41: [167, 499, 33, 39],
      42: [139, 495, 34, 42],
      43: [114, 484, 32, 41],
      44: [87, 470, 38, 42],
      45: [60, 444, 46, 45],
      46: [45, 410, 42, 45],
      47: [33, 366, 46, 53],
    },
  },
  decidua: {
    nome: 'Dentição decídua',
    largura: 385,
    altura: 520,
    dentes: {
      51: [138, 41, 44, 46],
      52: [104, 67, 34, 36],
      53: [76, 92, 38, 42],
      54: [50, 129, 43, 47],
      55: [35, 182, 48, 52],
      61: [190, 41, 44, 46],
      62: [232, 63, 33, 36],
      63: [253, 84, 40, 44],
      64: [269, 122, 50, 47],
      65: [287, 173, 43, 51],
      71: [190, 449, 38, 33],
      72: [230, 436, 42, 37],
      73: [262, 405, 40, 47],
      74: [276, 370, 49, 49],
      75: [289, 321, 49, 50],
      81: [148, 450, 38, 33],
      82: [105, 436, 42, 37],
      83: [72, 407, 41, 46],
      84: [48, 367, 49, 49],
      85: [37, 323, 45, 48],
    },
  },
} satisfies Record<
  string,
  { nome: string; largura: number; altura: number; dentes: Record<number, Caixa> }
>

export type TipoArcada = keyof typeof ARCADAS

/** Números dos dentes do plano ("16MO" → "16"), sem repetir. */
export const dentesDoPlano = (itens: { dentes: string[] }[]) =>
  new Set(itens.flatMap((i) => i.dentes.map((d) => d.slice(0, 2))))

/** Dentes do plano que aparecem numa arcada, com a caixa de cada um. */
export const marcadosNa = (tipo: TipoArcada, plano: Set<string>) =>
  Object.entries(ARCADAS[tipo].dentes as Record<string, Caixa>).filter(([n]) => plano.has(n))
