// Documentos gerados de modelo: atestado, declaração e receita (R-062).
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaConfig,
  consultaEu,
  consultaProfissionais,
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
import { Icone } from './Icones'

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

const ROTULO_VARIAVEL = { horario: 'Horário do atendimento', dias: 'Afastamento' }
/** Cor do ícone de cada modelo, para reconhecer o tipo na lista sem ler. */
const TOM: Record<string, string> = {
  atestado: 'bg-aviso/15 text-aviso',
  comparecimento: 'bg-primaria-clara text-primaria',
  receita: 'bg-sucesso/15 text-sucesso',
  padrao: 'bg-secundaria-clara text-titulo',
}
const tom = (modelo: string) => TOM[modelo] ?? 'bg-superficie-2 text-suave'

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
    <div className="space-y-4">
      <header className="cartao flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl">Documentos</h2>
          <p className="subtitulo">Atestados, declarações e receitas emitidos para o paciente.</p>
        </div>
        {podeEditar && (
          <button className="botao" onClick={() => setNovo(true)}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo documento
          </button>
        )}
      </header>

      <section className="cartao overflow-hidden p-0">
        {lista.isPending && <p className="px-4 py-10 text-center text-suave">Carregando…</p>}
        {lista.isError && (
          <p className="px-4 py-10 text-center text-perigo">{mensagemDeErro(lista.error)}</p>
        )}
        {lista.data?.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primaria-clara text-primaria">
              <Icone nome="arquivo" className="h-7 w-7" />
            </span>
            <div>
              <p className="font-bold text-titulo">Nenhum documento ainda</p>
              <p className="text-suave">
                Gere atestados, declarações e receitas a partir dos modelos.
              </p>
            </div>
            {podeEditar && (
              <button className="botao-leve botao-pequeno" onClick={() => setNovo(true)}>
                <Icone nome="mais" className="h-3.5 w-3.5" />
                Novo documento
              </button>
            )}
          </div>
        )}
        <ul className="divide-y divide-borda">
          {lista.data?.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-superficie-2"
            >
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-xl ${tom(d.modelo)}`}
              >
                <Icone nome="arquivo" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-titulo">{d.titulo}</p>
                <p className="text-suave">
                  <span className="tabular-nums">{dataBR(d.criadoEm)}</span>
                  {' · '}
                  {d.profissional?.nome ?? 'Sem profissional'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  to="/documento/$id"
                  params={{ id: String(d.id) }}
                  className="botao-leve botao-pequeno"
                >
                  <Icone nome="imprimir" className="h-4 w-4" />
                  Abrir e imprimir
                </Link>
                {podeEditar && (
                  <button
                    className="botao-fantasma botao-icone text-perigo hover:bg-perigo/10"
                    aria-label={`Excluir ${d.titulo}`}
                    title="Excluir"
                    disabled={excluir.isPending}
                    onClick={async () =>
                      (await confirmar(
                        `Excluir o documento "${d.titulo}"? Ele fica guardado no histórico.`,
                      )) && excluir.mutate(d.id)
                    }
                  >
                    <Icone nome="lixeira" className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Dialogo aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo documento" largo>
        <NovoDocumento paciente={paciente} aoTerminar={() => setNovo(false)} />
      </Dialogo>
    </div>
  )
}

function Passo({ n, texto }: { n: number; texto: string }) {
  return (
    <p className="text-xs font-extrabold tracking-wide text-suave uppercase">
      Passo {n} de 2 · {texto}
    </p>
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
  // O profissional começa como o usuário logado, quando ele é dentista.
  const meuId = useQuery(consultaProfissionais).data?.meuId ?? ''
  const modelos = useQuery(consultaConfig('documentos')).data
  const clinica = useQuery(consultaConfig('clinica')).data
  const padroes = useQuery(consultaConfig('documentosPadrao')).data ?? []
  // Modelo fixo (atestado…) ou documento padrão da clínica, como "p:<posição>".
  const [modelo, setModelo] = useState<string>('atestado')
  const padrao = modelo.startsWith('p:') ? padroes[Number(modelo.slice(2))] : undefined
  const fixo = (padrao ? 'atestado' : modelo) as ModeloDocumento
  const variaveis = padrao
    ? (['horario', 'dias'] as const).filter((v) => padrao.texto.includes(`{${v}}`))
    : MODELOS_DOCUMENTO[fixo].variaveis
  const [escolhido, setEscolhido] = useState<number | '' | null>(null)
  const profissionalId = escolhido ?? meuId
  const [valores, setValores] = useState<Record<string, string>>({})
  const [inicial, setInicial] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [salvo, setSalvo] = useState<Documento | null>(null)

  const salvar = useMutation({
    mutationFn: async (texto: string) =>
      (
        await api.post<Documento>(`/pacientes/${props.paciente.id}/documentos`, {
          modelo: padrao ? 'padrao' : modelo,
          titulo: padrao?.nome,
          profissionalId: profissionalId || null,
          texto,
        })
      ).data,
    onSuccess: (d) => {
      avisar('Documento salvo no prontuário')
      qc.invalidateQueries({ queryKey: ['documentos', props.paciente.id] })
      // Documento padrão não passa pelo editor: fica a opção de imprimir.
      if (padrao) setSalvo(d)
      else props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  function preencher(base: string) {
    const prof = profissionais.data?.find((p) => p.id === profissionalId)
    return preencherModelo(base, {
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
  }

  function abrirEditor() {
    const pronto = preencher(modelos?.[fixo] ?? MODELOS_DOCUMENTO[fixo].texto)
    setInicial(pronto)
    setTexto(pronto)
  }

  if (salvo)
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-sucesso/15 text-sucesso">
          <Icone nome="arquivo" className="h-7 w-7" />
        </span>
        <div>
          <p className="font-bold text-titulo">{salvo.titulo} salvo no prontuário</p>
          <p className="text-suave">
            {props.paciente.nome} · {salvo.profissional?.nome ?? 'Sem profissional'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="botao-leve" onClick={props.aoTerminar}>
            Fechar
          </button>
          <Link to="/documento/$id" params={{ id: String(salvo.id) }} className="botao">
            <Icone nome="imprimir" className="h-4 w-4" />
            Imprimir
          </Link>
        </div>
      </div>
    )

  if (inicial !== null)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Passo n={2} texto="Revise o texto" />
          <span className={`etiqueta ${tom(modelo)}`}>{MODELOS_DOCUMENTO[fixo].titulo}</span>
        </div>
        <label className="block">
          <span className="rotulo">Texto do documento</span>
          <textarea
            className="campo font-serif text-base leading-relaxed"
            rows={14}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
          />
          <span className="ajuda">
            {texto.includes('________') && 'Complete os trechos “________” que ficaram sem valor. '}
            O botão Salvar libera depois da primeira edição.
          </span>
        </label>
        <div className="flex flex-wrap justify-between gap-2">
          <button className="botao-leve" onClick={() => setInicial(null)}>
            <Icone nome="esquerda" className="h-4 w-4" />
            Voltar
          </button>
          <button
            className="botao"
            disabled={texto === inicial || !texto.trim() || salvar.isPending}
            onClick={() => salvar.mutate(texto)}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    )

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (padrao) salvar.mutate(preencher(padrao.texto))
        else abrirEditor()
      }}
    >
      {padrao ? (
        <p className="text-xs font-extrabold tracking-wide text-suave uppercase">
          Documento padrão · confira os dados e salve
        </p>
      ) : (
        <Passo n={1} texto="Preencha os dados" />
      )}
      <fieldset>
        <legend className="rotulo">Modelo</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ...(Object.keys(MODELOS_DOCUMENTO) as ModeloDocumento[]).map((id) => ({
              id,
              nome: MODELOS_DOCUMENTO[id].titulo as string,
              cor: id,
            })),
            ...padroes.map((d, i) => ({ id: `p:${i}`, nome: d.nome, cor: 'padrao' })),
          ].map(({ id, nome, cor }) => (
            <label
              key={id}
              className="flex items-center gap-3 rounded-xl border-2 border-borda p-3 hover:border-primaria/50 has-checked:border-primaria has-checked:bg-primaria-clara has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primaria"
            >
              <input
                type="radio"
                name="modelo"
                className="sr-only"
                checked={modelo === id}
                onChange={() => setModelo(id)}
              />
              <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tom(cor)}`}>
                <Icone nome="arquivo" className="h-4 w-4" />
              </span>
              <span className="min-w-0 font-bold break-words">{nome}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {padrao && (
        <div className="max-h-48 overflow-y-auto rounded-xl bg-superficie-2 p-3 font-serif text-sm whitespace-pre-wrap">
          {padrao.texto}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="rotulo">Profissional</span>
          <CampoSelect
            value={profissionalId}
            onChange={(e) => setEscolhido(Number(e.target.value) || '')}
            opcoes={profissionais.data?.map((p) => [p.id, p.nome] as const)}
          />
        </label>
        {variaveis.map((v) => (
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
        {padrao ? (
          <button className="botao" disabled={!profissionalId || salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar no prontuário'}
          </button>
        ) : (
          <button className="botao" disabled={!profissionalId}>
            Abrir editor
            <Icone nome="direita" className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  )
}
