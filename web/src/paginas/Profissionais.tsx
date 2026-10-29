import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaConfig, consultaEu, errosDosCampos, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { Dialogo } from '../componentes/Dialogo'
import { CampoCelular, CampoEmail } from '../componentes/CampoMascara'
import { Icone } from '../componentes/Icones'
import { CampoBusca } from '../componentes/BuscaPaciente'
import { FotoRecortada, RecorteFoto, type FotoNova } from '../componentes/RecorteFoto'
import { normalizar } from '../../../shared/regras'

export interface Profissional {
  id: number
  nome: string
  cro: string | null
  especialidade: string | null
  email: string | null
  celular: string | null
  corAgenda: string | null
  ativo: boolean
  fotoEm: string | null
}

const FOTO_MAXIMO_MB = 10

/** Ações que pedem para digitar a palavra (o próprio nome da ação) antes de confirmar. */
type Acao = 'inativar' | 'deletar'
const TEXTOS: Record<
  Acao,
  { titulo: string; aviso: (nome: string) => string; detalhe: string; botao: string }
> = {
  inativar: {
    titulo: 'Inativar profissional',
    aviso: (nome) => `${nome} deixará de aparecer na agenda.`,
    detalhe:
      'O histórico de consultas e prontuários continua guardado. Dá para ativar de novo depois.',
    botao: 'Inativar',
  },
  deletar: {
    titulo: 'Excluir profissional',
    aviso: (nome) => `${nome} será excluído e sairá desta lista.`,
    detalhe:
      'Consultas, orçamentos e prontuários feitos por este profissional continuam guardados.',
    botao: 'Excluir',
  },
}

