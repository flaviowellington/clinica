// Controle Protético (R-082): as cinco colunas do quadro, na ordem.
export const ETAPAS = {
  PRE_ENVIO: 'Pré-envio',
  EM_LABORATORIO: 'Em laboratório',
  RETORNO: 'Retorno à clínica',
  AGENDAMENTO: 'Agendar instalação',
  INSTALADO: 'Instalado',
} as const
export type Etapa = keyof typeof ETAPAS
export const ORDEM_ETAPAS = Object.keys(ETAPAS) as Etapa[]
