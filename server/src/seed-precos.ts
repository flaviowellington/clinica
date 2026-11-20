// Tabela de preços 2026 da clínica (criança e adulto). Atualiza pelo nome; nenhum outro dado.
// Rodar de novo só reescreve os preços: orçamentos antigos guardam o valor da época.
import { db } from './db'
import { normalizar } from '../../shared/regras'
import { ProcedimentoTabelaDto } from '../../shared/dtos'

// [nome, criança (R$), adulto (R$), por dente?, retornos, alerta, benefícios].
// null = não se faz nessa faixa. Por dente = valor × dentes; senão cobra uma vez por procedimento.
type Alerta = [number, 'DIAS' | 'MESES']
type Linha = [string, number | null, number | null, boolean, number?, Alerta?, string?]
const DENTE = true
const PROC = false
const TABELA: Linha[] = [
  // 1. Procedimentos clínicos e restauradores
  ['Acesso + curativo', 350, 350, DENTE],
  ['Aumento de coroa clínica', 500, 500, DENTE],
  [
    'Banda alça – mantenedor de espaço (com escaneamento)',
    800,
    null,
    PROC,
    undefined,
    undefined,
    'Escaneamento',
  ],
  ['Cariostático', 280, null, DENTE],
  ['Coroa de acetato e coroa de aço', 440, null, DENTE],
  ['Dente provisório', 280, null, DENTE],
  ['Pulpotomia', 390, null, DENTE],
  ['Restauração ionômero anterior e posterior', 300, 300, DENTE],
  ['Restauração resina anterior e posterior', 300, 300, DENTE],
  ['Selante', 290, 250, DENTE],
  ['Tratamento CTZ', 800, null, DENTE],

  // 2. Tratamentos de canal e extrações
  ['Canal decíduo anterior', 1000, null, DENTE],
  ['Canal decíduo posterior já restaurado', 1000, null, DENTE],
  ['Canal dente permanente anterior e posterior', 1350, 1350, DENTE],
  ['Exodontia 3º molar superior e inferior', null, 450, DENTE],
  ['Exodontia decíduo anterior e posterior', 330, null, DENTE],
  ['Exodontia permanente anterior e posterior', 330, 330, DENTE],
  ['Supra numerário erupcionado – exodontia', 450, 450, DENTE],

  // 3. Clareamento e estética
  [
    'Clareamento associado',
    null,
    2000,
    PROC,
    2,
    undefined,
    '4 bisnagas + 2 sessões de consultório',
  ],
  [
    'Clareamento associado concluindo orto',
    null,
    1800,
    PROC,
    2,
    undefined,
    '4 bisnagas + 2 sessões de consultório',
  ],
  [
    'Clareamento caseiro + acompanhamento após 30 dias',
    null,
    800,
    PROC,
    1,
    [30, 'DIAS'],
    '4 bisnagas',
  ],
  ['Clareamento de consultório', null, 1200, PROC, 3, undefined, '3 sessões'],
  ['Faceta em resina', null, 400, DENTE],

  // 4. Ortodontia e aparelhos
  ['Instalação aparelho autoligado estético', 3600, 3600, PROC],
  ['Instalação aparelho autoligado metálico', 2990, 2990, PROC],
  ['Instalação aparelho estético convencional', 3500, 3500, PROC],
  ['Instalação aparelho metálico convencional', 2200, 2200, PROC],
  ['Instalação aparelho ortopédico', 2990, null, PROC],
  [
    'Instalação Invisalign adulto (com planejamento)',
    null,
    8100,
    PROC,
    undefined,
    undefined,
    'Planejamento',
  ],
  [
    'Instalação Invisalign infantil (com planejamento)',
    5460,
    null,
    PROC,
    undefined,
    undefined,
    'Planejamento',
  ],
  ['Instalação MARPE', 2900, 2900, PROC],
  ['Instalação de mini-implante', 450, 450, PROC],
  [
    'Instalação disjuntor Garib + planejamento',
    3200,
    3200,
    PROC,
    undefined,
    undefined,
    'Planejamento',
  ],
  ['Instalação nivelamento 4x2 estético 2 arcadas (segunda fase)', 2100, 2100, PROC],
  ['Instalação nivelamento 4x2 metálico 2 arcadas (segunda fase)', 1900, 1900, PROC],
  ['Manutenção aparelho autoligado estético', 320, 320, PROC],
  ['Manutenção aparelho autoligado metálico', 300, 300, PROC],
  ['Manutenção aparelho convencional estético', 320, 320, PROC],
  ['Manutenção aparelho convencional metálico', 270, 270, PROC],
  ['Manutenção aparelho ortopédico', 280, null, PROC],
  ['Manutenção Invisalign adulto', null, 480, PROC],
  ['Manutenção Invisalign infantil', 350, null, PROC],

  // 5. Contenções e mantenedores de espaço
  [
    'Contenções (2) + escaneamento + remoção de aparelho',
    1450,
    1450,
    PROC,
    undefined,
    undefined,
    '2 contenções + escaneamento + remoção de aparelho',
  ],
  ['Contenção de acetato', 650, null, PROC],
  ['Contenção placa de Hawley', 450, null, PROC],
  ['Contenção fixa 1x1, 2x2 ou 3x3', 650, null, PROC],
  ['Controle anual de contenções + profilaxia', 350, null, PROC, 1, [12, 'MESES'], '1 profilaxia'],
  ['Mantenedor de espaço arco lingual, estético e funcional', 950, null, PROC],
  ['Recolocação de mantenedor de espaço/aparelho', 200, null, PROC],
  ['Reposição de novo aparelho infantil por perda (ou início da fase 2)', 1300, 1300, PROC],
  ['Manutenção de contenção (a cada 3 meses)', 250, 250, PROC, undefined, [3, 'MESES']],
  ['Prótese provisória para orto', 900, 900, PROC],

  // 6. Consultas, avaliações e prevenção
  ['Consulta adulto', null, 350, PROC],
  ['Consulta Dra. Gabriela', 400, 400, PROC],
  ['Consulta infantil', 350, null, PROC],
  ['Consulta urgência', 500, 500, PROC],
  ['Consulta de acompanhamento ou raio X', 200, 200, PROC],
  ['Escaneamento', 110, 110, PROC],
  ['Profilaxia (prazo 15 dias) + raspagem', 280, 200, PROC, undefined, [15, 'DIAS']],
  ['Fluorterapia (4 sessões)', 500, 500, PROC, 4, undefined, '4 sessões'],

  // 7. Cirurgias e procedimentos especializados
  ['Contenção de trauma semirrígido', 330, null, DENTE],
  ['Frenectomia labial', 1500, 1500, PROC, 2, undefined, '2 sessões de acompanhamento'],
  ['Frenectomia lingual', 2150, 2150, PROC, 3, undefined, '3 sessões de acompanhamento'],
  ['Laser terapêutico – 1 sessão', 330, 330, PROC, 1, undefined, '1 sessão'],
  ['Laser terapêutico – 2 sessões', 500, 500, PROC, 2, undefined, '2 sessões'],
  ['Mucocele', 500, 500, PROC],
  ['Ulectomia', 500, null, DENTE],

  // 8. Placas, relaxamento e sedação
  ['Placa de miorrelaxante', 1800, 1800, PROC, 3, undefined, '3 retornos'],
  ['Placa palatina de memória', 2900, null, PROC],
  ['Retorno placa de miorrelaxante com seis meses', null, 350, PROC, 1, [6, 'MESES']],
  ['Remoção de cola (aparelho)', 200, 200, PROC],
  ['Sedação com óxido nitroso', 830, 830, PROC],
  ['Sedação medicamentosa (com Keila)', 2000, 2000, PROC],
  ['Sedação para outro profissional', 1000, 1000, PROC],
]

