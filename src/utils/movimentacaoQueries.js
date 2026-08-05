import { QueryTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import Movimentacao from "../models/Movimentacao.js";

const colunaFisica = (atributo) =>
  Movimentacao.rawAttributes[atributo]?.field || atributo;

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
