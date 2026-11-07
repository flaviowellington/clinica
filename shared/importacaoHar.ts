// Importação pelo arquivo HAR: no sistema antigo, o DevTools grava as respostas da API enquanto
// se abre a ficha de cada paciente ("Exportar HAR"). Aqui elas viram as mesmas linhas da
// importação de planilha, que o servidor valida e grava (server/src/importacao.ts).
import { mascaraCelular } from './mascaras'

type Linha = Record<string, string | null>
type Obj = Record<string, unknown>

const txt = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).trim() || null : null
const dia = (v: unknown) => txt(v)?.slice(0, 10) ?? null
const marcado = (v: unknown) => v === 'X' || v === true
const SEXO: Record<string, string> = { M: 'Masculino', F: 'Feminino' }

/** Respostas JSON do HAR, com o caminho da URL. Entradas sem JSON são ignoradas. */
function respostas(har: unknown) {
  const entradas = (har as { log?: { entries?: unknown[] } })?.log?.entries
  if (!Array.isArray(entradas)) return []
  return entradas.flatMap((e) => {
    const { request, response } = e as { request?: { url?: string }; response?: { content?: Obj } }
    const c = response?.content
    if (!request?.url || typeof c?.text !== 'string') return []
    try {
      const texto = c.encoding === 'base64' ? atob(c.text) : c.text
      return [
        { caminho: new URL(request.url).pathname.replace(/\/$/, ''), corpo: JSON.parse(texto) },
      ]
    } catch {
      return []
    }
  })
}

const lista = (corpo: unknown): Obj[] => {
  const l = Array.isArray(corpo) ? corpo : (corpo as Obj)?.list
  return Array.isArray(l) ? l.filter((x) => x && typeof x === 'object') : []
}

/** Campos do sistema antigo sem lugar no cadastro: vão para as observações, para não se perder. */
function observacoes(p: Obj) {
  const endereco = [txt(p.Address), txt(p.AddressNumber), txt(p.AddressComplement)].filter(Boolean)
  const extras: [string, unknown][] = [
    ['Endereço', endereco.join(', ')],
    ['Bairro', p.Neighborhood],
    ['Cidade', p.City],
    ['Estado', p.state],
    ['CEP', p.CEP],
    ['Profissão', p.Profession],
    ['Local de trabalho', p.Workplace],
    ['Tempo de trabalho', p.WorkingTime],
    ['Convênio', p.insurancePlanName],
    ['Nº do convênio', p.insurancePlanNumber ?? p.numero_carteirinha],
    ['Profissão do pai', p.FatherProfession],
    ['Profissão da mãe', p.MotherProfession],
  ]
  return (
    [txt(p.Notes), ...extras.filter(([, v]) => txt(v)).map(([rotulo, v]) => `${rotulo}: ${txt(v)}`)]
      .filter(Boolean)
      .join('\n') || null
  )
}

