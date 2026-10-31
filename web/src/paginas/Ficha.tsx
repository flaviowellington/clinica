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
import type { Pergunta } from '../../../shared/prontuario'
import { Dialogo } from '../componentes/Dialogo'
import { FormPaciente } from '../componentes/FormPaciente'
import { NovoRetorno } from '../componentes/Retornos'
import { Situacao, whatsapp } from './Pacientes'
import { Icone, type NomeIcone } from '../componentes/Icones'
import { OrcamentosPaciente } from '../componentes/Orcamentos'
import { FichasEspecialidade, Odontograma, PlanoFichaClinica } from '../componentes/Clinico'
import { Anamneses } from '../componentes/Anamnese'
import { Arquivos } from '../componentes/Arquivos'
import { Documentos } from '../componentes/Documentos'
import { AgendamentosPaciente, Indicacoes } from '../componentes/FichaConsultas'

type Janela = 'editar' | 'excluir' | null

/** As 11 seções da ficha (S-003), em grupos no menu lateral. Cada uma só aparece com a permissão. */
const ABAS_FICHA = [
  { id: 'visao-geral', rotulo: 'Visão Geral', acao: 'paciente.ver', grupo: 'Paciente' },
  // Dentro de cada grupo, em ordem alfabética.
  { id: 'agendamentos', rotulo: 'Agendamentos', acao: 'agenda.ver', grupo: 'Atendimento' },
  { id: 'orcamentos', rotulo: 'Orçamentos', acao: 'orcamento.ver', grupo: 'Atendimento' },
  { id: 'anamnese', rotulo: 'Anamnese', acao: 'anamnese.ver', grupo: 'Clínico' },
  {
    id: 'especialidades',
    rotulo: 'Fichas Especialidades',
    acao: 'prontuario.ver',
    grupo: 'Clínico',
  },
  { id: 'odontograma', rotulo: 'Odontograma', acao: 'prontuario.ver', grupo: 'Clínico' },
  { id: 'plano', rotulo: 'Plano e Ficha Clínica', acao: 'prontuario.ver', grupo: 'Clínico' },
  { id: 'documentos', rotulo: 'Documentos', acao: 'prontuario.ver', grupo: 'Arquivos' },
  { id: 'exames', rotulo: 'Exames', acao: 'prontuario.ver', grupo: 'Arquivos' },
  { id: 'fotos', rotulo: 'Fotos', acao: 'fotos.ver', grupo: 'Arquivos' },
  { id: 'indicacoes', rotulo: 'Indicações', acao: 'paciente.ver', grupo: 'Outros' },
] as const satisfies readonly { id: string; rotulo: string; acao: Acao; grupo: string }[]
const GRUPOS_FICHA = ['Paciente', 'Atendimento', 'Clínico', 'Arquivos', 'Outros'] as const
const ICONE_GRUPO: Record<(typeof GRUPOS_FICHA)[number], NomeIcone> = {
  Paciente: 'inicio',
  Atendimento: 'agenda',
  Clínico: 'dente',
  Arquivos: 'pasta',
  Outros: 'reticencias',
}
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

  const ativar = useMutation({
    mutationFn: async () => (await api.post<Paciente>(`/pacientes/${id}/ativar`)).data,
    onSuccess: (p) => {
      atualizar(p)
      avisar('Paciente ativado')
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
  const naVisao = aba === 'visao-geral'

  const acoes = (
    <>
      {pode(eu.perfis, 'paciente.editar') && (
        <button className="botao-leve" onClick={() => setJanela('editar')}>
          Editar
        </button>
      )}
      {pode(eu.perfis, 'paciente.inativar') && !p.ativo && (
        <button className="botao-leve" onClick={() => ativar.mutate()}>
          Ativar paciente
        </button>
      )}
      {pode(eu.perfis, 'paciente.excluir') && (
        <button className="botao-leve text-perigo" onClick={() => setJanela('excluir')}>
          Excluir paciente
        </button>
      )}
    </>
  )

  return (
    <div>
      {/* Cabeçalho fixo em todas as seções: quem é o paciente, alertas de saúde e ações. */}
      <header className="cartao mb-4 p-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <div className="grid size-13 shrink-0 place-items-center rounded-full bg-primaria-clara text-lg font-extrabold text-primaria">
            {iniciais}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl">{p.nome}</h1>
              <Situacao ativo={p.ativo} />
            </div>
            <p className="text-suave">
              {[p.nascimento && `${idade(p.nascimento)} anos`, p.sexo].filter(Boolean).join(' · ')}
            </p>
          </div>
          {!!alertas.data?.length && (
            <div role="alert" className="flex flex-wrap gap-1.5">
              {alertas.data.map((a) => (
                <button
                  key={a.texto}
                  className="etiqueta etiqueta-perigo"
                  title="Ver anamnese"
                  onClick={() => trocarAba('anamnese')}
                >
                  {a.texto.replace(/[?]$/, '')}: {a.resposta}
                  {a.descricao && ` (${a.descricao})`}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {p.celular && (
              <a className="botao" href={whatsapp(p.celular)} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            )}
            {p.email && (
              <a
                className="botao-leve botao-icone size-10"
                href={`mailto:${p.email}`}
                aria-label="Enviar e-mail"
                title="Enviar e-mail"
              >
                <Icone nome="confirmacoes" />
              </a>
            )}
            {acoes}
          </div>
        </div>

        {/* Cada grupo é um trilho de botões; a seção aberta é o botão roxo cheio. */}
        <nav
          aria-label="Seções da ficha"
          className="flex flex-wrap items-end gap-x-3 gap-y-2.5 rounded-b-2xl border-t border-borda bg-superficie-2/50 px-4 pt-3 pb-3.5"
        >
          {GRUPOS_FICHA.map((g) => {
            const itens = abas.filter((a) => a.grupo === g)
            if (!itens.length) return null
            const grupoAtivo = itens.some((a) => a.id === aba)
            return (
              <div key={g} role="group" aria-label={g} className="flex flex-col gap-1.5">
                <p
                  className={`flex items-center gap-1.5 px-1.5 text-[11px] font-extrabold tracking-wide uppercase ${grupoAtivo ? 'text-primaria' : 'text-suave'}`}
                >
                  {/* As reticências têm traço fino: engrossa para ter o mesmo peso dos outros. */}
                  <Icone
                    nome={ICONE_GRUPO[g]}
                    className={`h-3.5 w-3.5 ${g === 'Outros' ? 'stroke-[4]' : ''}`}
                  />
                  {g}
                </p>
                <ul className="flex gap-0.5 rounded-xl border border-borda bg-superficie-2 p-[3px]">
                  {itens.map((a) => (
                    <li key={a.id}>
                      <button
                        aria-current={aba === a.id ? 'page' : undefined}
                        onClick={() => trocarAba(a.id)}
                        className={`rounded-[9px] px-3 py-1.5 font-bold whitespace-nowrap ${aba === a.id ? 'bg-primaria text-sobre-primaria shadow-[0_3px_10px_color-mix(in_srgb,var(--primaria)_35%,transparent)]' : 'text-texto hover:bg-superficie hover:shadow-sm'}`}
                      >
                        {a.rotulo}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </nav>
      </header>

      <div className="min-w-0 space-y-4">
        {!p.ativo && p.motivoInativacao && (
          <p className="cartao border-perigo/40">
            Inativo por: {MOTIVOS_INATIVACAO[p.motivoInativacao]}
            {p.motivoInativacaoDescricao && ` — ${p.motivoInativacaoDescricao}`}. Não pode receber
            novas consultas.
          </p>
        )}

        {naVisao && <VisaoGeral paciente={p} irPara={trocarAba} />}
        {aba === 'orcamentos' && <OrcamentosPaciente paciente={p} />}
        {aba === 'fotos' && <Arquivos paciente={p} categoria="FOTO" />}
        {aba === 'plano' && <PlanoFichaClinica paciente={p} />}
        {aba === 'especialidades' && <FichasEspecialidade paciente={p} />}
        {aba === 'odontograma' && <Odontograma paciente={p} />}
        {aba === 'anamnese' && <Anamneses paciente={p} />}
        {aba === 'documentos' && <Documentos paciente={p} />}
        {aba === 'exames' && <Arquivos paciente={p} categoria="EXAME" />}
        {aba === 'agendamentos' && <AgendamentosPaciente paciente={p} />}
        {aba === 'indicacoes' && <Indicacoes paciente={p} />}
      </div>

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
  const verAnamnese = pode(eu.perfis, 'anamnese.ver')
  const atalho = (a: AbaFicha, texto: string) => (
    <button className="link mt-auto self-start" onClick={() => irPara(a)}>
      {texto}
    </button>
  )
  // Só o que foi preenchido aparece no Cadastro.
  const familia = [
    { rotulo: 'Mãe', valor: p.nomeMae },
    { rotulo: 'Pai', valor: p.nomePai },
    {
      rotulo: 'Responsável legal',
      valor: [p.responsavelNome, p.responsavelParentesco, cpfBR(p.responsavelCpf)]
        .filter(Boolean)
        .join(' · '),
    },
  ].filter((f) => f.valor)

  const consulta = r?.proximaConsulta
  const dia = consulta ? new Date(`${consulta.data.slice(0, 10)}T00:00`) : null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const faltam = dia ? Math.round((dia.getTime() - hoje.getTime()) / 86_400_000) : 0

  return (
    <div className="flex flex-wrap items-start gap-4">
      <aside className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
        <Bloco titulo="Contato">
          <Info rotulo="Celular / WhatsApp" valor={p.celular} />
          <Info rotulo="E-mail" valor={p.email} />
        </Bloco>

        <Bloco titulo="Cadastro" colunas>
          <Info rotulo="Nascimento" valor={dataBR(p.nascimento)} />
          <Info rotulo="CPF" valor={cpfBR(p.cpf)} />
          <Info rotulo="RG" valor={p.rg} />
          <Info rotulo="Estado civil" valor={p.estadoCivil} />
          <Info
            rotulo="Como conheceu"
            valor={[p.comoConheceu, p.indicadoPor ?? p.comoConheceuOutro]
              .filter(Boolean)
              .join(': ')}
          />
          <Info rotulo="Cadastrado em" valor={dataBR(p.criadoEm)} />
          {p.apelido && <Info rotulo="Apelido" valor={p.apelido} />}
          {p.observacoes && (
            <div className="col-span-2">
              <Info rotulo="Observações" valor={p.observacoes} />
            </div>
          )}
          {familia.length > 0 && (
            <div className="col-span-2 space-y-3 border-t border-borda pt-3">
              <p className="text-xs font-bold tracking-wide text-suave uppercase">
                Família e responsável
              </p>
              {familia.map((f) => (
                <Info key={f.rotulo} rotulo={f.rotulo} valor={f.valor} />
              ))}
            </div>
          )}
        </Bloco>
      </aside>

      <div className="flex min-w-0 flex-[999_1_32rem] flex-col gap-4">
        <section className="cartao flex flex-wrap items-center justify-between gap-4 border-primaria/30 bg-primaria-clara">
          {consulta && dia ? (
            <div className="flex items-center gap-4">
              <div className="min-w-16 rounded-xl border border-primaria/30 bg-superficie px-3 py-2 text-center">
                <p className="text-xs font-extrabold text-primaria uppercase">
                  {dia.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                </p>
                <p className="text-2xl font-extrabold text-titulo">{dia.getDate()}</p>
              </div>
              <div>
                <p className="text-xs text-suave">
                  Próxima consulta ·{' '}
                  {faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`}
                </p>
                <p className="text-lg font-bold text-titulo first-letter:uppercase">
                  {dia.toLocaleDateString('pt-BR', { weekday: 'long' })}, {consulta.inicio}
                </p>
                <p className="text-suave">{consulta.profissional.nome}</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-suave">Próxima consulta</p>
              <p className="text-lg font-bold text-titulo">Nenhuma consulta marcada</p>
            </div>
          )}
          {pode(eu.perfis, 'agenda.ver') && (
            <button className="botao-leve" onClick={() => irPara('agendamentos')}>
              Ver agendamentos
            </button>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
          <section className="cartao flex flex-col gap-2">
            <h2 className="text-xs tracking-wide text-suave uppercase">Retorno</h2>
            {r?.retornos.length ? (
              <ul className="space-y-1">
                {r.retornos.map((x) => (
                  <li key={x.id}>
                    <p className="font-bold">{dataBR(x.data)}</p>
                    <p className="text-suave">
                      {[x.motivo, x.profissional.nome].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-suave">Nenhum retorno pendente.</p>
            )}
            {pode(eu.perfis, 'agenda.editar') && p.ativo && (
              <button
                className="botao-leve botao-pequeno mt-auto self-start"
                onClick={() => setNovoRetorno(true)}
              >
                <Icone nome="mais" className="h-3.5 w-3.5" />
                Alerta de retorno
              </button>
            )}
          </section>

          {verAnamnese && (
            <section className="cartao flex flex-col gap-2">
              <h2 className="text-xs tracking-wide text-suave uppercase">Anamnese</h2>
              {r?.anamnese ? (
                <>
                  <p className="font-bold">Atualizada em {dataBR(r.anamnese.criadoEm)}</p>
                  <p className={r.anamnese.alertas.length ? 'font-bold text-perigo' : 'text-suave'}>
                    {r.anamnese.alertas.length
                      ? `${r.anamnese.alertas.length} alerta(s)`
                      : 'Sem alertas'}
                  </p>
                </>
              ) : (
                <p className="text-suave">Ainda não preenchida.</p>
              )}
              {atalho('anamnese', 'Abrir anamnese')}
            </section>
          )}

          <section className="cartao flex flex-col gap-2">
            <h2 className="text-xs tracking-wide text-suave uppercase">Tratamento</h2>
            {r?.orcamentosAbertos.length ? (
              <p className="font-bold">
                {r.orcamentosAbertos.length === 1
                  ? '1 orçamento aguardando'
                  : `${r.orcamentosAbertos.length} orçamentos aguardando`}
              </p>
            ) : (
              <p className="text-suave">Nenhum orçamento em aberto.</p>
            )}
            {pode(eu.perfis, 'orcamento.ver') && atalho('orcamentos', 'Ver orçamentos')}
          </section>
        </div>

        <section className="cartao space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs tracking-wide text-suave uppercase">Notas gerais</h2>
            {!!r?.notas.length && (
              <span className="text-xs text-suave">{r.notas.length} nota(s)</span>
            )}
          </div>
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
              <li key={n.id} className="rounded-xl bg-superficie-2 px-3 py-2">
                <p className="whitespace-pre-wrap">{n.texto}</p>
                <p className="mt-1 text-xs text-suave">
                  {n.criadoPor.nome} · {new Date(n.criadoEm).toLocaleString('pt-BR')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

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

function Bloco(props: { titulo: string; colunas?: boolean; children: ReactNode }) {
  return (
    <section className="cartao">
      <h2 className="mb-3 text-xs tracking-wide text-suave uppercase">{props.titulo}</h2>
      <dl className={props.colunas ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>{props.children}</dl>
    </section>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs text-suave">{rotulo}</dt>
      <dd className="font-bold break-words">{valor || '—'}</dd>
    </div>
  )
}
