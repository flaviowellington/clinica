// Permissões por perfil, conferidas no servidor contra o documento permissoes-por-perfil.pdf (06/11/2026).
// Só roda à mão: npm run test:permissoes (fica fora do npm test).
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { entrarComo, PACIENTE, usarServidor, type Cliente } from './ajuda'
import type { Perfil } from '../../shared/permissoes'

usarServidor()

// Quem pode, em letras: R Recepção, F Financeiro, P Profissional, A Administrador.
// :p vira o id de um paciente que existe; 999999 é um id que não existe (a permissão é checada antes).
const D = '2026-11-06'
const MATRIZ: [modulo: string, metodo: string, caminho: string, quem: string][] = [
  ['Agenda', 'GET', `/api/agenda?data=${D}`, 'RFPA'],
  ['Agenda', 'POST', '/api/agenda', 'RFPA'],
  ['Agenda', 'PATCH', '/api/agenda/999999/status', 'RFPA'],
  ['Agenda', 'PUT', '/api/agenda/999999/horario', 'RFPA'],
  ['Agenda', 'POST', '/api/agenda/999999/desmarcar', 'RFPA'],
  ['Agenda', 'GET', `/api/retornos?de=${D}&ate=${D}`, 'RFPA'],
  ['Agenda', 'POST', '/api/retornos', 'RFPA'],
  ['Confirmações', 'GET', `/api/confirmacoes?data=${D}`, 'RFPA'],
  ['Confirmações', 'POST', '/api/confirmacoes/999999/confirmar', 'RFPA'],

  ['Pacientes', 'GET', '/api/pacientes', 'RFPA'],
  ['Pacientes', 'POST', '/api/pacientes', 'RFPA'],
  ['Pacientes', 'PUT', '/api/pacientes/:p', 'RFPA'],
  ['Pacientes', 'POST', '/api/pacientes/:p/inativar', 'RFPA'],
  ['Pacientes', 'POST', '/api/pacientes/:p/ativar', 'RFPA'],
  ['Pacientes', 'DELETE', '/api/pacientes/999999', 'A'],
  ['Ficha: Paciente', 'GET', '/api/pacientes/:p/resumo', 'RFPA'],
  ['Ficha: Paciente', 'POST', '/api/pacientes/:p/notas', 'RFPA'],
  ['Ficha: Atendimento', 'GET', '/api/pacientes/:p/agendamentos', 'RFPA'],
  ['Ficha: Atendimento', 'GET', '/api/orcamentos?pacienteId=:p', 'RFPA'],
  ['Ficha: Outros', 'GET', '/api/pacientes/:p/indicacoes', 'RFPA'],
  ['Ficha: Clínico', 'GET', '/api/pacientes/:p/anamneses', 'PA'],
  ['Ficha: Clínico', 'GET', '/api/pacientes/:p/alertas', 'PA'],
  ['Ficha: Clínico', 'POST', '/api/pacientes/:p/anamneses', 'PA'],
  ['Ficha: Clínico', 'GET', '/api/pacientes/:p/procedimentos', 'PA'],
  ['Ficha: Clínico', 'GET', '/api/pacientes/:p/fichas', 'PA'],
  ['Ficha: Clínico', 'GET', '/api/pacientes/:p/odontograma', 'PA'],
  ['Ficha: Clínico', 'GET', '/api/autorizacoes?pacienteId=:p', 'PA'],
  ['Ficha: Arquivos', 'GET', '/api/pacientes/:p/documentos', 'PA'],
  ['Ficha: Arquivos', 'POST', '/api/pacientes/:p/documentos', 'PA'],
  ['Ficha: Arquivos', 'GET', '/api/pacientes/:p/arquivos?categoria=EXAME', 'PA'],
  ['Ficha: Arquivos', 'GET', '/api/pacientes/:p/arquivos?categoria=FOTO', 'PA'],
  ['Executar procedimento', 'POST', '/api/orcamentos/itens/999999/executar', 'PA'],
  ['Cancelar orçamento aprovado', 'POST', '/api/orcamentos/999999/cancelar', 'FA'],

  ['Protético', 'GET', '/api/protetico', 'RFPA'],
  ['Protético', 'POST', '/api/protetico', 'PA'],
  ['Protético', 'DELETE', '/api/protetico/999999', 'PA'],
  ['Protético', 'PATCH', '/api/protetico/999999/etapa', 'RFPA'],
  ['Protético', 'PUT', '/api/protetico/999999', 'RFPA'],

  ['Financeiro: Orçamentos abertos', 'GET', '/api/financeiro/orcamentos-abertos', 'RFPA'],
  ['Financeiro: Controle', 'GET', '/api/financeiro/contas', 'FA'],
  ['Financeiro: Controle', 'POST', '/api/financeiro/contas', 'FA'],
  ['Financeiro: Controle', 'GET', '/api/financeiro/lancamentos', 'FA'],
  ['Financeiro: Controle', 'GET', '/api/financeiro/fluxo', 'FA'],
  ['Financeiro: Controle', 'GET', '/api/financeiro/extrato', 'FA'],
  ['Financeiro: Gráficos', 'GET', '/api/financeiro/analise', 'FA'],

  ['Relatórios', 'GET', `/api/relatorios/agenda-geral?de=${D}&ate=${D}`, 'FA'],
  ['Relatórios', 'GET', `/api/relatorios/pacientes-novos?de=${D}&ate=${D}`, 'FA'],
  ['Relatórios', 'GET', `/api/relatorios/financeiro-caixa?de=${D}&ate=${D}`, 'FA'],
  ['Relatórios', 'GET', `/api/relatorios/geral-acessos?de=${D}&ate=${D}`, 'FA'],
  ['Relatórios', 'GET', `/api/relatorios/tratamentos-abertos?de=${D}&ate=${D}`, 'FA'],

  ['Painel', 'GET', '/api/painel', 'A'],
  ['Usuários', 'GET', '/api/usuarios', 'A'],
  ['Usuários', 'POST', '/api/usuarios', 'A'],
  ['Configurações', 'GET', '/api/configuracoes/email/estado', 'A'],
  ['Importar dados', 'GET', '/api/importacao', 'A'],
  ['Lixeira', 'GET', '/api/lixeira', 'A'],
  ['Lixeira', 'POST', '/api/lixeira/paciente/999999/restaurar', 'A'],
  ['Profissionais', 'GET', '/api/profissionais', 'RFPA'],
  ['Profissionais', 'POST', '/api/profissionais', 'A'],
]

