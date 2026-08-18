import { describe, expect, it } from 'vitest'
import {
  adicionarUsuario,
  alterarMinhaSenha,
  atualizarUsuario,
  cpfJaCadastrado,
  definirCredenciais,
  emailJaCadastrado,
  loginJaCadastrado,
  entrarComo,
  obterPdrsCatalogo,
  obterUsuarioLogado,
  obterUsuarios,
  removerUsuario,
} from './store'
import { USUARIOS_INICIAIS } from './data/mock'
import { PERFIS, podeEditarVisita, type Perfil, type Usuario } from './types'
import {
  coordenadaValida,
  cpfValido,
  emailValido,
  mascaraCoordenada,
  mascaraCpf,
  mascaraTelefone,
} from './format'

const sufixo = () => Math.random().toString(36).slice(2, 8)

/** usuário de teste com login e e-mail únicos, para os casos não colidirem entre si */
const novo = (patch: Partial<Omit<Usuario, 'id'>> = {}): Omit<Usuario, 'id'> => ({
  nome: 'Teste Silva',
  login: `teste.${sufixo()}`,
  email: `teste${sufixo()}@qima.com`,
  perfil: 'Coordinator',
  situacao: 'Ativo',
  ...patch,
})

describe('perfis de acesso', () => {
  it('só os quatro perfis combinados editam a visita', () => {
    const editam = PERFIS.filter(podeEditarVisita)
    expect([...editam].sort()).toEqual(
      ['Admin', 'Information Analyst', 'Operational Leader', 'Strategic Leader'].sort(),
    )
  })

  it('os demais perfis abrem a visita em leitura', () => {
    const leitura: Perfil[] = [
      'Support',
      'Coordinator',
      'Supervisor',
      'Auditor',
      'Regional GR (Client)',
      'RTV (Client)',
      'Bayer SP (Client)',
      'Operational Monitor',
    ]
    for (const p of leitura) expect(podeEditarVisita(p), p).toBe(false)
  })

  it('a base traz pelo menos um usuário de cada perfil combinado', () => {
    for (const perfil of ['Admin', 'Strategic Leader', 'Operational Leader', 'Information Analyst']) {
      expect(USUARIOS_INICIAIS.some((u) => u.perfil === perfil), perfil).toBe(true)
    }
  })
})

describe('sessão', () => {
  it('começa logado no primeiro usuário da base', () => {
    expect(obterUsuarioLogado().id).toBe(USUARIOS_INICIAIS[0].id)
  })

  it('entrar como outro usuário troca o perfil corrente', () => {
    const admin = USUARIOS_INICIAIS.find((u) => u.perfil === 'Admin')!
    entrarComo(admin.id)

    expect(obterUsuarioLogado().id).toBe(admin.id)
    expect(podeEditarVisita(obterUsuarioLogado().perfil)).toBe(true)
  })

  it('perfil sem permissão perde a edição da visita', () => {
    const auditor = USUARIOS_INICIAIS.find((u) => u.perfil === 'Auditor')!
    entrarComo(auditor.id)
    expect(podeEditarVisita(obterUsuarioLogado().perfil)).toBe(false)
  })

  it('ignora id inexistente em vez de deixar a sessão sem usuário', () => {
    const antes = obterUsuarioLogado().id
    entrarComo('U-NAO-EXISTE')
    expect(obterUsuarioLogado().id).toBe(antes)
  })
})

describe('cadastro de usuários', () => {
  it('gera id sequencial', () => {
    const a = adicionarUsuario(novo())
    const b = adicionarUsuario(novo())
    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(/^U-\d{3}$/)
  })

  it('editar troca o perfil sem mexer no id', () => {
    const u = adicionarUsuario(novo({ perfil: 'Auditor' }))
    atualizarUsuario(u.id, { perfil: 'Admin', nome: 'Nome Corrigido' })
    entrarComo(u.id)

    expect(obterUsuarioLogado().id).toBe(u.id)
    expect(obterUsuarioLogado().perfil).toBe('Admin')
    expect(obterUsuarioLogado().nome).toBe('Nome Corrigido')
  })

  it('trocar o perfil do usuário logado muda a permissão na hora', () => {
    const u = adicionarUsuario(novo({ perfil: 'Auditor' }))
    entrarComo(u.id)
    expect(podeEditarVisita(obterUsuarioLogado().perfil)).toBe(false)

    atualizarUsuario(u.id, { perfil: 'Operational Leader' })
    expect(podeEditarVisita(obterUsuarioLogado().perfil)).toBe(true)
  })

  it('acusa e-mail repetido, ignorando o próprio registro', () => {
    const u = adicionarUsuario(novo({ email: 'repetido@qima.com' }))
    expect(emailJaCadastrado('repetido@qima.com')).toBe(true)
    expect(emailJaCadastrado('REPETIDO@qima.com')).toBe(true)
    expect(emailJaCadastrado('repetido@qima.com', u.id)).toBe(false)
  })

  it('remover o usuário logado transfere a sessão para outro', () => {
    const u = adicionarUsuario(novo())
    entrarComo(u.id)
    expect(removerUsuario(u.id)).toBe(true)
    expect(obterUsuarioLogado().id).not.toBe(u.id)
  })
})

