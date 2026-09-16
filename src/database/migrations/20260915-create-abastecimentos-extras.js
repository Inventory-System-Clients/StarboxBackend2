/**
 * Migration: Tabela de abastecimentos extras (US - painel do abastecedor)
 * Cada chamada a /movimentacoes/:id/abastecimento-extra passa a gerar uma
 * linha própria aqui, em vez de só incrementar o total acumulado em
 * movimentacoes.abastecidas - permite auditar/corrigir um lançamento
 * específico sem mexer nos demais.
 * Data: 2026-09-15
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("abastecimentos_extras", {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
    },
    movimentacaoId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "movimentacoes",
        key: "id",
      },
    },
    maquinaId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "maquinas",
        key: "id",
      },
    },
    roteiroId: {
      type: Sequelize.UUID,
      allowNull: true,
    },
    usuarioId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "id",
      },
    },
    produtoId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "produtos",
        key: "id",
      },
    },
    quantidade: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    origemEstoque: {
      type: Sequelize.STRING(10),
      allowNull: false,
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  });

  await queryInterface.addIndex("abastecimentos_extras", ["movimentacaoId"], {
    name: "abastecimentos_extras_movimentacao_id_idx",
  });
  await queryInterface.addIndex("abastecimentos_extras", ["maquinaId"], {
    name: "abastecimentos_extras_maquina_id_idx",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("abastecimentos_extras");
};
