// Campos de formulário: dinheiro, máscaras (CPF, e-mail, celular) e lista de sugestões.
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CampoReais } from '../src/componentes/CampoReais'
import { CampoCelular, CampoCpf, CampoEmail } from '../src/componentes/CampoMascara'
import { CampoSugestoes } from '../src/componentes/CampoSugestoes'

const texto = (el: HTMLElement) => (el as HTMLInputElement).value.replace(/\s/g, ' ')

describe('CampoReais (R-055): os dígitos entram pela direita', () => {
  function Reais() {
    const [v, setV] = useState(0)
    return (
      <>
        <CampoReais id="valor" rotulo="Valor" valor={v} aoMudar={setV} />
        <output data-testid="centavos">{v}</output>
      </>
    )
  }
  it('1 → 0,01; 12 → 0,12; 123 → 1,23', async () => {
    const u = userEvent.setup()
    render(<Reais />)
    const campo = screen.getByLabelText('Valor')
    expect(texto(campo)).toBe('R$ 0,00')
    await u.type(campo, '1')
    expect(texto(campo)).toBe('R$ 0,01')
    await u.type(campo, '2')
    expect(texto(campo)).toBe('R$ 0,12')
    await u.type(campo, '3')
    expect(texto(campo)).toBe('R$ 1,23')
    expect(screen.getByTestId('centavos').textContent).toBe('123')
  })
  it('Backspace tira o último dígito', async () => {
    const u = userEvent.setup()
    render(<Reais />)
    const campo = screen.getByLabelText('Valor')
    await u.type(campo, '123{Backspace}')
    expect(texto(campo)).toBe('R$ 0,12')
  })
  it('letras são ignoradas', async () => {
    const u = userEvent.setup()
    render(<Reais />)
    const campo = screen.getByLabelText('Valor')
    await u.type(campo, 'a5b')
    expect(texto(campo)).toBe('R$ 0,05')
  })
  it('mostra o erro e o rótulo pode ficar só para leitor de tela', () => {
    render(
      <CampoReais
        id="x"
        rotulo="Preço"
        valor={0}
        aoMudar={() => {}}
        erro="Valor inválido."
        rotuloOculto
      />,
    )
    expect(screen.getByText('Valor inválido.')).toBeTruthy()
    expect(screen.getByText('Preço').className).toContain('sr-only')
  })
})

describe('CampoCpf', () => {
  it('põe a máscara enquanto digita', async () => {
    const u = userEvent.setup()
    render(<CampoCpf aria-label="CPF" />)
    const campo = screen.getByLabelText('CPF') as HTMLInputElement
    await u.type(campo, '52998224725')
    expect(campo.value).toBe('529.982.247-25')
    expect(campo.getAttribute('aria-invalid')).toBe('false')
    expect(campo.checkValidity()).toBe(true)
  })
  it('CPF completo e inválido: erro na hora e bloqueia o formulário', async () => {
    const u = userEvent.setup()
    render(<CampoCpf aria-label="CPF" />)
    const campo = screen.getByLabelText('CPF') as HTMLInputElement
    await u.type(campo, '52998224724')
    expect(screen.getByText('CPF inválido.')).toBeTruthy()
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(campo.checkValidity()).toBe(false)
  })
  it('CPF pela metade: o erro só aparece ao sair do campo', async () => {
    const u = userEvent.setup()
    render(<CampoCpf aria-label="CPF" />)
    await u.type(screen.getByLabelText('CPF'), '123')
    expect(screen.queryByText('CPF inválido.')).toBeNull()
    await u.tab()
    expect(screen.getByText('CPF inválido.')).toBeTruthy()
  })
  it('vazio é válido (CPF é opcional)', async () => {
    const u = userEvent.setup()
    render(<CampoCpf aria-label="CPF" />)
    await u.click(screen.getByLabelText('CPF'))
    await u.tab()
    expect(screen.queryByText('CPF inválido.')).toBeNull()
  })
  it('valor inicial já vem mascarado', () => {
    render(<CampoCpf aria-label="CPF" defaultValue="52998224725" />)
    expect((screen.getByLabelText('CPF') as HTMLInputElement).value).toBe('529.982.247-25')
  })
  it('erro do servidor aparece mesmo com o CPF certo', () => {
    render(<CampoCpf aria-label="CPF" defaultValue="52998224725" erro="CPF já cadastrado." />)
    expect(screen.getByText('CPF já cadastrado.')).toBeTruthy()
  })
})

