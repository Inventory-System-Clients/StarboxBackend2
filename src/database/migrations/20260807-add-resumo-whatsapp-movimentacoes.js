export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("movimentacoes", "resumo_whatsapp", {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("movimentacoes", "resumo_whatsapp");
  },
};