/** Foto do profissional, ou as iniciais na cor da agenda quando não tem. */
function Retrato(props: {
  p: Pick<Profissional, 'id' | 'nome' | 'corAgenda' | 'fotoEm'>
  className: string
}) {
  const { p } = props
  return p.fotoEm ? (
    <img
      src={`/api/profissionais/${p.id}/foto?v=${encodeURIComponent(p.fotoEm)}`}
      alt=""
      className={`shrink-0 object-cover ${props.className}`}
    />
  ) : (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-extrabold text-white ${props.className}`}
      style={{ backgroundColor: p.corAgenda ?? COR_PADRAO }}
    >
      {iniciais(p.nome) || '?'}
    </span>
  )
}

const iniciais = (nome: string) =>
  nome
    .replace(/^(dra?\.?)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

export const COR_PADRAO = '#0f766e'

/**
 * Especialidade: busca na lista da clínica enquanto digita e oferece adicionar o que foi
 * digitado (mesmo padrão da busca de paciente).
 */
function CampoEspecialidade({ inicial }: { inicial: string }) {
  const qc = useQueryClient()
  const especialidades = useQuery(consultaConfig('especialidades'))
  const [valor, setValor] = useState(inicial)
  const [texto, setTexto] = useState(inicial)
  const [aberta, setAberta] = useState(false)
  const [criando, setCriando] = useState(false)
  // Com a escolhida ainda no campo, mostra a lista toda; filtra só depois que digitar.
  const termo = texto === valor ? '' : texto.trim()
  // Mantém uma especialidade antiga que saiu da lista, para não apagá-la ao salvar.
  const todas = [...new Set([...(especialidades.data ?? []), ...(inicial ? [inicial] : [])])]
  const achadas = todas.filter((e) => normalizar(e).includes(normalizar(termo)))
  const existe = todas.some((e) => normalizar(e) === normalizar(termo))

  const escolher = (e: string) => {
    setValor(e)
    setTexto(e)
    setAberta(false)
  }
  const adicionar = useMutation({
    mutationFn: async (nome: string) =>
      (
        await api.put<string[]>('/configuracoes/especialidades', [
          ...(especialidades.data ?? []),
          nome,
        ])
      ).data,
    onSuccess: (lista, nome) => {
      qc.setQueryData(['config', 'especialidades'], lista)
      escolher(lista.find((e) => normalizar(e) === normalizar(nome)) ?? nome)
      setCriando(false)
      avisar('Especialidade adicionada')
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  return (
    // Lista sobreposta; ao sair do campo, volta para a escolhida (ou limpa, se apagou o texto).
    <div
      className="relative"
      // contains(target): ignora o foco da janela "Nova especialidade", que sobe pelo portal.
      onFocus={(e) => e.currentTarget.contains(e.target) && setAberta(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.target)) return
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setAberta(false)
        if (!texto.trim()) setValor('')
        else setTexto(valor)
      }}
    >
      <input type="hidden" name="especialidade" value={valor} />
      <CampoBusca
        rotulo="p-esp-rotulo"
        placeholder="Buscar ou adicionar"
        valor={texto}
        aoMudar={(v) => {
          setTexto(v)
          setAberta(true)
        }}
        // Enter escolhe a igual ao digitado, ou a única achada; adicionar nova é sempre no clique.
        aoEnter={() => {
          const certa = achadas.find((e) => normalizar(e) === normalizar(termo))
          if (certa || achadas.length === 1) escolher(certa ?? achadas[0])
        }}
      />
      {aberta && (
        <div
          // Clicar na lista não tira o foco da busca (senão ela fecharia antes do clique).
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-borda bg-superficie shadow-[0_10px_30px_-8px_color-mix(in_srgb,black_30%,transparent)]"
        >
          {!existe && (
            <button
              type="button"
              disabled={adicionar.isPending}
              // Com algo digitado, adiciona direto; sem nada, abre a janela para digitar o nome.
              onClick={() => (termo ? adicionar.mutate(termo) : setCriando(true))}
              className="flex w-full items-center gap-2 border-b border-borda bg-superficie-2 px-3 py-2.5 text-left hover:bg-primaria-clara focus-visible:bg-primaria-clara"
            >
              <Icone nome="mais" className="h-5 w-5 shrink-0 text-suave" />
              <span className="min-w-0 truncate">
                Nova especialidade{termo && ': '}
                {termo && <span className="font-bold">{termo}</span>}
              </span>
            </button>
          )}
          <p className="px-3 pt-2 pb-1 text-xs font-bold text-suave">Especialidades</p>
          {achadas.length === 0 && (
            <p className="px-3 pb-3 text-sm text-suave">Nenhuma especialidade com “{termo}”.</p>
          )}
          <ul className="pb-1">
            {achadas.map((e) => (
              <li key={e}>
                <button
                  type="button"
                  onClick={() => escolher(e)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-primaria-clara focus-visible:bg-primaria-clara ${e === valor ? 'font-bold text-primaria' : ''}`}
                >
                  {e}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No <body>: este campo está dentro do form do profissional, e form dentro de form não vale.
          O stopPropagation impede o envio de subir (pela árvore do React) até aquele form. */}
      {createPortal(
        <div onSubmit={(e) => e.stopPropagation()}>
          <Dialogo
            aberto={criando}
            aoFechar={() => setCriando(false)}
            titulo="Nova especialidade"
          >
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                const nome = String(new FormData(e.currentTarget).get('nome') ?? '').trim()
                if (nome) adicionar.mutate(nome)
              }}
            >
              <div>
                <label className="rotulo" htmlFor="esp-nova">
                  Nome *
                </label>
                <input
                  id="esp-nova"
                  name="nome"
                  className="campo"
                  placeholder="Ex.: Harmonização orofacial"
                  maxLength={80}
                  required
                  autoFocus
                />
                <span className="ajuda">Entra na lista da clínica e já fica escolhida.</span>
              </div>
              <div className="flex justify-end gap-2 border-t border-borda pt-4">
                <button type="button" className="botao-leve" onClick={() => setCriando(false)}>
                  Cancelar
                </button>
                <button className="botao" disabled={adicionar.isPending}>
                  Adicionar e usar
                </button>
              </div>
            </form>
          </Dialogo>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** Cadastro dos profissionais da clínica (F-024, S-013). */
