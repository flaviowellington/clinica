import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, consultaEu, cpfBR, errosDosCampos, mensagemDeErro, type Paciente } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { Dialogo } from './Dialogo'
import { FormPaciente } from './FormPaciente'
import { Icone } from './Icones'

/** O que foi buscado vira o campo certo do cadastro: CPF, celular ou nome. */
function sugestaoDeCadastro(termo: string): Partial<Paciente> {
  const digitos = termo.replace(/\D/g, '')
  if (!/[a-zà-ú]/i.test(termo) && digitos.length >= 8)
    return digitos.length === 11 && !/[()\s+]/.test(termo) ? { cpf: termo } : { celular: termo }
  return { nome: termo }
}

export function iniciais(nome: string) {
  const p = nome
    .replace(/^dra?\.\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

export function Avatar(props: { texto: string; cor?: string; pequeno?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-bold ${
        props.pequeno ? 'size-7 text-[10px]' : 'size-9 text-xs'
      } ${props.cor ? 'text-white' : 'bg-primaria text-sobre-primaria'}`}
      style={props.cor ? { backgroundColor: props.cor } : undefined}
    >
      {props.texto}
    </span>
  )
}

export function CampoBusca(props: {
  rotulo?: string
  placeholder: string
  valor: string
  aoMudar: (v: string) => void
  aoEnter?: () => void
  autoFocus?: boolean
  pequeno?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-suave">
        <Icone nome="busca" className="h-4 w-4" />
      </span>
      <input
        type="search"
        className={`campo pl-9 ${props.pequeno ? 'py-1.5 text-sm' : ''}`}
        placeholder={props.placeholder}
        aria-labelledby={props.rotulo}
        aria-label={props.rotulo ? undefined : props.placeholder}
        value={props.valor}
        onChange={(e) => props.aoMudar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            props.aoEnter?.()
          }
        }}
        autoFocus={props.autoFocus}
      />
    </div>
  )
}

/**
 * Escolher um paciente: busca enquanto digita (nome, telefone ou CPF), oferece cadastrar
 * o que foi buscado (R-001) e mostra o escolhido com "Trocar". Mesmo padrão em todas as telas.
 */
export function BuscaPaciente(props: {
  valor: Paciente | null
  aoEscolher: (p: Paciente | null) => void
  somenteAtivos?: boolean
  autoFocus?: boolean
  /** id do título que nomeia o campo (acessibilidade). */
  rotulo?: string
}) {
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [listaAberta, setListaAberta] = useState(false)
  // Busca enquanto digita (B-018: só pacientes existentes); ENTER busca na hora.
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 250)
    return () => clearTimeout(t)
  }, [busca])
  const achados = useQuery({
    queryKey: ['pacientes', termo, 1],
    queryFn: async () =>
      (await api.get<{ itens: Paciente[] }>('/pacientes', { params: { busca: termo } })).data.itens,
    enabled: termo.length >= 2,
  })

  // Paciente que não existe ainda: cadastra numa janela por cima e já escolhe.
  const qc = useQueryClient()
  const { data: eu } = useQuery(consultaEu)
  const podeCadastrar = !!eu && pode(eu.perfis, 'paciente.editar')
  const [cadastrando, setCadastrando] = useState(false)
  const cadastrar = useMutation({
    mutationFn: async (dados: Record<string, string>) =>
      (await api.post<Paciente>('/pacientes', dados)).data,
    onSuccess: (p) => {
      avisar('Paciente cadastrado com sucesso')
      qc.invalidateQueries({ queryKey: ['pacientes'] })
      props.aoEscolher(p)
      setCadastrando(false)
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })

  const p = props.valor
  return (
    <>
      {p ? (
        <div className="flex items-center gap-3 rounded-xl border-2 border-primaria/40 bg-primaria-clara px-3 py-2">
          <Avatar texto={iniciais(p.nome)} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{p.nome}</p>
            <p className="truncate text-xs text-suave">
              {[p.celular, p.email].filter(Boolean).join(' · ') || 'Sem contato'}
            </p>
          </div>
          <button
            type="button"
            className="botao-fantasma botao-pequeno"
            onClick={() => props.aoEscolher(null)}
          >
            Trocar
          </button>
        </div>
      ) : (
        // Lista sobreposta (não empurra o resto da tela); fecha quando o foco sai da busca.
        <div
          className="relative"
          onFocus={() => setListaAberta(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setListaAberta(false)
          }}
        >
          <CampoBusca
            rotulo={props.rotulo}
            placeholder="Buscar por nome, telefone ou CPF"
            valor={busca}
            aoMudar={setBusca}
            aoEnter={() => setTermo(busca.trim())}
            autoFocus={props.autoFocus}
          />
          {listaAberta && termo.length >= 2 && (
            <div
              // Clicar na lista não tira o foco da busca (no Safari o botão não recebe foco e a lista fecharia antes do clique).
              onMouseDown={(e) => e.preventDefault()}
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-borda bg-superficie shadow-[0_10px_30px_-8px_color-mix(in_srgb,black_30%,transparent)]"
            >
              {podeCadastrar && (
                <button
                  type="button"
                  onClick={() => setCadastrando(true)}
                  className="flex w-full items-center gap-2 border-b border-borda bg-superficie-2 px-3 py-2.5 text-left hover:bg-primaria-clara focus-visible:bg-primaria-clara"
                >
                  <Icone nome="mais" className="h-5 w-5 shrink-0 text-suave" />
                  <span className="min-w-0 truncate">
                    Novo paciente: <span className="font-bold">{termo}</span>
                  </span>
                </button>
              )}
              <p className="px-3 pt-2 pb-1 text-xs font-bold text-suave">Pacientes</p>
              {achados.isFetching && !achados.data && (
                <p className="px-3 pb-2 text-sm text-suave">Buscando…</p>
              )}
              {achados.data?.length === 0 && (
                <p className="px-3 pb-3 text-sm text-suave">
                  Nenhum paciente com “{termo}”.
                  {!podeCadastrar && ' Peça a quem pode cadastrar pacientes.'}
                </p>
              )}
              <ul>
                {achados.data?.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={props.somenteAtivos && !a.ativo}
                      onClick={() => props.aoEscolher(a)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-primaria-clara focus-visible:bg-primaria-clara disabled:opacity-50"
                    >
                      <Icone nome="pacientes" className="h-5 w-5 shrink-0 text-suave" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-primaria">{a.nome}</span>
                        <span className="flex flex-wrap gap-x-4 text-xs text-suave">
                          <span className="flex items-center gap-1">
                            <Icone nome="celular" className="h-3.5 w-3.5" />
                            {a.celular || 'Sem celular'}
                          </span>
                          {a.cpf && (
                            <span className="flex items-center gap-1">
                              <Icone nome="documento" className="h-3.5 w-3.5" />
                              {cpfBR(a.cpf)}
                            </span>
                          )}
                        </span>
                      </span>
                      {!a.ativo && <span className="etiqueta">inativo</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* No <body>: quem usa a busca costuma estar dentro de um <form>, e form dentro de form não vale.
          O stopPropagation impede o envio do cadastro de subir (pela árvore do React) até esse form. */}
      {createPortal(
        <div onSubmit={(e) => e.stopPropagation()}>
          <Dialogo
            aberto={cadastrando}
            aoFechar={() => setCadastrando(false)}
            titulo="Novo paciente"
          >
            <FormPaciente
              inicial={sugestaoDeCadastro(termo)}
              textoBotao="Cadastrar e usar"
              enviando={cadastrar.isPending}
              erros={errosDosCampos(cadastrar.error)}
              aoEnviar={(d) => cadastrar.mutate(d)}
            />
          </Dialogo>
        </div>,
        document.body,
      )}
    </>
  )
}
