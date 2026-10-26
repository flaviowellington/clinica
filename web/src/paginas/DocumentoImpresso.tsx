import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api, dataBR, mensagemDeErro } from '../api'
import type { Documento } from '../componentes/Documentos'

/** Documento do prontuário (atestado, declaração, receita), pronto para imprimir. */
export function DocumentoImpresso() {
  const { id } = useParams({ from: '/logado/documento/$id' })
  const r = useQuery({
    queryKey: ['documento', id],
    queryFn: async () => (await api.get<Documento>(`/prontuario/documentos/${id}`)).data,
  })
  if (r.isPending) return <p className="text-suave">Carregando…</p>
  if (r.isError) return <p className="text-perigo">{mensagemDeErro(r.error)}</p>
  const d = r.data
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex justify-between print:hidden">
        <Link
          to="/pacientes/$id"
          params={{ id: String(d.paciente.id) }}
          search={{ aba: 'documentos' }}
          className="text-primaria"
        >
          ‹ Voltar para a ficha de {d.paciente.nome}
        </Link>
        <button className="botao" onClick={() => print()}>
          Imprimir
        </button>
      </div>
      <article className="cartao space-y-6 p-10 print:border-0 print:p-0">
        <header className="border-b border-borda pb-4">
          <h1 className="text-center text-2xl font-semibold uppercase">{d.titulo}</h1>
        </header>
        <p className="font-serif text-base leading-relaxed whitespace-pre-wrap">{d.texto}</p>
        <p className="text-xs text-suave print:hidden">
          Gerado em {dataBR(d.criadoEm)} por {d.criadoPor.nome}
        </p>
      </article>
    </div>
  )
}
