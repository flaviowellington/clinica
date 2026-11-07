// Conversor do arquivo HAR (gravado no DevTools do sistema antigo) em linhas de importação.
// Dados fictícios: o formato das respostas é o do test.har gravado com o paciente de teste.
import { describe, expect, it } from 'vitest'
import { linhasDoHar } from '../../shared/importacaoHar'

const resposta = (url: string, corpo: unknown) => ({
  request: { url: `https://api.exemplo.test${url}` },
  response: { content: { mimeType: 'application/json', text: JSON.stringify(corpo) } },
})

const PACIENTE = {
  id: 111,
  Name: 'Paciente Fictício',
  NickName: 'Fic',
  BirthDate: '1990-04-15T03:00:00.000Z',
  OtherDocumentId: '52998224725',
  DocumentId: '1234567',
  Sex: 'F',
  MobilePhone: '+5511999990000',
  Landline: '1133334444',
  Email: 'ficticio@example.com',
  HowDidMeet: 'Instagram',
}

const har = {
  log: {
    entries: [
      resposta('/solution/api/patient/get?id=111', PACIENTE),
      resposta('/gc-api/person/search?name=Paciente', {
        list: [
          {
            ...PACIENTE,
            Address: 'Rua Fictícia',
            AddressNumber: '10',
            City: 'Natal',
            Profession: 'Professora',
            motherName: 'Mãe Fictícia',
            insurancePlanName: 'Plano X',
          },
        ],
      }),
      resposta('/solution/api/dentist/list_all', [
        { id: 7, Name: 'Dra. Fictícia', Active: 'X', MobilePhone: '(11) 98888-7777' },
        { id: 8, Name: 'Dr. Antigo', Active: '', Deleted: 'X', Email: 'antigo@example.com' },
      ]),
      resposta('/api/dentist/list_active', {
        list: [
          {
            id: 7,
            Name: 'Dra. Fictícia',
            Active: 'X',
            Email: 'dra@example.com',
            CRO: 'RN-1234',
            Color: '#a0b1c2',
            Specialties: [{ id: 1, Description: 'Ortodontia' }],
          },
        ],
      }),
      resposta('/api/treatment/get_odontogram_procedures?patient_id=111&deleted=X', [
        {
          id: 1,
          Patient_PersonId: 111,
          Tooth: '16',
          Surface: 'MO',
          ProcedureDescription: 'Restauração',
          DentistName: 'Dra. Fictícia',
          Executed: 'X',
          ExecutedDate: '2025-03-10T15:00:00.000Z',
          CreateDate: '2025-03-01T15:00:00.000Z',
          Notes: 'Resina A2',
          PatientNotes: 'Evitar mastigar 2h',
        },
        {
          id: 2,
          Patient_PersonId: 111,
          Tooth: '24',
          ProcedureDescription: 'Canal',
          Dentist_PersonId: 7,
          Existing: 'X',
          CreateDate: '2025-03-02T15:00:00.000Z',
          Deleted: 'X',
          DeletedDate: '2025-03-05T15:00:00.000Z',
        },
        { id: 3, Patient_PersonId: 111, Tooth: '28', Missing: 'X', CreateDate: '2025-03-02' },
      ]),
      // A mesma lista chega de novo (outra tela): não pode duplicar.
      resposta('/api/treatment/get_odontogram_procedures?patient_id=111&isOdontogram=X', [
        {
          id: 1,
          Patient_PersonId: 111,
          Tooth: '16',
          ProcedureDescription: 'Restauração',
          DentistName: 'Dra. Fictícia',
          Executed: 'X',
          ExecutedDate: '2025-03-10T15:00:00.000Z',
        },
      ]),
      resposta('/api/appointment_ret/patient_list?patientId=111&Status=1', {
        list: [
          {
            id: 9,
            AtomicDate: 20251130,
            Notes: 'Revisão',
            Patient_PersonId: 111,
            Dentist_PersonId: 7,
          },
        ],
      }),
      { request: { url: 'https://api.exemplo.test/img/logo.png' }, response: { content: {} } },
    ],
  },
}

describe('importação pelo arquivo HAR', () => {
  const r = linhasDoHar(har)

  it('paciente: campos do cadastro, e o que não tem campo próprio vai para observações', () => {
    expect(r.pacientes).toEqual([
      expect.objectContaining({
        nome: 'Paciente Fictício',
        apelido: 'Fic',
        nascimento: '1990-04-15',
        cpf: '52998224725',
        rg: '1234567',
        sexo: 'Feminino',
        celular: '+55 (11) 99999-0000',
        telefone: '1133334444',
        email: 'ficticio@example.com',
        comoConheceu: 'Instagram',
        nomeMae: 'Mãe Fictícia',
      }),
    ])
    const obs = r.pacientes[0].observacoes as string
    expect(obs).toContain('Endereço: Rua Fictícia, 10')
    expect(obs).toContain('Cidade: Natal')
    expect(obs).toContain('Profissão: Professora')
    expect(obs).toContain('Convênio: Plano X')
  })

  it('procedimentos: situação, exclusão e dentista; sem duplicar e sem as marcas de dente', () => {
    expect(r.procedimentos).toEqual([
      expect.objectContaining({
        paciente: 'Paciente Fictício',
        pacienteCpf: '52998224725',
        profissional: 'Dra. Fictícia',
        procedimento: 'Restauração',
        data: '2025-03-10',
        dente: '16',
        faces: 'MO',
        situacao: 'EXECUTADO',
        observacao: 'Resina A2',
        observacaoPaciente: 'Evitar mastigar 2h',
        excluidoEm: null,
      }),
      expect.objectContaining({
        procedimento: 'Canal',
        profissional: 'Dra. Fictícia',
        data: '2025-03-02',
        situacao: 'EXISTENTE',
        excluidoEm: '2025-03-05',
      }),
    ])
  })

  it('alerta de retorno: data, motivo e dentista', () => {
    expect(r.retornos).toEqual([
      {
        paciente: 'Paciente Fictício',
        pacienteCpf: '52998224725',
        profissional: 'Dra. Fictícia',
        data: '2025-11-30',
        motivo: 'Revisão',
      },
    ])
  })

  it('arquivo que não é HAR devolve listas vazias', () => {
    expect(linhasDoHar({})).toEqual({
      profissionais: [],
      pacientes: [],
      procedimentos: [],
      retornos: [],
    })
  })

  it('profissionais: juntam as duas listas; o excluído entra inativo', () => {
    expect(r.profissionais).toEqual([
      {
        nome: 'Dra. Fictícia',
        cro: 'RN-1234',
        especialidade: 'Ortodontia',
        email: 'dra@example.com',
        celular: '+55 (11) 98888-7777',
        corAgenda: '#a0b1c2',
        ativo: 'SIM',
      },
      {
        nome: 'Dr. Antigo',
        cro: null,
        especialidade: null,
        email: 'antigo@example.com',
        celular: null,
        corAgenda: null,
        ativo: 'NAO',
      },
    ])
  })
})