const LETRA: Record<Perfil, string> = {
  RECEPCAO: 'R',
  FINANCEIRO: 'F',
  PROFISSIONAL: 'P',
  ADMINISTRADOR: 'A',
}

const dentista = (nome = 'Dra. Teste') =>
  db.pessoa.create({ data: { tipo: 'PROFISSIONAL', nome, nomeBusca: nome.toLowerCase() } })
const paciente = async (api: Cliente, extra = {}) =>
  (await api('POST', '/api/pacientes', { ...PACIENTE, ...extra })).corpo

describe('permissões por perfil (servidor recusa o que a tela esconde)', () => {
  let pacienteId = 0
  beforeEach(async () => {
    pacienteId = (
      await db.pessoa.create({
        data: { tipo: 'PACIENTE', nome: 'Paciente Fictício', nomeBusca: 'paciente ficticio' },
      })
    ).id
  })

  for (const perfil of Object.keys(LETRA) as Perfil[]) {
    it(`matriz: ${perfil}`, async () => {
      const api = await entrarComo(perfil)
      for (const [modulo, metodo, caminho, quem] of MATRIZ) {
        const url = caminho.replace(':p', String(pacienteId))
        const { status } = await api(metodo, url, metodo === 'GET' ? undefined : {})
        const pode = quem.includes(LETRA[perfil])
        const msg = `${modulo} — ${metodo} ${url}: ${perfil} ${pode ? 'deveria' : 'não deveria'} poder (veio ${status})`
        if (pode) expect.soft([401, 403], msg).not.toContain(status)
        else expect.soft(status, msg).toBe(403)
      }
    })
  }

  it('as permissões se somam: Recepção + Profissional vê o prontuário e o Financeiro não', async () => {
    const api = await entrarComo('RECEPCAO', 'PROFISSIONAL')
    expect((await api('GET', `/api/pacientes/${pacienteId}/anamneses`)).status).toBe(200)
    expect((await api('GET', '/api/financeiro/contas')).status).toBe(403)
  })
})

