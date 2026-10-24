// Ícones próprios, em traço simples (nada copiado de terceiros).
const CAMINHOS = {
  agenda:
    'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 13h2M14 13h2M8 17h2',
  pacientes: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  financeiro:
    'M12 3v18M16.5 7.5C16 6 14.3 5 12 5c-2.8 0-4.5 1.3-4.5 3.2 0 4.3 9 2.3 9 6.6 0 2-1.8 3.2-4.5 3.2-2.4 0-4.2-1-4.8-2.6',
  profissionais:
    'M9 4h6M12 4v3M7 7h10a1 1 0 0 1 1 1v12H6V8a1 1 0 0 1 1-1zM12 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9 20c0-2 1.3-3 3-3s3 1 3 3',
  relatorios: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  conta: 'M3 7h18v12H3zM3 11h18M7 15h4M16 4l-9 3',
  inicio: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  lixeira: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  escuro: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  claro:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  sair: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10',
} as const

export type NomeIcone = keyof typeof CAMINHOS

export function Icone({ nome, className = 'h-5 w-5' }: { nome: NomeIcone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  )
}
