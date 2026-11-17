import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { api, consultaConfig, consultaEu, errosDosCampos, mensagemDeErro } from '../api'
import { avisar, useVoltar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { Dialogo } from '../componentes/Dialogo'
import { GradeSemana } from '../componentes/GradeSemana'
import { Icone } from '../componentes/Icones'
import { FotoPerfil, salvarFoto, urlFoto, type FotoPendente } from '../componentes/FotoPerfil'
import { CamposProfissional, Retrato, TEXTOS, type Acao, type Profissional } from './Profissionais'

/** Página do profissional: dados básicos e agenda de trabalho (F-024). */
export function ProfissionalPagina() {
  const { id } = useParams({ from: '/logado/profissionais/$id' })
  const { data: eu } = useSuspenseQuery(consultaEu)
  const podeEditar = pode(eu.perfis, 'profissional.editar')
  const qc = useQueryClient()
  const navegar = useNavigate()
  const voltar = useVoltar()
  const consulta = useQuery({
    queryKey: ['profissionais', 'um', id],
    queryFn: async () => (await api.get<Profissional>(`/profissionais/${id}`)).data,
  })
  const [confirmando, setConfirmando] = useState<Acao | null>(null)
  const [confirmacao, setConfirmacao] = useState('')

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['profissionais'] })
    qc.invalidateQueries({ queryKey: ['agenda', 'profissionais'] })
  }
  const ativar = useMutation({
    mutationFn: async (p: Profissional) =>
      (await api.post<Profissional>(`/profissionais/${p.id}/ativo`, { ativo: !p.ativo })).data,
    onSuccess: (p) => {
      avisar(p.ativo ? 'Profissional ativado' : 'Profissional inativado')
      atualizar()
      fechar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const excluir = useMutation({
    mutationFn: async (p: Profissional) => (await api.delete(`/profissionais/${p.id}`)).data,
    onSuccess: () => {
      avisar('Profissional excluído')
      atualizar()
      navegar({ to: '/profissionais' })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const fechar = () => {
    setConfirmando(null)
    setConfirmacao('')
  }

  const p = consulta.data
  if (consulta.isError) return <p className="p-4">{mensagemDeErro(consulta.error)}</p>
  if (!p) return <p className="p-4 text-suave">Carregando…</p>
  const textos = confirmando && TEXTOS[confirmando]
  const confirmou = !!confirmando && confirmacao.trim().toLowerCase() === confirmando

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to="/profissionais"
          onClick={voltar}
          className="botao-leve px-2.5"
          aria-label="Voltar para profissionais"
        >
          <Icone nome="esquerda" className="h-4 w-4" />
        </Link>
        <Retrato
          p={p}
          className={`size-12 rounded-2xl text-base ${p.ativo ? '' : 'opacity-50 grayscale'}`}
        />
        <div className="min-w-0 flex-1">
          <h1 className="titulo truncate">{p.nome}</h1>
          <p className="subtitulo">
            {p.especialidade ?? 'Sem especialidade'} ·{' '}
            {p.ativo ? 'Ativo' : 'Inativo, fora da agenda'}
          </p>
        </div>
        {podeEditar &&
          (p.ativo ? (
            <button
              className="botao-fantasma text-perigo hover:bg-perigo/10"
              onClick={() => setConfirmando('inativar')}
            >
              Inativar
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                className="botao-leve"
                disabled={ativar.isPending}
                onClick={() => ativar.mutate(p)}
              >
                Ativar
              </button>
              <button
                className="botao-fantasma text-perigo hover:bg-perigo/10"
                onClick={() => setConfirmando('deletar')}
              >
                Excluir
              </button>
            </div>
          ))}
      </header>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <DadosBasicos key={p.id} p={p} podeEditar={podeEditar} aoSalvar={atualizar} />
        <AgendaTrabalho key={`agenda-${p.id}`} p={p} podeEditar={podeEditar} aoSalvar={atualizar} />
      </div>

      <Dialogo aberto={!!confirmando} aoFechar={fechar} titulo={textos?.titulo ?? ''}>
        {confirmando && textos && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (confirmou) (confirmando === 'inativar' ? ativar : excluir).mutate(p)
            }}
          >
            <div className="alerta-perigo space-y-1">
              <p className="font-bold">{textos.aviso(p.nome)}</p>
              <p>{textos.detalhe}</p>
            </div>
            <div>
              <label className="rotulo" htmlFor="p-confirma">
                Digite <span className="text-perigo">{confirmando}</span> para confirmar
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
              <button type="button" className="botao-leve" onClick={fechar}>
                Cancelar
              </button>
              <button
                className="botao-perigo"
                disabled={!confirmou || ativar.isPending || excluir.isPending}
              >
                {textos.botao}
              </button>
            </div>
          </form>
        )}
      </Dialogo>
    </div>
  )
}

function DadosBasicos(props: { p: Profissional; podeEditar: boolean; aoSalvar: () => void }) {
  const { p } = props
  // Foto escolhida, enviada ao salvar; 'remover' apaga a atual.
  const [foto, setFoto] = useState<FotoPendente>(null)
  const salvar = useMutation({
    mutationFn: async (d: Record<string, string>) => {
      await api.put(`/profissionais/${p.id}`, d)
      await salvarFoto(`/profissionais/${p.id}`, foto)
    },
    onSuccess: () => {
      avisar('Profissional salvo')
      setFoto(null)
      props.aoSalvar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)

  return (
    <section aria-labelledby="titulo-dados" className="cartao">
      <h2 id="titulo-dados" className="mb-4 text-base font-extrabold text-titulo">
        Dados básicos
      </h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          salvar.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>)
        }}
      >
        <div className="flex items-center gap-4 rounded-2xl bg-superficie-2 p-3">
          <FotoPerfil
            lado={64}
            className="rounded-2xl"
            src={foto === 'remover' ? null : urlFoto(`/profissionais/${p.id}`, p.fotoEm)}
            nova={foto === 'remover' ? null : foto}
            vazio={<Retrato p={{ ...p, fotoEm: null }} className="size-16 rounded-2xl text-lg" />}
            podeEditar={props.podeEditar}
            aoEscolher={setFoto}
            aoRemover={() => setFoto('remover')}
          />
          <div className="min-w-0">
            <p className="font-bold">Foto</p>
            <p className="text-xs text-suave">
              {props.podeEditar
                ? 'Clique na foto para ver ou alterar. Vale depois de salvar.'
                : 'Clique na foto para ver.'}
            </p>
          </div>
        </div>
        {/* Sem permissão: os campos aparecem só para leitura. */}
        <fieldset disabled={!props.podeEditar} className="space-y-4">
          <div>
            <label className="rotulo" htmlFor="p-nome">
              Nome *
            </label>
            <input id="p-nome" name="nome" className="campo" defaultValue={p.nome} />
            {erros.nome && <p className="erro-campo">{erros.nome}</p>}
          </div>
          <CamposProfissional atual={p} erros={erros} />
        </fieldset>
        {props.podeEditar && (
          <div className="flex justify-end border-t border-borda pt-4">
            <button className="botao" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        )}
      </form>
    </section>
  )
}