// Nomes da versão anterior desta tabela: renomeia em vez de criar um segundo procedimento.
const NOME_ANTIGO: Record<string, string> = {
  'Supra numerário erupcionado – exodontia': 'Supranumerário erupcionado exodontia',
  'Placa de miorrelaxante': 'Placa miorrelaxante',
  'Retorno placa de miorrelaxante com seis meses': 'Retorno placa miorrelaxante com seis meses',
  'Laser terapêutico – 1 sessão': 'Laser terapêutico - 1 sessão',
  'Laser terapêutico – 2 sessões': 'Laser terapêutico - 2 sessões',
}

const centavos = (r: number | null) => (r === null ? null : r * 100)
let criados = 0
for (const [nome, crianca, adulto, porDente, retornos, alerta, beneficios] of TABELA) {
  // Mesma validação do cadastro: o valor único do orçamento sai do DTO.
  const dados = {
    ...ProcedimentoTabelaDto.parse({
      nome,
      valorCriancaCentavos: centavos(crianca),
      valorAdultoCentavos: centavos(adulto),
      porDente,
      retornos: retornos ?? null,
      alertaRetorno: alerta?.[0] ?? null,
      alertaRetornoUnidade: alerta?.[1] ?? null,
      beneficios: beneficios ?? null,
    }),
    nomeBusca: normalizar(nome),
    // A tabela não traz especialidade: mantém a que já estiver cadastrada.
    especialidade: undefined,
  }
  const busca = [dados.nomeBusca, ...(NOME_ANTIGO[nome] ? [normalizar(NOME_ANTIGO[nome])] : [])]
  const existente = await db.procedimento.findFirst({
    where: { nomeBusca: { in: busca } },
    orderBy: { id: 'asc' },
  })
  if (existente) await db.procedimento.update({ where: { id: existente.id }, data: dados })
  else {
    await db.procedimento.create({ data: dados })
    criados++
  }
}
console.log(`Tabela de preços 2026: ${criados} criados, ${TABELA.length - criados} atualizados.`)
await db.$disconnect()
