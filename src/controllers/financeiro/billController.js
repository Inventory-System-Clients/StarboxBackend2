import { Op } from "sequelize";
import ContasFinanceiro from "../../models/ContasFinanceiro.js";
import BillOccurrencePayment from "../../models/BillOccurrencePayment.js";
import {
  parseDateOnly,
  monthKeyFromParts,
  parseMonthKey,
  isValidMonthKey,
  addMonths,
  projectDueDate,
  buildMonthWindow,
  normalizeDateOnly,
} from "../../utils/billRecurrence.js";

// Quantidade de meses exibidos na visão "DDA" (mês atual + próximos 11 = 12 meses)
const OCCURRENCE_WINDOW_SIZE = 12;

export async function getAll(req, res) {
  try {
    const { bill_type } = req.query;
    const where = bill_type ? { bill_type } : {};
    const bills = await ContasFinanceiro.findAll({ where });

    const recurrentBills = bills.filter((b) => b.recorrente);
    if (recurrentBills.length === 0) {
      return res.json(
        bills.map((bill) => {
          const plain = bill.toJSON();
          plain.due_date = normalizeDateOnly(plain.due_date);
          return plain;
        }),
      );
    }

    const windowMonths = buildMonthWindow(new Date(), OCCURRENCE_WINDOW_SIZE);
    const windowKeys = windowMonths.map((m) => m.key);

    const occurrenceRows = await BillOccurrencePayment.findAll({
      where: {
        bill_id: { [Op.in]: recurrentBills.map((b) => b.id) },
        month: { [Op.in]: windowKeys },
      },
    });

    const occurrenceMap = new Map();
    occurrenceRows.forEach((row) => {
      occurrenceMap.set(`${row.bill_id}:${row.month}`, row);
    });

    const result = bills.map((bill) => {
      const plain = bill.toJSON();
      plain.due_date = normalizeDateOnly(plain.due_date);
      if (!bill.recorrente) return plain;

      const { year: dueYear, month: dueMonth, day: dueDay } = parseDateOnly(
        bill.due_date,
      );
      const nativeMonthKey = monthKeyFromParts(dueYear, dueMonth);

      plain.occurrences = windowMonths.map(({ year, month, key }) => {
        if (key === nativeMonthKey) {
          return {
            month: key,
            due_date: plain.due_date,
            status: bill.status,
            paid_at: null,
          };
        }

        const row = occurrenceMap.get(`${bill.id}:${key}`);
        const isPaid = row && row.status === "paid";
        return {
          month: key,
          due_date: projectDueDate(dueDay, year, month),
          status: isPaid ? "paid" : "open",
          paid_at: isPaid ? row.paid_at : null,
        };
      });

      return plain;
    });

    res.json(result);
  } catch (err) {
    console.error("Erro detalhado getAll:", err);
    res.status(500).json({ error: err.message });
  }
}

export function create(req, res) {
  const amount = req.body.amount ?? req.body.value ?? 0;
  ContasFinanceiro.create({
    name: req.body.name,
    status: req.body.status || "pending",
    value: amount,
    due_date: req.body.due_date || new Date().toISOString().slice(0, 10),
    category: req.body.category || "",
    city: req.body.city || "",
    bill_type: req.body.bill_type || "personal",
    observations: req.body.observations || "",
    payment_method: req.body.payment_method || "boleto",
    payment_details: req.body.payment_details || "",
    boleto_em_maos: req.body.boleto_em_maos || false,
    recorrente: req.body.recorrente || false,
    beneficiario: req.body.beneficiario || "",
    numero: req.body.numero || "",
  })
    .then((bill) => res.json(bill))
    .catch((err) => {
      console.error("Erro detalhado create:", err);
      res.status(500).json({ error: err.message });
    });
}

export function update(req, res) {
  const id = parseInt(req.params.id);
  const amount = req.body.amount ?? req.body.value ?? 0;
  ContasFinanceiro.update(
    {
      name: req.body.name,
      status: req.body.status,
      value: amount,
      due_date: req.body.due_date,
      category: req.body.category,
      city: req.body.city,
      bill_type: req.body.bill_type,
      observations: req.body.observations,
      payment_method: req.body.payment_method,
      payment_details: req.body.payment_details,
      boleto_em_maos: req.body.boleto_em_maos,
      recorrente: req.body.recorrente,
      beneficiario: req.body.beneficiario,
      numero: req.body.numero,
    },
    { where: { id } },
  )
    .then(() => ContasFinanceiro.findByPk(id))
    .then((bill) => res.json(bill))
    .catch((err) => {
      console.error("Erro detalhado update:", err);
      res.status(500).json({ error: err.message });
    });
}

