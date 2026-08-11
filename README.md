# QIMA Harvest 2026

Painel de acompanhamento de visitas a PDRs (pontos de recebimento) da safra 2025/2026.
React + Vite + TypeScript, identidade visual QIMA, com dados fictícios gerados em memória.

## Rodando

```bash
npm install
npm run dev
```

Abre em http://localhost:5173.

## Estrutura

```
public/favicon.svg      marca QIMA em vetor (lupa + vermelho)
src/
  App.tsx               rotas (hash router)
  types.ts              modelos de domínio
  store.ts              estado em memória + ações (editar/importar/excluir cargas)
  format.ts             formatadores pt-BR (kg, t, %, número)
  data/mock.ts          gerador determinístico da base fictícia
  components/
    Layout.tsx          header + abas de navegação
    Logo.tsx            marca e logotipo em SVG
    icons.tsx           ícones de linha
    ui.tsx              Breadcrumb, PageHead, Panel, Question, SimNaoInput, Modal, Toast
    TabelaCargas.tsx    tabela de cargas com rateio agrupado, edição e exclusão
    EditarCarga.tsx     modal de cadastro/edição de carga
    ImportarCargas.tsx  importação em massa por CSV/colagem
  pages/
    Visitas.tsx         KPIs + cards por situação
    VisitasLista.tsx    lista filtrável/ordenável/paginada + export CSV
    VisitaDetalhe.tsx   abas 1 a 7 do registro de visita
    Administracao.tsx   cadastros
    EmBreve.tsx         placeholder dos módulos pendentes
```

## Fluxo principal

`Visitas` → cards **Central Correção · Operação Correção · Certificada · Cancelada**
→ lista com Cód · Data · PDR · Nº · Cargas · Situação · Consultor · Líder · Líder Focal · Supervisor
→ detalhe da visita:

A página de Visitas abre com uma **busca** que localiza a visita por código, PDR, CNPJ, cidade ou
consultor (navegação por setas e Enter). Abaixo dela, os próprios cards de situação formam o fluxo,
ligados por setas na ordem
**Central Correção → Operação Correção → Central Correção (2ª) → Operação Correção (2ª) →
Cancelada / Certificada**. As etapas repetidas são marcadas com "2ª" e apontam para a mesma fila.

| Aba | Conteúdo |
|-----|----------|
| ! | Análise — todas as regras quebradas na visita |
| 1 | Dados da unidade + recebimento mensal |
| 2 | Dados da visita (2.1 a 2.6, com campos condicionais de reteste) |
| 3 | 3.1 acumulado e sua origem · 3.2 histórico em tabela, por dia e por mês |
| 4 | Acompanhamento de cargas |
| 5 | Cargas não acompanhadas |
| 6 | Ocorrências, com a carga que as originou |
| 7 | Comunicação — conversa entre os analistas e ações da visita |

## Comunicação e fluxo (aba 7)

Conversa cronológica entre os envolvidos, com avatar, papel e horário de cada mensagem. Ao
escrever, é possível **apontar um responsável** pelo problema entre os membros da equipe da visita
(consultor, líder, líder focal, supervisor). Eventos do sistema (validação, devolução,
certificação) entram na mesma linha do tempo como registros automáticos.

Abaixo da conversa ficam as três ações:

- **Validar** — roda as regras e grava o resultado na aba Análise (quem validou, quando, quantos
  erros e atenções), levando para lá quando há pendências.
- **Enviar para operação** — pede o motivo, devolve a visita para `operacao-correcao` e registra
  na conversa.
- **Certificar** — sem erros, certifica direto. Com erros, abre um modal listando cada um; o
  analista marca a caixa para **liberar** o erro e escreve a **justificativa** obrigatória. Só
  certifica quando todos estiverem liberados e justificados. Os erros liberados param de bloquear,
  mas continuam visíveis na Análise, na seção "Erros liberados", com autor, data e justificativa.

## Análise de inconsistências

`src/analise.ts` aplica as regras de consistência a cada visita e devolve a lista de erros e
pontos de atenção. O resultado aparece em duas frentes: um **banner no topo do registro** e a
**aba Análise**. Cada linha leva direto ao ponto — clicar em um alerta de carga abre a aba certa,
rola até a linha e a destaca.

Os **erros aparecem expandidos** em cartões (no banner do topo e na aba); os pontos de atenção
ficam recolhidos em lista compacta, com botão para expandir. Na tabela de cargas, a linha com erro
é **pintada de vermelho** e a com atenção de âmbar, ambas com etiqueta nomeando a regra quebrada.

