/**
 * Catálogo de regras de análise da visita — cada item aqui é uma regra
 * que pode ser ligada/desligada em Administração → Parâmetros. Arquivo
 * sem dependências (não importa de store.ts nem analise.ts) para evitar
 * import circular, já que os dois o consomem.
 */
export interface DefinicaoRegra {
  codigo: string
  secao: string
  label: string
}

export const CATALOGO_REGRAS: DefinicaoRegra[] = [
  // 1. Formulário
  { codigo: '1.1', secao: '1. Formulário', label: 'Visita deve estar marcada como iniciada' },
  { codigo: '1.2', secao: '1. Formulário', label: 'Coerência entre "Houve Recebimento" e cargas acompanhadas' },
  { codigo: '1.3', secao: '1. Formulário', label: 'Coerência entre "Realiza Testes" e resultado informado' },
  { codigo: '1.4', secao: '1. Formulário', label: 'PDR guarda fitas testadas associáveis às cargas' },
  { codigo: '1.5', secao: '1. Formulário', label: 'Reteste realizado precisa de justificativa' },
  { codigo: '1.6', secao: '1. Formulário', label: 'Quantidade de caixas dentro da faixa' },

  // 2. Acumulado
  { codigo: '2.1', secao: '2. Acumulado', label: 'Recebimento sem dados de acumulado' },
  { codigo: '2.2', secao: '2. Acumulado', label: 'Acumulado informado sem recebimento' },
  { codigo: '2.3', secao: '2. Acumulado', label: 'Acumulado inferior a 100 kg' },
  { codigo: '2.4', secao: '2. Acumulado', label: 'Crescimento diário de uma classificação acima de 2.000.000 kg' },
  { codigo: '2.5', secao: '2. Acumulado', label: 'Histórico com acumulado inferior ao anterior' },
  { codigo: '2.6', secao: '2. Acumulado', label: 'Acumulado duplicado' },
  { codigo: '2.7', secao: '2. Acumulado', label: 'Acumulado informado e zerado' },
  { codigo: '2.8', secao: '2. Acumulado', label: 'Acumulado com valor negativo' },
  // Dia Anterior entra como 2.9/2.10 em vez de virar seção nova: os códigos são
  // a chave de regrasAtivas, e renumerar as seções invalidaria o que já está salvo
  { codigo: '2.9', secao: '2. Acumulado', label: 'Dia Anterior acima do teto por tecnologia' },
  { codigo: '2.10', secao: '2. Acumulado', label: 'Dia Anterior duplicado na mesma data' },

  // 3. Cargas
  { codigo: '3.1.1', secao: '3. Cargas', label: 'Horário da carga dentro da janela da visita (com tolerância)' },
  { codigo: '3.1.2', secao: '3. Cargas', label: 'Data da carga igual à data da visita' },
  { codigo: '3.2.1', secao: '3. Cargas', label: 'Carga sem placa' },
  { codigo: '3.2.2', secao: '3. Cargas', label: 'Carga sem romaneio' },
  { codigo: '3.2.3', secao: '3. Cargas', label: 'Carga sem produtor' },
  { codigo: '3.2.4', secao: '3. Cargas', label: 'Ambos os pesos não informados' },
  { codigo: '3.3.2', secao: '3. Cargas', label: 'Placa com poucos caracteres' },
  { codigo: '3.3.3', secao: '3. Cargas', label: 'Possível placa fictícia' },
  { codigo: '3.4.1', secao: '3. Cargas', label: 'Peso acima de 55.000 kg (possível tara)' },
  { codigo: '3.4.2', secao: '3. Cargas', label: 'Peso menor que 10 kg' },
  { codigo: '3.4.3', secao: '3. Cargas', label: 'Peso acima de 100.000 kg' },
  { codigo: '3.4.4', secao: '3. Cargas', label: 'Peso com desconto maior que o líquido' },
  { codigo: '3.4.5', secao: '3. Cargas', label: 'Nenhuma carga com peso com desconto informado' },
  { codigo: '3.4.6', secao: '3. Cargas', label: 'Possível peso fictício' },
  { codigo: '3.4.7', secao: '3. Cargas', label: 'Desconto acima do limite' },
  { codigo: '3.4.8', secao: '3. Cargas', label: 'Peso líquido zerado' },
  { codigo: '3.5.1', secao: '3. Cargas', label: 'Produtor com inconsistências no nome' },
  { codigo: '3.6.1', secao: '3. Cargas', label: 'Romaneio fora do padrão / salto acima do limite' },
  { codigo: '3.6.2', secao: '3. Cargas', label: 'Romaneio duplicado (sem rateio)' },
  { codigo: '3.7.1', secao: '3. Cargas', label: 'Tecnologia marcada como não testada' },

  // 4. Rateio
  { codigo: '4.1', secao: '4. Rateio', label: 'Rateio sem parceiro/grupo informado' },
  { codigo: '4.2', secao: '4. Rateio', label: 'Soma do peso com desconto do grupo maior que o líquido' },
  { codigo: '4.3', secao: '4. Rateio', label: 'Desconto do grupo acima do limite' },
  { codigo: '4.4', secao: '4. Rateio', label: 'Peso total do grupo acima de 70.000 kg' },
  { codigo: '4.5', secao: '4. Rateio', label: 'Grupo com carga sem peso líquido' },
  { codigo: '4.6', secao: '4. Rateio', label: 'Mesma placa em menos de 10 minutos' },
  { codigo: '4.7', secao: '4. Rateio', label: 'Rateio com tecnologia do participante' },
  { codigo: '4.8', secao: '4. Rateio', label: 'Peso duplicado entre cargas' },
  { codigo: '4.9', secao: '4. Rateio', label: 'Rateio com placas divergentes' },
  { codigo: '4.10', secao: '4. Rateio', label: 'Rateio com classificações divergentes' },
  { codigo: '4.11', secao: '4. Rateio', label: 'Rateio com uma única carga' },

  // 5. Cargas não acompanhadas
  { codigo: '5.1', secao: '5. Cargas não acompanhadas', label: 'Mesma carga inserida como acompanhada e não acompanhada' },
  { codigo: '5.2', secao: '5. Cargas não acompanhadas', label: 'Carga não acompanhada dentro do horário da visita' },
  { codigo: '5.3', secao: '5. Cargas não acompanhadas', label: 'Romaneio duplicado com carga acompanhada' },

  // 6. Ocorrências
  { codigo: '6.1', secao: '6. Ocorrências', label: 'Ocorrência sinalizada (2.5) sem registro na aba 6' },
  { codigo: '6.2', secao: '6. Ocorrências', label: 'Ocorrência registrada mas não sinalizada em 2.5' },
  { codigo: '6.3', secao: '6. Ocorrências', label: 'Ocorrência apontando carga inexistente' },
]

export function regrasAtivasPadrao(): Record<string, boolean> {
  return Object.fromEntries(CATALOGO_REGRAS.map((r) => [r.codigo, true]))
}