describe('CampoEmail', () => {
  it('não aceita espaços', async () => {
    const u = userEvent.setup()
    render(<CampoEmail aria-label="E-mail" />)
    const campo = screen.getByLabelText('E-mail') as HTMLInputElement
    await u.type(campo, 'ana @exemplo.com')
    expect(campo.value).toBe('ana@exemplo.com')
  })
  it('formato errado mostra o erro ao sair', async () => {
    const u = userEvent.setup()
    render(<CampoEmail aria-label="E-mail" />)
    await u.type(screen.getByLabelText('E-mail'), 'ana@exemplo')
    await u.tab()
    expect(screen.getByText('E-mail inválido.')).toBeTruthy()
  })
})

describe('CampoCelular', () => {
  it('começa com +55 e monta (DDD) e o traço', async () => {
    const u = userEvent.setup()
    render(<CampoCelular aria-label="Celular" />)
    const campo = screen.getByLabelText('Celular') as HTMLInputElement
    expect(campo.value).toBe('+55 ')
    await u.type(campo, '11987654321')
    expect(campo.value).toBe('+55 (11) 98765-4321')
  })
  it('só o +55 conta como vazio (não dá erro)', async () => {
    const u = userEvent.setup()
    render(<CampoCelular aria-label="Celular" />)
    await u.click(screen.getByLabelText('Celular'))
    await u.tab()
    expect(screen.queryByText('Celular inválido.')).toBeNull()
  })
  it('número curto dá erro ao sair', async () => {
    const u = userEvent.setup()
    render(<CampoCelular aria-label="Celular" />)
    await u.type(screen.getByLabelText('Celular'), '1198')
    await u.tab()
    expect(screen.getByText('Celular inválido.')).toBeTruthy()
  })
})

describe('CampoSugestoes', () => {
  function Campo(props: { sugestoes: string[]; inicial?: string }) {
    const [v, setV] = useState(props.inicial ?? '')
    return (
      <>
        <CampoSugestoes aria-label="Dente" value={v} onChange={setV} sugestoes={props.sugestoes} />
        <output data-testid="valor">{v}</output>
      </>
    )
  }
  const opcoes = () => screen.queryAllByRole('option').map((o) => o.textContent)
  const valor = () => screen.getByTestId('valor').textContent

  it('mostra primeiro as que começam com o digitado', async () => {
    const u = userEvent.setup()
    render(<Campo sugestoes={['14', '24', '41', '48']} />)
    await u.type(screen.getByRole('combobox', { name: 'Dente' }), '4')
    expect(opcoes()).toEqual(['41', '48', '14', '24'])
  })
  it('setas e Enter escolhem', async () => {
    const u = userEvent.setup()
    render(<Campo sugestoes={['14', '24', '41', '48']} />)
    const campo = screen.getByRole('combobox')
    await u.type(campo, '4')
    await u.keyboard('{ArrowDown}{Enter}')
    expect(valor()).toBe('48')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
  it('seta para cima a partir da primeira vai para a última', async () => {
    const u = userEvent.setup()
    render(<Campo sugestoes={['11', '12', '13']} />)
    await u.type(screen.getByRole('combobox'), '1')
    await u.keyboard('{ArrowUp}{Enter}')
    expect(valor()).toBe('13')
  })
  it('clique numa opção escolhe', async () => {
    const u = userEvent.setup()
    render(<Campo sugestoes={['Limpeza', 'Clareamento']} />)
    await u.click(screen.getByRole('combobox'))
    await u.click(screen.getByRole('option', { name: 'Clareamento' }))
    expect(valor()).toBe('Clareamento')
  })
  it('Esc fecha só a lista', async () => {
    const u = userEvent.setup()
    render(<Campo sugestoes={['Limpeza']} />)
    await u.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeTruthy()
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false')
  })
  it('busca sem acento e sem maiúscula', async () => {
    const u = userEvent.setup()
    render(<Campo sugestoes={['Avaliação', 'Extração']} />)
    await u.type(screen.getByRole('combobox'), 'AVALIACAO')
    expect(opcoes()).toEqual(['Avaliação'])
  })
  it('texto livre fica como digitado, sem lista', async () => {
    const u = userEvent.setup()
    render(<Campo sugestoes={['Limpeza']} />)
    await u.type(screen.getByRole('combobox'), 'Procedimento novo')
    expect(valor()).toBe('Procedimento novo')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
  it('já escrito igual à única sugestão: não abre a lista', async () => {
    const u = userEvent.setup()
    render(<Campo sugestoes={['Limpeza']} inicial="Limpeza" />)
    await u.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
