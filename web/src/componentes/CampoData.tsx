import { useRef, useState } from 'react'
import { isoLocal } from '../api'
import { Icone } from './Icones'
import { MiniCalendario } from './MiniCalendario'

/** aaaa-mm-dd → dd/mm/aaaa (ou dd/mm/aa com anoCurto) */
const paraTexto = (iso?: string, anoCurto?: boolean) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(anoCurto ? 2 : 0, 4)}` : ''

/** dd/mm/aaaa ou dd/mm/aa (vira 20aa) → aaaa-mm-dd, ou '' se incompleta ou se a data não existe (31/02). */
export function paraIso(texto: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(texto)
  if (!m) return ''
  const iso = `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}`
  const d = new Date(`${iso}T12:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : ''
}

/** Põe as barras enquanto digita: "23102026" → "23/10/2026". */
const mascarar = (texto: string, anoCurto?: boolean) => {
  let n = texto.replace(/\D/g, '').slice(0, 8)
  // Colou a data com ano de 4 dígitos (29/10/2026): fica 29/10/26.
  if (anoCurto) n = n.length === 8 ? n.slice(0, 4) + n.slice(6) : n.slice(0, 6)
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4)].filter(Boolean).join('/')
}

/**
 * Campo de data no padrão dia/mês/ano. O campo do navegador (type="date") segue o idioma
 * do Chrome e pode mostrar mês/dia/ano; este mostra sempre dd/mm/aaaa.
 * Só dia e mês ("29/10") completa com o ano atual ao sair do campo.
 * Recebe e devolve aaaa-mm-dd. Com "name", vai no formulário como aaaa-mm-dd.
 */
export function CampoData(props: {
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (iso: string) => void
  required?: boolean
  className?: string
  'aria-label'?: string
  /** Mostra e aceita dd/mm/aa (ano 20aa). Não use em nascimento. */
  anoCurto?: boolean
  /** Calendário ocupa espaço abaixo do campo em vez de flutuar (dentro de janelas que rolam). */
  calendarioNoFluxo?: boolean
}) {
  const curto = props.anoCurto
  const tamanho = curto ? 8 : 10
  const [texto, setTexto] = useState(paraTexto(props.value ?? props.defaultValue, curto))
  // Quando o valor muda por fora (ex.: botão "Hoje"), o texto acompanha.
  const [anterior, setAnterior] = useState(props.value)
  if (props.value !== undefined && props.value !== anterior) {
    setAnterior(props.value)
    if (props.value !== paraIso(texto)) setTexto(paraTexto(props.value, curto))
  }
  const [aberto, setAberto] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const iso = paraIso(texto)

  function mudar(novo: string, campo?: HTMLInputElement) {
    setTexto(novo)
    const valido = paraIso(novo)
    campo?.setCustomValidity(novo.length === tamanho && !valido ? 'Esta data não existe.' : '')
    props.onChange?.(valido)
  }

  return (
    <span
      className={`relative block ${props.className ?? ''}`}
      // Fecha o calendário ao clicar ou tabular para fora dele.
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setAberto(false)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !aberto) return
        e.stopPropagation() // Esc fecha só o calendário, não a janela em volta
        setAberto(false)
        campo.current?.focus()
      }}
    >
      <input
        ref={campo}
        id={props.id}
        className="campo pr-9"
        inputMode="numeric"
        placeholder={curto ? 'dd/mm/aa' : 'dd/mm/aaaa'}
        pattern={curto ? '\\d{2}/\\d{2}/\\d{2}' : '\\d{2}/\\d{2}/\\d{4}'}
        title={`Use o formato ${curto ? 'dd/mm/aa' : 'dd/mm/aaaa'}`}
        required={props.required}
        aria-label={props['aria-label']}
        value={texto}
        onChange={(e) => mudar(mascarar(e.target.value, curto), e.target)}
        onBlur={(e) => {
          // Só dia e mês: completa com o ano atual.
          if (/^\d{2}\/\d{2}\/?$/.test(texto)) {
            const ano = String(new Date().getFullYear()).slice(curto ? 2 : 0)
            mudar(`${texto.slice(0, 5)}/${ano}`, e.target)
          }
        }}
      />
      {props.name && <input type="hidden" name={props.name} value={iso} />}
      <button
        type="button"
        className={`absolute top-0 right-0 flex h-10 items-center px-2 hover:text-primaria ${aberto ? 'text-primaria' : 'text-suave'}`}
        aria-label="Abrir calendário"
        aria-expanded={aberto}
        tabIndex={-1}
        onClick={() => setAberto(!aberto)}
      >
        <Icone nome="agenda" className="h-4 w-4" />
      </button>
      {aberto && (
        <div
          className={
            props.calendarioNoFluxo
              ? 'mt-1 w-full max-w-64'
              : 'absolute top-full right-0 z-40 mt-1 w-64 shadow-lg'
          }
        >
          <MiniCalendario
            data={iso || isoLocal(new Date())}
            hoje={isoLocal(new Date())}
            aoEscolher={(d) => {
              mudar(paraTexto(d, curto), campo.current ?? undefined)
              setAberto(false)
              campo.current?.focus()
            }}
          />
        </div>
      )}
    </span>
  )
}
