// Peças da interface: abas, lista aos poucos, janela modal, confirmações e teclado nas listas.
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Abas } from '../src/componentes/Abas'
import { useAosPoucos } from '../src/componentes/CarregarMais'
import { Dialogo } from '../src/componentes/Dialogo'
import { Confirmacao, confirmar, confirmarDigitando, perguntar } from '../src/componentes/Confirmar'
import { navegarLista } from '../src/componentes/navegarLista'

describe('Abas', () => {
  const abas = [
    { id: 'a', rotulo: 'Primeira' },
    { id: 'b', rotulo: 'Segunda' },
  ]
  it('marca a atual e avisa a troca', async () => {
    const aoTrocar = vi.fn()
    render(<Abas abas={abas} atual="a" aoTrocar={aoTrocar} />)
    expect(screen.getByRole('tab', { name: 'Primeira' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Segunda' }).getAttribute('aria-selected')).toBe('false')
    await userEvent.click(screen.getByRole('tab', { name: 'Segunda' }))
    expect(aoTrocar).toHaveBeenCalledWith('b')
  })
})

describe('useAosPoucos (lista longa)', () => {
  function Lista(props: { n: number; chave: string }) {
    const lista = Array.from({ length: props.n }, (_, i) => i + 1)
    const { itens, mais } = useAosPoucos(lista, props.chave, 10)
    return (
      <>
        <ul>
          {itens.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        {mais}
      </>
    )
  }
  it('mostra de 10 em 10 com o que falta no botão', async () => {
    const u = userEvent.setup()
    render(<Lista n={25} chave="x" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    await u.click(screen.getByRole('button', { name: 'Carregar mais (15)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    await u.click(screen.getByRole('button', { name: 'Carregar mais (5)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('lista curta: sem botão', () => {
    render(<Lista n={10} chave="x" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('outro filtro (chave) volta ao começo', async () => {
    const u = userEvent.setup()
    const { rerender } = render(<Lista n={30} chave="x" />)
    await u.click(screen.getByRole('button', { name: /Carregar mais/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    rerender(<Lista n={30} chave="y" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })
})

describe('Dialogo', () => {
  it('aberto mostra o título e o conteúdo; fechado não monta o conteúdo', () => {
    const { rerender } = render(
      <Dialogo aberto titulo="Janela" aoFechar={() => {}}>
        <p>Conteúdo</p>
      </Dialogo>,
    )
    expect(screen.getByRole('heading', { name: 'Janela' })).toBeTruthy()
    expect(screen.getByText('Conteúdo')).toBeTruthy()
    rerender(
      <Dialogo aberto={false} titulo="Janela" aoFechar={() => {}}>
        <p>Conteúdo</p>
      </Dialogo>,
    )
    expect(screen.queryByText('Conteúdo')).toBeNull()
  })
  it('× e Esc fecham', async () => {
    const aoFechar = vi.fn()
    render(
      <Dialogo aberto titulo="Janela" aoFechar={aoFechar}>
        <input aria-label="Campo" />
      </Dialogo>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByLabelText('Campo'), { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalledTimes(2)
  })
  it('outras teclas não fecham', () => {
    const aoFechar = vi.fn()
    render(
      <Dialogo aberto titulo="Janela" aoFechar={aoFechar}>
        <input aria-label="Campo" />
      </Dialogo>,
    )
    fireEvent.keyDown(screen.getByLabelText('Campo'), { key: 'Enter' })
    expect(aoFechar).not.toHaveBeenCalled()
  })
})

describe('confirmar / perguntar / confirmarDigitando', () => {
  // Devolve a promessa dentro de uma lista: "await" direto nela esperaria a resposta da janela.
  function abrir<T>(f: () => Promise<T>) {
    let p!: Promise<T>
    act(() => {
      p = f()
    })
    return [p] as const
  }
  it('confirmar: o botão resolve true', async () => {
    render(<Confirmacao />)
    const [p] = abrir(() => confirmar('Apagar o paciente?'))
    expect(screen.getByRole('heading', { name: 'Tem certeza?' })).toBeTruthy()
    expect(screen.getByText('Apagar o paciente?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    await expect(p).resolves.toBe(true)
    expect(screen.queryByText('Apagar o paciente?')).toBeNull()
  })
  it('confirmar: Voltar resolve false', async () => {
    render(<Confirmacao />)
    const [p] = abrir(() => confirmar('Apagar?', { botao: 'Apagar', titulo: 'Cuidado' }))
    expect(screen.getByRole('heading', { name: 'Cuidado' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await expect(p).resolves.toBe(false)
  })
  it('perguntar: devolve o texto digitado', async () => {
    const u = userEvent.setup()
    render(<Confirmacao />)
    const [p] = abrir(() => perguntar('Motivo'))
    await u.type(screen.getByLabelText('Motivo'), 'Paciente pediu')
    await u.click(screen.getByRole('button', { name: 'Confirmar' }))
    await expect(p).resolves.toBe('Paciente pediu')
  })
  it('perguntar: cancelar devolve null', async () => {
    render(<Confirmacao />)
    const [p] = abrir(() => perguntar('Motivo'))
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await expect(p).resolves.toBeNull()
  })
  it('confirmarDigitando: botão só libera com a palavra (sem diferenciar maiúscula)', async () => {
    const u = userEvent.setup()
    render(<Confirmacao />)
    const [p] = abrir(() => confirmarDigitando('apagar', 'Some para sempre.'))
    const botao = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    await u.type(screen.getByLabelText(/Digite/), 'apaga')
    expect(botao.disabled).toBe(true)
    await u.type(screen.getByLabelText(/Digite/), 'R ')
    expect(botao.disabled).toBe(false)
    await u.click(botao)
    await expect(p).resolves.toBe(true)
  })
})

describe('navegarLista (teclado nas listas de busca)', () => {
  function Lista() {
    return (
      <div onKeyDown={navegarLista}>
        <input aria-label="Busca" />
        <button>A</button>
        <button disabled>X</button>
        <button>B</button>
      </div>
    )
  }
  const focado = () =>
    (document.activeElement as HTMLElement).textContent ||
    document.activeElement?.getAttribute('aria-label')

  it('↓ anda pelas opções (pula as desabilitadas) e volta ao campo', async () => {
    const u = userEvent.setup()
    render(<Lista />)
    await u.click(screen.getByLabelText('Busca'))
    await u.keyboard('{ArrowDown}')
    expect(focado()).toBe('A')
    await u.keyboard('{ArrowDown}')
    expect(focado()).toBe('B')
    await u.keyboard('{ArrowDown}')
    expect(focado()).toBe('Busca')
  })
  it('↑ no campo vai para a última', async () => {
    const u = userEvent.setup()
    render(<Lista />)
    await u.click(screen.getByLabelText('Busca'))
    await u.keyboard('{ArrowUp}')
    expect(focado()).toBe('B')
  })
  it('Esc numa opção volta ao campo', async () => {
    const u = userEvent.setup()
    render(<Lista />)
    await u.click(screen.getByLabelText('Busca'))
    await u.keyboard('{ArrowDown}{Escape}')
    expect(focado()).toBe('Busca')
  })
  it('digitar numa opção volta ao campo', async () => {
    const u = userEvent.setup()
    render(<Lista />)
    await u.click(screen.getByLabelText('Busca'))
    await u.keyboard('{ArrowDown}')
    await u.keyboard('x')
    expect(focado()).toBe('Busca')
  })
})
