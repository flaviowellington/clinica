// Controle Protético (R-082): quadro de 5 colunas com a ordem de serviço em cada cartão.
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  api,
  consultaEu,
  consultaProfissionais,
  dataBR,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { reais } from '../../../shared/financeiro'
import { ETAPAS, ORDEM_ETAPAS, type Etapa } from '../../../shared/protetico'
import { Dialogo } from '../componentes/Dialogo'
import { BuscaPaciente } from '../componentes/BuscaPaciente'
import { CampoData } from '../componentes/CampoData'
import { CampoReais } from '../componentes/CampoReais'

interface Trabalho {
  id: number
  etapa: Etapa
  laboratorio: string
  trabalho: string
  dentes: string | null
  cor: string | null
  prazo: string | null
  valorCentavos: number
  enviadoEm: string | null
  retornoEm: string | null
  instaladoEm: string | null
  observacoes: string | null
  paciente: { id: number; nome: string; celular: string | null }
  profissional: { id: number; nome: string }
}

export function Protetico() {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const lista = useQuery({
    queryKey: ['protetico'],
    queryFn: async () => (await api.get<Trabalho[]>('/protetico')).data,
  })
  const [aberto, setAberto] = useState<Trabalho | 'novo' | null>(null)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const podeEditar = pode(eu.perfis, 'protetico.editar')
  const hoje = isoLocal(new Date())

  const mover = useMutation({
    mutationFn: async (d: { id: number; etapa: Etapa }) =>
      (await api.patch(`/protetico/${d.id}/etapa`, { etapa: d.etapa })).data,
    onMutate: (d) => {
      // Move na hora; se o servidor recusar, a lista volta ao recarregar.
      qc.setQueryData<Trabalho[]>(['protetico'], (l) =>
        l?.map((t) => (t.id === d.id ? { ...t, etapa: d.etapa } : t)),
      )
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
    onSettled: () => qc.invalidateQueries({ queryKey: ['protetico'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Controle Protético</h1>
          <p className="text-suave">
            Trabalhos de laboratório, do envio à instalação. Arraste o cartão ou use as setas.
          </p>
        </div>
        {podeEditar && (
          <button className="botao" onClick={() => setAberto('novo')}>
            Novo trabalho
          </button>
        )}
      </div>

      <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-5">
        {ORDEM_ETAPAS.map((etapa, k) => {
          const cartoes = lista.data?.filter((t) => t.etapa === etapa) ?? []
          return (
            <section
              key={etapa}
              aria-label={ETAPAS[etapa]}
              className="min-w-60 space-y-2 rounded-lg bg-primaria-clara/40 p-2"
              onDragOver={(e) => podeEditar && e.preventDefault()}
              onDrop={() => {
                if (arrastando !== null) mover.mutate({ id: arrastando, etapa })
                setArrastando(null)
              }}
            >
              <h2 className="flex justify-between px-1 font-semibold">
                {ETAPAS[etapa]} <span className="font-normal text-suave">{cartoes.length}</span>
              </h2>
              {cartoes.map((t) => {
                const atrasado = t.prazo && t.prazo < hoje && t.etapa !== 'INSTALADO'
                return (
                  <article
                    key={t.id}
                    draggable={podeEditar}
                    onDragStart={() => setArrastando(t.id)}
                    className="cartao space-y-1 p-3"
                  >
                    <button className="block w-full text-left" onClick={() => setAberto(t)}>
                      <p className="font-medium">{t.paciente.nome}</p>
                      <p>
                        {t.trabalho}
                        {t.dentes && <span className="text-suave"> · {t.dentes}</span>}
                      </p>
                      <p className="text-xs text-suave">
                        {t.laboratorio} · {t.profissional.nome}
                      </p>
                      {t.prazo && (
                        <p
                          className={`text-xs ${atrasado ? 'font-medium text-perigo' : 'text-suave'}`}
                        >
                          Prazo {dataBR(t.prazo)}
                          {atrasado && ' (atrasado)'}
                        </p>
                      )}
                    </button>
                    {podeEditar && (
                      <div className="flex justify-between pt-1">
                        <button
                          className="text-primaria disabled:opacity-30"
                          disabled={!k}
                          aria-label={`Voltar ${t.paciente.nome} para ${k ? ETAPAS[ORDEM_ETAPAS[k - 1]] : ''}`}
                          onClick={() => mover.mutate({ id: t.id, etapa: ORDEM_ETAPAS[k - 1] })}
                        >
                          ‹
                        </button>
                        <button
                          className="text-primaria disabled:opacity-30"
                          disabled={k === ORDEM_ETAPAS.length - 1}
                          aria-label={`Avançar ${t.paciente.nome} para ${ETAPAS[ORDEM_ETAPAS[k + 1]] ?? ''}`}
                          onClick={() => mover.mutate({ id: t.id, etapa: ORDEM_ETAPAS[k + 1] })}
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}
            </section>
          )
        })}
      </div>

      <Dialogo
        aberto={!!aberto}
        aoFechar={() => setAberto(null)}
        titulo={aberto === 'novo' ? 'Novo trabalho protético' : 'Ordem de serviço'}
        largo
      >
        {aberto && (
          <FormTrabalho
            trabalho={aberto === 'novo' ? undefined : aberto}
            podeEditar={podeEditar}
            aoTerminar={() => setAberto(null)}
          />
        )}
      </Dialogo>
    </div>
  )
}

function FormTrabalho(props: { trabalho?: Trabalho; podeEditar: boolean; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const t = props.trabalho
  const { data: prof } = useQuery(consultaProfissionais)
  const [paciente, setPaciente] = useState<Pick<Paciente, 'id' | 'nome'> | null>(
    t?.paciente ?? null,
  )
  const [profissionalId, setProfissionalId] = useState<number | ''>(
    t?.profissional.id ?? prof?.meuId ?? '',
  )
  const [valor, setValor] = useState(t?.valorCentavos ?? 0)
  const [datas, setDatas] = useState({
    prazo: t?.prazo ?? '',
    enviadoEm: t?.enviadoEm ?? '',
    retornoEm: t?.retornoEm ?? '',
    instaladoEm: t?.instaladoEm ?? '',
  })
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['protetico'] })
    props.aoTerminar()
  }
  const salvar = useMutation({
    mutationFn: async (d: Record<string, unknown>) =>
      t ? (await api.put(`/protetico/${t.id}`, d)).data : (await api.post('/protetico', d)).data,
    onSuccess: () => {
      avisar(t ? 'Ordem de serviço salva' : 'Trabalho criado em Pré-envio')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const excluir = useMutation({
    mutationFn: async () => (await api.delete(`/protetico/${t!.id}`)).data,
    onSuccess: () => {
      avisar('Trabalho excluído')
      atualizar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(salvar.error)
  const erro = (c: string) => erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>
  const data = (campo: keyof typeof datas, rotulo: string) => (
    <label>
      <span className="rotulo">{rotulo}</span>
      <CampoData value={datas[campo]} onChange={(v) => setDatas({ ...datas, [campo]: v })} />
    </label>
  )

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.currentTarget))
        salvar.mutate({
          ...f,
          ...datas,
          pacienteId: paciente?.id,
          profissionalId,
          valorCentavos: valor,
        })
      }}
    >
      <fieldset disabled={!props.podeEditar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="rotulo">Paciente *</span>
            {t ? (
              <Link
                to="/pacientes/$id"
                params={{ id: String(t.paciente.id) }}
                className="block py-2 text-primaria"
              >
                {t.paciente.nome}
              </Link>
            ) : (
              <BuscaPaciente
                valor={paciente as Paciente | null}
                aoEscolher={setPaciente}
                autoFocus
              />
            )}
            {erro('pacienteId')}
          </div>
          <label>
            <span className="rotulo">Profissional *</span>
            <select
              className="campo"
              value={profissionalId}
              onChange={(e) => setProfissionalId(Number(e.target.value) || '')}
            >
              <option value="">Escolha…</option>
              {prof?.profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            {erro('profissionalId')}
          </label>
          <label>
            <span className="rotulo">Laboratório *</span>
            <input name="laboratorio" className="campo" defaultValue={t?.laboratorio} required />
            {erro('laboratorio')}
          </label>
          <label>
            <span className="rotulo">Trabalho *</span>
            <input
              name="trabalho"
              className="campo"
              defaultValue={t?.trabalho}
              placeholder="Ex.: coroa em porcelana"
              required
            />
            {erro('trabalho')}
          </label>
          <label>
            <span className="rotulo">Dentes</span>
            <input
              name="dentes"
              className="campo"
              defaultValue={t?.dentes ?? ''}
              placeholder="Ex.: 11, 21"
            />
          </label>
          <label>
            <span className="rotulo">Cor</span>
            <input name="cor" className="campo" defaultValue={t?.cor ?? ''} placeholder="Ex.: A2" />
          </label>
          <CampoReais
            id="protetico-valor"
            rotulo="Valor do laboratório"
            valor={valor}
            aoMudar={setValor}
          />
          {data('prazo', 'Prazo de entrega')}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {data('enviadoEm', 'Enviado em')}
          {data('retornoEm', 'Voltou em')}
          {data('instaladoEm', 'Instalado em')}
        </div>
        <label className="block">
          <span className="rotulo">Observações</span>
          <textarea
            name="observacoes"
            className="campo"
            rows={3}
            maxLength={1500}
            defaultValue={t?.observacoes ?? ''}
          />
        </label>
        {t && (
          <p className="text-suave">
            Etapa atual: <strong>{ETAPAS[t.etapa]}</strong> · valor {reais(t.valorCentavos)}
          </p>
        )}
      </fieldset>
      {props.podeEditar && (
        <div className="flex justify-between gap-2">
          {t ? (
            <button
              type="button"
              className="botao-leve text-perigo"
              disabled={excluir.isPending}
              onClick={() =>
                confirm(`Excluir o trabalho de ${t.paciente.nome}? Ele sai do quadro.`) &&
                excluir.mutate()
              }
            >
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="botao-leve" onClick={props.aoTerminar}>
              Cancelar
            </button>
            <button className="botao" disabled={salvar.isPending}>
              Salvar
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