describe('regras que dependem dos dados', () => {
  it('receber ao aprovar orçamento: Recepção, Financeiro e Adm sim; Profissional não', async () => {
    const adm = await entrarComo('ADMINISTRADOR')
    const prof = await dentista()
    const pac = await paciente(adm)
    const proc = await db.procedimento.create({
      data: { nome: 'Limpeza', nomeBusca: 'limpeza', valorCentavos: 15000 },
    })
    const esperado: [Perfil, number][] = [
      ['RECEPCAO', 200],
      ['FINANCEIRO', 200],
      ['ADMINISTRADOR', 200],
      ['PROFISSIONAL', 403],
    ]
    for (const [perfil, status] of esperado) {
      const { corpo: o } = await adm('POST', '/api/orcamentos', {
        pacienteId: pac.id,
        profissionalId: prof.id,
        itens: [{ procedimentoId: proc.id }],
      })
      const api = await entrarComo(perfil)
      const r = await api('POST', `/api/orcamentos/${o.id}/aprovar`, {
        pagamento: { forma: 'Pix', data: D },
      })
      expect.soft(r.status, `${perfil} aprovando com pagamento`).toBe(status)
    }
    // Sem pagamento, o Profissional aprova.
    const { corpo: o } = await adm('POST', '/api/orcamentos', {
      pacienteId: pac.id,
      profissionalId: prof.id,
      itens: [{ procedimentoId: proc.id }],
    })
    expect(
      (await (await entrarComo('PROFISSIONAL'))('POST', `/api/orcamentos/${o.id}/aprovar`)).status,
    ).toBe(200)
  })

  it('Confirmações: Recepção e Financeiro veem todas; Profissional só as dele', async () => {
    const rec = await entrarComo('RECEPCAO')
    const pac = await paciente(rec)
    const [a, b] = [await dentista('Dra. A'), await dentista('Dr. B')]
    for (const prof of [a, b])
      await rec('POST', '/api/agenda', {
        tipo: 'CONSULTA',
        data: D,
        inicio: prof === a ? '09:00' : '10:00',
        profissionalId: prof.id,
        pacienteId: pac.id,
      })
    const url = `/api/confirmacoes?data=${D}`
    expect((await rec('GET', url)).corpo).toHaveLength(2)
    expect((await (await entrarComo('FINANCEIRO'))('GET', url)).corpo).toHaveLength(2)
    expect((await (await entrarComo('ADMINISTRADOR'))('GET', url)).corpo).toHaveLength(2)
    const dele = await entrarComo('PROFISSIONAL')
    await db.usuario.update({ where: { id: dele.usuario.id }, data: { pessoaId: a.id } })
    const lista = (await dele('GET', url)).corpo as { profissionalId: number }[]
    expect(lista.map((x) => x.profissionalId)).toEqual([a.id])
  })

  it('Protético: Recepção e Financeiro mudam o andamento, mas não paciente, laboratório, trabalho, dentes e cor', async () => {
    const dono = await entrarComo('PROFISSIONAL')
    const prof = await dentista()
    const pac = await paciente(dono)
    const outro = await paciente(dono, { nome: 'Ciclano de Teste' })
    const base = {
      pacienteId: pac.id,
      profissionalId: prof.id,
      laboratorio: 'Laboratório Fictício',
      trabalho: 'Coroa',
      dentes: '11',
      cor: 'A2',
    }
    const t = (await dono('POST', '/api/protetico', base)).corpo
    const mudanca = {
      pacienteId: outro.id,
      laboratorio: 'Outro',
      trabalho: 'Ponte',
      dentes: '21',
      cor: 'B1',
    }
    for (const perfil of ['RECEPCAO', 'FINANCEIRO'] as const) {
      const api = await entrarComo(perfil)
      const e = await api('PUT', `/api/protetico/${t.id}`, {
        ...base,
        ...mudanca,
        observacoes: perfil,
      })
      expect(e.status).toBe(200)
      expect(e.corpo).toMatchObject({ ...base, observacoes: perfil })
      expect(
        (await api('PATCH', `/api/protetico/${t.id}/etapa`, { etapa: 'EM_LABORATORIO' })).status,
      ).toBe(200)
    }
    const e = await dono('PUT', `/api/protetico/${t.id}`, { ...base, ...mudanca })
    expect(e.corpo).toMatchObject(mudanca)
  })
})
