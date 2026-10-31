import { useState } from 'react'
import { isoLocal, somarDias } from '../api'

/** Minicalendário (lateral da Agenda, data da Agenda 2 e do novo agendamento). */
export function MiniCalendario(props: {
  data: string
  hoje: string
  aoEscolher: (d: string) => void
}) {
  const [mes, setMes] = useState(props.data.slice(0, 7))
  const primeiro = `${mes}-01`
  const inicio = somarDias(primeiro, -new Date(`${primeiro}T12:00:00`).getDay()) // começa no domingo
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i))
  const trocar = (dir: number) => {
    const d = new Date(`${primeiro}T12:00:00`)
    d.setMonth(d.getMonth() + dir)
    setMes(isoLocal(d).slice(0, 7))
  }
  return (
    <div className="cartao p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="px-2 text-suave hover:text-texto"
          onClick={() => trocar(-1)}
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <span className="font-extrabold text-titulo first-letter:uppercase">
          {new Date(`${primeiro}T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <button
          type="button"
          className="px-2 text-suave hover:text-texto"
          onClick={() => trocar(1)}
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="py-1 text-suave">
            {d}
          </span>
        ))}
        {dias.map((d) => (
          <button
            type="button"
            key={d}
            onClick={() => props.aoEscolher(d)}
            aria-label={d.split('-').reverse().join('/')}
            aria-current={d === props.data ? 'date' : undefined}
            className={`m-0.5 rounded-full py-1 ${d === props.data ? 'bg-primaria font-semibold text-sobre-primaria' : d === props.hoje ? 'text-primaria font-semibold' : 'hover:bg-primaria-clara'} ${d.startsWith(mes) ? '' : 'opacity-40'}`}
          >
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  )
}
