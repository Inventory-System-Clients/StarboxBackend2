/**
 * Migration: Histórico de pagamento por ocorrência mensal (visão "DDA") de contas recorrentes
 * Data: 2026-07-15
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("bill_occurrence_payments", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true,
    },
    bill_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "contas_financeiro",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    month: {
      type: Sequelize.CHAR(7),
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "open",
    },
    paid_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  });

  await queryInterface.addIndex("bill_occurrence_payments", ["bill_id", "month"], {
    unique: true,
    name: "bill_occurrence_payments_bill_id_month_unique",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("bill_occurrence_payments");
};
