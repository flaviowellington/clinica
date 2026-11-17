// Gera o recorte pintado de cada dente das arcadas (dentes/<n>.png) e imprime as caixas para
// shared/arcadas.ts. Rodar de novo só se trocar a cor ou o desenho:
//   node shared/arcadas/gerar.mjs
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const COR = [0x67, 0x0f, 0xce] // --primaria (claro)
const aqui = (f) => fileURLToPath(new URL(f, import.meta.url))

// Ordem dos dentes: centro aproximado de cada um no desenho, para dar o número à mancha.
const CENTROS = {
  permanente: {
    11: [183, 62],
    12: [152, 68],
    13: [125, 84],
    14: [99, 105],
    15: [79, 133],
    16: [64, 166],
    17: [49, 204],
    21: [216, 63],
    22: [244, 68],
    23: [272, 86],
    24: [297, 106],
    25: [317, 134],
    26: [331, 167],
    27: [345, 205],
    31: [212, 519],
    32: [238, 517],
    33: [266, 510],
    34: [292, 495],
    35: [315, 471],
    36: [333, 432],
    37: [342, 389],
    41: [183, 519],
    42: [156, 515],
    43: [130, 504],
    44: [106, 491],
    45: [82, 466],
    46: [65, 432],
    47: [56, 390],
  },
  decidua: {
    51: [162, 63],
    52: [123, 84],
    53: [95, 113],
    54: [72, 153],
    55: [59, 209],
    61: [209, 63],
    62: [246, 81],
    63: [272, 106],
    64: [294, 146],
    65: [309, 197],
    71: [208, 465],
    72: [250, 454],
    73: [281, 427],
    74: [300, 393],
    75: [313, 344],
    81: [167, 465],
    82: [126, 453],
    83: [93, 429],
    84: [72, 391],
    85: [59, 346],
  },
}

mkdirSync(aqui('dentes'), { recursive: true })
for (const [arcada, centros] of Object.entries(CENTROS)) {
  const { data: px, info } = await sharp(aqui(`${arcada}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const rgba = (i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]]
  const branco = (i) => {
    const [r, g, b, a] = rgba(i)
    return a > 50 && r > 200 && g > 200 && b > 200
  }
  // Gengiva (vermelha) e fundo transparente: o dente nunca avança sobre eles.
  const fora = (i) => {
    const [r, g, , a] = rgba(i)
    return a < 50 || (r > 140 && r - g > 60)
  }
  const vizinhos = (p) => {
    const x = p % W
    return [x > 0 && p - 1, x < W - 1 && p + 1, p >= W && p - W, p < W * (H - 1) && p + W].filter(
      (q) => q !== false,
    )
  }

  // Manchas brancas que não tocam a borda: uma por dente.
  const rotulo = new Int32Array(W * H)
  const manchas = []
  for (let s = 0; s < W * H; s++) {
    if (!branco(s) || rotulo[s]) continue
    const id = manchas.length + 1
    const pilha = [s]
    const pontos = []
    rotulo[s] = id
    let borda = false
    while (pilha.length) {
      const p = pilha.pop()
      pontos.push(p)
      const x = p % W
      const y = (p / W) | 0
      if (!x || !y || x === W - 1 || y === H - 1) borda = true
      for (const q of vizinhos(p))
        if (branco(q) && !rotulo[q]) {
          rotulo[q] = id
          pilha.push(q)
        }
    }
    if (!borda && pontos.length > 150) manchas.push(pontos)
  }

  const caixas = {}
  for (const [n, [cx, cy]] of Object.entries(centros)) {
    // A mancha cujo centro fica mais perto.
    const centro = (m) => [
      m.reduce((s, p) => s + (p % W), 0) / m.length,
      m.reduce((s, p) => s + ((p / W) | 0), 0) / m.length,
    ]
    const dist = (m) => Math.hypot(centro(m)[0] - cx, centro(m)[1] - cy)
    const mancha = manchas.reduce((a, b) => (dist(a) < dist(b) ? a : b))
    if (dist(mancha) > 15) throw new Error(`Dente ${n} não encontrado em ${arcada}`)

    const dente = new Uint8Array(W * H)
    for (const p of mancha) dente[p] = 1
    // Sulcos e traços de dentro: tudo o que a borda não alcança sem passar pelo dente.
    let x0 = W,
      y0 = H,
      x1 = 0,
      y1 = 0
    for (const p of mancha) {
      x0 = Math.min(x0, p % W)
      x1 = Math.max(x1, p % W)
      y0 = Math.min(y0, (p / W) | 0)
      y1 = Math.max(y1, (p / W) | 0)
    }
    x0--
    y0--
    x1++
    y1++
    const visto = new Uint8Array(W * H)
    const pilha = []
    for (let x = x0; x <= x1; x++) pilha.push(y0 * W + x, y1 * W + x)
    for (let y = y0; y <= y1; y++) pilha.push(y * W + x0, y * W + x1)
    while (pilha.length) {
      const p = pilha.pop()
      if (visto[p] || dente[p]) continue
      visto[p] = 1
      for (const q of vizinhos(p)) {
        const x = q % W
        const y = (q / W) | 0
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) pilha.push(q)
      }
    }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (!visto[y * W + x]) dente[y * W + x] = 1
    // Inclui o contorno (até 3 px), sem passar para a gengiva.
    for (let k = 0; k < 3; k++) {
      const novos = []
      for (let p = 0; p < W * H; p++)
        if (dente[p]) for (const q of vizinhos(p)) if (!dente[q] && !fora(q)) novos.push(q)
      for (const q of novos) dente[q] = 1
    }

    // Recorte: os pixels do dente multiplicados pela cor (os traços do desenho continuam).
    x0 = W
    y0 = H
    x1 = 0
    y1 = 0
    for (let p = 0; p < W * H; p++)
      if (dente[p]) {
        x0 = Math.min(x0, p % W)
        x1 = Math.max(x1, p % W)
        y0 = Math.min(y0, (p / W) | 0)
        y1 = Math.max(y1, (p / W) | 0)
      }
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    const saida = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (y0 + y) * W + x0 + x
        if (!dente[p]) continue
        const [r, g, b] = rgba(p)
        const o = (y * w + x) * 4
        // Clareia um pouco a cor para os traços do desenho continuarem visíveis.
        COR.forEach((c, i) => (saida[o + i] = ([r, g, b][i] * (c + (255 - c) * 0.15)) / 255))
        saida[o + 3] = 255
      }
    await sharp(saida, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(aqui(`dentes/${n}.png`))
    caixas[n] = [x0, y0, w, h]
  }
  console.log(arcada, W, H, JSON.stringify(caixas))
}
