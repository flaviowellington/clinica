import { useEffect, useRef, useState } from 'react'

/** Quadrado escolhido, em pixels da imagem original (o servidor corta e reduz para 400x400). */
export interface Recorte {
  x: number
  y: number
  tamanho: number
}

/** Foto escolhida e ainda não enviada: o arquivo, a URL local e o recorte. */
export interface FotoNova {
  arquivo: File
  url: string
  largura: number
  altura: number
  recorte: Recorte
}

const QUADRO = 260 // quadro fixo do recorte, em px de tela
const MARGEM = 40 // sobra em volta, onde aparece escurecido o que será removido
const PALCO = QUADRO + 2 * MARGEM
const ZOOM_MAXIMO = 4
export const LADO_FINAL = 400

/** Mostra só o pedaço recortado da imagem, num quadrado de `lado` px. */
export function FotoRecortada(props: { foto: FotoNova; lado: number; className?: string }) {
  const { foto, lado } = props
  const escala = lado / foto.recorte.tamanho
  return (
    <span
      className={`relative block shrink-0 overflow-hidden ${props.className ?? ''}`}
      style={{ width: lado, height: lado }}
    >
      <img
        src={foto.url}
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={{
          width: foto.largura * escala,
          height: foto.altura * escala,
          left: -foto.recorte.x * escala,
          top: -foto.recorte.y * escala,
        }}
      />
    </span>
  )
}

/**
 * Ajuste da foto: o quadro tem tamanho fixo; arrasta a imagem e usa o zoom para escolher
 * o que fica. O que está fora do quadro aparece escurecido e será removido.
 */
export function RecorteFoto(props: {
  arquivo: File
  aoConfirmar: (f: FotoNova) => void
  aoCancelar: () => void
}) {
  const [url, setUrl] = useState('')
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  // Posição do canto da imagem em relação ao canto do quadro (sempre <= 0).
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const arrasto = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const usada = useRef(false)
  // URL local da foto; solta se não foi usada (a usada fica viva para a prévia no formulário).
  useEffect(() => {
    const u = URL.createObjectURL(props.arquivo)
    setUrl(u)
    return () => {
      if (!usada.current) URL.revokeObjectURL(u)
    }
  }, [props.arquivo])

  // Escala mínima: a imagem cobre o quadro inteiro.
  const base = natural ? QUADRO / Math.min(natural.w, natural.h) : 1
  const escala = base * zoom
  const w = (natural?.w ?? 0) * escala
  const h = (natural?.h ?? 0) * escala
  const limitar = (x: number, y: number) => ({
    x: Math.min(0, Math.max(QUADRO - w, x)),
    y: Math.min(0, Math.max(QUADRO - h, y)),
  })
  const p = limitar(pos.x, pos.y)

  // Zoom mantendo o centro do quadro no mesmo ponto da imagem.
  const mudarZoom = (z: number) => {
    const novo = Math.min(ZOOM_MAXIMO, Math.max(1, z))
    const f = novo / zoom
    const c = QUADRO / 2
    setZoom(novo)
    setPos({ x: c - (c - p.x) * f, y: c - (c - p.y) * f })
  }

  const recorte = (): Recorte => {
    const n = natural!
    const tamanho = Math.min(n.w, n.h, Math.round(QUADRO / escala))
    return {
      x: Math.min(n.w - tamanho, Math.max(0, Math.round(-p.x / escala))),
      y: Math.min(n.h - tamanho, Math.max(0, Math.round(-p.y / escala))),
      tamanho,
    }
  }
  const atual: FotoNova | null = natural
    ? { arquivo: props.arquivo, url, largura: natural.w, altura: natural.h, recorte: recorte() }
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-center gap-6">
        <div
          role="img"
          aria-label="Área de recorte. Arraste a foto ou use as setas do teclado para posicionar."
          tabIndex={0}
          className="relative cursor-grab touch-none overflow-hidden rounded-2xl bg-superficie-2 select-none active:cursor-grabbing"
          style={{ width: PALCO, height: PALCO }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            arrasto.current = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }
          }}
          onPointerMove={(e) => {
            const a = arrasto.current
            if (a) setPos(limitar(a.px + e.clientX - a.x, a.py + e.clientY - a.y))
          }}
          onPointerUp={() => (arrasto.current = null)}
          onWheel={(e) => mudarZoom(zoom - Math.sign(e.deltaY) * 0.1)}
          onKeyDown={(e) => {
            const passo = e.shiftKey ? 30 : 10
            const d = { ArrowLeft: [passo, 0], ArrowRight: [-passo, 0], ArrowUp: [0, passo], ArrowDown: [0, -passo] }[e.key]
            if (e.key === '+' || e.key === '=') mudarZoom(zoom + 0.2)
            else if (e.key === '-') mudarZoom(zoom - 0.2)
            else if (!d) return
            else setPos(limitar(p.x + d[0], p.y + d[1]))
            e.preventDefault()
          }}
        >
          <img
            src={url || undefined}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth: nw, naturalHeight: nh } = e.currentTarget
              setNatural({ w: nw, h: nh })
              // Começa centralizada.
              const s = QUADRO / Math.min(nw, nh)
              setPos({ x: (QUADRO - nw * s) / 2, y: (QUADRO - nh * s) / 2 })
            }}
            className={`pointer-events-none absolute max-w-none ${natural ? '' : 'invisible'}`}
            style={{ width: w || undefined, height: h || undefined, left: MARGEM + p.x, top: MARGEM + p.y }}
          />
          {/* O quadro: fora dele fica escurecido (será removido). */}
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-xl border-2 border-white shadow-[0_0_0_999px_rgb(0_0_0/0.6)]"
            style={{ left: MARGEM, top: MARGEM, width: QUADRO, height: QUADRO }}
          >
            {/* Grade de terços para ajudar a centralizar o rosto. */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="border border-white/25" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-bold tracking-wide text-suave uppercase">Resultado</p>
          {atual ? (
            <>
              <FotoRecortada foto={atual} lado={112} className="rounded-2xl border border-borda" />
              <FotoRecortada foto={atual} lado={48} className="rounded-xl border border-borda" />
            </>
          ) : (
            <span className="size-28 rounded-2xl bg-superficie-2" />
          )}
          <p className="text-center text-xs text-suave">
            {LADO_FINAL} × {LADO_FINAL} px
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="botao-leve botao-icone"
          aria-label="Diminuir zoom"
          onClick={() => mudarZoom(zoom - 0.2)}
          disabled={zoom <= 1}
        >
          −
        </button>
        <input
          type="range"
          min={1}
          max={ZOOM_MAXIMO}
          step={0.01}
          value={zoom}
          onChange={(e) => mudarZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="flex-1"
        />
        <button
          type="button"
          className="botao-leve botao-icone"
          aria-label="Aumentar zoom"
          onClick={() => mudarZoom(zoom + 0.2)}
          disabled={zoom >= ZOOM_MAXIMO}
        >
          +
        </button>
      </div>
      <p className="ajuda mt-0">
        Arraste a foto para posicionar. O que fica fora do quadro (escurecido) será removido, e a
        foto é reduzida para {LADO_FINAL} × {LADO_FINAL} px.
      </p>

      <div className="flex justify-end gap-2 border-t border-borda pt-4">
        <button type="button" className="botao-leve" onClick={props.aoCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="botao"
          disabled={!atual}
          onClick={() => {
            usada.current = true
            props.aoConfirmar(atual!)
          }}
        >
          Usar esta foto
        </button>
      </div>
    </div>
  )
}
