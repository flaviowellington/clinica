import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaConfig,
  consultaEu,
  consultaProfissionais,
  cpfBR,
  errosDosCampos,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode, podeNotaFiscal } from '../../../shared/permissoes'
import {
  REGIMES_TRIBUTARIOS,
  TOMADORES_NF,
  normalizar,
  type TomadorNf,
} from '../../../shared/regras'
import { reais } from '../../../shared/financeiro'
import { mascaraCep, mascaraCnpj } from '../../../shared/mascaras'
import type { Emitente } from '../../../shared/configuracoes'
import { CampoCnpj, CampoCpf, CampoMascara } from './CampoMascara'
import { BuscaPaciente } from './BuscaPaciente'
import { Icone } from './Icones'
import { dataCurta, diaDaSemana } from './CalendarioIntervalo'
import {
  PeriodoSuspenso,
  ProfissionaisSuspenso,
  consultaAnalise,
  faturamentoPorProfissional,
  useIntervalo,
  type OrcamentoAnalise,
} from '../paginas/FinanceiroAbas'
import { COR_PADRAO } from '../paginas/Profissionais'

type Endereco = Pick<
  Emitente,
  'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf'
>

/** CEP, rua, número, complemento, bairro, cidade e UF: o mesmo bloco no destinatário e no emitente. */
export function CamposEndereco(props: {
  valores: Partial<Record<keyof Endereco, string | null>> | null | undefined
  erros?: Record<string, string>
}) {
  const v = props.valores ?? {}
  const erros = props.erros ?? {}
  const texto = (nome: keyof Endereco, rotulo: string, extra = {}) => (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      <input
        name={nome}
        defaultValue={v[nome] ?? ''}
        className="campo"
        aria-invalid={!!erros[nome]}
        {...extra}
      />
      {erros[nome] && <span className="erro-campo">{erros[nome]}</span>}
    </label>
  )
  return (
    <div className="grid gap-x-3 gap-y-4 sm:grid-cols-6">
      <label className="block sm:col-span-2">
        <span className="rotulo">CEP</span>
        <CampoMascara
          name="cep"
          mascara={mascaraCep}
          defaultValue={v.cep ?? ''}
          inputMode="numeric"
          maxLength={9}
          placeholder="00000-000"
          erro={erros.cep}
        />
      </label>
      <div className="sm:col-span-4">{texto('logradouro', 'Endereço (rua, avenida)')}</div>
      <div className="sm:col-span-2">{texto('numero', 'Número')}</div>
      <div className="sm:col-span-4">{texto('complemento', 'Complemento')}</div>
      <div className="sm:col-span-2">{texto('bairro', 'Bairro')}</div>
      <div className="sm:col-span-3">{texto('cidade', 'Cidade')}</div>
      <div className="sm:col-span-1">
        {texto('uf', 'UF', { maxLength: 2, className: 'campo uppercase' })}
      </div>
    </div>
  )
}

/** CNPJ ou CPF formatado para leitura. */
export const documentoBR = (tipo: 'PJ' | 'PF', doc: string | null) =>
  doc ? (tipo === 'PJ' ? mascaraCnpj(doc) : cpfBR(doc)) : ''

/** "Rua X, 12, ap 3 – Bairro – Cidade/UF – 00000-000" */
const enderecoTexto = (e: Partial<Record<keyof Endereco, string | null>> | null | undefined) =>
  e
    ? [
        [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', '),
        e.bairro,
        [e.cidade, e.uf].filter(Boolean).join('/'),
        e.cep && mascaraCep(e.cep),
      ]
        .filter(Boolean)
        .join(' – ')
    : ''

const Linha = (props: { rotulo: string; valor: string | null | undefined }) => (
  <div className="min-w-0">
    <dt className="text-xs text-suave">{props.rotulo}</dt>
    <dd className="font-bold break-words">{props.valor || '—'}</dd>
  </div>
)

/** Nome e CPF que vão na nota quando vêm do cadastro. */
const doCadastro = (
  p: Paciente,
): Record<Exclude<TomadorNf, 'OUTRO' | 'EMPRESA'>, [string | null, string | null]> => ({
  PACIENTE: [p.nome, p.cpf],
  MAE: [p.nomeMae, p.cpfMae],
  PAI: [p.nomePai, p.cpfPai],
  RESPONSAVEL: [p.responsavelNome, p.responsavelCpf],
})

