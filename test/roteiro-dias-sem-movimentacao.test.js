import test from "node:test";
import assert from "node:assert/strict";

import { roteiroDiasSemMovimentacao } from "../src/controllers/relatorioController.js";
import { Roteiro, Movimentacao } from "../src/models/index.js";

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
  roteiroFindByPk: Roteiro.findByPk,
  movimentacaoFindAll: Movimentacao.findAll,
};

function restaurar() {
  Roteiro.findByPk = metodosOriginais.roteiroFindByPk;
  Movimentacao.findAll = metodosOriginais.movimentacaoFindAll;
}

test("roteiroDiasSemMovimentacao: abastecimento sem contador não conta como leitura do ponto", async () => {
  Roteiro.findByPk = async () => ({
    id: "roteiro-1",
    lojas: [{ id: "loja-1", nome: "Loja 1" }],
  });

  // Dia 1: movimentação real, com leitura de contador (relógio usado) -> conta.
  // Dia 2: só abastecimento feito por funcionário abastecedor, sem contador -> NÃO conta.
  Movimentacao.findAll = async () => [
    {
      dataColeta: "2026-07-01T10:00:00.000Z",
      contadorIn: 100,
      contadorOut: 50,
    },
    {
      dataColeta: "2026-07-02T10:00:00.000Z",
      contadorIn: null,
      contadorOut: null,
    },
  ];

  const res = createMockRes();
  await roteiroDiasSemMovimentacao(
    {
      query: {
        roteiroId: "roteiro-1",
        dataInicio: "2026-07-01",
        dataFim: "2026-07-03",
      },
    },
    res,
  );

  const loja1 = res.body.lojas.find((l) => l.id === "loja-1");
  assert.deepEqual(loja1.diasSemMovimentacao, ["2026-07-02", "2026-07-03"]);

  restaurar();
});

test("roteiroDiasSemMovimentacao: movimentação com apenas contadorOut preenchido já conta como leitura", async () => {
  Roteiro.findByPk = async () => ({
    id: "roteiro-2",
    lojas: [{ id: "loja-2", nome: "Loja 2" }],
  });

  Movimentacao.findAll = async () => [
    {
      dataColeta: "2026-07-01T10:00:00.000Z",
      contadorIn: null,
      contadorOut: 30,
    },
  ];

  const res = createMockRes();
  await roteiroDiasSemMovimentacao(
    {
      query: {
        roteiroId: "roteiro-2",
        dataInicio: "2026-07-01",
        dataFim: "2026-07-01",
      },
    },
    res,
  );

  const loja2 = res.body.lojas.find((l) => l.id === "loja-2");
  assert.deepEqual(loja2.diasSemMovimentacao, []);

  restaurar();
});
