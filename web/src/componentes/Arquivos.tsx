// Fotos e Exames do paciente: pastas, envio, girar/espelhar na hora, excluir (R-076, R-077).
import { useEffect, useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, consultaEu, dataBR, mensagemDeErro, type Paciente } from '../api'
import { avisar } from '../estado'
import { pode } from '../../../shared/permissoes'
import { Dialogo } from './Dialogo'
import { confirmar } from './Confirmar'
import { CampoSugestoes } from './CampoSugestoes'
import { Icone } from './Icones'

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
const TEXTOS = {
  FOTO: {
    titulo: 'Fotos',
    subtitulo: 'Fotos clínicas do paciente, organizadas por pasta.',
    botao: 'Adicionar fotos',
    vazio: 'Nenhuma foto ainda',
    icone: 'foto',
  },
  EXAME: {
    titulo: 'Exames',
    subtitulo:
      'Sem integração com centro radiológico. Anexe aqui os exames recebidos (imagem ou PDF).',
    botao: 'Adicionar exames',
    vazio: 'Nenhum exame anexado',
    icone: 'arquivo',
  },
} as const
const SEM_PASTA = 'Sem pasta'
const url = (a: Arquivo) => `/api/prontuario/arquivos/${a.id}/conteudo`
const transformar = (a: Arquivo) => `rotate(${a.rotacao}deg)${a.espelhado ? ' scaleX(-1)' : ''}`
const tamanho = (b: number) =>
  b < 1024 * 1024
    ? `${Math.ceil(b / 1024)} KB`
    : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

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
  const [abertoId, setAbertoId] = useState<number | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const idEnvio = useId()
  const podeEditar = pode(eu.perfis, 'prontuario.editar')
  const t = TEXTOS[categoria]

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

  function receber(arquivos: File[]) {
    // Arrastar aceita qualquer arquivo: deixa de fora o que o servidor recusaria.
    const validos = arquivos.filter((f) => ACEITOS[categoria].split(',').includes(f.type))
    if (validos.length < arquivos.length)
      avisar(
        categoria === 'FOTO'
          ? 'Só imagens JPEG, PNG, WEBP, BMP ou GIF são aceitas.'
          : 'Só imagens ou PDF são aceitos.',
        true,
      )
    if (validos.length) enviar.mutate(validos)
  }

  const grupos = new Map<string, Arquivo[]>()
  for (const a of lista.data ?? []) {
    const p = a.pasta ?? SEM_PASTA
    grupos.set(p, [...(grupos.get(p) ?? []), a])
  }
  const pastas = [...grupos.keys()].filter((p) => p !== SEM_PASTA)
  // Pastas com nome primeiro; "Sem pasta" fica por último.
  const secoes = [...grupos].sort(([a], [b]) => +(a === SEM_PASTA) - +(b === SEM_PASTA))
  // Ordem em que o visualizador anda com as setas: a mesma da tela.
  const ordem = secoes.flatMap(([, l]) => l)
  const i = ordem.findIndex((a) => a.id === abertoId)
  const aberto = ordem[i]

  return (
    <div
      className={`space-y-4 rounded-2xl ${arrastando ? 'outline-2 outline-offset-4 outline-primaria outline-dashed' : ''}`}
      onDragOver={(e) => {
        if (!podeEditar || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false)
      }}
      onDrop={(e) => {
        if (!podeEditar) return
        e.preventDefault()
        setArrastando(false)
        receber([...e.dataTransfer.files])
      }}
    >
      <header className="cartao flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">{t.titulo}</h2>
          <p className="subtitulo">{t.subtitulo}</p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="w-60">
              <span className="rotulo">Nome da Pasta (opcional)</span>
              <CampoSugestoes
                sugestoes={pastas}
                value={pasta}
                maxLength={80}
                onChange={setPasta}
                placeholder="Ex.: Inicial, Pós-tratamento"
              />
            </label>
            <label
              htmlFor={idEnvio}
              className={`botao has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primaria ${enviar.isPending ? 'pointer-events-none opacity-60' : ''}`}
            >
              <Icone nome="enviar" className="h-4 w-4" />
              {enviar.isPending ? 'Enviando…' : t.botao}
              <input
                id={idEnvio}
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
      </header>

      {lista.isPending && <p className="cartao py-10 text-center text-suave">Carregando…</p>}
      {lista.isError && (
        <p className="cartao py-10 text-center text-perigo">{mensagemDeErro(lista.error)}</p>
      )}

      {lista.data?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-borda bg-superficie px-4 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-primaria-clara text-primaria">
            <Icone nome={t.icone} className="h-7 w-7" />
          </span>
          <div>
            <p className="font-bold text-titulo">{t.vazio}</p>
            {podeEditar && (
              <p className="text-suave">Arraste os arquivos para cá ou use o botão abaixo.</p>
            )}
          </div>
          {podeEditar && (
            <label htmlFor={idEnvio} className="botao-leve botao-pequeno">
              <Icone nome="enviar" className="h-3.5 w-3.5" />
              {t.botao}
            </label>
          )}
        </div>
      )}

      {secoes.map(([nomePasta, arquivos]) => (
        <section key={nomePasta} className="cartao space-y-3">
          <h3 className="flex items-center gap-2">
            <Icone nome="pasta" className="h-5 w-5 text-primaria" />
            {nomePasta}
            <span className="etiqueta">{arquivos.length}</span>
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {arquivos.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  title={a.nome}
                  className="block w-full overflow-hidden rounded-xl border border-borda bg-superficie text-left hover:border-primaria hover:shadow-md"
                  onClick={() => setAbertoId(a.id)}
                >
                  <div className="grid aspect-square place-items-center overflow-hidden bg-superficie-2">
                    {a.tipo === 'application/pdf' ? (
                      <span className="flex flex-col items-center gap-2 text-suave">
                        <Icone nome="arquivo" className="h-10 w-10" />
                        <span className="etiqueta etiqueta-perigo">PDF</span>
                      </span>
                    ) : (
                      <img
                        src={url(a)}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                        style={{ transform: transformar(a) }}
                      />
                    )}
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="truncate font-bold">{a.nome}</p>
                    <p className="text-xs text-suave tabular-nums">{dataBR(a.criadoEm)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Dialogo
        aberto={!!aberto}
        aoFechar={() => setAbertoId(null)}
        titulo={aberto?.nome ?? ''}
        largo
      >
        {aberto && (
          <Visualizador
            arquivo={aberto}
            posicao={`${i + 1} de ${ordem.length}`}
            anterior={i > 0 ? () => setAbertoId(ordem[i - 1].id) : undefined}
            proximo={i < ordem.length - 1 ? () => setAbertoId(ordem[i + 1].id) : undefined}
            podeEditar={podeEditar}
            aoMudar={(novo) =>
              qc.setQueryData<Arquivo[]>(chave, (l) => l?.map((x) => (x.id === novo.id ? novo : x)))
            }
            aoExcluir={() => {
              setAbertoId(null)
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
  posicao: string
  anterior?: () => void
  proximo?: () => void
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

  // Setas do teclado passam de um arquivo para o outro.
  const { anterior, proximo } = props
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') anterior?.()
      if (e.key === 'ArrowRight') proximo?.()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [anterior, proximo])

  return (
    <div className="space-y-4">
      <div className="relative grid h-[60vh] place-items-center overflow-hidden rounded-xl bg-superficie-2">
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
        {anterior && (
          <button
            className="botao-leve botao-icone absolute top-[calc(50%-1.125rem)] left-3 shadow-md"
            aria-label="Arquivo anterior"
            title="Anterior (←)"
            onClick={anterior}
          >
            <Icone nome="esquerda" />
          </button>
        )}
        {proximo && (
          <button
            className="botao-leve botao-icone absolute top-[calc(50%-1.125rem)] right-3 shadow-md"
            aria-label="Próximo arquivo"
            title="Próximo (→)"
            onClick={proximo}
          >
            <Icone nome="direita" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-suave">
          <span className="etiqueta mr-2 tabular-nums">{props.posicao}</span>
          Enviado em {dataBR(a.criadoEm)} por {a.criadoPor.nome} · {tamanho(a.tamanho)}
        </p>
        <div className="flex flex-wrap gap-2">
          {props.podeEditar && !pdf && (
            <>
              <button
                className="botao-leve botao-pequeno"
                disabled={mudar.isPending}
                onClick={() => mudar.mutate({ rotacao: (a.rotacao + 90) % 360 })}
              >
                <Icone nome="girar" className="h-4 w-4" />
                Girar
              </button>
              <button
                className="botao-leve botao-pequeno"
                aria-pressed={a.espelhado}
                disabled={mudar.isPending}
                onClick={() => mudar.mutate({ espelhado: !a.espelhado })}
              >
                <Icone nome="espelhar" className="h-4 w-4" />
                Espelhar
              </button>
            </>
          )}
          <a className="botao-leve botao-pequeno" href={url(a)} target="_blank" rel="noreferrer">
            <Icone nome="externo" className="h-4 w-4" />
            Abrir em nova aba
          </a>
          {props.podeEditar && (
            <button
              className="botao-leve botao-pequeno text-perigo hover:border-perigo/50 hover:bg-perigo/10"
              disabled={excluir.isPending}
              onClick={async () =>
                (await confirmar(
                  `Excluir "${a.nome}"? Ele sai da ficha, mas fica guardado no histórico.`,
                )) && excluir.mutate()
              }
            >
              <Icone nome="lixeira" className="h-4 w-4" />
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
