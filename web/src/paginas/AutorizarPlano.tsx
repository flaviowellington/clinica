// Página pública: o paciente abre o link no celular, lê o plano de tratamento em forma de
// documento e assina com o dedo. A assinatura entra no canto do documento; o PDF é gerado no
// servidor (server/src/pdfAutorizacao.ts) e baixa no celular e no computador.
import { useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, dataBR, mensagemDeErro } from '../api'
import type { DadosClinica } from '../../../shared/configuracoes'

interface Dados {
  clinica: DadosClinica
  primeiroNome: string
  criadoEm: string
  assinadoEm: string | null
  assinanteNome: string | null
  assinatura: string | null
  conteudo: {
    paciente: string
    termo: string
    plano?: string | null
    autor?: string
    /** Planejamento: a especialidade e as etapas com as datas previstas. */
    especialidade?: string
    etapas?: { id: string; nome: string; data: string | null; comentario: string | null }[]
    itens: {
      nome: string
      profissional: string
      dentes: string[]
      data?: string | null
      observacaoPaciente: string | null
    }[]
  }
}

/** Um traço da assinatura: os pontos por onde o dedo passou. */
type Traco = [number, number][]

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function AutorizarPlano() {
  const { token } = useParams({ from: '/autorizar/$token' })
  const dados = useQuery({
    queryKey: ['autorizacao-publica', token],
    queryFn: async () => (await api.get<Dados>(`/publico/autorizacao/${token}`)).data,
    retry: false,
  })
  const [nome, setNome] = useState('')
  const quadro = useRef<HTMLCanvasElement>(null)
  // Traços prontos e desfeitos (para refazer); o traço em andamento fica fora do estado.
  const [tracos, setTracos] = useState<Traco[]>([])
  const [desfeitos, setDesfeitos] = useState<Traco[]>([])
  const atual = useRef<Traco | null>(null)
  const assinar = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/publico/autorizacao/${token}`, {
          nome,
          assinatura: quadro.current!.toDataURL('image/png'),
        })
      ).data,
    onSuccess: () => dados.refetch(),
  })

  const pincel = () => {
    const ctx = quadro.current!.getContext('2d')!
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
    return ctx
  }
  const desenhar = (t: Traco, ctx = pincel()) => {
    ctx.beginPath()
    ctx.moveTo(...t[0])
    for (const p of t) ctx.lineTo(...p)
    ctx.stroke()
  }
  const redesenhar = (lista: Traco[]) => {
    const c = quadro.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    lista.forEach((t) => desenhar(t))
  }
  // Dedo, caneta ou mouse (Pointer Events cobre os três).
  const ponto = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    return [
      ((e.clientX - r.left) * e.currentTarget.width) / r.width,
      ((e.clientY - r.top) * e.currentTarget.height) / r.height,
    ]
  }
  const comecar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    atual.current = [ponto(e)]
    desenhar(atual.current) // um toque vira um ponto
  }
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = atual.current
    if (!t) return
    const ctx = pincel()
    ctx.beginPath()
    ctx.moveTo(...t[t.length - 1])
    t.push(ponto(e))
    ctx.lineTo(...t[t.length - 1])
    ctx.stroke()
  }
  const terminar = () => {
    const t = atual.current
    if (!t) return
    atual.current = null
    setTracos([...tracos, t])
    setDesfeitos([]) // traço novo apaga o "refazer"
  }
  const desfazer = () => {
    const n = tracos.slice(0, -1)
    setDesfeitos([...desfeitos, tracos[tracos.length - 1]])
    setTracos(n)
    redesenhar(n)
  }
  const refazer = () => {
    const n = [...tracos, desfeitos[desfeitos.length - 1]]
    setDesfeitos(desfeitos.slice(0, -1))
    setTracos(n)
    redesenhar(n)
  }
  const limpar = () => {
    setTracos([])
    setDesfeitos([])
    redesenhar([])
  }

  const d = dados.data
  const c = d?.clinica
  const linkPdf = `/api/publico/autorizacao/${token}/pdf`
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-3 pt-3 pb-28 sm:px-6 sm:pt-6">
      {dados.isPending && <p className="text-suave">Carregando…</p>}
      {dados.isError && <p className="cartao text-perigo">{mensagemDeErro(dados.error)}</p>}
      {d && c && (
        <>
          {!d.assinadoEm && (
            <p className="text-center">
              Olá, {d.primeiroNome}! Leia o documento abaixo e, se estiver de acordo, assine no fim
              da página.
            </p>
          )}

          {/* O documento: papel branco nos dois temas, igual ao PDF. */}
          <article className="rounded-sm bg-white px-4 py-6 text-[14px] leading-relaxed break-words text-[#1a1a1a] shadow-lg sm:px-12 sm:py-12 sm:text-[15px]">
            <header className="border-b-2 border-[#1a1a1a] pb-3 text-center">
              <p className="text-base font-bold tracking-wide text-[#1a1a1a] uppercase sm:text-lg">
                {c.nome}
              </p>
              <p className="text-xs text-[#555]">
                {[c.endereco, c.cidade].filter(Boolean).join(' · ')}
              </p>
              <p className="text-xs text-[#555]">
                {[c.telefone, c.email, c.cnpj && `CNPJ ${c.cnpj}`].filter(Boolean).join(' · ')}
              </p>
            </header>

            <h1 className="mt-6 text-center text-[15px] font-bold text-[#1a1a1a] uppercase sm:text-base">
              Termo de ciência e autorização do plano de tratamento
            </h1>

            <p className="mt-5">
              <strong>Paciente:</strong> {d.conteudo.paciente}
              <br />
              <strong>Data:</strong> {dataBR(d.criadoEm)}
              {d.conteudo.especialidade && (
                <>
                  <br />
                  <strong>Especialidade:</strong> {d.conteudo.especialidade}
                </>
              )}
            </p>

            {d.conteudo.plano && (
              <section className="mt-5">
                <h2 className="font-bold text-[#1a1a1a]">Plano de tratamento</h2>
                <p className="mt-1 text-justify whitespace-pre-wrap">{d.conteudo.plano}</p>
                {d.conteudo.autor && (
                  <p className="mt-1 text-xs text-[#555]">Escrito por {d.conteudo.autor}</p>
                )}
              </section>
            )}

            <section className="mt-5">
              <h2 className="font-bold text-[#1a1a1a]">Procedimentos</h2>
              <ul className="mt-1 divide-y divide-[#ddd] border-y border-[#ddd]">
                {d.conteudo.itens.map((i, k) => (
                  <li key={k} className="py-2.5">
                    <p className="font-semibold">{i.nome}</p>
                    <p className="text-[13px] text-[#555]">
                      {[
                        i.dentes.length && `Dentes: ${i.dentes.join(', ')}`,
                        i.data && `Previsto para ${dataBR(i.data)}`,
                        i.profissional,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {i.observacaoPaciente && (
                      <p className="mt-1 text-[13px] whitespace-pre-wrap text-[#333] italic">
                        {i.observacaoPaciente}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {!!d.conteudo.etapas?.length && (
              <section className="mt-5">
                <h2 className="font-bold text-[#1a1a1a]">Etapas e datas previstas</h2>
                <ol className="mt-1 divide-y divide-[#ddd] border-y border-[#ddd]">
                  {d.conteudo.etapas.map((e, k) => (
                    <li key={e.id} className="py-2.5">
                      <p className="flex flex-wrap justify-between gap-x-3">
                        <span className="font-semibold">
                          {k + 1}. {e.nome}
                        </span>
                        <span className="text-[13px] text-[#555]">
                          {e.data ? dataBR(e.data) : 'A definir'}
                        </span>
                      </p>
                      {e.comentario && (
                        <p className="mt-1 text-[13px] whitespace-pre-wrap text-[#333] italic">
                          {e.comentario}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <p className="mt-6 text-justify">{d.conteudo.termo}</p>

            <p className="mt-6">
              {c.cidade ? `${c.cidade}, ` : ''}
              {dataBR(d.assinadoEm ?? d.criadoEm)}.
            </p>

            {/* Assinatura no canto inferior direito (no celular, ocupa a largura). */}
            <div className="mt-10 flex justify-end">
              <div className="w-full text-center sm:w-72">
                <div className="flex h-20 items-end justify-center">
                  {d.assinatura && (
                    <img
                      src={d.assinatura}
                      alt={`Assinatura de ${d.assinanteNome}`}
                      className="max-h-20 max-w-full"
                    />
                  )}
                </div>
                <div className="border-t border-[#1a1a1a] pt-1">
                  <p className="font-semibold">{d.assinanteNome ?? d.conteudo.paciente}</p>
                  <p className="text-xs text-[#555]">
                    {d.assinadoEm
                      ? `Assinado eletronicamente em ${dataHora(d.assinadoEm)}`
                      : 'Assinatura do paciente'}
                  </p>
                </div>
              </div>
            </div>
          </article>

          {d.assinadoEm ? (
            <div className="cartao space-y-3 text-center">
              <p className="text-lg font-medium text-sucesso">Plano assinado. Obrigado!</p>
              <a className="botao block w-full py-3 text-base" href={linkPdf} download>
                Baixar PDF
              </a>
            </div>
          ) : (
            <form
              className="cartao space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                assinar.mutate()
              }}
            >
              <label className="block">
                <span className="rotulo">Seu nome completo</span>
                <input
                  className="campo text-base"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
              <div>
                <span className="rotulo">Assine com o dedo no quadro</span>
                <canvas
                  ref={quadro}
                  width={900}
                  height={360}
                  aria-label="Quadro de assinatura"
                  className="mt-1 block aspect-[5/2] w-full touch-none rounded-xl border border-borda bg-white"
                  onPointerDown={comecar}
                  onPointerMove={mover}
                  onPointerUp={terminar}
                  onPointerCancel={terminar}
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className="botao-leve px-2 py-2 whitespace-nowrap"
                    disabled={!tracos.length}
                    onClick={desfazer}
                  >
                    ↶ Desfazer
                  </button>
                  <button
                    type="button"
                    className="botao-leve px-2 py-2 whitespace-nowrap text-perigo"
                    disabled={!tracos.length && !desfeitos.length}
                    onClick={limpar}
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    className="botao-leve px-2 py-2 whitespace-nowrap"
                    disabled={!desfeitos.length}
                    onClick={refazer}
                  >
                    ↷ Refazer
                  </button>
                </div>
              </div>
              {assinar.isError && <p className="text-perigo">{mensagemDeErro(assinar.error)}</p>}
              <button
                className="botao w-full py-3 text-base"
                disabled={!nome.trim() || !tracos.length || assinar.isPending}
              >
                Li e autorizo o tratamento
              </button>
            </form>
          )}
        </>
      )}
    </main>
  )
}
