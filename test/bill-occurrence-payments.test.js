import test from "node:test";
import assert from "node:assert/strict";

import { getAll, updateOccurrence } from "../src/controllers/financeiro/billController.js";
import { ContasFinanceiro, BillOccurrencePayment } from "../src/models/index.js";

const createMockRes = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const metodosOriginais = {
  billFindByPk: ContasFinanceiro.findByPk,
  billUpdate: ContasFinanceiro.update,
  billFindAll: ContasFinanceiro.findAll,
  occFindOne: BillOccurrencePayment.findOne,
  occFindOrCreate: BillOccurrencePayment.findOrCreate,
  occFindAll: BillOccurrencePayment.findAll,
};

function restaurar() {
  ContasFinanceiro.findByPk = metodosOriginais.billFindByPk;
  ContasFinanceiro.update = metodosOriginais.billUpdate;
  ContasFinanceiro.findAll = metodosOriginais.billFindAll;
  BillOccurrencePayment.findOne = metodosOriginais.occFindOne;
  BillOccurrencePayment.findOrCreate = metodosOriginais.occFindOrCreate;
  BillOccurrencePayment.findAll = metodosOriginais.occFindAll;
}

test("updateOccurrence: mês nativo pago avança due_date em 1 mês e grava histórico", async () => {
  const bill = ContasFinanceiro.build({
    id: 1,
    due_date: "2026-07-10",
    status: "open",
    recorrente: true,
    bill_type: "company",
  });

  const billUpdateCalls = [];
  const occurrenceUpserts = [];

  ContasFinanceiro.findByPk = async () => bill;
  ContasFinanceiro.update = async (values, options) => {
    billUpdateCalls.push({ values, options });
    return [1];
  };
  BillOccurrencePayment.findOne = async () => null; // nenhum mês futuro pré-pago
  BillOccurrencePayment.findOrCreate = async ({ where, defaults }) => {
    const instance = BillOccurrencePayment.build({ ...where, ...defaults });
    instance.update = async (values) => {
      Object.assign(instance, values);
      occurrenceUpserts.push({ where, values });
      return instance;
    };
    return [instance, true];
  };

  const res = createMockRes();
  await updateOccurrence(
    { params: { id: "1", month: "2026-07" }, body: { status: "paid" } },
    res,
  );

  assert.equal(billUpdateCalls.length, 1);
  assert.equal(billUpdateCalls[0].values.due_date, "2026-08-10");
  assert.equal(billUpdateCalls[0].values.status, "open");
  assert.deepEqual(billUpdateCalls[0].options.where, { id: 1 });

  assert.equal(occurrenceUpserts.length, 1);
  assert.equal(occurrenceUpserts[0].where.month, "2026-07");
  assert.equal(occurrenceUpserts[0].values.status, "paid");
  assert.ok(occurrenceUpserts[0].values.paid_at instanceof Date);

  assert.equal(res.body.month, "2026-07");
  assert.equal(res.body.due_date, "2026-07-10");
  assert.equal(res.body.status, "paid");
  assert.ok(res.body.paid_at instanceof Date);

  restaurar();
});

test("updateOccurrence: roll-forward inteligente pula meses já pagos adiantado", async () => {
  const bill = ContasFinanceiro.build({
    id: 2,
    due_date: "2026-07-10",
    status: "open",
    recorrente: true,
    bill_type: "personal",
  });

  const billUpdateCalls = [];

  ContasFinanceiro.findByPk = async () => bill;
  ContasFinanceiro.update = async (values, options) => {
    billUpdateCalls.push({ values, options });
    return [1];
  };
  // Agosto já foi pago adiantado; setembro ainda não.
  BillOccurrencePayment.findOne = async ({ where }) => {
    if (where.month === "2026-08" && where.status === "paid") {
      return BillOccurrencePayment.build({ ...where });
    }
    return null;
  };
  BillOccurrencePayment.findOrCreate = async ({ where, defaults }) => {
    const instance = BillOccurrencePayment.build({ ...where, ...defaults });
    instance.update = async (values) => Object.assign(instance, values);
    return [instance, true];
  };

  const res = createMockRes();
  await updateOccurrence(
    { params: { id: "2", month: "2026-07" }, body: { status: "paid" } },
    res,
  );

  assert.equal(billUpdateCalls[0].values.due_date, "2026-09-10");

  restaurar();
});

