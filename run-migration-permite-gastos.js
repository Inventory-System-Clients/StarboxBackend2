import { sequelize } from "./src/database/connection.js";
import { DataTypes } from "sequelize";

console.log("🔄 Conectando ao banco de dados...");

try {
  await sequelize.authenticate();
  console.log("✅ Conexão estabelecida com sucesso!\n");

  const queryInterface = sequelize.getQueryInterface();

  const [columns] = await sequelize.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'Roteiros'
    AND column_name = 'permiteGastos'
  `);

  if (columns.length > 0) {
    console.log("⚠️  Coluna permiteGastos já existe. Nada a fazer.");
  } else {
    console.log("📝 Adicionando coluna permiteGastos na tabela Roteiros...\n");
    await queryInterface.addColumn("Roteiros", "permiteGastos", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    console.log("✅ Coluna permiteGastos adicionada (default: true para todos os roteiros existentes).");
  }

  process.exit(0);
} catch (error) {
  console.error("❌ Erro ao executar migration:", error);
  process.exit(1);
}
