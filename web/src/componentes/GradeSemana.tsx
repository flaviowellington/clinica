import { useEffect, useState, type ReactNode } from 'react'
import { DIAS_SEMANA, HORARIOS, celulaSemana, celulasEntre } from '../../../shared/agenda'

/** Cores da grade semanal: cada horário é um quadrinho com a hora escrita. */
export const COR_SEMANA = {
  livre: 'border-borda bg-superficie text-texto',
  profissional: 'border-perigo bg-perigo text-white',
  clinica: 'border-suave bg-suave text-superficie',
}
type Cor = 'profissional' | 'clinica'

/**
 * Semana fixa (segunda a sábado), um quadrinho por horário. Mesmo jeito de escolher da nova
 * consulta: 1º clique no início, 2º no fim (pode ser em outro dia) e a faixa toda muda.
 * Começou num horário livre, marca; num marcado, libera. "travados" aparecem na cor da
 * clínica e não mudam.
 */
export function GradeSemana(props: {
  marcados: Set<string>
  aoMudar: (s: Set<string>) => void
  cor: Cor
  travados?: Set<string>
  editavel: boolean
  dica: string
}) {
  const travados = props.travados ?? new Set<string>()
  const [ancora, setAncora] = useState('')
  const [sobre, setSobre] = useState('')

  // Esc desiste da faixa começada.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAncora('')
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const marcando = !!ancora && !props.marcados.has(ancora)
  const previa = new Set(ancora && sobre ? celulasEntre(ancora, sobre) : [])

  function clicar(c: string) {
    if (!ancora) return setAncora(c)
    const novo = new Set(props.marcados)
    for (const x of celulasEntre(ancora, c)) {
      if (travados.has(x)) continue
      if (marcando) novo.add(x)
      else novo.delete(x)
    }
    props.aoMudar(novo)
    setAncora('')
  }

  const livres = (d: number) =>
    HORARIOS.filter((h) => {
      const c = celulaSemana(d, h)
      return !props.marcados.has(c) && !travados.has(c)
    }).length / 4

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-suave">
        <Legenda classe={COR_SEMANA.livre}>Disponível</Legenda>
        <Legenda classe={COR_SEMANA[props.cor]}>
          {props.cor === 'profissional' ? 'Profissional não atende' : 'Clínica sem atendimento'}
        </Legenda>
        {props.travados && <Legenda classe={COR_SEMANA.clinica}>Clínica sem atendimento</Legenda>}
      </div>

      <p
        aria-live="polite"
        className={`rounded-xl px-3 py-2 text-sm ${ancora ? 'bg-primaria-clara font-bold text-primaria' : 'bg-superficie-2 text-suave'}`}
      >
        {!props.editavel
          ? 'Só o administrador altera estes horários.'
          : ancora
            ? `${marcando ? 'Marcando' : 'Liberando'} a partir de ${DIAS_SEMANA[Number(ancora[0]) - 1].toLowerCase()} ${ancora.slice(2)}. Agora clique no último horário (Esc cancela).`
            : props.dica}
      </p>

      <div className="overflow-x-auto">
        <div className="grid min-w-[440px] grid-cols-6 gap-x-1.5" onMouseLeave={() => setSobre('')}>
          {DIAS_SEMANA.map((nome, i) => {
            const d = i + 1
            return (
              <div key={nome} className="flex flex-col gap-1">
                <div className="sticky top-0 z-10 bg-superficie pb-1 text-center">
                  <p className="text-sm font-extrabold text-titulo">{nome}</p>
                  <p className="text-[11px] text-suave tabular-nums">
                    {livres(d).toLocaleString('pt-BR')}h livres
                  </p>
                </div>
                {HORARIOS.map((h) => {
                  const c = celulaSemana(d, h)
                  const estado = travados.has(c)
                    ? 'clinica'
                    : props.marcados.has(c)
                      ? props.cor
                      : 'livre'
                  const bloqueado = !props.editavel || travados.has(c)
                  const rotulo = `${nome} ${h}: ${
                    estado === 'livre'
                      ? 'disponível'
                      : estado === 'clinica'
                        ? 'clínica sem atendimento'
                        : 'profissional não atende'
                  }`
                  const aparencia =
                    c === ancora
                      ? 'border-primaria bg-primaria text-sobre-primaria shadow-md ring-2 ring-primaria/30'
                      : previa.has(c) && !bloqueado
                        ? marcando
                          ? `border-dashed ${props.cor === 'clinica' ? 'border-suave bg-suave/40' : 'border-perigo bg-perigo/30'} text-texto`
                          : 'border-dashed border-sucesso bg-sucesso/20 text-texto'
                        : COR_SEMANA[estado]
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={bloqueado}
                      aria-label={rotulo}
                      title={rotulo}
                      onClick={() => clicar(c)}
                      onMouseEnter={() => setSobre(c)}
                      onFocus={() => setSobre(c)}
                      className={`h-7 rounded-md border text-xs font-bold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primaria ${aparencia} ${bloqueado ? 'cursor-default' : 'cursor-pointer hover:border-primaria'}`}
                    >
                      {h.replace(/^0/, '')}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Legenda(props: { classe: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-3.5 rounded border ${props.classe}`} />
      {props.children}
    </span>
  )
}
