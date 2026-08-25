/**
 * Migration: adiciona campo permiteFinalizarRota na tabela de roteiros
 * Data: 2026-08-24
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("Roteiros", "permiteFinalizarRota", {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("Roteiros", "permiteFinalizarRota");
};
