// Modelo Sequelize para o histórico de pagamento por ocorrência mensal (visão "DDA") de contas recorrentes
import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const BillOccurrencePayment = sequelize.define(
  "BillOccurrencePayment",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    bill_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "contas_financeiro",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    month: {
      type: DataTypes.CHAR(7),
      allowNull: false,
      comment: "Mês da ocorrência no formato YYYY-MM",
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "open",
      comment: "Status da ocorrência: open ou paid",
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "bill_occurrence_payments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["bill_id", "month"],
        name: "bill_occurrence_payments_bill_id_month_unique",
      },
    ],
  },
);

export default BillOccurrencePayment;