export function Profissionais() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const podeEditar = pode(eu.perfis, 'profissional.editar')
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [ativos, setAtivos] = useState(true)
  const [editando, setEditando] = useState<Profissional | 'novo' | null>(null)
  // Ação perigosa esperando a palavra de confirmação.
  const [confirmando, setConfirmando] = useState<{ acao: Acao; p: Profissional } | null>(null)
  const [confirmacao, setConfirmacao] = useState('')
  // Foto escolhida no formulário, enviada ao salvar; 'remover' apaga a atual.
  const [foto, setFoto] = useState<FotoNova | 'remover' | null>(null)
  const [ajustando, setAjustando] = useState<File | null>(null)
  const confirmou = !!confirmando && confirmacao.trim().toLowerCase() === confirmando.acao

  const lista = useQuery({
    queryKey: ['profissionais', busca, ativos],
    queryFn: async () =>
      (
        await api.get<Profissional[]>('/profissionais', {
          params: { busca: busca || undefined, ativos: ativos ? 1 : undefined },
        })
      ).data,
  })

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['profissionais'] })
    qc.invalidateQueries({ queryKey: ['agenda', 'profissionais'] })
  }

  const abrirEditor = (p: Profissional | 'novo') => {
    setFoto(null)
    setEditando(p)
  }
  const salvar = useMutation({
    mutationFn: async (d: Record<string, string>) => {
      const p: Profissional =
        editando && editando !== 'novo'
          ? (await api.put(`/profissionais/${editando.id}`, d)).data
          : (await api.post('/profissionais', d)).data
      // A foto vai depois do cadastro, pois o profissional novo só tem id agora.
      if (foto === 'remover') await api.delete(`/profissionais/${p.id}/foto`)
      else if (foto) {
        const f = new FormData()
        f.append('foto', foto.arquivo)
        for (const [k, v] of Object.entries(foto.recorte)) f.append(k, String(v))
        await api.post(`/profissionais/${p.id}/foto`, f)
      }
      return p
    },
    onSuccess: () => {
      avisar('Profissional salvo')
      atualizar()
      setEditando(null)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const ativar = useMutation({
    mutationFn: async (p: Profissional) =>
      (await api.post(`/profissionais/${p.id}/ativo`, { ativo: !p.ativo })).data,
    onSuccess: (p: Profissional) => {
      avisar(p.ativo ? 'Profissional ativado' : 'Profissional inativado')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const excluir = useMutation({
    mutationFn: async (p: Profissional) => (await api.delete(`/profissionais/${p.id}`)).data,
    onSuccess: () => {
      avisar('Profissional excluído')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)
  const atual = editando && editando !== 'novo' ? editando : null
  const temFoto = foto === 'remover' ? false : !!foto || !!atual?.fotoEm
  const fecharConfirmacao = () => {
    setConfirmando(null)
    setConfirmacao('')
  }
  const textos = confirmando && TEXTOS[confirmando.acao]
  const enviandoConfirmacao = ativar.isPending || excluir.isPending
  const ativosDaLista = lista.data?.filter((p) => p.ativo) ?? []
  const inativosDaLista = lista.data?.filter((p) => !p.ativo) ?? []

  const cartao = (p: Profissional) => (
    <article
      key={p.id}
      className={`cartao flex flex-col gap-4 overflow-hidden p-0 ${p.ativo ? 'hover:border-primaria/40 hover:shadow-md' : 'border-2 border-dashed bg-superficie-2'}`}
    >
      {/* Faixa na cor da agenda; listrada e sem cor no inativo. */}
      <div
        aria-hidden
        className={`h-1.5 ${p.ativo ? '' : 'bg-[repeating-linear-gradient(135deg,var(--borda)_0_6px,transparent_6px_12px)]'}`}
        style={p.ativo ? { backgroundColor: p.corAgenda ?? COR_PADRAO } : undefined}
      />
      <div className="flex items-start gap-3 px-4">
        <span className="relative shrink-0">
          <Retrato
            p={p}
            className={`size-12 rounded-2xl text-base ${p.ativo ? '' : 'opacity-50 grayscale'}`}
          />
          {!p.ativo && (
            <span
              aria-hidden
              className="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full border-2 border-superficie-2 bg-suave text-superficie"
            >
              <Icone nome="pausa" className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-extrabold ${p.ativo ? 'text-titulo' : 'text-suave'}`}>
            {p.nome}
          </p>
          <p className="truncate text-xs text-suave">{p.cro ?? 'Sem CRO'}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        <span className={`etiqueta ${p.especialidade && p.ativo ? 'etiqueta-primaria' : ''}`}>
          {p.especialidade ?? 'Sem especialidade'}
        </span>
        {p.ativo ? (
          <span className="etiqueta etiqueta-sucesso">Ativo</span>
        ) : (
          <span className="etiqueta border border-dashed border-suave/50">
            <Icone nome="pausa" className="h-3 w-3" />
            Inativo · fora da agenda
          </span>
        )}
      </div>
      <dl className={`space-y-1.5 px-4 pb-1 text-suave ${p.ativo ? '' : 'opacity-70'}`}>
        <div className="flex items-center gap-2">
          <dt>
            <Icone nome="celular" className="h-4 w-4" />
            <span className="sr-only">Celular</span>
          </dt>
          <dd className={p.celular && p.ativo ? 'text-texto' : ''}>{p.celular ?? 'Sem celular'}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <dt>
            <Icone nome="confirmacoes" className="h-4 w-4" />
            <span className="sr-only">E-mail</span>
          </dt>
          <dd className={`truncate ${p.email && p.ativo ? 'text-texto' : ''}`}>
            {p.email ?? 'Sem e-mail'}
          </dd>
        </div>
      </dl>
      {podeEditar && (
        <div
          className={`mt-auto flex justify-end gap-1 border-t px-3 py-2 ${p.ativo ? 'border-borda' : 'border-dashed border-borda'}`}
        >
          <button className="botao-fantasma botao-pequeno" onClick={() => abrirEditor(p)}>
            Editar
          </button>
          {p.ativo ? (
            <button
              className="botao-fantasma botao-pequeno text-perigo hover:bg-perigo/10"
              onClick={() => setConfirmando({ acao: 'inativar', p })}
            >
              Inativar
            </button>
          ) : (
            <>
              <button
                className="botao-fantasma botao-pequeno"
                disabled={ativar.isPending}
                onClick={() => ativar.mutate(p)}
              >
                Ativar
              </button>
              <button
                className="botao-fantasma botao-pequeno text-perigo hover:bg-perigo/10"
                onClick={() => setConfirmando({ acao: 'deletar', p })}
              >
                Excluir
              </button>
            </>
          )}
        </div>
      )}
    </article>
  )

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo">Profissionais</h1>
          <p className="subtitulo">Dentistas da clínica, especialidades e cor na agenda.</p>
        </div>
        {podeEditar && (
          <button className="botao" onClick={() => abrirEditor('novo')}>
            <Icone nome="mais" className="h-4 w-4" />
            Adicionar profissional
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Pesquisar profissional</span>
          <Icone
            nome="busca"
            className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-suave"
          />
          <input
            type="search"
            className="campo pl-10"
            placeholder="Pesquisar profissional"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <div
          role="group"
          aria-label="Situação"
          className="inline-flex rounded-xl border-2 border-borda bg-superficie p-1"
        >
          {(
            [
              [true, 'Ativos'],
              [false, 'Todos'],
            ] as const
          ).map(([v, t]) => (
            <button
              key={t}
              type="button"
              aria-pressed={ativos === v}
              onClick={() => setAtivos(v)}
              className={`rounded-lg px-3 py-1 font-bold ${ativos === v ? 'bg-primaria text-sobre-primaria' : 'text-suave hover:text-texto'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {lista.data && (
          <span className="text-suave sm:ml-auto">
            {ativosDaLista.length} {ativosDaLista.length === 1 ? 'ativo' : 'ativos'}
            {inativosDaLista.length > 0 &&
              ` · ${inativosDaLista.length} ${inativosDaLista.length === 1 ? 'inativo' : 'inativos'}`}
          </span>
        )}
      </div>

      {lista.data?.length === 0 && (
        <div className="cartao flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primaria-clara text-primaria">
            <Icone nome="profissionais" className="h-6 w-6" />
          </span>
          <p className="font-bold">Nenhum profissional encontrado</p>
          <p className="text-suave">
            {busca
              ? 'Tente outro nome ou limpe a pesquisa.'
              : 'Cadastre o primeiro dentista da clínica.'}
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ativosDaLista.map(cartao)}
      </div>

      {inativosDaLista.length > 0 && (
        <section aria-labelledby="titulo-inativos" className="space-y-4">
          <div className="flex items-center gap-3">
            <h2
              id="titulo-inativos"
              className="flex items-center gap-2 text-sm font-bold tracking-wide text-suave uppercase"
            >
              <Icone nome="pausa" className="h-4 w-4" />
              Inativos
              <span className="etiqueta">{inativosDaLista.length}</span>
            </h2>
            <span className="h-px flex-1 border-t border-dashed border-borda" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {inativosDaLista.map(cartao)}
          </div>
        </section>
      )}

      <Dialogo
        aberto={!!confirmando}
        aoFechar={fecharConfirmacao}
        titulo={textos?.titulo ?? ''}
      >
        {confirmando && textos && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!confirmou) return
              const mutacao = confirmando.acao === 'inativar' ? ativar : excluir
              mutacao.mutate(confirmando.p, { onSuccess: fecharConfirmacao })
            }}
          >
            <div className="alerta-perigo space-y-1">
              <p className="font-bold">{textos.aviso(confirmando.p.nome)}</p>
              <p>{textos.detalhe}</p>
            </div>
            <div>
              <label className="rotulo" htmlFor="p-confirma">
                Digite <span className="text-perigo">{confirmando.acao}</span> para confirmar
              </label>
              <input
                id="p-confirma"
                className="campo"
                autoComplete="off"
                autoFocus
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-borda pt-4">
              <button type="button" className="botao-leve" onClick={fecharConfirmacao}>
                Cancelar
              </button>
              <button className="botao-perigo" disabled={!confirmou || enviandoConfirmacao}>
                {textos.botao}
              </button>
            </div>
          </form>
        )}
      </Dialogo>

      <Dialogo aberto={!!ajustando} aoFechar={() => setAjustando(null)} titulo="Ajustar foto">
        {ajustando && (
          <RecorteFoto
            arquivo={ajustando}
            aoCancelar={() => setAjustando(null)}
            aoConfirmar={(f) => {
              setFoto(f)
              setAjustando(null)
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        aberto={!!editando}
        aoFechar={() => setEditando(null)}
        titulo={atual ? 'Editar profissional' : 'Novo profissional'}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            salvar.mutate(
              Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>,
            )
          }}
        >
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-superficie-2 p-3">
            {foto && foto !== 'remover' ? (
              <FotoRecortada foto={foto} lado={64} className="rounded-2xl" />
            ) : (
              <Retrato
                p={{
                  id: atual?.id ?? 0,
                  nome: atual?.nome ?? '',
                  corAgenda: atual?.corAgenda ?? null,
                  fotoEm: foto === 'remover' ? null : (atual?.fotoEm ?? null),
                }}
                className="size-16 rounded-2xl text-lg"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold">Foto</p>
              <p className="text-xs text-suave">
                JPEG, PNG ou WEBP até {FOTO_MAXIMO_MB} MB. Você ajusta o recorte antes de salvar.
              </p>
            </div>
            <div className="flex gap-1">
              <label className="botao-leve botao-pequeno has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primaria">
                {temFoto ? 'Trocar foto' : 'Escolher foto'}
                {/* Sem name: não vai junto com os dados do formulário. */}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = '' // deixa escolher o mesmo arquivo de novo
                    if (!f) return
                    if (f.size > FOTO_MAXIMO_MB * 1024 * 1024)
                      return avisar(`A foto pode ter no máximo ${FOTO_MAXIMO_MB} MB.`, true)
                    setAjustando(f)
                  }}
                />
              </label>
              {temFoto && (
                <button
                  type="button"
                  className="botao-fantasma botao-pequeno text-perigo hover:bg-perigo/10"
                  onClick={() => setFoto('remover')}
                >
                  Remover
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="rotulo" htmlFor="p-nome">
              Nome *
            </label>
            <input id="p-nome" name="nome" className="campo" defaultValue={atual?.nome} autoFocus />
            {erros.nome && <p className="erro-campo">{erros.nome}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="p-cro">
                CRO
              </label>
              <input
                id="p-cro"
                name="cro"
                className="campo"
                placeholder="CRO-UF 00000"
                defaultValue={atual?.cro ?? ''}
              />
            </div>
            <div>
              <label className="rotulo" id="p-esp-rotulo">
                Especialidade
              </label>
              <CampoEspecialidade inicial={atual?.especialidade ?? ''} />
            </div>
            <div>
              <label className="rotulo" htmlFor="p-cel">
                Celular
              </label>
              <CampoCelular
                id="p-cel"
                name="celular"
                defaultValue={atual?.celular ?? ''}
                erro={erros.celular}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="p-email">
                E-mail
              </label>
              <CampoEmail
                id="p-email"
                name="email"
                defaultValue={atual?.email ?? ''}
                erro={erros.email}
              />
            </div>
          </div>
          <div>
            <label className="rotulo" htmlFor="p-cor">
              Cor na agenda
            </label>
            <input
              id="p-cor"
              name="corAgenda"
              type="color"
              className="h-10 w-16 cursor-pointer rounded-xl border-2 border-borda bg-superficie p-1"
              defaultValue={atual?.corAgenda ?? COR_PADRAO}
            />
            <span className="ajuda">Usada nos agendamentos deste profissional.</span>
          </div>
          <div className="flex justify-end gap-2 border-t border-borda pt-4">
            <button type="button" className="botao-leve" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="botao" disabled={salvar.isPending}>
              Salvar
            </button>
          </div>
        </form>
      </Dialogo>
    </div>
  )
}