Regras: desconto acima de 30% (erro) e acima de 2,5% (atenção), peso com desconto maior que o
líquido, carga sem romaneio/placa/peso, **placa com menos de 6 caracteres**, **romaneio
duplicado** na visita, **salto de romaneio maior que 500** entre cargas consecutivas, rateio com
placas ou classificações divergentes, rateio com carga única, incoerência entre 2.2 e as cargas
lançadas, reteste sem justificativa, ocorrência declarada sem registro (e vice-versa),
caixa de fita fora de 0–300 ou zerada com testes realizados, acumulado informado zerado ou negativo e **acumulado
de um período menor que o do período anterior** (o acumulado é cumulativo e não pode diminuir).

Cores de classificação: **Positiva** verde · **Declarada** azul · **Negativa** vermelho ·
**Participante** roxo.

Cada aba tem rodapé de navegação com "Anterior / Próxima" e atalhos numerados.

## Link permanente da visita

Cada visita tem um endereço fixo — `.../#/visita/295430` — que pode ser enviado a outro usuário
do sistema. Na lista, tanto o código quanto o botão **Detalhar** abrem o registro em **nova aba**
(`target="_blank"`).

O registro roda em um layout próprio (`LayoutVisita`), **sem as abas globais** do sistema: o topo
mostra apenas a identificação da visita (número, situação, PDR, CNPJ, cidade e data), o botão
**Copiar link** e o atalho para voltar à lista. Se o navegador bloquear a cópia automática, abre
um modal com o endereço pronto para selecionar.

O roteamento usa `HashRouter` de propósito: o link funciona em qualquer hospedagem estática, sem
precisar de regra de rewrite no servidor. Para URLs sem `#` (`/visita/295430`), troque por
`BrowserRouter` em `src/main.tsx` e configure o servidor para servir `index.html` em qualquer rota.

## Regras implementadas

- **2.1** trava em "Sim" automaticamente quando existe ao menos uma carga lançada.
- **2.4** exibe "quem pediu" e "motivo" apenas quando o reteste é Sim; ao voltar para Não, limpa os campos.
- **2.6** número da caixa de fita teste, limitado de 0 a 300.
- **3.1** origem do acumulado é **PDR**, **RTV** ou **B2B**; só PDR permite digitação — RTV e B2B
  chegam consolidados e ficam travados.
- **3.2** histórico dos 14 dias e dos 8 meses mais recentes (não de safras antigas), com a origem
  de cada período.
- **Rateio**: as cargas do grupo são o mesmo caminhão — compartilham **placa**, data, hora e
  classificação. Editar qualquer uma propaga para as demais; o cabeçalho mostra o peso líquido e o
  peso com desconto totais do grupo. Se um grupo ficar com uma única carga, ela deixa de ser rateio.
- **Ocorrências** ficam vinculadas à carga que as originou; a carga é sinalizada na tabela de
  cargas e pode ser aberta em detalhe pela aba 6.
- **Desconto %** é calculado entre peso líquido e peso com desconto; acima de 2,5% a linha é destacada.

## Importação de cargas

Aceita CSV/TXT/TSV (separador `;`, tabulação ou `,`) por arquivo, arrastar-e-soltar ou colagem
direta do Excel. Colunas:

```
Data;Hora;Placa;Produtor;CPF/CNPJ;Romaneio;Peso Líquido;Peso com Desconto;Classificação;Rateio;Grupo Rateio;Observação
```

A pré-visualização valida linha a linha e só importa as válidas. O botão **Baixar modelo**
gera o CSV de exemplo. Para ler `.xlsx` binário seria preciso adicionar uma biblioteca
(SheetJS); hoje o caminho é "Salvar como CSV" no Excel.

## Trocando o mock pela API real

Todo acesso a dados passa por `src/store.ts`. Basta trocar as funções
(`salvarCarga`, `adicionarCargas`, `excluirCarga`, `salvarDadosVisita`, `salvarAcumulado`)
por chamadas HTTP mantendo os tipos de `src/types.ts` — nenhuma tela precisa mudar.

## Identidade visual

A marca em `public/favicon.svg` e `src/components/Logo.tsx` é uma recriação vetorial na
identidade QIMA (vermelho `#e4002b` + lupa). Para usar o arquivo oficial da empresa,
substitua esses dois arquivos.
