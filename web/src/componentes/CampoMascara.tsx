import { useState, type InputHTMLAttributes } from 'react'
import { cpfValido } from '../../../shared/regras'
import { mascaraCelular, mascaraCpf } from '../../../shared/mascaras'
import { celular, celularObrigatorio, email, emailObrigatorio, erroDe } from '../../../shared/dtos'

type Atributos = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'>

/**
 * Campo com máscara aplicada enquanto digita. "validar" devolve a mensagem de erro (ou '');
 * ela aparece ao sair do campo ou quando ele está completo, e bloqueia o envio do formulário.
 */
export function CampoMascara({
  mascara,
  validar,
  erro,
  defaultValue = '',
  aoMudar,
  ...resto
}: Atributos & {
  mascara: (valor: string, apagando?: boolean) => string
  validar?: (valor: string) => string
  /** Erro vindo do servidor. */
  erro?: string
  defaultValue?: string
  /** Para tela que guarda o valor no estado (sem FormData). */
  aoMudar?: (valor: string) => void
}) {
  const [texto, setTexto] = useState(() => (defaultValue ? mascara(defaultValue) : ''))
  const [saiu, setSaiu] = useState(false)
  const problema = validar?.(texto) ?? ''
  const completo = !!resto.maxLength && texto.length >= resto.maxLength
  const mensagem = (problema && (saiu || completo) ? problema : '') || erro

  return (
    <>
      <input
        {...resto}
        className="campo"
        value={texto}
        aria-invalid={!!mensagem}
        ref={(el) => el?.setCustomValidity(problema)}
        onChange={(e) => {
          const novo = mascara(e.target.value, e.target.value.length < texto.length)
          setTexto(novo)
          aoMudar?.(novo)
        }}
        onBlur={() => setSaiu(true)}
      />
      {mensagem && <span className="erro-campo">{mensagem}</span>}
    </>
  )
}

/** Regra única de CPF do sistema: máscara 000.000.000-00 e dígitos verificadores válidos. */
export function CampoCpf(props: Atributos & { erro?: string; defaultValue?: string }) {
  return (
    <CampoMascara
      inputMode="numeric"
      placeholder="000.000.000-00"
      maxLength={14}
      {...props}
      mascara={mascaraCpf}
      validar={(v) => (v && !cpfValido(v) ? 'CPF inválido.' : '')}
    />
  )
}

type PropsCampo = Atributos & {
  erro?: string
  defaultValue?: string
  aoMudar?: (v: string) => void
}

/**
 * Regra única de e-mail do sistema: sem espaços e no formato nome@dominio.algo,
 * conferido pelo mesmo DTO da API (shared/dtos.ts). "required" torna obrigatório.
 */
export function CampoEmail(props: PropsCampo) {
  const regra = props.required ? emailObrigatorio() : email
  return (
    <CampoMascara
      type="email"
      inputMode="email"
      autoComplete="off"
      placeholder="nome@exemplo.com"
      {...props}
      mascara={(v) => v.replace(/\s/g, '')}
      validar={(v) => erroDe(regra, v)}
    />
  )
}

/**
 * Regra única de celular do sistema: máscara +55 (00) 00000-0000 (o DDI pode ser trocado)
 * e o número conferido pelo DTO da API. Só o "+55 " conta como vazio.
 */
export function CampoCelular(props: PropsCampo) {
  const regra = props.required ? celularObrigatorio() : celular
  return (
    <CampoMascara
      type="tel"
      inputMode="tel"
      autoComplete="off"
      placeholder="+55 (00) 00000-0000"
      {...props}
      defaultValue={props.defaultValue || '+55 '}
      mascara={mascaraCelular}
      validar={(v) => erroDe(regra, v)}
    />
  )
}
