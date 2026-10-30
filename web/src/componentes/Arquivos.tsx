// Fotos e Exames do paciente: pastas, envio, girar/espelhar na hora, excluir (R-076, R-077).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, dataBR, mensagemDeErro, type Paciente } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { Dialogo } from './Dialogo'
import { confirmar } from './Confirmar'
import { CampoSugestoes } from './CampoSugestoes'

interface Arquivo {
  id: number
  pasta: string | null
  nome: string
  tipo: string
  tamanho: number
  rotacao: number
  espelhado: boolean
  criadoEm: string
  criadoPor: { nome: string }
}
type Categoria = 'FOTO' | 'EXAME'

const ACEITOS = {
  FOTO: 'image/jpeg,image/png,image/webp,image/bmp,image/gif',
  EXAME: 'image/jpeg,image/png,image/webp,image/bmp,image/gif,application/pdf',
}
const SEM_PASTA = 'Sem pasta'
const url = (a: Arquivo) => `/api/prontuario/arquivos/${a.id}/conteudo`
const transformar = (a: Arquivo) => `rotate(${a.rotacao}deg)${a.espelhado ? ' scaleX(-1)' : ''}`

export function Arquivos({ paciente, categoria }: { paciente: Paciente; categoria: Categoria }) {
  const { data: eu } = useSuspenseQuery(consultaEu)
  const qc = useQueryClient()
  const chave = ['arquivos', paciente.id, categoria]
  const lista = useQuery({
    queryKey: chave,
    queryFn: async () =>
      (await api.get<Arquivo[]>(`/pacientes/${paciente.id}/arquivos`, { params: { categoria } }))
        .data,
  })
  const [pasta, setPasta] = useState('')
  const [aberto, setAberto] = useState<Arquivo | null>(null)
  const podeEditar = pode(eu.perfis, 'prontuario.editar')

  const enviar = useMutation({
    mutationFn: async (arquivos: File[]) => {
      for (const f of arquivos)
        await api.post(`/pacientes/${paciente.id}/arquivos`, f, {
          headers: { 'Content-Type': f.type || 'application/octet-stream' },
          params: { categoria, pasta: pasta.trim() || undefined, nome: f.name },
        })
      return arquivos.length
    },
    onSuccess: (n) => avisar(n > 1 ? `${n} arquivos enviados` : 'Arquivo enviado'),
    onError: (e) => avisar(mensagemDeErro(e), true),
    onSettled: () => qc.invalidateQueries({ queryKey: chave }),
  })

  const grupos = new Map<string, Arquivo[]>()
  for (const a of lista.data ?? []) {
    const p = a.pasta ?? SEM_PASTA
    grupos.set(p, [...(grupos.get(p) ?? []), a])
  }
  const pastas = [...grupos.keys()].filter((p) => p !== SEM_PASTA)
  const titulo = categoria === 'FOTO' ? 'Fotos' : 'Exames'

  return (
    <div className="space-y-4">
      <section className="cartao space-y-3">
        <h2 className="font-semibold">{titulo}</h2>
        {categoria === 'EXAME' && (
          <p className="text-suave">
            Sem integração com centro radiológico. Anexe aqui os exames recebidos (imagem ou PDF).
          </p>
        )}
        {podeEditar && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="w-60">
              <span className="rotulo">Pasta (opcional)</span>
              <CampoSugestoes
                sugestoes={pastas}
                value={pasta}
                maxLength={80}
                onChange={setPasta}
                placeholder="Ex.: Inicial, Pós-tratamento"
              />
            </label>
            <label className={`botao ${enviar.isPending ? 'opacity-50' : ''}`}>
              {enviar.isPending
                ? 'Enviando…'
                : `Adicionar ${categoria === 'FOTO' ? 'fotos' : 'exames'}`}
              <input
                type="file"
                multiple
                accept={ACEITOS[categoria]}
                className="sr-only"
                disabled={enviar.isPending}
                onChange={(e) => {
                  const arquivos = [...(e.target.files ?? [])]
                  e.target.value = ''
                  if (arquivos.length) enviar.mutate(arquivos)
                }}
              />
            </label>
          </div>
        )}
      </section>

      {lista.data?.length === 0 && (
        <p className="cartao text-suave">
          {categoria === 'FOTO' ? 'Nenhuma foto ainda.' : 'Nenhum exame anexado.'}
        </p>
      )}

      {[...grupos].map(([nomePasta, arquivos]) => (
        <section key={nomePasta} className="cartao space-y-3">
          <h3 className="font-semibold">
            {nomePasta} <span className="font-normal text-suave">({arquivos.length})</span>
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {arquivos.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="block w-full overflow-hidden rounded-md border border-borda text-left hover:border-primaria"
                  onClick={() => setAberto(a)}
                >
                  <div className="grid aspect-square place-items-center overflow-hidden bg-fundo">
                    {a.tipo === 'application/pdf' ? (
                      <span className="text-2xl font-semibold text-suave">PDF</span>
                    ) : (
                      <img
                        src={url(a)}
                        alt={a.nome}
                        loading="lazy"
                        className="size-full object-cover"
                        style={{ transform: transformar(a) }}
                      />
                    )}
                  </div>
                  <p className="truncate px-2 pt-1">{a.nome}</p>
                  <p className="px-2 pb-1 text-xs text-suave">{dataBR(a.criadoEm)}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Dialogo aberto={!!aberto} aoFechar={() => setAberto(null)} titulo={aberto?.nome ?? ''} largo>
        {aberto && (
          <Visualizador
            arquivo={aberto}
            podeEditar={podeEditar}
            aoMudar={(a) => {
              setAberto(a)
              qc.invalidateQueries({ queryKey: chave })
            }}
            aoExcluir={() => {
              setAberto(null)
              qc.invalidateQueries({ queryKey: chave })
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

function Visualizador(props: {
  arquivo: Arquivo
  podeEditar: boolean
  aoMudar: (a: Arquivo) => void
  aoExcluir: () => void
}) {
  const a = props.arquivo
  // R-077: girar e espelhar gravam na hora, sem botão salvar.
  const mudar = useMutation({
    mutationFn: async (d: Partial<Pick<Arquivo, 'rotacao' | 'espelhado'>>) =>
      (await api.patch<Arquivo>(`/prontuario/arquivos/${a.id}`, d)).data,
    onSuccess: props.aoMudar,
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const excluir = useMutation({
    mutationFn: async () => (await api.delete(`/prontuario/arquivos/${a.id}`)).data,
    onSuccess: () => {
      avisar('Arquivo excluído')
      props.aoExcluir()
    },
    onError: (e) => avisar(mensagemDeErro(e), true),
  })
  const pdf = a.tipo === 'application/pdf'
  return (
    <div className="space-y-3">
      <div className="grid h-[60vh] place-items-center overflow-hidden rounded-md bg-fundo">
        {pdf ? (
          <iframe src={url(a)} title={a.nome} className="size-full" />
        ) : (
          <img
            src={url(a)}
            alt={a.nome}
            className="max-h-full max-w-full object-contain"
            style={{ transform: transformar(a) }}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-suave">
          Enviado em {dataBR(a.criadoEm)} por {a.criadoPor.nome} · {Math.ceil(a.tamanho / 1024)} KB
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="botao-leve" href={url(a)} target="_blank" rel="noreferrer">
            Abrir em nova aba
          </a>
          {props.podeEditar && !pdf && (
            <>
              <button
                className="botao-leve"
                disabled={mudar.isPending}
                onClick={() => mudar.mutate({ rotacao: (a.rotacao + 90) % 360 })}
              >
                Girar
              </button>
              <button
                className="botao-leve"
                disabled={mudar.isPending}
                onClick={() => mudar.mutate({ espelhado: !a.espelhado })}
              >
                Espelhar
              </button>
            </>
          )}
          {props.podeEditar && (
            <button
              className="botao-leve text-perigo"
              disabled={excluir.isPending}
              onClick={async () =>
                (await confirmar(
                  `Excluir "${a.nome}"? Ele sai da ficha, mas fica guardado no histórico.`,
                )) && excluir.mutate()
              }
            >
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