/** Em nome de quem sai a nota (o que está salvo na ficha) e o que falta para emitir. */
function tomadorDe(p: Paciente) {
  const nf = p.notaFiscal
  const tomador = nf?.tomador ?? 'PACIENTE'
  const pj = tomador === 'EMPRESA'
  const [nome, doc] =
    tomador === 'EMPRESA'
      ? [nf?.nome, nf?.cnpj ? mascaraCnpj(nf.cnpj) : '']
      : tomador === 'OUTRO'
        ? [nf?.nome, cpfBR(nf?.cpf ?? null)]
        : [doCadastro(p)[tomador][0], cpfBR(doCadastro(p)[tomador][1])]
  const endereco = enderecoTexto(nf)
  const falta = [
    !nome && 'nome',
    !doc && tomador !== 'OUTRO' && (pj ? 'CNPJ' : 'CPF'),
    !(nf?.logradouro && nf.cidade) && 'endereço',
  ].filter(Boolean) as string[]
  return { tomador, rotuloDoc: pj ? 'CNPJ' : 'CPF', nome, doc, endereco, falta }
}

type Orc = OrcamentoAnalise
type PacienteLista = { id: number; nome: string; dia: string; os: Orc[] }

/**
 * Financeiro → Nota fiscal: pacientes com orçamento aprovado (já pago) no período, à esquerda;
 * o escolhido abre destinatário, o que entra na nota e a prévia.
 */
