import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api, cpfBR, dataBR, mensagemDeErro } from '../api'
import { reais } from '../../../shared/financeiro'

interface Lancamento {
  id: number
  data: string
  tipo: string
  valorCentavos: number
  descricao: string
  forma: string | null
  paciente: { id: number; nome: string; cpf: string | null } | null
  criadoPor: { nome: string }
}

// ponytail: nome da clínica fixo; virar configuração quando houver a tela de dados da clínica.
const CLINICA = 'Clínica'

/** Recibo de um recebimento, pronto para imprimir. */
export function Recibo() {
  const { id } = useParams({ from: '/logado/recibo/$id' })
  const r = useQuery({
    queryKey: ['recibo', id],
    queryFn: async () => (await api.get<Lancamento>(`/financeiro/lancamentos/${id}`)).data,
  })
  if (r.isPending) return <p className="text-suave">Carregando…</p>
  if (r.isError) return <p className="text-perigo">{mensagemDeErro(r.error)}</p>
  const l = r.data
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex justify-between print:hidden">
        <Link to="/financeiro" search={{ aba: 'conta-corrente' }} className="text-primaria">
          ‹ Voltar para a conta corrente
        </Link>
        <button className="botao" onClick={() => print()}>
          Imprimir
        </button>
      </div>
      <article className="cartao space-y-6 p-10 print:border-0 print:p-0">
        <header className="flex items-baseline justify-between border-b border-borda pb-4">
          <h1 className="text-2xl font-semibold">Recibo</h1>
          <p className="text-lg">
            Nº {l.id} · <strong>{reais(l.valorCentavos)}</strong>
          </p>
        </header>
        <p className="text-base leading-relaxed">
          Recebemos de <strong>{l.paciente?.nome ?? '________________'}</strong>
          {l.paciente?.cpf && <>, CPF {cpfBR(l.paciente.cpf)}</>}, a quantia de{' '}
          <strong>{reais(l.valorCentavos)}</strong>, referente a {l.descricao}
          {l.forma && <>, paga em {l.forma.toLowerCase()}</>}.
        </p>
        <p>Data: {dataBR(l.data)}</p>
        <div className="pt-12 text-center">
          <div className="mx-auto w-72 border-t border-texto pt-2">{CLINICA}</div>
          <p className="text-suave">Emitido por {l.criadoPor.nome}</p>
        </div>
      </article>
    </div>
  )
}
