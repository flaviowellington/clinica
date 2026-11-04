// PDF do plano de tratamento (o mesmo conteúdo da página que o paciente assina).
// Arquivo de verdade: baixa no celular (inclusive no navegador do WhatsApp) e no computador.
import { createRequire } from 'node:module'
import PDFDocument from 'pdfkit'
import type { Writable } from 'node:stream'
import type { DadosClinica } from '../../shared/configuracoes'
import type { ConteudoAutorizacao } from './autorizacoes'

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
    info: { Title: `Plano de tratamento – ${a.conteudo.paciente}` },
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

  doc.moveDown(1.5).font('Negrito').fontSize(12)
  doc.text('TERMO DE CIÊNCIA E AUTORIZAÇÃO DO PLANO DE TRATAMENTO', { align: 'center' })

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
  for (const i of a.conteudo.itens) {
    doc.font('Negrito').fontSize(10).text(i.nome)
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

  // Etapas do planejamento, com as datas previstas e o comentário do profissional.
  if (a.conteudo.etapas?.length) {
    doc.moveDown(0.5).font('Negrito').fontSize(11).text('Etapas e datas previstas')
    doc.moveDown(0.3)
    a.conteudo.etapas.forEach((e, k) => {
      doc.font('Negrito').fontSize(10).text(`${k + 1}. ${e.nome}`, { continued: true })
      doc.font('Normal').fillColor(cinza).text(e.data ? `  ·  ${dataIso(e.data)}` : '  ·  a definir')
      doc.fillColor('black')
      if (e.comentario) doc.font('Italico').fontSize(9).text(e.comentario)
      doc.moveDown(0.3)
    })
  }

  doc.moveDown(0.5).font('Normal').fontSize(10).text(a.conteudo.termo, { align: 'justify' })
  doc.moveDown(1).text(`${c.cidade ? `${c.cidade}, ` : ''}${data(a.assinadoEm ?? a.criadoEm)}.`)

  // Assinatura no canto inferior direito; se não couber, vai para a próxima página.
  const caixa = { largura: 220, altura: 110 }
  if (doc.y + 30 + caixa.altura > doc.page.height - 50) doc.addPage()
  const x = 50 + largura - caixa.largura
  const y = doc.y + 30
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