describe('CPF do usuário', () => {
  it('a máscara monta 000.000.000-00 e ignora o excedente', () => {
    expect(mascaraCpf('12345678062')).toBe('123.456.780-62')
    expect(mascaraCpf('123456780629999')).toBe('123.456.780-62')
    expect(mascaraCpf('abc123')).toBe('123')
  })

  it('vazio é válido, porque o campo é opcional', () => {
    expect(cpfValido('')).toBe(true)
  })

  it('aceita qualquer CPF com 11 dígitos', () => {
    expect(cpfValido('123.456.780-62')).toBe(true)
    expect(cpfValido('12345678062')).toBe(true)
    // sem conferência de dígito verificador: só o tamanho importa
    expect(cpfValido('123.456.780-63')).toBe(true)
    expect(cpfValido('111.111.111-11')).toBe(true)
  })

  it('recusa só o tamanho errado', () => {
    expect(cpfValido('123456')).toBe(false)
    expect(cpfValido('123.456.780-621')).toBe(false)
  })

  it('todo usuário da base tem CPF de 11 dígitos', () => {
    for (const u of USUARIOS_INICIAIS) {
      expect(cpfValido(u.cpf ?? ''), `${u.nome} — ${u.cpf}`).toBe(true)
    }
  })

  it('acusa CPF repetido comparando só os dígitos', () => {
    // CPF fora da base, para o teste não depender da semente
    const CPF = '987.654.321-00'
    expect(cpfJaCadastrado(CPF)).toBe(false)

    const u = adicionarUsuario(novo({ cpf: CPF }))

    expect(cpfJaCadastrado(CPF)).toBe(true)
    // com e sem pontuação é a mesma pessoa
    expect(cpfJaCadastrado('98765432100')).toBe(true)
    // editando o próprio registro, não é conflito
    expect(cpfJaCadastrado(CPF, u.id)).toBe(false)
  })

  it('CPF vazio nunca conta como repetido', () => {
    expect(cpfJaCadastrado('')).toBe(false)
  })
})

describe('login e senha', () => {
  it('todo usuário da base tem login', () => {
    for (const u of USUARIOS_INICIAIS) expect(u.login, u.nome).toBeTruthy()
  })

  it('não repete login na base', () => {
    const logins = USUARIOS_INICIAIS.map((u) => u.login.toLowerCase())
    expect(new Set(logins).size).toBe(logins.length)
  })

  it('acusa login repetido sem diferenciar caixa', () => {
    const u = adicionarUsuario(novo({ login: 'joao.teste' }))
    expect(loginJaCadastrado('joao.teste')).toBe(true)
    expect(loginJaCadastrado('JOAO.TESTE')).toBe(true)
    // editando o próprio registro, não é conflito
    expect(loginJaCadastrado('joao.teste', u.id)).toBe(false)
  })

  it('login vazio nunca conta como repetido', () => {
    expect(loginJaCadastrado('')).toBe(false)
  })

  it('a base nasce sem senha — quem define é o Admin', () => {
    expect(USUARIOS_INICIAIS.every((u) => !u.senha)).toBe(true)
  })

  it('só o Admin define credenciais', () => {
    const alvo = adicionarUsuario(novo())
    const auditor = USUARIOS_INICIAIS.find((u) => u.perfil === 'Auditor')!

    entrarComo(auditor.id)
    expect(definirCredenciais(alvo.id, 'novo.login', 'segredo123')).toBe(false)

    const admin = USUARIOS_INICIAIS.find((u) => u.perfil === 'Admin')!
    entrarComo(admin.id)
    expect(definirCredenciais(alvo.id, 'novo.login', 'segredo123')).toBe(true)
  })

  it('senha em branco na edição mantém a que já existia', () => {
    const admin = USUARIOS_INICIAIS.find((u) => u.perfil === 'Admin')!
    entrarComo(admin.id)

    const alvo = adicionarUsuario(novo())
    definirCredenciais(alvo.id, alvo.login, 'segredo123')
    expect(obterUsuarios().find((u) => u.id === alvo.id)?.senha).toBe('segredo123')

    // sem passar senha, só o login muda
    definirCredenciais(alvo.id, 'login.novo')
    const depois = obterUsuarios().find((u) => u.id === alvo.id)
    expect(depois?.login).toBe('login.novo')
    expect(depois?.senha).toBe('segredo123')
  })

  it('senha vazia explícita limpa a senha', () => {
    const admin = USUARIOS_INICIAIS.find((u) => u.perfil === 'Admin')!
    entrarComo(admin.id)

    const alvo = adicionarUsuario(novo())
    definirCredenciais(alvo.id, alvo.login, 'segredo123')
    definirCredenciais(alvo.id, alvo.login, '')

    expect(obterUsuarios().find((u) => u.id === alvo.id)?.senha).toBeUndefined()
  })
})

