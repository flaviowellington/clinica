import { centavosDeDigitos, reais } from '../../../shared/financeiro'

/** Campo de dinheiro com os dígitos entrando pela direita (R-055): 1 → 0,01; 100 → 1,00. */
export function CampoReais(props: {
  valor: number
  aoMudar: (centavos: number) => void
  rotulo: string
  id: string
  erro?: string
}) {
  return (
    <label htmlFor={props.id} className="block">
      <span className="rotulo">{props.rotulo}</span>
      <input
        id={props.id}
        inputMode="numeric"
        className="campo text-right"
        value={reais(props.valor)}
        onChange={(e) => props.aoMudar(centavosDeDigitos(e.target.value))}
      />
      {props.erro && <p className="mt-1 text-perigo">{props.erro}</p>}
    </label>
  )
}
