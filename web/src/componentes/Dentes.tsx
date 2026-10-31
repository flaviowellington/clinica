// Desenho dos dentes do odontograma: cada imagem traz 3 vistas empilhadas (de cima, oclusal, de baixo).
import type { ReactNode } from 'react'
import { DENTES_PERMANENTES } from '../../../shared/orcamentos'
import { MEDIDAS } from './medidasDentes'

const IMAGENS = import.meta.glob<string>('../assets/dentes/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})
const imagem = (d: string) => IMAGENS[`../assets/dentes/${d}.png`]
/** [topo, base, coroaX0, coroaY0, coroaX1, coroaY1] da vista v (0 de cima, 1 oclusal, 2 de baixo). */
const vistaDe = (d: string, v: number) => MEDIDAS[d][(2 + v) as 2 | 3 | 4]

export type TipoDenticao = 'PERMANENTE' | 'DECIDUA'
export const decidua = (d: string) => Number(d[0]) >= 5
/** As imagens de decíduos foram desenhadas maiores; a escala deixa os dois tipos do mesmo tamanho. */
const escala = (d: string) => (decidua(d) ? 0.36 : 0.42)

/** Altura de cada linha (vista de cima, oclusal, de baixo): a maior entre todos os dentes. */
export const ALTURAS = [0, 1, 2].map((v) =>
  Math.ceil(
    Math.max(...Object.keys(MEDIDAS).map((d) => (vistaDe(d, v)[1] - vistaDe(d, v)[0]) * escala(d))),
  ),
)

export const larguraDente = (d: string, z: number) => MEDIDAS[d][0] * escala(d) * z

/** Lado direito do paciente: aparece à esquerda da tela. */
export const ladoEsquerdo = (d: string) => [1, 4, 5, 8].includes(Number(d[0]))

/**
 * Dentes de cada arcada (superior, inferior) na ordem da tela.
 * "mista" são os dentes do outro tipo escolhidos em "Dentição mista": substituem o dente
 * da mesma posição (15 ↔ 55); os molares 16 a 18 não têm decíduo e entram a mais.
 */
export function arcada(tipo: TipoDenticao, mista: string[]) {
  const m = new Set(mista)
  return DENTES_PERMANENTES.map((linha) =>
    linha.flatMap((n) => {
      const p = String(n)
      const d = n % 10 <= 5 ? String(n + 40) : null
      if (tipo === 'PERMANENTE') return [d && m.has(d) ? d : p]
      if (!d) return m.has(p) ? [p] : []
      return [m.has(p) ? p : d]
    }),
  )
}

/**
 * Porções clicáveis de uma vista, em pixels da imagem. k é o índice em facesDoDente:
 * 0 borda esquerda, 1 centro da oclusal, 2 borda direita, 3 cervical, 4 vista de baixo, 5 vista de cima.
 */
export function regioes(d: string, v: 0 | 1 | 2) {
  const [topo, base, x0, y0, x1, y1] = vistaDe(d, v)
  const w = x1 - x0
  const h = y1 - y0
  // A caixa da coroa é menor que o desenho: as bordas de fora vão até o fim da imagem
  // (a máscara corta no contorno do dente). Do lado da raiz a borda fica na coroa.
  const r = (k: number, a: number, b: number, c: number, e: number) => ({
    k,
    x0: a === 0 ? 0 : x0 + a * w,
    y0: b === 0 && v !== 0 ? topo : y0 + b * h,
    x1: c === 1 ? MEDIDAS[d][0] : x0 + c * w,
    y1: e === 1 && v !== 2 ? base : y0 + e * h,
  })
  // As porções se encostam: com todas pintadas, a coroa fica cheia, sem frestas.
  const lados = [r(0, 0, 0, 0.25, 1), r(2, 0.75, 0, 1, 1)]
  if (v === 1) return [...lados, r(1, 0.25, 0, 0.75, 1)]
  if (v === 0) return [...lados, r(3, 0.25, 0, 0.75, 0.3), r(5, 0.25, 0.3, 0.75, 1)]
  return [...lados, r(3, 0.25, 0.7, 0.75, 1), r(4, 0.25, 0, 0.75, 0.7)]
}

/** Caixa da coroa (a parte clara, sem a raiz) de uma vista, em pixels da imagem. */
export function coroa(d: string, v: 0 | 1 | 2) {
  const [, , x0, y0, x1, y1] = vistaDe(d, v)
  return { x0, y0, x1, y1 }
}

/** Posição de uma porção em % da imagem, para o estilo do elemento. */
export function posicao(d: string, p: { x0: number; y0: number; x1: number; y1: number }) {
  const [w, h] = MEDIDAS[d]
  const pc = (n: number) => `${n * 100}%`
  return {
    left: pc(p.x0 / w),
    top: pc(p.y0 / h),
    width: pc((p.x1 - p.x0) / w),
    height: pc((p.y1 - p.y0) / h),
  }
}

/**
 * Uma vista do dente numa célula de altura fixa: a de cima encosta a coroa embaixo,
 * a oclusal fica no meio e a de baixo encosta em cima, para as coroas se alinharem.
 * "children" ficam sobre a imagem, recortados no contorno do dente.
 */
export function VistaDente(p: {
  d: string
  v: 0 | 1 | 2
  z: number
  altura: number
  children?: ReactNode
  oculto?: boolean
}) {
  const [w, h] = MEDIDAS[p.d]
  const s = escala(p.d) * p.z
  const [y0, y1] = vistaDe(p.d, p.v)
  const topo =
    p.v === 0 ? p.altura - y1 * s : p.v === 1 ? p.altura / 2 - ((y0 + y1) / 2) * s : -y0 * s
  return (
    <div className="relative overflow-hidden" style={{ width: w * s, height: p.altura }}>
      {!p.oculto && (
        <div className="absolute left-0" style={{ top: topo, width: w * s, height: h * s }}>
          <img
            src={imagem(p.d)}
            alt=""
            draggable={false}
            className="pointer-events-none size-full select-none"
          />
          {p.children && (
            <div
              className="absolute inset-0"
              style={{ maskImage: `url(${imagem(p.d)})`, maskSize: '100% 100%' }}
            >
              {p.children}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