describe('trocar a própria senha', () => {
  const comoNovoUsuario = (senha?: string) => {
    const admin = USUARIOS_INICIAIS.find((u) => u.perfil === 'Admin')!
    entrarComo(admin.id)
    const u = adicionarUsuario(novo())
    if (senha) definirCredenciais(u.id, u.login, senha)
    entrarComo(u.id)
    return u
  }

  const senhaDe = (id: string) => obterUsuarios().find((u) => u.id === id)?.senha

  it('quem ainda não tem senha define a primeira sem informar a atual', () => {
    const u = comoNovoUsuario()
    expect(alterarMinhaSenha('', 'primeira123')).toEqual({ ok: true })
    expect(senhaDe(u.id)).toBe('primeira123')
  })

  it('não exige Admin — é a própria conta', () => {
    // Coordinator não define credenciais de ninguém, mas troca a própria
    const u = comoNovoUsuario('antiga123')
    expect(obterUsuarioLogado().perfil).toBe('Coordinator')
    expect(alterarMinhaSenha('antiga123', 'nova12345').ok).toBe(true)
    expect(senhaDe(u.id)).toBe('nova12345')
  })

  it('recusa senha atual errada', () => {
    const u = comoNovoUsuario('antiga123')
    const r = alterarMinhaSenha('chutei', 'nova12345')

    expect(r.ok).toBe(false)
    expect(r.erro).toContain('não confere')
    expect(senhaDe(u.id)).toBe('antiga123')
  })

  it('recusa nova senha curta', () => {
    const u = comoNovoUsuario('antiga123')
    const r = alterarMinhaSenha('antiga123', '123')

    expect(r.ok).toBe(false)
    expect(r.erro).toContain('pelo menos 6')
    expect(senhaDe(u.id)).toBe('antiga123')
  })

  it('recusa repetir a senha que já estava', () => {
    const u = comoNovoUsuario('antiga123')
    expect(alterarMinhaSenha('antiga123', 'antiga123').ok).toBe(false)
    expect(senhaDe(u.id)).toBe('antiga123')
  })

  it('altera só a conta logada', () => {
    const admin = USUARIOS_INICIAIS.find((u) => u.perfil === 'Admin')!
    entrarComo(admin.id)
    const outro = adicionarUsuario(novo())
    definirCredenciais(outro.id, outro.login, 'doOutro123')

    const meu = comoNovoUsuario('minha123')
    alterarMinhaSenha('minha123', 'trocada123')

    expect(senhaDe(meu.id)).toBe('trocada123')
    expect(senhaDe(outro.id)).toBe('doOutro123')
  })
})

describe('campos novos do PDR', () => {
  it('a máscara de telefone monta celular e fixo', () => {
    expect(mascaraTelefone('54999990000')).toBe('(54) 99999-0000')
    expect(mascaraTelefone('5433221100')).toBe('(54) 3322-1100')
    expect(mascaraTelefone('abc54')).toBe('54')
  })

  it('a coordenada aceita vírgula e sinal, e descarta letra', () => {
    expect(mascaraCoordenada('-28,2625')).toBe('-28.2625')
    expect(mascaraCoordenada('lat -52.4083')).toBe('-52.4083')
  })

  it('coordenada vazia é válida, fora da faixa não', () => {
    expect(coordenadaValida('', 90)).toBe(true)
    expect(coordenadaValida('-28.26', 90)).toBe(true)
    expect(coordenadaValida('91', 90)).toBe(false)
    expect(coordenadaValida('-181', 180)).toBe(false)
    expect(coordenadaValida('abc', 90)).toBe(false)
  })

  it('e-mail vazio é válido; formato quebrado não', () => {
    expect(emailValido('')).toBe(true)
    expect(emailValido('contato@unidade.com.br')).toBe(true)
    expect(emailValido('contato@unidade')).toBe(false)
    expect(emailValido('sem-arroba.com')).toBe(false)
  })

  it('a observação nasce vazia no catálogo da base', () => {
    expect(obterPdrsCatalogo().every((p) => !p.observacao)).toBe(true)
  })
})
