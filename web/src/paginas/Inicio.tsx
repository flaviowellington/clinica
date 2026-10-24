import { Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { consultaEu } from '../api'
import { Icone } from '../componentes/Icones'
import { ABAS } from '../abas'

const saudacao = (hora = new Date().getHours()) =>
  hora < 12 ? 'bom dia' : hora < 18 ? 'boa tarde' : 'boa noite'

/** Tela inicial: um cartão para cada parte do sistema que o usuário pode abrir. */
export function Inicio() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const abas = ABAS.filter((a) => a.visivel(eu.perfis))
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      <h1 className="text-2xl">
        <strong>Olá, {eu.nome.split(' ')[0]}</strong>, {saudacao()}!
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {abas.map((a) => (
          <Link
            key={a.para}
            to={a.para}
            className="cartao space-y-3 p-5 transition hover:border-primaria hover:shadow-md"
          >
            <span className="inline-flex rounded-lg bg-primaria-clara p-2.5 text-primaria">
              <Icone nome={a.icone} />
            </span>
            <p className="text-base font-semibold">{a.rotulo}</p>
            <p className="text-suave">{a.descricao}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
