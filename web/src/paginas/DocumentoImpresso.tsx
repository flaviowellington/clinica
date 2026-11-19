import { Link, useParams } from '@tanstack/react-router'
import { useVoltar } from '../estado'
import { useQuery } from '@tanstack/react-query'
import { api, dataBR, mensagemDeErro } from '../api'
import type { Documento } from '../componentes/Documentos'
import { FolhaTimbrada, papelDe } from '../componentes/FolhaTimbrada'

/** Documento do prontuário (atestado, declaração, receita), pronto para imprimir. */
export function DocumentoImpresso() {
  const { id } = useParams({ from: '/logado/documento/$id' })
  const voltar = useVoltar()
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
          onClick={voltar}
          className="text-primaria"
        >
          ‹ Voltar para a ficha de {d.paciente.nome}
        </Link>
        <button className="botao" onClick={() => print()}>
          Imprimir
        </button>
      </div>
      <style>{`@page { size: ${papelDe(d.modelo)}; margin: 0 }`}</style>
      <FolhaTimbrada
        modelo={d.modelo}
        titulo={d.titulo}
        texto={d.texto}
        className="print:fixed print:top-0 print:left-0 print:w-(--largura) print:max-w-none print:shadow-none"
      />
      <p className="text-center text-xs text-suave print:hidden">
        Gerado em {dataBR(d.criadoEm)} por {d.criadoPor.nome}
      </p>
    </div>
  )
}
