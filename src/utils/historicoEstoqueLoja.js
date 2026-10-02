import { MovimentacaoEstoqueLoja, MovimentacaoEstoqueLojaProduto } from "../models/index.js";

// Grava uma entrada no histórico de movimentações do estoque de uma loja
// (tabela movimentacao_estoque_lojas), usada pela tela Estoque Loja.
// itens: [{ produtoId, quantidade, tipoMovimentacao: "entrada" | "saida" }]
export const registrarHistoricoEstoqueLoja = async ({
  lojaId,
  usuarioId,
  observacao,
  itens = [],
  transaction,
}) => {
  const itensValidos = itens.filter(
    (item) => item.produtoId && Number(item.quantidade) > 0,
  );
  if (!lojaId || !usuarioId || itensValidos.length === 0) return null;

  const movimentacao = await MovimentacaoEstoqueLoja.create(
    {
      lojaId,
      usuarioId,
      observacao: observacao ? String(observacao).slice(0, 255) : null,
      dataMovimentacao: new Date(),
    },
    { transaction },
  );

  await MovimentacaoEstoqueLojaProduto.bulkCreate(
    itensValidos.map((item) => ({
      movimentacaoEstoqueLojaId: movimentacao.id,
      produtoId: item.produtoId,
      quantidade: Math.round(Number(item.quantidade)),
      tipoMovimentacao: item.tipoMovimentacao === "entrada" ? "entrada" : "saida",
    })),
    { transaction },
  );

  return movimentacao;
};
