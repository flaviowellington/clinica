import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, cpfBR, dataBR, errosDosCampos, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import { STATUS_CONTA, TIPOS_CONTA, type TipoConta } from '../../../shared/financeiro'
import { Abas } from '../componentes/Abas'

interface Conta {
  id: number
  tipo: TipoConta
  nome: string
  documento: string
  email: string
  celular: string
  status: keyof typeof STATUS_CONTA
  criadoEm: string
}

const ABAS = [
  { id: 'geral', rotulo: 'Geral' },
  { id: 'abrir', rotulo: 'Abrir conta' },
  { id: 'gerenciar', rotulo: 'Gerenciar conta' },
  { id: 'extrato', rotulo: 'Extrato' },
] as const
type Aba = (typeof ABAS)[number]['id']

const CARTOES: { id: Aba; titulo: string; texto: string }[] = [
  {
    id: 'abrir',
    titulo: 'Abrir conta',
    texto: 'Peça a conta da clínica ou do profissional para receber por Pix e boleto.',
  },
  {
    id: 'gerenciar',
    titulo: 'Gerenciar conta',
    texto: 'Veja os pedidos e contas, e cancele o que não for usar.',
  },
  { id: 'extrato', titulo: 'Extrato', texto: 'Movimentações da conta, quando ela estiver ativa.' },
]

const documentoBR = (c: Conta) =>
  c.tipo === 'PESSOA_FISICA'
    ? cpfBR(c.documento)
    : c.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')

const consultaContas = {
  queryKey: ['contas'],
  queryFn: async () => (await api.get<Conta[]>('/contas')).data,
}

/** Conta digital (F-010). Abrir de verdade depende de um parceiro de pagamentos (BR-006). */
export function Contas() {
  const { aba: daUrl } = useSearch({ from: '/logado/contas' })
  const navegar = useNavigate({ from: '/contas' })
  const aba = (ABAS.find((a) => a.id === daUrl)?.id ?? 'geral') as Aba
  const ir = (a: Aba) => navegar({ search: { aba: a === 'geral' ? undefined : a } })

  return (
    <div className="space-y-4">
      <Abas abas={[...ABAS]} atual={aba} aoTrocar={ir} />
      {aba === 'geral' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARTOES.map((c) => (
            <button
              key={c.id}
              onClick={() => ir(c.id)}
              className="cartao space-y-2 p-5 text-left transition hover:border-primaria hover:shadow-md"
            >
              <p className="text-base font-semibold">{c.titulo}</p>
              <p className="text-suave">{c.texto}</p>
            </button>
          ))}
        </div>
      )}
      {aba === 'abrir' && <AbrirConta aoTerminar={() => ir('gerenciar')} />}
      {aba === 'gerenciar' && <Gerenciar aoAbrir={() => ir('abrir')} />}
      {aba === 'extrato' && <Extrato />}
    </div>
  )
}

