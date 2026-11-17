// PDF do plano de tratamento (o mesmo conteúdo da página que o paciente assina).
// Arquivo de verdade: baixa no celular (inclusive no navegador do WhatsApp) e no computador.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import type { Writable } from 'node:stream'
import type { DadosClinica } from '../../shared/configuracoes'
import type { ConteudoAutorizacao } from './autorizacoes'
import { ARCADAS, dentesDoPlano, marcadosNa } from '../../shared/arcadas'
import { reais } from '../../shared/financeiro'

const arquivoArcada = (nome: string) =>
  fileURLToPath(new URL(`../../shared/arcadas/${nome}.png`, import.meta.url))

// Nunito, a fonte do sistema (a mesma da página que o paciente assina).
const fonte = (arquivo: string) =>
  createRequire(import.meta.url).resolve(`@fontsource/nunito/files/nunito-latin-${arquivo}.woff`)
const FONTES = {
  Normal: fonte('400-normal'),
  Negrito: fonte('700-normal'),
  Italico: fonte('400-italic'),
}

const FUSO = 'America/Sao_Paulo'
const data = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: FUSO })
/** 'aaaa-mm-dd' → 'dd/mm/aaaa' (data sem hora, sem fuso). */
const dataIso = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')
const dataHora = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })

export function escreverPdf(
  saida: Writable,
  a: {
    id: number
    clinica: DadosClinica
    conteudo: ConteudoAutorizacao
    criadoEm: Date
    assinadoEm: Date | null
    assinanteNome: string | null
    assinatura: string | null
    ip: string | null
  },
) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: `${a.conteudo.retificacao ? 'Retificação do plano' : 'Plano'} de tratamento – ${a.conteudo.paciente}`,
    },
  })
  for (const [nome, arquivo] of Object.entries(FONTES)) doc.registerFont(nome, arquivo)
  doc.pipe(saida)
  const largura = doc.page.width - 100
  const cinza = '#555555'
  const c = a.clinica

  // Cabeçalho da clínica.
  doc.font('Negrito').fontSize(15).text(c.nome.toUpperCase(), { align: 'center' })
  doc.font('Normal').fontSize(9).fillColor(cinza)
  const linha1 = [c.endereco, c.cidade].filter(Boolean).join(' · ')
  const linha2 = [c.telefone, c.email, c.cnpj && `CNPJ ${c.cnpj}`].filter(Boolean).join(' · ')
  if (linha1) doc.text(linha1, { align: 'center' })
  if (linha2) doc.text(linha2, { align: 'center' })
  doc.fillColor('black').moveDown(0.5)
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + largura, doc.y)
    .lineWidth(1.5)
    .stroke()

  const vermelho = '#b91c1c'
  const r = a.conteudo.retificacao
  doc.moveDown(1.5).font('Negrito').fontSize(12)
  if (r) doc.fillColor(vermelho).text('RETIFICAÇÃO', { align: 'center' }).fillColor('black')
  doc.text('TERMO DE CIÊNCIA E AUTORIZAÇÃO DO PLANO DE TRATAMENTO', { align: 'center' })

  // Retificação: quadro em vermelho com o plano que ela substitui e o que mudou.
  if (r) {
    doc.moveDown(1)
    const topo = doc.y
    const x = 60
    const w = largura - 20
    doc.y = topo + 8
    doc.font('Negrito').fontSize(10).fillColor(vermelho)
    doc.text('DOCUMENTO DE RETIFICAÇÃO', x, doc.y, { width: w })
    doc.font('Normal').fillColor('black')
    doc.text(
      `Este documento corrige e substitui o plano de tratamento assinado em ${data(new Date(r.assinadoEm))}. O que mudou:`,
      x,
      doc.y,
      { width: w },
    )
    for (const t of r.alteracoes) doc.text(`•  ${t}`, x + 6, doc.y, { width: w - 6 })
    const fim = doc.y + 8
    doc
      .rect(50, topo, largura, fim - topo)
      .lineWidth(1.5)
      .strokeColor(vermelho)
      .stroke()
      .strokeColor('black')
    doc.x = 50
    doc.y = fim
  }

  doc.moveDown(1.2).fontSize(10)
  doc.font('Negrito').text('Paciente: ', { continued: true })
  doc.font('Normal').text(a.conteudo.paciente)
  doc.font('Negrito').text('Data: ', { continued: true })
  doc.font('Normal').text(data(a.criadoEm))
  if (a.conteudo.especialidade) {
    doc.font('Negrito').text('Especialidade: ', { continued: true })
    doc.font('Normal').text(a.conteudo.especialidade)
  }

  // Plano escrito pelo profissional.
  if (a.conteudo.plano) {
    doc.moveDown(1).font('Negrito').fontSize(11).text('Plano de tratamento')
    doc.moveDown(0.3).font('Normal').fontSize(10).text(a.conteudo.plano, { align: 'justify' })
    if (a.conteudo.autor)
      doc.fontSize(9).fillColor(cinza).text(`Escrito por ${a.conteudo.autor}`).fillColor('black')
  }

  doc.moveDown(1).font('Negrito').fontSize(11).text('Procedimentos')
  doc.moveDown(0.3)

  // As duas arcadas lado a lado, com os dentes do plano pintados (permanentes e decíduos).
  const plano = dentesDoPlano(a.conteudo.itens)
  if (plano.size) {
    const larg = 100
    const alt = Math.max(...Object.values(ARCADAS).map((ar) => (ar.altura * larg) / ar.largura))
    if (doc.y + alt + 20 > doc.page.height - 50) doc.addPage()
    const topo = doc.y
    // Mesmo espaço entre as duas e delas até as margens.
    const vao = (largura - 2 * larg) / 3
    for (const [tipo, x] of [
      ['permanente', 50 + vao],
      ['decidua', 50 + 2 * vao + larg],
    ] as const) {
      const ar = ARCADAS[tipo]
      const s = larg / ar.largura
      doc.image(arquivoArcada(tipo), x, topo, { width: larg })
      for (const [n, [dx, dy, w, h]] of marcadosNa(tipo, plano))
        doc.image(arquivoArcada(`dentes/${n}`), x + dx * s, topo + dy * s, {
          width: w * s,
          height: h * s,
        })
      doc.font('Normal').fontSize(8).fillColor(cinza)
      doc.text(ar.nome, x, topo + alt + 4, { width: larg, align: 'center' })
      doc.fillColor('black')
    }
    doc.x = 50
    doc.y = topo + alt + 22
  }
  // Nome à esquerda e valor à direita, na mesma linha.
  const colValor = 100
  for (const i of a.conteudo.itens) {
    const y = doc.y
    doc
      .font('Negrito')
      .fontSize(10)
      .text(i.nome, 50, y, { width: largura - colValor })
    const abaixo = doc.y
    if (i.valorCentavos != null)
      doc.text(reais(i.valorCentavos), 50 + largura - colValor, y, {
        width: colValor,
        align: 'right',
      })
    doc.x = 50
    doc.y = Math.max(abaixo, doc.y)
    doc.font('Normal').fontSize(9).fillColor(cinza)
    doc.text(
      [
        i.dentes.length && `Dentes: ${i.dentes.join(', ')}`,
        i.data && `Previsto para ${dataIso(i.data)}`,
        i.profissional,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    doc.fillColor('black')
    if (i.observacaoPaciente) doc.font('Italico').text(i.observacaoPaciente)
    doc.moveDown(0.5)
  }
  const valores = a.conteudo.itens.filter((i) => i.valorCentavos != null)
  if (valores.length)
    doc
      .font('Negrito')
      .fontSize(11)
      .text(`Valor total: ${reais(valores.reduce((s, i) => s + i.valorCentavos!, 0))}`, {
        align: 'right',
      })

  // Etapas do planejamento, com as datas previstas e o comentário do profissional.
  if (a.conteudo.etapas?.length) {
    doc.moveDown(0.5).font('Negrito').fontSize(11).text('Etapas e datas previstas')
    doc.moveDown(0.3)
    a.conteudo.etapas.forEach((e, k) => {
      doc
        .font('Negrito')
        .fontSize(10)
        .text(`${k + 1}. ${e.nome}`, { continued: true })
      doc
        .font('Normal')
        .fillColor(cinza)
        .text(e.data ? `  ·  ${dataIso(e.data)}` : '  ·  a definir')
      doc.fillColor('black')
      if (e.comentario) doc.font('Italico').fontSize(9).text(e.comentario)
      doc.moveDown(0.3)
    })
  }

  // Termo, data e assinatura ficam juntos: se não couberem, vão os três para a próxima página
  // (nunca a assinatura sozinha). Espaços mínimos: 16 acima da assinatura e 60 para o desenho.
  const caixa = { largura: 220, altura: 92, espaco: 16 }
  doc.moveDown(0.5).font('Normal').fontSize(10)
  const fim =
    doc.heightOfString(a.conteudo.termo, { width: largura, align: 'justify' }) +
    doc.currentLineHeight(true) * 2 +
    caixa.espaco +
    caixa.altura
  if (doc.y + fim > doc.page.height - 50) doc.addPage()
  doc.text(a.conteudo.termo, { align: 'justify' })
  doc.moveDown(1).text(`${c.cidade ? `${c.cidade}, ` : ''}${data(a.assinadoEm ?? a.criadoEm)}.`)

  // Assinatura no canto inferior direito.
  const x = 50 + largura - caixa.largura
  const y = doc.y + caixa.espaco
  if (a.assinatura)
    try {
      doc.image(Buffer.from(a.assinatura.split(',')[1], 'base64'), x, y, {
        fit: [caixa.largura, 60],
        align: 'center',
        valign: 'bottom',
      })
    } catch {
      // Imagem estragada: o PDF sai assim mesmo, com nome e data da assinatura.
    }
  doc
    .moveTo(x, y + 62)
    .lineTo(x + caixa.largura, y + 62)
    .lineWidth(0.8)
    .stroke()
  doc.font('Negrito').fontSize(10)
  doc.text(a.assinanteNome ?? a.conteudo.paciente, x, y + 66, {
    width: caixa.largura,
    align: 'center',
  })
  doc.font('Normal').fontSize(8).fillColor(cinza)
  doc.text(
    a.assinadoEm
      ? `Assinado eletronicamente em ${dataHora(a.assinadoEm)}`
      : 'Assinatura do paciente',
    { width: caixa.largura, align: 'center' },
  )

  // Rodapé com o rastro da assinatura.
  doc.page.margins.bottom = 0 // escrever no rodapé sem abrir outra página
  if (a.assinadoEm)
    doc
      .fontSize(7)
      .text(
        `Documento nº ${a.id} · assinado em ${dataHora(a.assinadoEm)}${a.ip ? ` · IP ${a.ip}` : ''}`,
        50,
        doc.page.height - 40,
        { width: largura, align: 'center', lineBreak: false },
      )
  doc.end()
}
