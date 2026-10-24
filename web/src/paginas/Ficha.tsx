import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
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
import { pode } from '../../../shared/permissoes'
import { idade, MOTIVOS_INATIVACAO } from '../../../shared/regras'
import { Dialogo } from '../componentes/Dialogo'
import { FormPaciente } from '../componentes/FormPaciente'
import { Situacao } from './Pacientes'
import { OrcamentosPaciente } from '../componentes/Orcamentos'

type Janela = 'editar' | 'inativar' | 'excluir' | null

export function Ficha() {
  const { id } = useParams({ from: '/logado/pacientes/$id' })
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const navegar = useNavigate()
  const [janela, setJanela] = useState<Janela>(null)

  // Cada abertura da ficha grava um registro de acesso no servidor (R-003).
  const ficha = useQuery({
    queryKey: ['paciente', id],
    queryFn: async () => (await api.get<Paciente>(`/pacientes/${id}`)).data,
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

      <OrcamentosPaciente paciente={p} />

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
