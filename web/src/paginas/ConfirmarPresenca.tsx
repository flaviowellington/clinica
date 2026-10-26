// Página pública: o paciente abre o link do e-mail e confirma a consulta. Sem login.
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, dataBR, mensagemDeErro } from '../api'

interface Dados {
  paciente: string
  data: string
  horario: string
  profissional: string
  clinica: string
  confirmado: boolean
}

export function ConfirmarPresenca() {
  const { token } = useParams({ from: '/confirmar/$token' })
  const dados = useQuery({
    queryKey: ['confirmacao-publica', token],
    queryFn: async () => (await api.get<Dados>(`/publico/confirmacao/${token}`)).data,
    retry: false,
  })
  const confirmar = useMutation({
    mutationFn: async () => (await api.post(`/publico/confirmacao/${token}`)).data,
  })
  const d = dados.data
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="cartao w-full max-w-md space-y-4 p-6 text-center">
        {dados.isPending && <p className="text-suave">Carregando…</p>}
        {dados.isError && <p className="text-perigo">{mensagemDeErro(dados.error)}</p>}
        {d && (
          <>
            <h1 className="text-xl font-semibold">{d.clinica}</h1>
            <p className="text-base">
              Olá, {d.paciente}! Sua consulta é em <strong>{dataBR(d.data)}</strong> às{' '}
              <strong>{d.horario}</strong>, com {d.profissional}.
            </p>
            {d.confirmado || confirmar.isSuccess ? (
              <p className="text-lg font-medium text-sucesso">Presença confirmada. Até lá!</p>
            ) : (
              <button
                className="botao w-full py-3 text-base"
                disabled={confirmar.isPending}
                onClick={() => confirmar.mutate()}
              >
                Confirmar presença
              </button>
            )}
            {confirmar.isError && <p className="text-perigo">{mensagemDeErro(confirmar.error)}</p>}
            <p className="text-suave">Não pode ir? Ligue para a clínica para remarcar.</p>
          </>
        )}
      </div>
    </main>
  )
}
