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
    AND column_name = 'permiteFinalizarRota'
  `);

  if (columns.length > 0) {
    console.log("⚠️  Coluna permiteFinalizarRota já existe. Nada a fazer.");
  } else {
    console.log("📝 Adicionando coluna permiteFinalizarRota na tabela Roteiros...\n");
    await queryInterface.addColumn("Roteiros", "permiteFinalizarRota", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    console.log("✅ Coluna permiteFinalizarRota adicionada (default: true para todos os roteiros existentes).");
  }

  process.exit(0);
} catch (error) {
  console.error("❌ Erro ao executar migration:", error);
  process.exit(1);
}
