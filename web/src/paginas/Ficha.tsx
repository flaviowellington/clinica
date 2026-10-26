import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  cpfBR,
  dataBR,
  errosDosCampos,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode, type Acao } from '../../../shared/permissoes'
import { idade, MOTIVOS_INATIVACAO } from '../../../shared/regras'
import { reais } from '../../../shared/financeiro'
import type { Pergunta } from '../../../shared/prontuario'
import { Dialogo } from '../componentes/Dialogo'
import { FormPaciente } from '../componentes/FormPaciente'
import { Abas } from '../componentes/Abas'
import { NovoRetorno } from '../componentes/Retornos'
import { Situacao } from './Pacientes'
import { OrcamentosPaciente } from '../componentes/Orcamentos'
import { FichasEspecialidade, Odontograma, PlanoFichaClinica } from '../componentes/Clinico'
import { Anamneses } from '../componentes/Anamnese'
import { Arquivos } from '../componentes/Arquivos'
import { Documentos } from '../componentes/Documentos'
import {
  AgendamentosPaciente,
  FinanceiroPaciente,
  Indicacoes,
  RecibosPaciente,
} from '../componentes/FichaConsultas'

type Janela = 'editar' | 'inativar' | 'excluir' | null

/** As 13 abas da ficha (S-003). Cada uma só aparece para quem tem a permissão. */
const ABAS_FICHA = [
  { id: 'visao-geral', rotulo: 'Visão Geral', acao: 'paciente.ver' },
  { id: 'orcamentos', rotulo: 'Orçamentos', acao: 'orcamento.ver' },
  { id: 'financeiro', rotulo: 'Financeiro', acao: 'financeiro.paciente' },
  { id: 'fotos', rotulo: 'Fotos', acao: 'fotos.ver' },
  { id: 'plano', rotulo: 'Plano e Ficha Clínica', acao: 'prontuario.ver' },
  { id: 'especialidades', rotulo: 'Fichas Especialidades', acao: 'prontuario.ver' },
  { id: 'odontograma', rotulo: 'Odontograma', acao: 'prontuario.ver' },
  { id: 'anamnese', rotulo: 'Anamnese', acao: 'anamnese.ver' },
  { id: 'documentos', rotulo: 'Documentos', acao: 'prontuario.ver' },
  { id: 'exames', rotulo: 'Exames', acao: 'prontuario.ver' },
  { id: 'recibos', rotulo: 'Recibos', acao: 'financeiro.receber' },
  { id: 'agendamentos', rotulo: 'Agendamentos', acao: 'agenda.ver' },
  { id: 'indicacoes', rotulo: 'Indicações', acao: 'paciente.ver' },
] as const satisfies readonly { id: string; rotulo: string; acao: Acao }[]
type AbaFicha = (typeof ABAS_FICHA)[number]['id']

