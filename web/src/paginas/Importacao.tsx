// Importar dados do sistema antigo (F-030): lê a planilha XLSX aqui no navegador, o usuário
// confere qual coluna é cada campo, e as linhas vão ao servidor em lotes.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import readXlsxFile from 'read-excel-file/browser'
import { api, mensagemDeErro } from '../api'
import { avisar } from '../estado'
import {
  CAMPOS_IMPORTACAO,
  TITULOS_IMPORTACAO,
  sugerirColunas,
  type TipoImportacao,
} from '../../../shared/importacao'
import { CampoSelect } from '../componentes/CampoSelect'

type Celula = string | number | boolean | Date | null
interface Planilha {
  arquivo: string
  abas: { sheet: string; data: Celula[][] }[]
}
interface Resultado {
  criados: number
  ignorados: number
  erros: { linha: number; erro: string }[]
}
interface Historico {
  id: number
  tipo: TipoImportacao
  arquivo: string
  criados: number
  ignorados: number
  erros: number
  criadoEm: string
  criadoPor: { nome: string }
}

const LOTE = 200
const ORDEM: TipoImportacao[] = ['pacientes', 'agendamentos', 'procedimentos']

/** Célula da planilha → texto que o servidor entende (datas aaaa-mm-dd, horas HH:MM). */
function valorCelula(v: Celula, campo: string): string | null {
  if (v === null || v === '') return null
  if (v instanceof Date) {
    const iso = v.toISOString()
    return campo === 'inicio' || campo === 'fim' ? iso.slice(11, 16) : iso.slice(0, 10)
  }
  // CPF salvo como número perde o zero da frente.
  if (typeof v === 'number' && campo.toLowerCase().includes('cpf'))
    return String(v).padStart(11, '0')
  return String(v)
}

