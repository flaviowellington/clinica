import type { CSSProperties } from 'react'
import timbrado from '../assets/timbrado.png'
import arteAtestado from '../assets/arte-atestado.png'
import arteDeclaracao from '../assets/arte-declaracao.png'

/**
 * Arte impressa de cada documento (os PDFs da clínica, com o miolo em branco): tamanho do
 * papel em mm e onde o texto começa (% da largura). Atestado e declaração já trazem o título.
 */
const ARTES = {
  receita: { imagem: timbrado, largura: 148, altura: 210, topo: 19, titulo: true },
  atestado: { imagem: arteAtestado, largura: 148, altura: 210, topo: 22, titulo: false },
  comparecimento: { imagem: arteDeclaracao, largura: 140, altura: 100, topo: 23, titulo: false },
}
/** Documento padrão da clínica usa o papel timbrado do receituário. */
const arteDe = (modelo: string) => ARTES[modelo as keyof typeof ARTES] ?? ARTES.receita

/** Tamanho do papel do documento, para o @page da impressão. */
export const papelDe = (modelo: string) => {
  const a = arteDe(modelo)
  return `${a.largura}mm ${a.altura}mm`
}

/** Folha com a arte da clínica; o texto fica na área branca do meio. */
export function FolhaTimbrada(props: {
  modelo: string
  titulo: string
  texto: string
  className?: string
}) {
  const a = arteDe(props.modelo)
  return (
    <article
      style={
        { aspectRatio: `${a.largura}/${a.altura}`, '--largura': `${a.largura}mm` } as CSSProperties
      }
      className={`relative mx-auto w-full max-w-(--largura) overflow-hidden bg-white text-black shadow-lg [container-type:inline-size] ${props.className ?? ''}`}
    >
      <img src={a.imagem} alt="" className="absolute inset-0 h-full w-full" />
      <div className="relative px-[10%]" style={{ paddingTop: `${a.topo}%` }}>
        {a.titulo && (
          <h1 className="mb-[4cqw] text-center text-[3.4cqw] font-bold text-black uppercase">
            {props.titulo}
          </h1>
        )}
        <p className="text-[2.5cqw] leading-normal whitespace-pre-wrap">{props.texto}</p>
      </div>
    </article>
  )
}