/** Semana fixa do profissional; os horários sem atendimento da clínica vêm de Configurações. */
function AgendaTrabalho(props: { p: Profissional; podeEditar: boolean; aoSalvar: () => void }) {
  const fechados = new Set(useQuery(consultaConfig('horariosFechados')).data ?? [])
  const salvos = props.p.horariosIndisponiveis
  const [prof, setProf] = useState(() => new Set(salvos))
  const mudou = prof.size !== salvos.length || salvos.some((c) => !prof.has(c))

  const salvar = useMutation({
    mutationFn: async () =>
      api.put(`/profissionais/${props.p.id}/horarios`, { horarios: [...prof] }),
    onSuccess: () => {
      avisar('Agenda de trabalho salva')
      props.aoSalvar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  return (
    <section aria-labelledby="titulo-agenda" className="cartao space-y-3">
      <div>
        <h2 id="titulo-agenda" className="text-base font-extrabold text-titulo">
          Agenda de trabalho
        </h2>
        <p className="text-xs text-suave">
          Semana fixa, vale para todas as semanas. Os horários sem atendimento da clínica são
          cadastrados em Configurações.
        </p>
      </div>
      <GradeSemana
        marcados={prof}
        aoMudar={setProf}
        cor="profissional"
        travados={fechados}
        editavel={props.podeEditar}
        dica="Clique no primeiro horário em que o profissional não atende e depois no último. Dá para pegar vários dias de uma vez."
      />
      {props.podeEditar && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-borda pt-3">
          {mudou && (
            <span className="mr-auto text-sm font-bold text-aviso">Alterações não salvas</span>
          )}
          <button
            type="button"
            className="botao-leve"
            disabled={!mudou || salvar.isPending}
            onClick={() => setProf(new Set(salvos))}
          >
            Desfazer
          </button>
          <button
            type="button"
            className="botao"
            disabled={!mudou || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar agenda'}
          </button>
        </div>
      )}
    </section>
  )
}