export function updateStatus(req, res) {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  ContasFinanceiro.update({ status }, { where: { id } })
    .then(() => ContasFinanceiro.findByPk(id))
    .then((bill) => res.json(bill))
    .catch((err) => {
      console.error("Erro detalhado updateStatus:", err);
      res.status(500).json({ error: err.message });
    });
}

// Limite de segurança para o loop de roll-forward (evita loop infinito em caso de dado inconsistente)
const MAX_ROLL_FORWARD_ITERATIONS = 240;

async function upsertOccurrence(billId, month, status, paidAt) {
  const [occurrence] = await BillOccurrencePayment.findOrCreate({
    where: { bill_id: billId, month },
    defaults: { status, paid_at: paidAt },
  });
  await occurrence.update({ status, paid_at: paidAt });
  return occurrence;
}

export async function updateOccurrence(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { month } = req.params;
    const { status } = req.body;

    if (!isValidMonthKey(month)) {
      return res
        .status(400)
        .json({ error: "Parâmetro month inválido, use o formato YYYY-MM" });
    }
    if (status !== "paid" && status !== "open") {
      return res
        .status(400)
        .json({ error: "status deve ser 'paid' ou 'open'" });
    }

    const bill = await ContasFinanceiro.findByPk(id);
    if (!bill) {
      return res.status(404).json({ error: "Conta não encontrada" });
    }
    if (!bill.recorrente) {
      return res
        .status(400)
        .json({ error: "Esta conta não é recorrente, use PATCH /:id/status" });
    }

    const { year: dueYear, month: dueMonth, day: dueDay } = parseDateOnly(
      bill.due_date,
    );
    const nativeMonthKey = monthKeyFromParts(dueYear, dueMonth);

    // Caso especial: pagar o mês nativo/corrente avança o due_date do bill,
    // reaproveitando o comportamento existente hoje (avançar 1 mês, status volta a "open"),
    // e registra o histórico dessa ocorrência.
    if (month === nativeMonthKey && status === "paid") {
      const paidAt = new Date();
      const previousDueDate = bill.due_date;

      let cursor = addMonths(dueYear, dueMonth, 1);
      for (let i = 0; i < MAX_ROLL_FORWARD_ITERATIONS; i++) {
        const candidateKey = monthKeyFromParts(cursor.year, cursor.month);
        const alreadyPaid = await BillOccurrencePayment.findOne({
          where: { bill_id: id, month: candidateKey, status: "paid" },
        });
        if (!alreadyPaid) break;
        cursor = addMonths(cursor.year, cursor.month, 1);
      }

      const newDueDate = projectDueDate(dueDay, cursor.year, cursor.month);

      await ContasFinanceiro.update(
        { due_date: newDueDate, status: "open" },
        { where: { id } },
      );
      await upsertOccurrence(id, nativeMonthKey, "paid", paidAt);

      return res.json({
        month: nativeMonthKey,
        due_date: previousDueDate,
        status: "paid",
        paid_at: paidAt,
      });
    }

    // Fluxo genérico: marca/desmarca um mês específico sem afetar o ciclo nativo do bill
    const paidAt = status === "paid" ? new Date() : null;
    await upsertOccurrence(id, month, status, paidAt);

    let dueDateForMonth = bill.due_date;
    if (month !== nativeMonthKey) {
      const { year: targetYear, month: targetMonth } = parseMonthKey(month);
      dueDateForMonth = projectDueDate(dueDay, targetYear, targetMonth);
    }

    return res.json({
      month,
      due_date: dueDateForMonth,
      status,
      paid_at: paidAt,
    });
  } catch (err) {
    console.error("Erro detalhado updateOccurrence:", err);
    res.status(500).json({ error: err.message });
  }
}

export function deleteBill(req, res) {
  const id = parseInt(req.params.id);
  ContasFinanceiro.destroy({ where: { id } })
    .then(() => res.json({ success: true }))
    .catch((err) => {
      console.error("Erro detalhado deleteBill:", err);
      res.status(500).json({ error: err.message });
    });
}

// Compatibilidade com rota
export { deleteBill as delete };
