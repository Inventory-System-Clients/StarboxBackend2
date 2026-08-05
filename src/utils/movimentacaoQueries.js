import { QueryTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import Movimentacao from "../models/Movimentacao.js";
import FluxoCaixa from "../models/FluxoCaixa.js";

const colunaFisica = (atributo) =>
  Movimentacao.rawAttributes[atributo]?.field || atributo;

const colunaFisicaFluxoCaixa = (atributo) =>
  FluxoCaixa.rawAttributes[atributo]?.field || atributo;

// Última movimentação e última retirada (fluxo de caixa) por loja, cada uma
// em uma única query agregada — em vez de baixar todas as movimentações e
// todo o fluxo de caixa do período pro frontend calcular o máximo na mão.
export async function getInatividadePorLoja(dataInicio) {
  const colMaquinaId = colunaFisica("maquinaId");
  const colDataColeta = colunaFisica("dataColeta");
  const colMovimentacaoId = colunaFisicaFluxoCaixa("movimentacaoId");
  const tabelaMovimentacao = Movimentacao.getTableName();
  const tabelaFluxoCaixa = FluxoCaixa.getTableName();

  const [movRows, retiradaRows] = await Promise.all([
    sequelize.query(
      `
        SELECT mq."lojaId" AS "lojaId", MAX(mv."${colDataColeta}") AS "ultimaMovimentacao"
        FROM "${tabelaMovimentacao}" mv
        JOIN "maquinas" mq ON mv."${colMaquinaId}" = mq."id"
        WHERE mv."${colDataColeta}" >= :dataInicio
        GROUP BY mq."lojaId"
      `,
      { replacements: { dataInicio }, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `
        SELECT mq."lojaId" AS "lojaId", MAX(mv."${colDataColeta}") AS "ultimaRetirada"
        FROM "${tabelaFluxoCaixa}" fc
        JOIN "${tabelaMovimentacao}" mv ON fc."${colMovimentacaoId}" = mv."id"
        JOIN "maquinas" mq ON mv."${colMaquinaId}" = mq."id"
        WHERE mv."${colDataColeta}" >= :dataInicio
        GROUP BY mq."lojaId"
      `,
      { replacements: { dataInicio }, type: QueryTypes.SELECT },
    ),
  ]);

  const ultimaMovimentacaoPorLoja = new Map();
  for (const row of movRows) {
    ultimaMovimentacaoPorLoja.set(row.lojaId, row.ultimaMovimentacao);
  }

  const ultimaRetiradaPorLoja = new Map();
  for (const row of retiradaRows) {
    ultimaRetiradaPorLoja.set(row.lojaId, row.ultimaRetirada);
  }

  return { ultimaMovimentacaoPorLoja, ultimaRetiradaPorLoja };
}

// Busca a última movimentação de cada máquina em uma única query (Postgres
// DISTINCT ON), no lugar de um Movimentacao.findOne por máquina dentro de um
// loop. Retorna um Map<maquinaId, linha>; máquinas sem movimentação não
// aparecem no Map.
export async function getUltimaMovimentacaoPorMaquina(maquinaIds) {
  const idsUnicos = [...new Set((maquinaIds || []).filter(Boolean))];
  if (idsUnicos.length === 0) {
    return new Map();
  }

  const tabela = Movimentacao.getTableName();
  const colMaquinaId = colunaFisica("maquinaId");
  const colDataColeta = colunaFisica("dataColeta");
  const colCreatedAt = colunaFisica("createdAt");
  const colTotalPos = colunaFisica("totalPos");
  const colContadorOut = colunaFisica("contadorOut");
  const colContadorIn = colunaFisica("contadorIn");
  const colFichas = colunaFisica("fichas");
  const colSairam = colunaFisica("sairam");

  const query = `
    SELECT DISTINCT ON ("${colMaquinaId}")
      "id",
      "${colMaquinaId}" AS "maquinaId",
      "${colDataColeta}" AS "dataColeta",
      "${colTotalPos}" AS "totalPos",
      "${colContadorOut}" AS "contadorOut",
      "${colContadorIn}" AS "contadorIn",
      "${colFichas}" AS "fichas",
      "${colSairam}" AS "sairam"
    FROM "${tabela}"
    WHERE "${colMaquinaId}" IN (:maquinaIds)
    ORDER BY "${colMaquinaId}", "${colDataColeta}" DESC, "${colCreatedAt}" DESC
  `;

  const rows = await sequelize.query(query, {
    replacements: { maquinaIds: idsUnicos },
    type: QueryTypes.SELECT,
  });

  const mapa = new Map();
  for (const row of rows) {
    mapa.set(row.maquinaId, row);
  }
  return mapa;
}
