import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  consultaProfissionais,
  errosDosCampos,
  isoLocal,
  mensagemDeErro,
  type Agendamento,
  type Paciente,
} from '../api'
import { avisar } from '../estado'
import {
  AVISO_MESMO_DIA,
  CANAIS,
  CATEGORIAS,
  HORARIOS,
  diaComExpediente,
  fimPadrao,
  paraMinutos,
} from '../../../shared/agenda'
import { CampoData } from './CampoData'

export interface Inicial {
  tipo: 'CONSULTA' | 'COMPROMISSO'
  data: string
  inicio?: string
  profissionalId?: number
}

/** Conteúdo do diálogo "Nova consulta" / "Novo compromisso" (C-001). */
export function NovoAgendamento(props: { inicial: Inicial; aoTerminar: () => void }) {
  const qc = useQueryClient()
  const { data: prof } = useQuery(consultaProfissionais)
  const [tipo, setTipo] = useState(props.inicial.tipo)
  const [data, setData] = useState(props.inicial.data)
  const [inicio, setInicio] = useState(props.inicial.inicio ?? '')
  const [fim, setFim] = useState('')
  const [profissionalId, setProfissionalId] = useState<number | ''>(
    props.inicial.profissionalId ?? prof?.meuId ?? '',
  )
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')

  // B-018: só pacientes existentes na busca; escolher um não mexe em data nem profissional (B-019).
  const achados = useQuery({
    queryKey: ['pacientes', termo, 1],
    queryFn: async () =>
      (await api.get<{ itens: Paciente[] }>('/pacientes', { params: { busca: termo } })).data.itens,
    enabled: !!termo,
  })

  const criar = useMutation({
    mutationFn: async (corpo: Record<string, unknown>) =>
      (await api.post<Agendamento>('/agenda', corpo)).data,
    onSuccess: () => {
      avisar(tipo === 'CONSULTA' ? 'Consulta marcada com sucesso' : 'Compromisso criado')
      qc.invalidateQueries({ queryKey: ['agenda'] })
      props.aoTerminar()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const erros = errosDosCampos(criar.error)
  const aberto = diaComExpediente(data)
  const ehHoje = data === isoLocal(new Date())

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget))
    criar.mutate({
      ...f,
      tipo,
      data,
      inicio,
      fim: tipo === 'COMPROMISSO' ? fim || undefined : undefined,
      profissionalId,
      pacienteId: paciente?.id,
      primeiraConsulta: f.primeiraConsulta === 'on',
    })
  }

  const erro = (campo: string) => erros[campo] && <p className="mt-1 text-perigo">{erros[campo]}</p>

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div role="tablist" className="flex gap-2">
        {(['CONSULTA', 'COMPROMISSO'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tipo === t}
            onClick={() => setTipo(t)}
            className={tipo === t ? 'botao' : 'botao-leve'}
          >
            {t === 'CONSULTA' ? 'Consulta' : 'Compromisso'}
          </button>
        ))}
      </div>

      {tipo === 'CONSULTA' ? (
        <div>
          <span className="rotulo">Paciente</span>
          {paciente ? (
            <div className="cartao flex items-center justify-between py-2">
              <div>
                <p className="font-medium">{paciente.nome}</p>
                <p className="text-suave">
                  {[paciente.celular, paciente.email].filter(Boolean).join(' · ') || 'Sem contato'}
                </p>
              </div>
              <button type="button" className="botao-leve py-1" onClick={() => setPaciente(null)}>
                Trocar
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                className="campo"
                placeholder="Nome ou sobrenome e ENTER"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setTermo(busca.trim())
                  }
                }}
                autoFocus
              />
              {termo && (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-borda">
                  {achados.data?.length === 0 && (
                    <li className="px-3 py-2 text-suave">
                      Nenhum paciente encontrado. Cadastre na aba Pacientes.
                    </li>
                  )}
                  {achados.data?.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={!p.ativo}
                        onClick={() => setPaciente(p)}
                        className="w-full px-3 py-2 text-left hover:bg-primaria-clara disabled:text-suave"
                      >
                        {p.nome}
                        {!p.ativo && ' (inativo)'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {erro('pacienteId')}
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="primeiraConsulta" /> Primeira consulta
          </label>
        </div>
      ) : (
        <div>
          <label className="rotulo" htmlFor="titulo">
            O que é
          </label>
          <input id="titulo" name="titulo" className="campo" placeholder="Ex.: Reunião, curso" />
          {erro('titulo')}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="rotulo" htmlFor="data">
            Data
          </label>
          <CampoData id="data" value={data} onChange={setData} required />
          {erro('data')}
        </div>
        <div>
          <label className="rotulo" htmlFor="profissional">
            Profissional
          </label>
          <select
            id="profissional"
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
        </div>
        {tipo === 'CONSULTA' && (
          <div>
            <label className="rotulo" htmlFor="categoria">
              Categoria
            </label>
            <select id="categoria" name="categoria" className="campo" defaultValue="">
              <option value="">Sem categoria</option>
              {Object.keys(CATEGORIAS).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="rotulo">Horário {inicio && `(${inicio})`}</legend>
        {!aberto && <p className="mb-1 text-suave">A clínica não abre neste dia.</p>}
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
          {HORARIOS.map((h) => (
            <button
              key={h}
              type="button"
              disabled={!aberto}
              aria-pressed={inicio === h}
              onClick={() => setInicio(h)}
              className={`rounded border px-1 py-1 text-xs disabled:opacity-40 ${inicio === h ? 'border-primaria bg-primaria text-white dark:text-black' : 'border-borda hover:bg-primaria-clara'}`}
            >
              {h}
            </button>
          ))}
        </div>
        {erro('inicio')}
      </fieldset>

      {tipo === 'COMPROMISSO' && inicio && (
        <div>
          <label className="rotulo" htmlFor="fim">
            Até
          </label>
          <select
            id="fim"
            className="campo"
            value={fim || fimPadrao(inicio)}
            onChange={(e) => setFim(e.target.value)}
          >
            {[...HORARIOS.slice(1), '20:00']
              .filter((h) => paraMinutos(h) > paraMinutos(inicio))
              .map((h) => (
                <option key={h}>{h}</option>
              ))}
          </select>
          {erro('fim')}
        </div>
      )}

      {tipo === 'CONSULTA' && (
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['confirmacao', 'alerta'] as const).map((campo) => (
              <div key={campo}>
                <label className="rotulo" htmlFor={campo}>
                  {campo === 'confirmacao' ? 'Pedir confirmação' : 'Lembrete da consulta'}
                </label>
                <select id={campo} name={campo} className="campo" defaultValue="NAO_ENVIAR">
                  {Object.entries(CANAIS).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {ehHoje && <p className="mt-1 text-suave">{AVISO_MESMO_DIA}</p>}
        </div>
      )}

      <div>
        <label className="rotulo" htmlFor="observacoes">
          Observações
        </label>
        <textarea id="observacoes" name="observacoes" rows={2} className="campo" />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="botao-leve" onClick={props.aoTerminar}>
          Cancelar
        </button>
        <button className="botao" disabled={criar.isPending || !inicio || !aberto}>
          {tipo === 'CONSULTA' ? 'Marcar consulta' : 'Criar compromisso'}
        </button>
      </div>
    </form>
  )
}
