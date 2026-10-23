import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Historico dos pontos (lojas) por onde a maquina ja passou. Cada linha
// representa um periodo em uma loja; o periodo atual tem dataSaida nula.
const MaquinaHistoricoLoja = sequelize.define(
  "MaquinaHistoricoLoja",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    maquinaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "maquinas",
        key: "id",
      },
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "lojas",
        key: "id",
      },
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Usuario que registrou a entrada da maquina no ponto",
    },
    dataEntrada: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    dataSaida: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Nulo enquanto a maquina continua neste ponto",
    },
  },
  {
    tableName: "maquina_historico_lojas",
    timestamps: true,
    indexes: [{ fields: ["maquinaId"] }],
  },
);

export default MaquinaHistoricoLoja;