export function Importacao() {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<TipoImportacao>('pacientes')
  const [planilha, setPlanilha] = useState<Planilha | null>(null)
  const [aba, setAba] = useState(0)
  const [mapa, setMapa] = useState<Record<string, number | null>>({})
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const historico = useQuery({
    queryKey: ['importacoes'],
    queryFn: async () => (await api.get<Historico[]>('/importacao')).data,
  })

  const dados = planilha?.abas[aba]?.data ?? []
  const cabecalhos = (dados[0] ?? []).map((c) => String(c ?? '').trim())
  const linhas = dados.slice(1).filter((l) => l.some((c) => c !== null && c !== ''))
  const campos = Object.entries(CAMPOS_IMPORTACAO[tipo]) as [
    string,
    { rotulo: string; obrigatorio?: boolean },
  ][]
  const faltando = campos
    .filter(([c, d]) => d.obrigatorio && mapa[c] == null)
    .map(([, d]) => d.rotulo)

  function escolherAba(p: Planilha, i: number, t = tipo) {
    setAba(i)
    const cab = (p.abas[i]?.data[0] ?? []).map((c) => String(c ?? ''))
    setMapa(sugerirColunas(t, cab))
    setResultado(null)
  }

  async function lerArquivo(f: File) {
    try {
      const abas = await readXlsxFile(f)
      const p: Planilha = { arquivo: f.name, abas: abas as Planilha['abas'] }
      setPlanilha(p)
      escolherAba(p, 0)
    } catch {
      avisar('Não consegui ler o arquivo. Envie a planilha em formato XLSX.', true)
    }
  }

  const montar = (l: Celula[]) =>
    Object.fromEntries(
      campos.map(([c]) => [c, mapa[c] == null ? null : valorCelula(l[mapa[c]!] ?? null, c)]),
    )

  async function importar() {
    const total = linhas.length
    const soma: Resultado = { criados: 0, ignorados: 0, erros: [] }
    setResultado(null)
    setProgresso({ feitas: 0, total })
    try {
      for (let i = 0; i < total; i += LOTE) {
        const r = (
          await api.post<Resultado>(`/importacao/${tipo}`, {
            arquivo: planilha!.arquivo,
            // Número da linha como no Excel: a 1ª é o cabeçalho.
            primeiraLinha: i + 2,
            linhas: linhas.slice(i, i + LOTE).map(montar),
          })
        ).data
        soma.criados += r.criados
        soma.ignorados += r.ignorados
        soma.erros.push(...r.erros)
        setProgresso({ feitas: Math.min(total, i + LOTE), total })
      }
      avisar(`Importação concluída: ${soma.criados} novo(s).`)
    } catch (e) {
      avisar(`A importação parou: ${mensagemDeErro(e)}. O que já foi enviado ficou gravado.`, true)
    }
    setResultado(soma)
    setProgresso(null)
    qc.invalidateQueries({ queryKey: ['importacoes'] })
    qc.invalidateQueries({ queryKey: ['pacientes'] })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Importar dados do sistema antigo</h1>
        <p className="text-suave">
          No sistema antigo, use “Exportar dados” para baixar as planilhas (XLSX). Importe nesta
          ordem: <strong>1. pacientes</strong>, 2. agendamentos, 3. procedimentos do prontuário.
          Antes, cadastre os profissionais com o mesmo nome usado no sistema antigo. Pode importar o
          mesmo arquivo de novo: o que já existe é ignorado.
        </p>
      </div>

      <section className="cartao space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="rotulo">O que importar</span>
            <CampoSelect
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as TipoImportacao
                setTipo(t)
                if (planilha) escolherAba(planilha, aba, t)
              }}
              vazio={false}
              opcoes={ORDEM.map((t, i) => [t, `${i + 1}. ${TITULOS_IMPORTACAO[t]}`] as const)}
            />
          </label>
          <label className="botao">
            Escolher planilha (.xlsx)
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) lerArquivo(f)
              }}
            />
          </label>
          {planilha && planilha.abas.length > 1 && (
            <label>
              <span className="rotulo">Aba da planilha</span>
              <CampoSelect
                value={aba}
                onChange={(e) => escolherAba(planilha, Number(e.target.value))}
                vazio={false}
                opcoes={planilha.abas.map((a, i) => [i, a.sheet] as const)}
              />
            </label>
          )}
          {planilha && (
            <p className="text-suave">
              {planilha.arquivo} · {linhas.length} linha(s)
            </p>
          )}
        </div>
      </section>

      {planilha && (
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Qual coluna da planilha é cada campo?</h2>
          <p className="text-suave">Já sugeri pelo nome do cabeçalho. Confira e ajuste.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campos.map(([c, d]) => (
              <label key={c}>
                <span className="rotulo">
                  {d.rotulo}
                  {d.obrigatorio && ' *'}
                </span>
                <CampoSelect
                  value={mapa[c] ?? ''}
                  onChange={(e) =>
                    setMapa({ ...mapa, [c]: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  vazio="— não importar —"
                  opcoes={cabecalhos.map((h, i) => [i, h || `Coluna ${i + 1}`] as const)}
                />
              </label>
            ))}
          </div>

          {!!linhas.length && (
            <>
              <h3 className="font-medium">Prévia das 5 primeiras linhas</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-borda text-suave">
                    <tr>
                      {campos
                        .filter(([c]) => mapa[c] != null)
                        .map(([c, d]) => (
                          <th key={c} className="px-2 py-1 font-medium">
                            {d.rotulo}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.slice(0, 5).map((l, i) => {
                      const m = montar(l)
                      return (
                        <tr key={i} className="border-b border-borda last:border-0">
                          {campos
                            .filter(([c]) => mapa[c] != null)
                            .map(([c]) => (
                              <td key={c} className="px-2 py-1">
                                {m[c] ?? ''}
                              </td>
                            ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {faltando.length > 0 && (
            <p className="text-perigo">Escolha a coluna de: {faltando.join(', ')}.</p>
          )}
          <div className="flex items-center justify-end gap-3">
            {progresso && (
              <span className="text-suave" role="status">
                Enviando {progresso.feitas} de {progresso.total}…
              </span>
            )}
            <button
              className="botao"
              disabled={!!faltando.length || !linhas.length || !!progresso}
              onClick={importar}
            >
              Importar {linhas.length} linha(s)
            </button>
          </div>
        </section>
      )}

      {resultado && (
        <section className="cartao space-y-2" role="status">
          <h2 className="font-semibold">Resultado</h2>
          <p>
            <strong className="text-sucesso">{resultado.criados} criado(s)</strong> ·{' '}
            {resultado.ignorados} já existia(m) ·{' '}
            <span className={resultado.erros.length ? 'text-perigo' : ''}>
              {resultado.erros.length} com erro
            </span>
          </p>
          {!!resultado.erros.length && (
            <ul className="max-h-64 overflow-y-auto text-perigo">
              {resultado.erros.slice(0, 300).map((e) => (
                <li key={e.linha}>
                  Linha {e.linha}: {e.erro}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="cartao space-y-2">
        <h2 className="font-semibold">Importações feitas</h2>
        {historico.data?.length === 0 && <p className="text-suave">Nenhuma ainda.</p>}
        <ul className="space-y-1">
          {historico.data?.map((h) => (
            <li key={h.id}>
              {new Date(h.criadoEm).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}{' '}
              · {TITULOS_IMPORTACAO[h.tipo]} · {h.arquivo} ·{' '}
              <span className="text-suave">
                {h.criados} novo(s), {h.ignorados} repetido(s), {h.erros} erro(s) ·{' '}
                {h.criadoPor.nome}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
