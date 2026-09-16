import { sequelize } from "./src/database/connection.js";
import { up } from "./src/database/migrations/20260915-create-abastecimentos-extras.js";
import { Sequelize } from "sequelize";

console.log("🔄 Conectando ao banco de dados...");

try {
  await sequelize.authenticate();
  console.log("✅ Conexão estabelecida com sucesso!\n");

  const [tables] = await sequelize.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'abastecimentos_extras'
  `);

  if (tables.length > 0) {
    console.log("⚠️  Tabela abastecimentos_extras já existe. Nada a fazer.");
  } else {
    console.log("📝 Criando tabela abastecimentos_extras...\n");
    const queryInterface = sequelize.getQueryInterface();
    await up(queryInterface, Sequelize);
    console.log("✅ Tabela abastecimentos_extras criada com sucesso!");
  }

  process.exit(0);
} catch (error) {
  console.error("❌ Erro ao executar migration:", error);
  process.exit(1);
}
