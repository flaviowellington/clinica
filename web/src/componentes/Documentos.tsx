// Documentos gerados de modelo: atestado, declaração e receita (R-062).
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaConfig,
  consultaEu,
  cpfBR,
  dataBR,
  isoLocal,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import {
  MODELOS_DOCUMENTO,
  preencherModelo,
  type ModeloDocumento,
} from '../../../shared/prontuario'
import { Dialogo } from './Dialogo'
import { CampoSelect } from './CampoSelect'
import { confirmar } from './Confirmar'

export interface Documento {
  id: number
  modelo: string
  titulo: string
  texto: string
  criadoEm: string
  profissional: { id: number; nome: string; cro: string | null } | null
  paciente: { id: number; nome: string; cpf: string | null }
  criadoPor: { nome: string }
}
interface Profissional {
  id: number
  nome: string
  cro: string | null
}

const ROTULO_VARIAVEL = { horario: 'Horário do atendimento', dias: 'Afastamento (ex.: 1 dia)' }

export function Documentos({ paciente }: { paciente: Paciente }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const chave = ['documentos', paciente.id]
  const lista = useQuery({
    queryKey: chave,
    queryFn: async () => (await api.get<Documento[]>(`/pacientes/${paciente.id}/documentos`)).data,
  })
  const [novo, setNovo] = useState(false)
  const excluir = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/prontuario/documentos/${id}`)).data,
    onSuccess: () => {
      avisar('Documento excluído')
      qc.invalidateQueries({ queryKey: chave })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const podeEditar = pode(eu.perfis, 'prontuario.editar')

  return (
    <section className="cartao space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Documentos</h2>
        {podeEditar && (
          <button className="botao py-1.5" onClick={() => setNovo(true)}>
            Novo documento
          </button>
        )}
      </div>
      {lista.data?.length === 0 && (
        <p className="text-suave">Nenhum documento. Gere atestados, declarações e receitas.</p>
      )}
      {!!lista.data?.length && (
        <table className="w-full text-left">
          <thead className="border-b border-borda text-suave">
            <tr>
              {['Data', 'Documento', 'Profissional', ''].map((t) => (
                <th key={t} className="px-3 py-2 font-medium">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.data.map((d) => (
              <tr key={d.id} className="border-b border-borda last:border-0">
                <td className="px-3 py-2">{dataBR(d.criadoEm)}</td>
                <td className="px-3 py-2">{d.titulo}</td>
                <td className="px-3 py-2">{d.profissional?.nome ?? '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link
                    to="/documento/$id"
                    params={{ id: String(d.id) }}
                    className="text-primaria hover:underline"
                  >
                    Abrir e imprimir
                  </Link>
                  {podeEditar && (
                    <button
                      className="ml-3 text-perigo hover:underline"
                      onClick={async () =>
                        (await confirmar(
                          `Excluir o documento "${d.titulo}"? Ele fica guardado no histórico.`,
                        )) && excluir.mutate(d.id)
                      }
                    >
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Dialogo aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo documento" largo>
        <NovoDocumento paciente={paciente} aoTerminar={() => setNovo(false)} />
      </Dialogo>
    </section>
  )
}

/** Escolhe o modelo e as variáveis; o editor abre com o texto pronto e só salva depois de uma edição. */
function NovoDocumento(props: { paciente: Paciente; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const profissionais = useQuery({
    queryKey: ['profissionais', 'ativos'],
    queryFn: async () =>
      (await api.get<Profissional[]>('/profissionais', { params: { ativos: 1 } })).data,
  })
  const { data: eu } = useSuspenseQuery(consultaEu)
  const modelos = useQuery(consultaConfig('documentos')).data
  const clinica = useQuery(consultaConfig('clinica')).data
  const medicamentos = useQuery(consultaConfig('medicamentos')).data ?? []
  const [modelo, setModelo] = useState<ModeloDocumento>('atestado')
  const [profissionalId, setProfissionalId] = useState<number | ''>('')
  const [valores, setValores] = useState<Record<string, string>>({})
  const [inicial, setInicial] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const salvar = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/pacientes/${props.paciente.id}/documentos`, {
          modelo,
          profissionalId: profissionalId || null,
          texto,
        })
      ).data,
    onSuccess: () => {
      avisar('Documento salvo')
      qc.invalidateQueries({ queryKey: ['documentos', props.paciente.id] })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  function abrirEditor() {
    const prof = profissionais.data?.find((p) => p.id === profissionalId)
    const pronto = preencherModelo(modelos?.[modelo] ?? MODELOS_DOCUMENTO[modelo].texto, {
      clinica: clinica?.nome,
      cidade: clinica?.cidade,
      paciente: props.paciente.nome,
      cpf: cpfBR(props.paciente.cpf),
      profissional: prof?.nome ?? eu.nome,
      // Aceita o CRO cadastrado com ou sem o prefixo "CRO".
      cro: prof?.cro && (/^cro/i.test(prof.cro) ? prof.cro : `CRO ${prof.cro}`),
      data: dataBR(isoLocal(new Date())),
      ...valores,
    })
    setInicial(pronto)
    setTexto(pronto)
  }

  if (inicial !== null)
    return (
      <div className="space-y-3">
        <label className="block">
          <span className="rotulo">{MODELOS_DOCUMENTO[modelo].titulo}</span>
          <textarea
            className="campo font-serif"
            rows={14}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
          />
        </label>
        {modelo === 'receita' && medicamentos.length > 0 && (
          <label className="block">
            <span className="rotulo">Inserir medicamento</span>
            <CampoSelect
              value=""
              onChange={(e) => {
                const m = medicamentos[Number(e.target.value)]
                if (!m) return
                // Entra antes da data, como mais um item da lista.
                const linha = m.posologia ? `${m.nome}\n   ${m.posologia}` : m.nome
                const n = (texto.match(/^\d+\. /gm) ?? []).length
                const vazio = /^\d+\. *$/m
                setTexto(
                  vazio.test(texto)
                    ? texto.replace(vazio, `${n}. ${linha}`)
                    : texto.replace(/\n\n\n/, `\n${n + 1}. ${linha}\n\n\n`),
                )
              }}
              vazio="Escolha para inserir na receita…"
              opcoes={medicamentos.map((m, i) => [i, m.nome] as const)}
            />
          </label>
        )}
        <p className="text-suave">
          Revise o texto. O botão Salvar libera depois da primeira edição.
        </p>
        <div className="flex justify-end gap-2">
          <button className="botao-leve" onClick={() => setInicial(null)}>
            Voltar
          </button>
          <button
            className="botao"
            disabled={texto === inicial || !texto.trim() || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            Salvar
          </button>
        </div>
      </div>
    )

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        abrirEditor()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="rotulo">Modelo</span>
          <CampoSelect
            value={modelo}
            onChange={(e) => setModelo(e.target.value as ModeloDocumento)}
            vazio={false}
            opcoes={Object.entries(MODELOS_DOCUMENTO).map(([id, m]) => [id, m.titulo] as const)}
          />
        </label>
        <label>
          <span className="rotulo">Profissional</span>
          <CampoSelect
            value={profissionalId}
            onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
            opcoes={profissionais.data?.map((p) => [p.id, p.nome] as const)}
          />
        </label>
        {MODELOS_DOCUMENTO[modelo].variaveis.map((v) => (
          <label key={v}>
            <span className="rotulo">{ROTULO_VARIAVEL[v]}</span>
            <input
              className="campo"
              value={valores[v] ?? ''}
              onChange={(e) => setValores({ ...valores, [v]: e.target.value })}
              placeholder={v === 'horario' ? '14:00' : '1 dia'}
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={!profissionalId}>
          Abrir editor
        </button>
      </div>
    </form>
  )
}