export function NotaFiscalBusca() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  // A lista sai da análise do Financeiro; quem só tem a permissão da nota busca o paciente.
  const veLista = pode(eu.perfis, 'financeiro.ver')
  const p = useIntervalo('ano')
  const [ocultos, setOcultos] = useState<number[]>([])
  const [busca, setBusca] = useState('')
  const [id, setId] = useState<number | null>(null)
  const [mostrar, setMostrar] = useState(30)

  const analise = useQuery({
    ...consultaAnalise({ ...p.consulta, profissionalId: '' }),
    enabled: veLista,
  })
  const profs = useQuery(consultaProfissionais)
  const corDe = (pid: number) =>
    profs.data?.profissionais.find((x) => x.id === pid)?.corAgenda ?? COR_PADRAO
  const porProf = faturamentoPorProfissional(analise.data)

  // Um paciente por linha, com os orçamentos dele no período; a API vem do mais novo ao mais antigo.
  const porPaciente = new Map<number, PacienteLista>()
  for (const o of analise.data?.orcamentos ?? []) {
    if (ocultos.includes(o.profissional.id)) continue
    const x = porPaciente.get(o.paciente.id)
    if (x) x.os.push(o)
    else porPaciente.set(o.paciente.id, { ...o.paciente, dia: o.aprovadoEm, os: [o] })
  }
  const termo = normalizar(busca.trim())
  const lista = [...porPaciente.values()].filter(
    (x) =>
      !termo ||
      normalizar(x.nome).includes(termo) ||
      x.os.some(
        (o) =>
          String(o.id) === termo.replace(/\D/g, '') ||
          o.itens.some((i) => normalizar(i.nome).includes(termo)),
      ),
  )
  const grupos: { dia: string; ls: PacienteLista[] }[] = []
  for (const x of lista.slice(0, mostrar)) {
    const g = grupos.at(-1)
    if (g?.dia === x.dia) g.ls.push(x)
    else grupos.push({ dia: x.dia, ls: [x] })
  }
  const total = lista.reduce((s, x) => s + x.os.reduce((t, o) => t + o.totalCentavos, 0), 0)

  // Mesma consulta da ficha: abrir aqui também grava quem abriu (R-003).
  const ficha = useQuery({
    queryKey: ['paciente', String(id)],
    queryFn: async () =>
      (await api.get<Paciente>(`/pacientes/${id}`, { params: { aba: 'nota-fiscal' } })).data,
    enabled: id !== null,
  })

  function escolher(novo: number | null) {
    setId(novo)
    // No celular o detalhe fica embaixo da lista: leva até ele.
    if (novo !== null && matchMedia('(max-width: 1023px)').matches)
      requestAnimationFrame(() => document.getElementById('nf-detalhe')?.scrollIntoView())
  }

  return (
    // ≥1280px: a tela cabe na janela (abas do Financeiro + respiro do <main> ≈ 6.75rem); só as listas rolam.
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 xl:h-[calc(100vh-6.75rem)]">
      <header className="flex flex-wrap items-center gap-3.5">
        <h1 className="titulo">Nota fiscal</h1>
        {veLista && (
          <>
            <span aria-hidden="true" className="h-6 w-px bg-borda" />
            <span className="text-base text-suave">
              {analise.isPending
                ? 'Carregando…'
                : `${lista.length} ${lista.length === 1 ? 'paciente' : 'pacientes'} · ${reais(total)}`}
            </span>
          </>
        )}
      </header>

      {/* ---------- Filtros (barra padrão do Financeiro) ---------- */}
      {veLista && (
        <div className="cartao flex flex-wrap items-center gap-2 py-2">
          <PeriodoSuspenso p={p} comAno />
          <ProfissionaisSuspenso
            ocultos={ocultos}
            aoMudar={setOcultos}
            valor={(pid) => reais(porProf.get(pid) ?? 0)}
          />
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] xl:min-h-0 xl:flex-1 xl:grid-cols-[19rem_minmax(0,1fr)] xl:items-stretch">
        {veLista ? (
          <section
            className={`cartao flex min-w-0 flex-col overflow-hidden p-0 xl:min-h-0 ${analise.isFetching ? 'opacity-60' : ''}`}
            aria-label="Pacientes"
          >
            {/* Mesma linha de busca de Orçamentos abertos e Aprovações. */}
            <div className="flex items-center gap-2 border-b border-borda p-3">
              <label className="relative min-w-0 flex-1">
                <Icone
                  nome="busca"
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-suave"
                />
                <span className="sr-only">Buscar paciente</span>
                <input
                  type="search"
                  className="campo min-h-11 py-1.5 pl-9 md:min-h-0"
                  placeholder="Buscar paciente, procedimento ou nº"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
            </div>
            {analise.isError && (
              <p className="alerta-perigo m-3">{mensagemDeErro(analise.error)}</p>
            )}
            {!analise.isPending && !lista.length && (
              <p className="p-4 text-suave">Nenhum orçamento aprovado no período.</p>
            )}
            <div className="lg:max-h-[65vh] lg:overflow-y-auto lg:overscroll-contain xl:max-h-none xl:min-h-0 xl:flex-1">
              {grupos.map((g) => (
                <div key={g.dia}>
                  <h3 className="px-4 pt-3 pb-1 text-sm font-extrabold text-suave">
                    {diaDaSemana(g.dia, p.hoje)}
                  </h3>
                  {g.ls.map((x) => {
                    const itens = x.os.reduce((s, o) => s + o.itens.length, 0)
                    return (
                      <button
                        key={x.id}
                        type="button"
                        aria-pressed={x.id === id}
                        onClick={() => escolher(x.id)}
                        className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-primaria-clara ${x.id === id ? 'bg-primaria-clara shadow-[inset_3px_0_0_var(--primaria)]' : ''}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-extrabold">{x.nome}</span>
                          <span className="block truncate text-xs text-suave">
                            {itens} {itens === 1 ? 'procedimento' : 'procedimentos'} ·{' '}
                            {x.os[0].profissional.nome}
                          </span>
                        </span>
                        <span className="font-extrabold tabular-nums">
                          {reais(x.os.reduce((s, o) => s + o.totalCentavos, 0))}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {lista.length > mostrar && (
                <div className="border-t border-borda p-3">
                  <button
                    type="button"
                    className="botao-leve w-full"
                    onClick={() => setMostrar(mostrar + 30)}
                  >
                    Carregar mais ({lista.length - mostrar})
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="cartao min-w-0 space-y-2">
            <h2 id="nf-busca" className="text-lg">
              Paciente
            </h2>
            <BuscaPaciente
              rotulo="nf-busca"
              valor={id !== null ? (ficha.data ?? null) : null}
              aoEscolher={(x) => setId(x?.id ?? null)}
            />
          </section>
        )}

        <div id="nf-detalhe" className="min-w-0 scroll-mt-4 xl:min-h-0">
          {id === null ? (
            <p className="cartao text-suave">
              {veLista
                ? 'Escolha um paciente na lista para montar a nota.'
                : 'Busque o paciente para ver os dados da nota.'}
            </p>
          ) : ficha.data ? (
            <NotaDoPaciente
              key={`${id}-${p.consulta.de}-${p.consulta.ate}`}
              paciente={ficha.data}
              os={porPaciente.get(id)?.os ?? []}
              corDe={corDe}
              periodo={p.tudo ? 'todo o período' : p.resumo}
            />
          ) : (
            <p className="cartao text-suave">
              {ficha.isError ? mensagemDeErro(ficha.error) : 'Carregando…'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Destinatário, orçamentos que entram e a prévia da nota de um paciente. */
function NotaDoPaciente(props: {
  paciente: Paciente
  os: Orc[]
  corDe: (id: number) => string
  periodo: string
}) {
  const { paciente: pac, os } = props
  const { data: eu } = useSuspenseQuery(consultaEu)
  const emitentes = useQuery(consultaConfig('emitentes'))
  const emitente = emitentes.data?.perfis[emitentes.data.ativo]
  const [editando, setEditando] = useState(false)
  const [marcados, setMarcados] = useState(() => os.map((o) => o.id))
  const [descricaoEditada, setDescricao] = useState<string | null>(null)

  const t = tomadorDe(pac)
  const escolhidos = os.filter((o) => marcados.includes(o.id))
  const valor = escolhidos.reduce((s, o) => s + o.totalCentavos, 0)
  const automatica = escolhidos.length
    ? `Serviços odontológicos: ${escolhidos.flatMap((o) => o.itens.map((i) => i.nome)).join('; ')}.`
    : ''
  const descricao = descricaoEditada ?? automatica

  async function copiar() {
    const texto = [
      `Tomador: ${t.nome ?? ''}`,
      `${t.rotuloDoc}: ${t.doc}`,
      t.endereco && `Endereço: ${t.endereco}`,
      `Descrição: ${descricao}`,
      `Valor: ${reais(valor)}`,
      pac.notaFiscal?.observacoes && `Observação: ${pac.notaFiscal.observacoes}`,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      avisar('Dados da nota copiados')
    } catch {
      avisar('Não foi possível copiar. Selecione o texto da prévia e copie.', true)
    }
  }

  return (
    <div className="flex flex-col gap-4 xl:h-full xl:min-h-0">
      {/* 1 · Destinatário: uma faixa só; o formulário abre nela e rola se passar da metade. */}
      <section
        className="cartao shrink-0 space-y-3 px-4 py-3 xl:max-h-[55%] xl:overflow-y-auto"
        aria-labelledby="nf-dest"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="nf-dest" className="text-base whitespace-nowrap">
            1 · Destinatário
          </h2>
          {!editando && (
            <dl className="grid min-w-0 flex-1 basis-80 gap-x-5 gap-y-2 sm:grid-cols-[auto_auto_auto_minmax(0,1fr)]">
              <Linha rotulo="Em nome de" valor={TOMADORES_NF[t.tomador]} />
              <Linha rotulo="Nome" valor={t.nome} />
              <Linha rotulo={t.rotuloDoc} valor={t.doc} />
              <Linha rotulo="Endereço" valor={t.endereco} />
            </dl>
          )}
          <div className="ml-auto flex items-center gap-3">
            {!editando && !t.falta.length && (
              <span className="etiqueta etiqueta-sucesso whitespace-nowrap">✓ Completo</span>
            )}
            {podeNotaFiscal(eu.perfis) && (
              <button
                type="button"
                className="botao-leve"
                aria-expanded={editando}
                onClick={() => setEditando(!editando)}
              >
                {editando ? 'Fechar' : 'Alterar'}
              </button>
            )}
          </div>
        </div>
        {editando ? (
          <NotaFiscalPaciente
            key={JSON.stringify(pac.notaFiscal)}
            paciente={pac}
            aoSalvar={() => setEditando(false)}
          />
        ) : (
          t.falta.length > 0 && (
            <p className="alerta-aviso">
              Falta {t.falta.join(', ')} para a nota. Complete em Alterar
              {t.tomador !== 'EMPRESA' && t.tomador !== 'OUTRO' && ' ou no cadastro do paciente'}.
            </p>
          )
        )}
      </section>

      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-stretch">
        <section
          className="cartao flex min-w-0 flex-col overflow-hidden p-0 xl:min-h-0"
          aria-labelledby="nf-itens"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
            <h2 id="nf-itens" className="text-lg">
              2 · O que entra na nota
            </h2>
            <span className="text-sm text-suave">Aprovados em {props.periodo}</span>
          </header>
          {os.length > 1 && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-borda bg-superficie-2 px-4 py-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={escolhidos.length === os.length}
                ref={(el) => {
                  if (el) el.indeterminate = escolhidos.length > 0 && escolhidos.length < os.length
                }}
                onChange={() =>
                  setMarcados(escolhidos.length === os.length ? [] : os.map((o) => o.id))
                }
              />
              Selecionar todos
              <span className="ml-auto font-semibold text-suave">
                {escolhidos.length}/{os.length} · {reais(valor)}
              </span>
            </label>
          )}
          <div className="lg:max-h-[28rem] lg:overflow-y-auto lg:overscroll-contain xl:max-h-none xl:min-h-0 xl:flex-1">
            {!os.length && (
              <p className="px-4 pb-4 text-suave">
                Nenhum orçamento aprovado deste paciente no período.
              </p>
            )}
            {os.map((o) => (
              <label
                key={o.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-borda px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={marcados.includes(o.id)}
                  onChange={() =>
                    setMarcados(
                      marcados.includes(o.id)
                        ? marcados.filter((x) => x !== o.id)
                        : [...marcados, o.id],
                    )
                  }
                />
                <span
                  aria-hidden="true"
                  className="w-1 shrink-0 self-stretch rounded"
                  style={{ background: props.corDe(o.profissional.id) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap gap-1">
                    {o.itens.map((i, k) => (
                      <span
                        key={k}
                        className="rounded-lg bg-superficie-2 px-2 py-0.5 text-sm font-bold"
                      >
                        {i.nome}
                      </span>
                    ))}
                  </span>
                  <span className="mt-1 block text-xs text-suave">
                    {o.profissional.nome} · aprovado {dataCurta(o.aprovadoEm)} · nº {o.id}
                    {o.descontoCentavos > 0 && ` · desconto ${reais(o.descontoCentavos)}`}
                  </span>
                </span>
                <span className="font-extrabold tabular-nums">{reais(o.totalCentavos)}</span>
              </label>
            ))}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-3 xl:min-h-0" aria-label="Prévia da nota">
          <div className="cartao flex flex-col overflow-hidden p-0 xl:min-h-0 xl:flex-1">
            <div className="flex items-center justify-between gap-2 bg-titulo px-4 py-3 text-fundo">
              <strong>3 · Prévia da nota</strong>
              <span className="rounded-full bg-destaque px-2.5 py-0.5 text-xs font-extrabold text-[#2a1840]">
                Rascunho
              </span>
            </div>
            <div className="flex flex-col gap-3 p-4 text-sm xl:min-h-0 xl:flex-1">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs tracking-wide text-suave uppercase">Prestador</dt>
                  <dd className="font-bold break-words">{emitente?.razaoSocial || '—'}</dd>
                  <dd className="text-xs text-suave">
                    {emitente
                      ? `${emitente.tipo === 'PJ' ? 'CNPJ' : 'CPF'} ${documentoBR(emitente.tipo, emitente.documento)} · ${REGIMES_TRIBUTARIOS[emitente.regime as keyof typeof REGIMES_TRIBUTARIOS] ?? ''}`
                      : 'Cadastre em Configurações → Clínica'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs tracking-wide text-suave uppercase">Tomador</dt>
                  <dd className="font-bold break-words">{t.nome || '—'}</dd>
                  <dd className="text-xs text-suave">
                    {t.rotuloDoc} {t.doc || '—'}
                  </dd>
                </div>
              </dl>
              {/* A descrição é editada aqui mesmo, na prévia. */}
              <label className="flex flex-col border-t border-dashed border-borda pt-3 xl:min-h-0 xl:flex-1">
                <span className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs tracking-wide text-suave uppercase">Descrição</span>
                  {descricaoEditada !== null ? (
                    <button
                      type="button"
                      className="botao-fantasma botao-pequeno"
                      onClick={() => setDescricao(null)}
                    >
                      Voltar ao texto automático
                    </button>
                  ) : (
                    <span className="text-xs text-suave">pode editar</span>
                  )}
                </span>
                <textarea
                  className="campo min-h-24 resize-none xl:flex-1"
                  rows={4}
                  maxLength={2000}
                  value={descricao}
                  placeholder="Marque ao menos um orçamento."
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </label>
              <div className="flex shrink-0 items-baseline justify-between rounded-xl bg-superficie-2 px-3 py-2.5">
                <span className="text-suave">Valor da nota</span>
                <strong className="text-2xl font-extrabold text-titulo tabular-nums">
                  {reais(valor)}
                </strong>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="botao min-h-12 w-full shrink-0"
            disabled={!escolhidos.length}
            onClick={copiar}
          >
            Copiar dados da nota
          </button>
          <p className="shrink-0 text-xs text-suave">
            A emissão automática da NFS-e ainda não está ligada: copie os dados e emita no portal da
            prefeitura.
            {eu.perfis.includes('ADMINISTRADOR') && (
              <>
                {' '}
                <Link to="/configuracoes" className="font-bold text-primaria hover:underline">
                  Alterar o prestador
                </Link>
              </>
            )}
          </p>
        </aside>
      </div>
    </div>
  )
}

/** Aba "Nota fiscal" da ficha (e do Financeiro): em nome de quem sai a nota, endereço e observação. */
export function NotaFiscalPaciente({
  paciente: p,
  aoSalvar,
}: {
  paciente: Paciente
  aoSalvar?: () => void
}) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const nf = p.notaFiscal
  const [tomador, setTomador] = useState<TomadorNf>(nf?.tomador ?? 'PACIENTE')

  const salvar = useMutation({
    mutationFn: async (d: Record<string, string>) =>
      (await api.put<Paciente>(`/pacientes/${p.id}/nota-fiscal`, d)).data,
    onSuccess: (novo) => {
      qc.setQueryData(['paciente', String(p.id)], novo)
      avisar('Dados da nota fiscal salvos')
      aoSalvar?.()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    if (!form.checkValidity()) {
      form.querySelector<HTMLInputElement>(':invalid')?.focus()
      return
    }
    salvar.mutate(Object.fromEntries(new FormData(form)) as Record<string, string>)
  }

  const cadastro = doCadastro(p)

  const texto = (nome: 'nome' | 'inscricaoEstadual', rotulo: string, extra = {}) => (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      <input
        name={nome}
        defaultValue={nf?.[nome] ?? ''}
        className="campo"
        aria-invalid={!!erros[nome]}
        {...extra}
      />
      {erros[nome] && <span className="erro-campo">{erros[nome]}</span>}
    </label>
  )

  return (
    <form onSubmit={enviar} noValidate className="cartao space-y-6">
      <fieldset disabled={!podeNotaFiscal(eu.perfis)} className="space-y-6">
        <fieldset>
          <legend className="rotulo mb-2">Em nome de quem sai a nota?</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {(Object.keys(TOMADORES_NF) as TomadorNf[]).map((t) => (
              <label key={t} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="tomador"
                  value={t}
                  checked={tomador === t}
                  onChange={() => setTomador(t)}
                />
                {TOMADORES_NF[t]}
              </label>
            ))}
          </div>
        </fieldset>

        {tomador === 'EMPRESA' ? (
          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              {texto('nome', 'Razão social *', { maxLength: 150, required: true })}
            </div>
            <label className="block">
              <span className="rotulo">CNPJ *</span>
              <CampoCnpj name="cnpj" defaultValue={nf?.cnpj ?? ''} erro={erros.cnpj} required />
            </label>
            {texto('inscricaoEstadual', 'Inscrição estadual', {
              maxLength: 20,
              placeholder: 'Vazio se for isenta',
            })}
          </div>
        ) : tomador === 'OUTRO' ? (
          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
            {texto('nome', 'Nome *', { maxLength: 150, required: true })}
            <label className="block">
              <span className="rotulo">CPF</span>
              <CampoCpf name="cpf" defaultValue={nf?.cpf ?? ''} erro={erros.cpf} />
            </label>
          </div>
        ) : (
          <dl className="grid gap-3 rounded-xl bg-superficie-2 p-3 sm:grid-cols-2">
            <Linha rotulo="Nome" valor={cadastro[tomador][0]} />
            <Linha rotulo="CPF" valor={cpfBR(cadastro[tomador][1])} />
            {!cadastro[tomador].every(Boolean) && (
              <p className="text-xs text-suave sm:col-span-2">
                Falta nome ou CPF no cadastro do paciente: complete em Editar.
              </p>
            )}
          </dl>
        )}

        <CamposEndereco valores={nf} erros={erros} />

        <label className="block">
          <span className="rotulo">Observação</span>
          <textarea
            name="observacoes"
            defaultValue={nf?.observacoes ?? ''}
            rows={3}
            maxLength={2000}
            className="campo"
            placeholder="Ex.: enviar a nota por e-mail, descrição do serviço"
          />
        </label>

        <div className="flex justify-end">
          <button className="botao" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </fieldset>
    </form>
  )
}
