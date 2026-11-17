// Arcadas no documento de autorização: dentição mista pinta cada dente na arcada certa.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { ARCADAS, dentesDoPlano, marcadosNa } from '../../shared/arcadas'
import { escreverPdf } from '../src/pdfAutorizacao'

describe('arcadas do documento', () => {
  it('dentição mista: permanentes na primeira arcada, decíduos na segunda', () => {
    const plano = dentesDoPlano([{ dentes: ['16MO', '55', '11'] }, { dentes: ['74V', '18'] }])
    expect(marcadosNa('permanente', plano).map(([n]) => n)).toEqual(['11', '16'])
    expect(marcadosNa('decidua', plano).map(([n]) => n)).toEqual(['55', '74'])
  })

  it('todo dente do desenho tem o recorte pintado', () => {
    for (const a of Object.values(ARCADAS))
      for (const n of Object.keys(a.dentes))
        expect(
          existsSync(
            fileURLToPath(new URL(`../../shared/arcadas/dentes/${n}.png`, import.meta.url)),
          ),
        ).toBe(true)
  })

  it('o PDF sai com as duas arcadas', async () => {
    const saida = new PassThrough()
    const partes: Buffer[] = []
    saida.on('data', (b) => partes.push(b))
    const fim = new Promise((r) => saida.on('end', r))
    escreverPdf(saida, {
      id: 1,
      clinica: { nome: 'Clínica Teste' } as never,
      conteudo: {
        paciente: 'Paciente Fictício',
        termo: 'Termo.',
        itens: [
          {
            nome: 'Restauração',
            profissional: 'Dra. Teste',
            dentes: ['16MO', '55'],
            observacaoPaciente: null,
          },
        ],
      },
      criadoEm: new Date(),
      assinadoEm: null,
      assinanteNome: null,
      assinatura: null,
      ip: null,
    })
    await fim
    expect(Buffer.concat(partes).subarray(0, 5).toString()).toBe('%PDF-')
  })
})
