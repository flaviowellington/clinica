// Calendário de intervalo do Financeiro (De/Até em dois cliques + "Ver todo o período").
import { useState, type ComponentProps } from 'react'
import { isoLocal, somarDias } from '../api'
import { Icone } from './Icones'

export const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]
/** "01 nov 2026" */
export const dataCurta = (iso: string) =>
  `${iso.slice(8)} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
export const meio = (iso: string) => new Date(`${iso}T12:00:00`)
/**
 * Calendário de intervalo: dois cliques em dias quaisquer escolhem De e Até.
 * Trocar o mês exibido não muda o intervalo.
 */
export function CalendarioIntervalo(props: {
  de: string
  ate: string
  pendente: string | null
  tudo: boolean
  hoje: string
  aoClicar: (dia: string) => void
  aoVerTudo: () => void
}) {
  const [mes, setMes] = useState(props.de.slice(0, 7))
  const primeiro = `${mes}-01`
  const inicio = somarDias(primeiro, -meio(primeiro).getDay()) // começa no domingo, como na Agenda
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i))
  const trocar = (n: number) => {
    const d = meio(primeiro)
    d.setMonth(d.getMonth() + n)
    setMes(isoLocal(d).slice(0, 7))
  }
  const nomeMes = meio(primeiro).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const [ini, fim] = props.pendente ? [props.pendente, null] : [props.de, props.ate]
  const marcado = !props.tudo

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-suave hover:bg-primaria-clara hover:text-texto"
            onClick={() => trocar(-1)}
            aria-label="Mês anterior"
          >
            <Icone nome="esquerda" className="h-4 w-4" />
          </button>
          <h2 className="text-base first-letter:uppercase" aria-live="polite">
            {nomeMes}
          </h2>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-suave hover:bg-primaria-clara hover:text-texto"
            onClick={() => trocar(1)}
            aria-label="Próximo mês"
          >
            <Icone nome="direita" className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-extrabold text-suave">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <span key={i} className="py-1" aria-hidden="true">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {dias.map((d) => {
            const ponta = marcado && (d === ini || d === fim)
            const dentro = marcado && !!fim && d > ini && d < fim
            const raio = ponta
              ? !fim || ini === fim
                ? 'rounded-full'
                : d === ini
                  ? 'rounded-l-full'
                  : 'rounded-r-full'
              : dentro
                ? ''
                : 'rounded-lg'
            const cor = ponta
              ? 'bg-primaria text-sobre-primaria'
              : dentro
                ? 'bg-primaria-clara text-titulo'
                : d.startsWith(mes)
                  ? 'text-texto hover:bg-primaria-clara'
                  : 'font-semibold text-suave hover:bg-primaria-clara'
            return (
              <button
                type="button"
                key={d}
                onClick={() => props.aoClicar(d)}
                aria-label={`${d.split('-').reverse().join('/')}${d === props.hoje ? ', hoje' : ''}`}
                aria-pressed={ponta || dentro}
                aria-current={d === props.hoje ? 'date' : undefined}
                className={`h-9 text-sm font-bold ${raio} ${cor} ${d === props.hoje && !ponta ? 'ring-2 ring-primaria ring-inset' : ''}`}
              >
                {Number(d.slice(8))}
              </button>
            )
          })}
        </div>
      </div>

      <div
        className={`grid grid-cols-2 gap-2 border-t border-borda pt-3 ${props.tudo ? 'opacity-45' : ''}`}
        aria-live="polite"
      >
        <div className="rounded-xl border-2 border-transparent bg-superficie-2 px-2.5 py-1.5">
          <span className="block text-[0.7rem] font-extrabold tracking-wider text-suave uppercase">
            De
          </span>
          <span className="font-extrabold text-titulo tabular-nums">{dataCurta(ini)}</span>
        </div>
        <div
          className={`rounded-xl border-2 px-2.5 py-1.5 ${fim ? 'border-transparent bg-superficie-2' : 'border-dashed border-primaria bg-superficie'}`}
        >
          <span className="block text-[0.7rem] font-extrabold tracking-wider text-suave uppercase">
            Até
          </span>
          <span className={`font-extrabold tabular-nums ${fim ? 'text-titulo' : 'text-primaria'}`}>
            {fim ? dataCurta(fim) : 'Escolha o dia'}
          </span>
        </div>
      </div>

      <button
        type="button"
        aria-pressed={props.tudo}
        onClick={props.aoVerTudo}
        className={`h-10 w-full rounded-xl border-2 font-bold ${props.tudo ? 'border-primaria bg-primaria-clara text-titulo' : 'border-borda bg-superficie hover:border-primaria/50 hover:bg-primaria-clara'}`}
      >
        Ver todo o período
      </button>
    </div>
  )
}

/** Cartão de período da lateral: no celular fica recolhido, mostrando só o resumo. */
export function CartaoPeriodo({
  resumo,
  ...cal
}: { resumo: string } & ComponentProps<typeof CalendarioIntervalo>) {
  const [aberto, setAberto] = useState(false) // só no celular; no computador fica sempre aberto
  return (
    <section className="cartao overflow-hidden p-0" aria-label="Período">
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left lg:hidden"
        aria-expanded={aberto}
        aria-controls="calendario-periodo"
        onClick={() => setAberto(!aberto)}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primaria-clara text-primaria">
          <Icone nome="agenda" className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-[0.7rem] font-extrabold tracking-wider text-suave uppercase">
            Período
          </span>
          <span className="font-extrabold text-titulo">{resumo}</span>
        </span>
        <Icone
          nome="direita"
          className={`h-4 w-4 text-suave transition-transform ${aberto ? '-rotate-90' : 'rotate-90'}`}
        />
      </button>
      <div
        id="calendario-periodo"
        className={`border-t border-borda p-3.5 lg:block lg:border-0 ${aberto ? '' : 'hidden'}`}
      >
        <CalendarioIntervalo {...cal} />
      </div>
    </section>
  )
}