export function linhasDoHar(har: unknown) {
  const pacientes = new Map<string, Obj>()
  const dentistas = new Map<string, Obj>()
  const procedimentos = new Map<string, Obj>()
  const retornos = new Map<string, Obj>()
  const juntar = (mapa: Map<string, Obj>, o: Obj) => {
    const id = txt(o.id)
    if (id) mapa.set(id, { ...mapa.get(id), ...o })
  }

  for (const { caminho, corpo } of respostas(har)) {
    if (caminho.endsWith('/patient/get')) juntar(pacientes, corpo)
    else if (caminho.endsWith('/person/search'))
      lista(corpo)
        .filter((p) => !p.Type || p.Type === 'PATIENT')
        .forEach((p) => juntar(pacientes, p))
    else if (/\/dentist\/list_(all|active)$/.test(caminho))
      lista(corpo).forEach((d) => juntar(dentistas, d))
    else if (caminho.endsWith('/get_odontogram_procedures'))
      lista(corpo).forEach((p) => juntar(procedimentos, p))
    else if (caminho.endsWith('/appointment_ret/patient_list'))
      lista(corpo).forEach((r) => juntar(retornos, r))
  }

  const pacienteDe = (id: unknown) => {
    const p = pacientes.get(txt(id) ?? '')
    return { paciente: txt(p?.Name), pacienteCpf: txt(p?.OtherDocumentId) }
  }
  const dentista = (o: Obj) =>
    txt(o.DentistName) ?? txt(dentistas.get(txt(o.Dentist_PersonId) ?? '')?.Name)
  /** "+5511999990000" → "+55 (11) 99999-0000". Outro DDI fica como veio. */
  const celular = (v: unknown) => {
    const t = txt(v)
    const n = t?.replace(/\D/g, '') ?? ''
    if (!t || (t.startsWith('+') && !n.startsWith('55'))) return t
    return mascaraCelular(`+55 ${t.startsWith('+') ? n.slice(2) : n}`)
  }

  return {
    profissionais: [...dentistas.values()]
      .filter((d) => txt(d.Name))
      .map((d): Linha => {
        const esp = Array.isArray(d.Specialties) ? (d.Specialties as Obj[]) : []
        return {
          nome: txt(d.Name),
          cro: txt(d.CRO),
          especialidade:
            esp
              .map((e) => txt(e.Description))
              .filter(Boolean)
              .join(', ') || null,
          email: txt(d.Email),
          celular: celular(d.MobilePhone),
          corAgenda: txt(d.Color),
          // Excluído lá entra inativo: os procedimentos antigos ainda acham o dentista.
          ativo: marcado(d.Active) && !marcado(d.Deleted) ? 'SIM' : 'NAO',
        }
      }),
    pacientes: [...pacientes.values()].map((p): Linha => ({
      nome: txt(p.Name),
      apelido: txt(p.NickName),
      nascimento: dia(p.BirthDate),
      cpf: txt(p.OtherDocumentId),
      rg: txt(p.DocumentId),
      sexo: SEXO[txt(p.Sex) ?? ''] ?? txt(p.Sex),
      estadoCivil: txt(p.CivilStatus),
      celular: celular(p.MobilePhone),
      telefone: txt(p.Landline),
      email: txt(p.Email),
      comoConheceu: txt(p.HowDidMeet),
      indicadoPor: txt(p.IndicationSource),
      nomeMae: txt(p.motherName),
      nomePai: txt(p.fatherName),
      responsavelNome: txt(p.PersonInCharge) ?? txt(p.ResponsiblePersonName),
      responsavelCpf: txt(p.PersonInChargeDocument),
      observacoes: observacoes(p),
    })),
    // Registros sem procedimento são marcas do desenho (dente ausente etc.): ficam de fora.
    procedimentos: [...procedimentos.values()]
      .filter((p) => txt(p.ProcedureDescription))
      .map((p): Linha => ({
        ...pacienteDe(p.Patient_PersonId),
        profissional: dentista(p),
        procedimento: txt(p.ProcedureDescription),
        data: dia(p.ExecutedDate) ?? dia(p.CreateDate),
        dente: txt(p.Tooth),
        faces: txt(p.Surface),
        situacao: marcado(p.Executed)
          ? 'EXECUTADO'
          : marcado(p.Existing)
            ? 'EXISTENTE'
            : 'A_REALIZAR',
        observacao: txt(p.Notes),
        observacaoPaciente: txt(p.PatientNotes),
        excluidoEm: marcado(p.Deleted) ? (dia(p.DeletedDate) ?? dia(p.CreateDate)) : null,
      })),
    retornos: [...retornos.values()].map((r): Linha => {
      const d = txt(r.AtomicDate) ?? ''
      return {
        ...pacienteDe(r.Patient_PersonId),
        profissional: dentista(r),
        data: /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : null,
        motivo: txt(r.Notes),
      }
    }),
  }
}
