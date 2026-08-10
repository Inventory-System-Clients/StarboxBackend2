/**
 * Migration: adiciona campo permiteGastos na tabela de roteiros
 * Data: 2026-08-10
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("Roteiros", "permiteGastos", {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("Roteiros", "permiteGastos");
};