function AbrirConta({ aoTerminar }: { aoTerminar: () => void }) {
  const qc = useQueryClient()
  const [passo, setPasso] = useState(1)
  const [tipo, setTipo] = useState<TipoConta>('PESSOA_JURIDICA')
  const [dados, setDados] = useState({ nome: '', documento: '', email: '', celular: '' })
  const pj = tipo === 'PESSOA_JURIDICA'

  const criar = useMutation({
    mutationFn: async () => (await api.post<Conta>('/contas', { tipo, ...dados })).data,
    onSuccess: () => {
      avisar('Pedido de conta registrado')
      qc.invalidateQueries({ queryKey: ['contas'] })
      aoTerminar()
    },
    onError: (e) => {
      avisar(mensagemDeErro(e), true)
      setPasso(2)
    },
  })
  const erros = errosDosCampos(criar.error)
  const campo = (
    c: keyof typeof dados,
    rotulo: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      <input
        className="campo"
        value={dados[c]}
        onChange={(e) => setDados({ ...dados, [c]: e.target.value })}
        {...extra}
      />
      {erros[c] && <p className="mt-1 text-perigo">{erros[c]}</p>}
    </label>
  )

  return (
    <div className="cartao mx-auto max-w-2xl space-y-6 p-8">
      <p className="text-suave">Passo {passo} de 3</p>
      {passo === 1 && (
        <fieldset className="space-y-3">
          <legend className="mb-3 text-lg font-semibold">Que tipo de conta você quer abrir?</legend>
          {(Object.keys(TIPOS_CONTA) as TipoConta[]).map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-4 ${tipo === t ? 'border-primaria bg-primaria-clara' : 'border-borda'}`}
            >
              <span className="font-medium">{TIPOS_CONTA[t]}</span>
              <input type="radio" name="tipo" checked={tipo === t} onChange={() => setTipo(t)} />
            </label>
          ))}
        </fieldset>
      )}
      {passo === 2 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Dados da conta</h2>
          {campo('nome', pj ? 'Razão social' : 'Nome completo', { autoFocus: true })}
          {campo('documento', pj ? 'CNPJ' : 'CPF', { inputMode: 'numeric' })}
          <div className="grid gap-3 sm:grid-cols-2">
            {campo('email', 'E-mail', { type: 'email' })}
            {campo('celular', 'Celular', { inputMode: 'tel' })}
          </div>
        </div>
      )}
      {passo === 3 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Confira e envie</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-suave">Tipo</dt>
            <dd>{TIPOS_CONTA[tipo]}</dd>
            <dt className="text-suave">{pj ? 'Razão social' : 'Nome'}</dt>
            <dd>{dados.nome}</dd>
            <dt className="text-suave">{pj ? 'CNPJ' : 'CPF'}</dt>
            <dd>{dados.documento}</dd>
            <dt className="text-suave">E-mail</dt>
            <dd>{dados.email}</dd>
            <dt className="text-suave">Celular</dt>
            <dd>{dados.celular}</dd>
          </dl>
          <p className="rounded-md bg-primaria-clara p-3">
            O pedido fica guardado como <strong>aguardando parceiro de pagamentos</strong>. A conta
            só passa a funcionar depois que a clínica contratar um parceiro autorizado pelo Banco
            Central.
          </p>
        </div>
      )}
      <div className="flex justify-between">
        <button className="botao-leve" disabled={passo === 1} onClick={() => setPasso(passo - 1)}>
          Voltar
        </button>
        {passo < 3 ? (
          <button className="botao" onClick={() => setPasso(passo + 1)}>
            Próximo
          </button>
        ) : (
          <button className="botao" disabled={criar.isPending} onClick={() => criar.mutate()}>
            Enviar pedido
          </button>
        )}
      </div>
    </div>
  )
}

function Gerenciar({ aoAbrir }: { aoAbrir: () => void }) {
  const qc = useQueryClient()
  const contas = useQuery(consultaContas)
  const cancelar = useMutation({
    mutationFn: async (id: number) => (await api.post(`/contas/${id}/cancelar`)).data,
    onSuccess: () => {
      avisar('Pedido cancelado')
      qc.invalidateQueries({ queryKey: ['contas'] })
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contas digitais</h1>
          <p className="text-suave">Pedidos e contas da clínica para receber por Pix e boleto.</p>
        </div>
        <button className="botao" onClick={aoAbrir}>
          Abrir conta
        </button>
      </header>
      {contas.data?.length === 0 && (
        <div className="cartao py-10 text-center">
          <p className="font-semibold">Nenhuma conta ainda</p>
          <p className="text-suave">Abra a conta da clínica para receber por Pix e boleto.</p>
        </div>
      )}
      {!!contas.data?.length && (
        <div className="cartao overflow-x-auto p-0">
          <table className="w-full text-left">
            <thead className="border-b border-borda text-suave">
              <tr>
                {['Titular', 'Documento', 'Tipo', 'Pedido em', 'Situação', ''].map((t) => (
                  <th key={t} className="px-4 py-2 font-medium">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contas.data.map((c) => (
                <tr key={c.id} className="border-b border-borda last:border-0">
                  <td className="px-4 py-2 font-medium">{c.nome}</td>
                  <td className="px-4 py-2">{documentoBR(c)}</td>
                  <td className="px-4 py-2">{TIPOS_CONTA[c.tipo]}</td>
                  <td className="px-4 py-2">{dataBR(c.criadoEm)}</td>
                  <td className="px-4 py-2">{STATUS_CONTA[c.status]}</td>
                  <td className="px-4 py-2 text-right">
                    {c.status !== 'CANCELADA' && (
                      <button
                        className="text-perigo hover:underline"
                        disabled={cancelar.isPending}
                        onClick={() =>
                          confirm(`Cancelar o pedido de conta de ${c.nome}?`) &&
                          cancelar.mutate(c.id)
                        }
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Extrato() {
  const contas = useQuery(consultaContas)
  const ativas = contas.data?.filter((c) => c.status === 'ATIVA') ?? []
  return (
    <div className="cartao space-y-2 py-10 text-center">
      <p className="font-semibold">{ativas.length ? 'Sem movimentações' : 'Nenhuma conta ativa'}</p>
      <p className="text-suave">
        {ativas.length
          ? 'As movimentações aparecem aqui assim que houver recebimentos.'
          : 'O extrato aparece quando uma conta estiver ativa com o parceiro de pagamentos.'}
      </p>
    </div>
  )
}