export function Ficha() {
  const { id } = useParams({ from: '/logado/pacientes/$id' })
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const navegar = useNavigate()
  const [janela, setJanela] = useState<Janela>(null)

  const abas = ABAS_FICHA.filter((a) => pode(eu.perfis, a.acao))
  const { aba: daUrl } = useSearch({ from: '/logado/pacientes/$id' })
  const aba: AbaFicha = abas.find((a) => a.id === daUrl)?.id ?? 'visao-geral'
  const trocarAba = (a: AbaFicha) =>
    navegar({
      to: '/pacientes/$id',
      params: { id },
      search: { aba: a === 'visao-geral' ? undefined : a },
    })

  // Cada abertura da ficha grava um registro de acesso no servidor (R-003)...
  const ficha = useQuery({
    queryKey: ['paciente', id],
    queryFn: async () => (await api.get<Paciente>(`/pacientes/${id}`, { params: { aba } })).data,
  })
  // ...e cada troca de aba também.
  const ultimaAba = useRef(aba)
  useEffect(() => {
    if (ultimaAba.current === aba) return
    ultimaAba.current = aba
    api.get(`/pacientes/${id}`, { params: { aba } }).catch(() => {})
  }, [aba, id])

  const alertas = useQuery({
    queryKey: ['alertas', id],
    queryFn: async () => (await api.get<Pergunta[]>(`/pacientes/${id}/alertas`)).data,
    enabled: pode(eu.perfis, 'anamnese.ver'),
  })

  const atualizar = (p: Paciente) => {
    qc.setQueryData(['paciente', id], p)
    qc.invalidateQueries({ queryKey: ['pacientes'] })
    setJanela(null)
  }

  const salvar = useMutation({
    mutationFn: async (d: Record<string, string>) =>
      (await api.put<Paciente>(`/pacientes/${id}`, d)).data,
    onSuccess: (p) => {
      atualizar(p)
      avisar('Cadastro atualizado')
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const situacao = useMutation({
    mutationFn: async (d: { acao: 'inativar' | 'ativar'; motivo?: string; descricao?: string }) =>
      (await api.post<Paciente>(`/pacientes/${id}/${d.acao}`, d)).data,
    onSuccess: (p) => {
      atualizar(p)
      avisar(p.ativo ? 'Paciente ativado' : 'Paciente inativado')
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const excluir = useMutation({
    mutationFn: async () => (await api.delete<{ mensagem: string }>(`/pacientes/${id}`)).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['pacientes'] })
      avisar(r.mensagem)
      navegar({ to: '/pacientes' })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  if (ficha.isPending) return <p className="text-suave">Carregando…</p>
  if (ficha.isError) return <p className="text-perigo">{mensagemDeErro(ficha.error)}</p>
  const p = ficha.data
  const iniciais = p.nome
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="space-y-4">
      <header className="cartao flex flex-wrap items-center gap-4">
        <div className="grid size-12 place-items-center rounded-full bg-primaria-clara font-semibold text-primaria">
          {iniciais}
        </div>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {p.nome} <Situacao ativo={p.ativo} />
          </h1>
          <p className="text-suave">{p.celular || 'Sem celular cadastrado'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pode(eu.perfis, 'paciente.editar') && (
            <button className="botao-leve" onClick={() => setJanela('editar')}>
              Editar
            </button>
          )}
          {pode(eu.perfis, 'paciente.inativar') &&
            (p.ativo ? (
              <button className="botao-leve" onClick={() => setJanela('inativar')}>
                Inativar paciente
              </button>
            ) : (
              <button className="botao-leve" onClick={() => situacao.mutate({ acao: 'ativar' })}>
                Ativar paciente
              </button>
            ))}
          {pode(eu.perfis, 'paciente.excluir') && (
            <button className="botao-leve text-perigo" onClick={() => setJanela('excluir')}>
              Excluir paciente
            </button>
          )}
        </div>
      </header>

      {!p.ativo && p.motivoInativacao && (
        <p className="cartao border-perigo/40">
          Inativo por: {MOTIVOS_INATIVACAO[p.motivoInativacao]}
          {p.motivoInativacaoDescricao && ` — ${p.motivoInativacaoDescricao}`}. Não pode receber
          novas consultas.
        </p>
      )}

      {!!alertas.data?.length && (
        <div role="alert" className="cartao flex flex-wrap items-center gap-2 border-perigo/50">
          <span className="font-medium text-perigo">Alertas da anamnese:</span>
          {alertas.data.map((a) => (
            <span key={a.texto} className="rounded-full bg-perigo/10 px-2 py-0.5 text-perigo">
              {a.texto.replace(/[?]$/, '')}: {a.resposta}
              {a.descricao && ` (${a.descricao})`}
            </span>
          ))}
        </div>
      )}

      <Abas abas={[...abas]} atual={aba} aoTrocar={trocarAba} />

      {aba === 'visao-geral' && <VisaoGeral paciente={p} irPara={trocarAba} />}
      {aba === 'orcamentos' && <OrcamentosPaciente paciente={p} />}
      {aba === 'financeiro' && <FinanceiroPaciente paciente={p} />}
      {aba === 'fotos' && <Arquivos paciente={p} categoria="FOTO" />}
      {aba === 'plano' && <PlanoFichaClinica paciente={p} />}
      {aba === 'especialidades' && <FichasEspecialidade paciente={p} />}
      {aba === 'odontograma' && <Odontograma paciente={p} />}
      {aba === 'anamnese' && <Anamneses paciente={p} />}
      {aba === 'documentos' && <Documentos paciente={p} />}
      {aba === 'exames' && <Arquivos paciente={p} categoria="EXAME" />}
      {aba === 'recibos' && <RecibosPaciente paciente={p} />}
      {aba === 'agendamentos' && <AgendamentosPaciente paciente={p} />}
      {aba === 'indicacoes' && <Indicacoes paciente={p} />}

      <Dialogo
        aberto={janela === 'editar'}
        aoFechar={() => setJanela(null)}
        titulo="Editar paciente"
      >
        <FormPaciente
          inicial={p}
          textoBotao="Salvar"
          enviando={salvar.isPending}
          erros={errosDosCampos(salvar.error)}
          aoEnviar={(d) => salvar.mutate(d)}
        />
      </Dialogo>

      <Dialogo
        aberto={janela === 'inativar'}
        aoFechar={() => setJanela(null)}
        titulo="Inativar paciente"
      >
        <Inativar
          enviando={situacao.isPending}
          aoConfirmar={(m, d) => situacao.mutate({ acao: 'inativar', motivo: m, descricao: d })}
        />
      </Dialogo>

      <Dialogo
        aberto={janela === 'excluir'}
        aoFechar={() => setJanela(null)}
        titulo="Excluir paciente"
      >
        <p>
          Excluir <strong>{p.nome}</strong>? A ficha sai das buscas e vai para a lixeira, de onde o
          administrador pode restaurá-la.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="botao-leve" onClick={() => setJanela(null)}>
            Cancelar
          </button>
          <button
            className="botao-perigo"
            disabled={excluir.isPending}
            onClick={() => excluir.mutate()}
          >
            Excluir paciente
          </button>
        </div>
      </Dialogo>
    </div>
  )
}

interface Resumo {
  proximaConsulta: { data: string; inicio: string; profissional: { nome: string } } | null
  retornos: { id: number; data: string; motivo: string | null; profissional: { nome: string } }[]
  orcamentosAbertos: { id: number; totalCentavos: number }[]
  notas: { id: number; texto: string; criadoEm: string; criadoPor: { nome: string } }[]
  anamnese: { id: number; criadoEm: string; alertas: Pergunta[] } | null
}

function VisaoGeral({
  paciente: p,
  irPara,
}: {
  paciente: Paciente
  irPara: (a: AbaFicha) => void
}) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const [novoRetorno, setNovoRetorno] = useState(false)
  const [nota, setNota] = useState('')
  const resumo = useQuery({
    queryKey: ['resumo', p.id],
    queryFn: async () => (await api.get<Resumo>(`/pacientes/${p.id}/resumo`)).data,
  })
  const salvarNota = useMutation({
    mutationFn: async () => (await api.post(`/pacientes/${p.id}/notas`, { texto: nota })).data,
    onSuccess: () => {
      setNota('')
      qc.invalidateQueries({ queryKey: ['resumo', p.id] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const r = resumo.data
  const totalAberto = r?.orcamentosAbertos.reduce((s, o) => s + o.totalCentavos, 0) ?? 0
  const atalho = (a: AbaFicha, texto: string) => (
    <button className="text-primaria hover:underline" onClick={() => irPara(a)}>
      {texto}
    </button>
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Bloco titulo="Cadastro">
          <Info rotulo="Apelido" valor={p.apelido} />
          <Info
            rotulo="Nascimento"
            valor={`${dataBR(p.nascimento)} (${idade(p.nascimento)} anos)`}
          />
          <Info rotulo="CPF" valor={cpfBR(p.cpf)} />
          <Info rotulo="RG" valor={p.rg} />
          <Info rotulo="Sexo" valor={p.sexo} />
          <Info rotulo="Estado civil" valor={p.estadoCivil} />
          <Info rotulo="Cadastrado em" valor={dataBR(p.criadoEm)} />
        </Bloco>
        <Bloco titulo="Contato">
          <Info rotulo="Celular / WhatsApp" valor={p.celular} />
          <Info rotulo="Telefone fixo" valor={p.telefone} />
          <Info rotulo="E-mail" valor={p.email} />
          <Info
            rotulo="Como conheceu"
            valor={[p.comoConheceu, p.indicadoPor].filter(Boolean).join(': ')}
          />
        </Bloco>
        <Bloco titulo="Complemento">
          <Info rotulo="Mãe" valor={p.nomeMae} />
          <Info rotulo="Pai" valor={p.nomePai} />
          <Info
            rotulo="Responsável legal"
            valor={[p.responsavelNome, p.responsavelParentesco, cpfBR(p.responsavelCpf)]
              .filter(Boolean)
              .join(' · ')}
          />
          <Info rotulo="Observações" valor={p.observacoes} />
        </Bloco>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="cartao space-y-2">
          <h2 className="font-semibold">Próximo agendamento</h2>
          {r?.proximaConsulta ? (
            <p>
              {dataBR(r.proximaConsulta.data)} às {r.proximaConsulta.inicio}
              <br />
              <span className="text-suave">{r.proximaConsulta.profissional.nome}</span>
            </p>
          ) : (
            <p className="text-suave">Nenhuma consulta marcada.</p>
          )}
          {pode(eu.perfis, 'agenda.ver') && atalho('agendamentos', 'Ver agendamentos')}
        </section>

        {pode(eu.perfis, 'anamnese.ver') && (
          <section className="cartao space-y-2">
            <h2 className="font-semibold">Anamnese</h2>
            {r?.anamnese ? (
              <p>
                Atual, de {dataBR(r.anamnese.criadoEm)}
                <br />
                <span className={r.anamnese.alertas.length ? 'text-perigo' : 'text-suave'}>
                  {r.anamnese.alertas.length
                    ? `${r.anamnese.alertas.length} alerta(s)`
                    : 'Sem alertas'}
                </span>
              </p>
            ) : (
              <p className="text-suave">Ainda não preenchida.</p>
            )}
            {atalho('anamnese', 'Abrir anamnese')}
          </section>
        )}

        <section className="cartao space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Alerta de retorno</h2>
            {pode(eu.perfis, 'agenda.editar') && (
              <button
                className="text-primaria hover:underline"
                onClick={() => setNovoRetorno(true)}
              >
                Novo alerta
              </button>
            )}
          </div>
          {r?.retornos.length === 0 && <p className="text-suave">Nenhum retorno pendente.</p>}
          <ul className="space-y-1">
            {r?.retornos.map((x) => (
              <li key={x.id}>
                {dataBR(x.data)} · {x.profissional.nome}
                {x.motivo && <span className="text-suave"> — {x.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao space-y-2">
          <h2 className="font-semibold">Orçamentos em aberto</h2>
          {r?.orcamentosAbertos.length ? (
            <p>
              {r.orcamentosAbertos.length} orçamento(s) · {reais(totalAberto)}
            </p>
          ) : (
            <p className="text-suave">Nenhum orçamento em aberto.</p>
          )}
          {pode(eu.perfis, 'orcamento.ver') && atalho('orcamentos', 'Ver orçamentos')}
        </section>
      </div>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Notas gerais</h2>
        {pode(eu.perfis, 'paciente.editar') && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              salvarNota.mutate()
            }}
          >
            <input
              className="campo"
              value={nota}
              maxLength={1500}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escreva uma nota sobre o paciente"
              aria-label="Nova nota"
            />
            <button className="botao shrink-0" disabled={!nota.trim() || salvarNota.isPending}>
              Adicionar
            </button>
          </form>
        )}
        {r?.notas.length === 0 && <p className="text-suave">Nenhuma nota.</p>}
        <ul className="space-y-2">
          {r?.notas.map((n) => (
            <li key={n.id} className="border-l-2 border-borda pl-3">
              <p className="whitespace-pre-wrap">{n.texto}</p>
              <p className="text-xs text-suave">
                {n.criadoPor.nome} · {new Date(n.criadoEm).toLocaleString('pt-BR')}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Dialogo
        aberto={novoRetorno}
        aoFechar={() => setNovoRetorno(false)}
        titulo="Alerta de retorno"
      >
        <NovoRetorno
          paciente={p}
          aoTerminar={() => {
            setNovoRetorno(false)
            qc.invalidateQueries({ queryKey: ['resumo', p.id] })
          }}
        />
      </Dialogo>
    </div>
  )
}

function Inativar(props: {
  enviando: boolean
  aoConfirmar: (motivo: string, descricao: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [descricao, setDescricao] = useState('')
  const ok = motivo && (motivo !== 'OUTROS' || descricao.trim())
  return (
    <div className="space-y-3">
      <p>Paciente inativo continua com a ficha acessível, mas não pode receber novas consultas.</p>
      <fieldset className="space-y-2">
        <legend className="rotulo">Motivo *</legend>
        {Object.entries(MOTIVOS_INATIVACAO).map(([valor, texto]) => (
          <label key={valor} className="flex items-center gap-2">
            <input type="radio" name="motivo" value={valor} onChange={() => setMotivo(valor)} />
            {texto}
          </label>
        ))}
      </fieldset>
      {motivo === 'OUTROS' && (
        <label className="block">
          <span className="rotulo">Descreva o motivo *</span>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="campo"
          />
        </label>
      )}
      <div className="flex justify-end">
        <button
          className="botao"
          disabled={!ok || props.enviando}
          onClick={() => props.aoConfirmar(motivo, descricao)}
        >
          Inativar
        </button>
      </div>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="cartao">
      <h2 className="mb-3 font-semibold">{titulo}</h2>
      <dl className="space-y-2">{children}</dl>
    </section>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-suave">{rotulo}</dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}
