import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Registro individual de cada "abastecimento extra" (US - painel do
// abastecedor). Diferente de Movimentacao.abastecidas, que é um total
// cumulativo reaproveitado por várias visitas, aqui cada chamada ao
// endpoint /movimentacoes/:id/abastecimento-extra gera uma linha própria,
// permitindo auditar/corrigir um lançamento específico sem afetar os demais.
const AbastecimentoExtra = sequelize.define(
  "AbastecimentoExtra",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    movimentacaoId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "movimentacoes",
        key: "id",
      },
      comment: "Movimentação base cujo total acumulado foi incrementado",
    },
    maquinaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "maquinas",
        key: "id",
      },
    },
    roteiroId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Roteiro durante o qual o abastecimento extra foi feito",
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "id",
      },
      comment: "Quem executou o abastecimento extra",
    },
    produtoId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "produtos",
        key: "id",
      },
    },
    quantidade: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Quantidade abastecida nesta chamada específica (não cumulativa)",
    },
    origemEstoque: {
      type: DataTypes.STRING(10),
      allowNull: false,
      comment: "'usuario' ou 'loja' - de onde o estoque foi debitado",
    },
  },
  {
    tableName: "abastecimentos_extras",
    timestamps: true,
  },
);

export default AbastecimentoExtra;