test("updateOccurrence: marcar mês futuro (não nativo) como pago não mexe no due_date do bill", async () => {
  const bill = ContasFinanceiro.build({
    id: 3,
    due_date: "2026-07-10",
    status: "open",
    recorrente: true,
    bill_type: "company",
  });

  let billUpdateCalled = false;
  const occurrenceUpserts = [];

  ContasFinanceiro.findByPk = async () => bill;
  ContasFinanceiro.update = async () => {
    billUpdateCalled = true;
    return [1];
  };
  BillOccurrencePayment.findOrCreate = async ({ where, defaults }) => {
    const instance = BillOccurrencePayment.build({ ...where, ...defaults });
    instance.update = async (values) => {
      Object.assign(instance, values);
      occurrenceUpserts.push({ where, values });
    };
    return [instance, true];
  };

  const res = createMockRes();
  await updateOccurrence(
    { params: { id: "3", month: "2026-09" }, body: { status: "paid" } },
    res,
  );

  assert.equal(billUpdateCalled, false);
  assert.equal(occurrenceUpserts.length, 1);
  assert.equal(occurrenceUpserts[0].where.month, "2026-09");
  assert.equal(res.body.due_date, "2026-09-10");
  assert.equal(res.body.status, "paid");

  restaurar();
});

test("updateOccurrence: desmarcar (open) um mês passado é só auditoria, sem tocar no bill", async () => {
  const bill = ContasFinanceiro.build({
    id: 4,
    due_date: "2026-07-10",
    status: "open",
    recorrente: true,
    bill_type: "personal",
  });

  let billUpdateCalled = false;
  const occurrenceUpserts = [];

  ContasFinanceiro.findByPk = async () => bill;
  ContasFinanceiro.update = async () => {
    billUpdateCalled = true;
    return [1];
  };
  BillOccurrencePayment.findOrCreate = async ({ where, defaults }) => {
    const instance = BillOccurrencePayment.build({ ...where, ...defaults });
    instance.update = async (values) => {
      Object.assign(instance, values);
      occurrenceUpserts.push({ where, values });
    };
    return [instance, false];
  };

  const res = createMockRes();
  await updateOccurrence(
    { params: { id: "4", month: "2026-05" }, body: { status: "open" } },
    res,
  );

  assert.equal(billUpdateCalled, false);
  assert.equal(occurrenceUpserts[0].values.status, "open");
  assert.equal(occurrenceUpserts[0].values.paid_at, null);
  assert.equal(res.body.status, "open");
  assert.equal(res.body.paid_at, null);

  restaurar();
});

test("getAll: bill recorrente ganha campo occurrences com mês nativo espelhando bill.due_date/status", async () => {
  const bill = ContasFinanceiro.build({
    id: 5,
    due_date: "2026-07-10",
    status: "open",
    recorrente: true,
    bill_type: "company",
  });
  const naoRecorrente = ContasFinanceiro.build({
    id: 6,
    due_date: "2026-07-15",
    status: "pending",
    recorrente: false,
    bill_type: "personal",
  });

  const preAgoOccurrence = BillOccurrencePayment.build({
    bill_id: 5,
    month: "2026-08",
    status: "paid",
    paid_at: new Date("2026-07-01T12:00:00Z"),
  });

  ContasFinanceiro.findAll = async () => [bill, naoRecorrente];
  BillOccurrencePayment.findAll = async () => [preAgoOccurrence];

  const res = createMockRes();
  // Congela "hoje" como 2026-07-15 fazendo o teste independente da data real de execução
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate("2026-07-15T12:00:00Z");
      return new RealDate(...args);
    }
    static now() {
      return new RealDate("2026-07-15T12:00:00Z").getTime();
    }
  }
  global.Date = FixedDate;

  try {
    await getAll({ query: {} }, res);
  } finally {
    global.Date = RealDate;
  }

  const billResult = res.body.find((b) => b.id === 5);
  const naoRecorrenteResult = res.body.find((b) => b.id === 6);

  assert.equal(naoRecorrenteResult.occurrences, undefined);

  assert.equal(billResult.occurrences.length, 12);
  const nativo = billResult.occurrences.find((o) => o.month === "2026-07");
  assert.equal(nativo.due_date, "2026-07-10");
  assert.equal(nativo.status, "open");
  assert.equal(nativo.paid_at, null);

  const agosto = billResult.occurrences.find((o) => o.month === "2026-08");
  assert.equal(agosto.due_date, "2026-08-10");
  assert.equal(agosto.status, "paid");
  assert.ok(agosto.paid_at);

  const setembro = billResult.occurrences.find((o) => o.month === "2026-09");
  assert.equal(setembro.due_date, "2026-09-10");
  assert.equal(setembro.status, "open");
  assert.equal(setembro.paid_at, null);

  restaurar();
});

test("updateOccurrence: rejeita month em formato inválido e status inválido", async () => {
  const res1 = createMockRes();
  await updateOccurrence(
    { params: { id: "1", month: "2026-13" }, body: { status: "paid" } },
    res1,
  );
  assert.equal(res1.statusCode, 400);

  const res2 = createMockRes();
  ContasFinanceiro.findByPk = async () =>
    ContasFinanceiro.build({ id: 1, due_date: "2026-07-10", status: "open", recorrente: true });
  await updateOccurrence(
    { params: { id: "1", month: "2026-07" }, body: { status: "quitado" } },
    res2,
  );
  assert.equal(res2.statusCode, 400);

  restaurar();
});
