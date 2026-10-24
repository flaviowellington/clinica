import { useRef, useState } from 'react'
import { Icone } from './Icones'

/** aaaa-mm-dd → dd/mm/aaaa */
const paraTexto = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '')

/** dd/mm/aaaa → aaaa-mm-dd, ou '' se incompleta ou se a data não existe (31/02). */
export function paraIso(texto: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)
  if (!m) return ''
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(`${iso}T12:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : ''
}

/** Põe as barras enquanto digita: "23102026" → "23/10/2026". */
const mascarar = (texto: string) => {
  const n = texto.replace(/\D/g, '').slice(0, 8)
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4)].filter(Boolean).join('/')
}

/**
 * Campo de data no padrão dia/mês/ano. O campo do navegador (type="date") segue o idioma
 * do Chrome e pode mostrar mês/dia/ano; este mostra sempre dd/mm/aaaa.
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
}) {
  const [texto, setTexto] = useState(paraTexto(props.value ?? props.defaultValue))
  // Quando o valor muda por fora (ex.: botão "Hoje"), o texto acompanha.
  const [anterior, setAnterior] = useState(props.value)
  if (props.value !== undefined && props.value !== anterior) {
    setAnterior(props.value)
    if (props.value !== paraIso(texto)) setTexto(paraTexto(props.value))
  }
  const calendario = useRef<HTMLInputElement>(null)
  const iso = paraIso(texto)

  function mudar(novo: string, campo?: HTMLInputElement) {
    setTexto(novo)
    const valido = paraIso(novo)
    campo?.setCustomValidity(novo.length === 10 && !valido ? 'Esta data não existe.' : '')
    props.onChange?.(valido)
  }

  return (
    <span className={`relative block ${props.className ?? ''}`}>
      <input
        id={props.id}
        className="campo pr-9"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        pattern="\d{2}/\d{2}/\d{4}"
        title="Use o formato dd/mm/aaaa"
        maxLength={10}
        required={props.required}
        aria-label={props['aria-label']}
        value={texto}
        onChange={(e) => mudar(mascarar(e.target.value), e.target)}
      />
      {props.name && <input type="hidden" name={props.name} value={iso} />}
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center px-2 text-suave hover:text-primaria"
        aria-label="Abrir calendário"
        tabIndex={-1}
        onClick={() => {
          const c = calendario.current
          if (!c) return
          try {
            c.showPicker()
          } catch {
            c.focus()
          }
        }}
      >
        <Icone nome="agenda" className="h-4 w-4" />
      </button>
      {/* Só para abrir o calendário do navegador; o valor aparece no campo de texto. */}
      <input
        ref={calendario}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
        value={iso}
        onChange={(e) => mudar(paraTexto(e.target.value))}
      />
    </span>
  )
}
