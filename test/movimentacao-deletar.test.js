import test from "node:test";
import assert from "node:assert/strict";

import { deletarMovimentacao } from "../src/controllers/movimentacaoController.js";
import {
  AbastecimentoExtra,
  EstoqueLoja,
  EstoqueUsuario,
  FluxoCaixa,
  Maquina,
  Movimentacao,
  MovimentacaoEstoqueLoja,
  MovimentacaoEstoqueLojaProduto,
  MovimentacaoPeca,
  MovimentacaoProduto,
  ValorEsperadoMovimentacao,
} from "../src/models/index.js";

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

const alvos = [
  [Movimentacao.sequelize, "transaction"],
  [Movimentacao, "findByPk"],
  [Maquina, "findByPk"],
  [AbastecimentoExtra, "findAll"],
  [AbastecimentoExtra, "destroy"],
  [MovimentacaoProduto, "findAll"],
  [MovimentacaoProduto, "destroy"],
  [MovimentacaoPeca, "destroy"],
  [FluxoCaixa, "destroy"],
  [ValorEsperadoMovimentacao, "destroy"],
  [EstoqueUsuario, "findOne"],
  [EstoqueUsuario, "create"],
  [EstoqueLoja, "findOne"],
  [EstoqueLoja, "create"],
  [MovimentacaoEstoqueLoja, "create"],
  [MovimentacaoEstoqueLojaProduto, "bulkCreate"],
];
const originais = alvos.map(([obj, nome]) => obj[nome]);

test.afterEach(() => {
  alvos.forEach(([obj, nome], i) => {
    obj[nome] = originais[i];
  });
});

test("deletarMovimentacao devolve estoque da leitura e dos extras", async () => {
  const estado = { committed: false, rolledBack: false, movDestruida: false };
  const historico = [];

  Movimentacao.sequelize.transaction = async () => ({
    LOCK: { UPDATE: "UPDATE" },
    commit: async () => {
      estado.committed = true;
    },
    rollback: async () => {
      estado.rolledBack = true;
    },
  });

  Movimentacao.findByPk = async () => ({
    id: "mov-1",
    maquinaId: "maq-1",
    usuarioId: "func-1",
    destroy: async () => {
      estado.movDestruida = true;
    },
  });
  Maquina.findByPk = async () => ({ id: "maq-1", lojaId: "loja-1", nome: "744" });

  // Extra de 5 saiu do estoque do funcionário; detalhe acumula 10 + 5.
  AbastecimentoExtra.findAll = async () => [
    { produtoId: 7, quantidade: 5, origemEstoque: "usuario", usuarioId: "func-2" },
  ];
  MovimentacaoProduto.findAll = async () => [
    { produtoId: 7, quantidadeAbastecida: 15 },
  ];

  const estoqueUsuarioFunc2 = {
    quantidade: 1,
    async update(dados) {
      this.quantidade = dados.quantidade;
    },
  };
  const estoqueLoja = {
    quantidade: 20,
    async update(dados) {
      this.quantidade = dados.quantidade;
    },
  };

  EstoqueUsuario.findOne = async ({ where }) =>
    where.usuarioId === "func-2" ? estoqueUsuarioFunc2 : null;
  EstoqueUsuario.create = async () => {
    throw new Error("não deveria criar estoque de usuário");
  };
  EstoqueLoja.findOne = async () => estoqueLoja;
  EstoqueLoja.create = async () => {
    throw new Error("não deveria criar estoque de loja");
  };
  MovimentacaoEstoqueLoja.create = async (dados) => ({ id: "hist-1", ...dados });
  MovimentacaoEstoqueLojaProduto.bulkCreate = async (itens) => {
    historico.push(...itens);
  };

  const destruidos = [];
  for (const model of [
    AbastecimentoExtra,
    MovimentacaoProduto,
    MovimentacaoPeca,
    FluxoCaixa,
    ValorEsperadoMovimentacao,
  ]) {
    model.destroy = async () => {
      destruidos.push(model.name);
    };
  }

  const res = createMockRes();
  await deletarMovimentacao(
    { params: { id: "mov-1" }, usuario: { id: "admin-1", role: "ADMIN" } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(estado.committed, true);
  assert.equal(estado.rolledBack, false);
  assert.equal(estado.movDestruida, true);
  // Extra (5) volta pro funcionário que fez o extra.
  assert.equal(estoqueUsuarioFunc2.quantidade, 6);
  // Leitura (15 - 5 = 10): funcionário da leitura não tem linha -> ponto.
  assert.equal(estoqueLoja.quantidade, 30);
  assert.deepEqual(historico, [
    {
      movimentacaoEstoqueLojaId: "hist-1",
      produtoId: 7,
      quantidade: 10,
      tipoMovimentacao: "entrada",
    },
  ]);
  assert.equal(destruidos.length, 5);
});

test("deletarMovimentacao retorna 404 quando não existe", async () => {
  let rolledBack = false;
  Movimentacao.sequelize.transaction = async () => ({
    commit: async () => {},
    rollback: async () => {
      rolledBack = true;
    },
  });
  Movimentacao.findByPk = async () => null;

  const res = createMockRes();
  await deletarMovimentacao({ params: { id: "x" }, usuario: { role: "ADMIN" } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(rolledBack, true);
});
