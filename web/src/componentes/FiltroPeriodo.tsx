// Escolha de período com atalhos (Dia, Semana, Mês, Tudo, Personalizado) e setas para
// andar para trás e para frente. Aplica na hora: sem botão "Listar".
import { useState } from 'react'
import { isoLocal, somarDias } from '../api'
import { CampoData } from './CampoData'
import { Icone } from './Icones'

export type ModoPeriodo = 'dia' | 'semana' | 'mes' | 'tudo' | 'personalizado'
const ROTULOS: Record<ModoPeriodo, string> = {
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  tudo: 'Tudo',
  personalizado: 'Personalizado',
}

/** Segunda-feira da semana da data. */
export const segundaDa = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`).getDay()
  return somarDias(iso, -((d + 6) % 7))
}
const ultimoDiaDoMes = (iso: string) =>
  isoLocal(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0))
const somarMeses = (iso: string, n: number) =>
  isoLocal(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + n, 1))

/** Intervalo (de, até) do modo, a partir de uma data de referência. */
export function intervalo(modo: ModoPeriodo, ref: string) {
  if (modo === 'dia') return { de: ref, ate: ref }
  if (modo === 'semana') return { de: segundaDa(ref), ate: somarDias(segundaDa(ref), 6) }
  if (modo === 'mes') return { de: `${ref.slice(0, 8)}01`, ate: ultimoDiaDoMes(ref) }
  return null
}
/** Mesma referência um período antes ou depois. */
const andar = (modo: ModoPeriodo, ref: string, n: number) =>
  modo === 'dia'
    ? somarDias(ref, n)
    : modo === 'semana'
      ? somarDias(ref, 7 * n)
      : somarMeses(ref, n)

const d = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', o).replace('.', '')

function rotulo(modo: ModoPeriodo, ref: string) {
  const hoje = isoLocal(new Date())
  if (modo === 'dia')
    return {
      principal: d(ref, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
      atual: ref === hoje ? 'Hoje' : ref === somarDias(hoje, -1) ? 'Ontem' : null,
    }
  if (modo === 'semana') {
    const de = segundaDa(ref)
    const ate = somarDias(de, 6)
    const mesmoMes = de.slice(5, 7) === ate.slice(5, 7)
    const ini = mesmoMes ? de.slice(8) : d(de, { day: '2-digit', month: 'short' })
    const esta = segundaDa(hoje)
    return {
      principal: `${ini} – ${d(ate, { day: '2-digit', month: 'short', year: 'numeric' })}`,
      atual: de === esta ? 'Esta semana' : de === somarDias(esta, -7) ? 'Semana passada' : null,
    }
  }
  const mes = d(ref, { month: 'long', year: 'numeric' })
  return {
    principal: mes.charAt(0).toUpperCase() + mes.slice(1),
    atual:
      ref.slice(0, 7) === hoje.slice(0, 7)
        ? 'Este mês'
        : ref.slice(0, 7) === somarMeses(hoje, -1).slice(0, 7)
          ? 'Mês passado'
          : null,
  }
}

export interface Periodo {
  modo: ModoPeriodo
  /** Vazio quando o modo é "tudo". */
  de?: string
  ate?: string
}

export function usePeriodo(
  padrao: ModoPeriodo = 'semana',
  modos: ModoPeriodo[] = ['dia', 'semana', 'mes', 'personalizado'],
) {
  const hoje = isoLocal(new Date())
  const [modo, setModo] = useState<ModoPeriodo>(padrao)
  const [ref, setRef] = useState(hoje)
  const [livre, setLivre] = useState(() => intervalo('mes', hoje)!)
  const fixo = intervalo(modo, ref)
  const periodo: Periodo = modo === 'tudo' ? { modo } : { modo, ...(fixo ?? livre) }
  const r = fixo && rotulo(modo, ref)
  const ehAtual = !fixo || intervalo(modo, hoje)!.de === fixo.de

  const controle = (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Período" className="flex rounded-xl bg-superficie-2 p-1">
        {modos.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={modo === m}
            onClick={() => {
              // Ao passar para "Personalizado", começa no intervalo que estava na tela.
              if (m === 'personalizado' && fixo) setLivre(fixo)
              setModo(m)
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${modo === m ? 'bg-primaria text-sobre-primaria shadow-sm' : 'text-suave hover:bg-superficie hover:text-texto'}`}
          >
            {ROTULOS[m]}
          </button>
        ))}
      </div>

      {fixo && r && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="botao-leve botao-icone"
            aria-label={`${ROTULOS[modo]} anterior`}
            title={`${ROTULOS[modo]} anterior`}
            onClick={() => setRef(andar(modo, ref, -1))}
          >
            <Icone nome="esquerda" className="h-4 w-4" />
          </button>
          <div className="min-w-44 px-2 text-center leading-tight" aria-live="polite">
            <span className="block text-[0.7rem] font-bold tracking-wide text-primaria uppercase">
              {r.atual ?? ' '}
            </span>
            <span className="block font-extrabold whitespace-nowrap text-titulo">
              {r.principal}
            </span>
          </div>
          <button
            type="button"
            className="botao-leve botao-icone"
            aria-label={`Próximo: ${ROTULOS[modo].toLowerCase()}`}
            title={`Próximo: ${ROTULOS[modo].toLowerCase()}`}
            onClick={() => setRef(andar(modo, ref, 1))}
          >
            <Icone nome="direita" className="h-4 w-4" />
          </button>
          {!ehAtual && (
            <button
              type="button"
              className="botao-fantasma botao-pequeno"
              onClick={() => setRef(hoje)}
            >
              Voltar para hoje
            </button>
          )}
        </div>
      )}

      {modo === 'personalizado' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="w-40">
            <span className="sr-only">De</span>
            <CampoData value={livre.de} onChange={(v) => v && setLivre({ ...livre, de: v })} />
          </label>
          <span className="text-suave">até</span>
          <label className="w-40">
            <span className="sr-only">Até</span>
            <CampoData value={livre.ate} onChange={(v) => v && setLivre({ ...livre, ate: v })} />
          </label>
        </div>
      )}
    </div>
  )
  return { periodo, controle }
}
