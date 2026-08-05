import { Peca } from "../models/index.js";
import { Op } from "sequelize";
import { parseListParams, buildPaginatedResponse } from "../utils/pagination.js";

// Listar todas as peças
export const listarPecas = async (req, res) => {
  try {
    const { busca, categoria, ativo } = req.query;
    const params = parseListParams(req.query, { defaultPageSize: 20 });
    const where = {};

    if (categoria) where.categoria = categoria;
    if (ativo !== undefined) where.ativo = ativo === "true";
    if (busca) where.nome = { [Op.iLike]: `%${busca}%` };

    const order = [["nome", "ASC"]];

    if (params.all) {
      const pecas = await Peca.findAll({ where, order });
      return res.json(pecas);
    }

    const { rows, count } = await Peca.findAndCountAll({
      where,
      order,
      limit: params.limit,
      offset: params.offset,
    });

    res.json(buildPaginatedResponse(rows, count, params));
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar peças" });
  }
};

// Cadastrar nova peça (ADMIN, GERENCIADOR)
export const criarPeca = async (req, res) => {
  try {
    const { nome, categoria, quantidade, descricao, preco } = req.body;
    if (!nome || !categoria) {
      return res.status(400).json({ error: "Nome e categoria são obrigatórios" });
    }
    const peca = await Peca.create({ nome, categoria, quantidade, descricao, preco });
    res.status(201).json(peca);
  } catch (error) {
    res.status(500).json({ error: "Erro ao cadastrar peça" });
  }
};

// Editar peça (ADMIN, GERENCIADOR)
export const atualizarPeca = async (req, res) => {
  try {
    const peca = await Peca.findByPk(req.params.id);
    if (!peca) return res.status(404).json({ error: "Peça não encontrada" });
    const { nome, categoria, quantidade, descricao, preco, ativo } = req.body;
    await peca.update({ nome, categoria, quantidade, descricao, preco, ativo });
    res.json(peca);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar peça" });
  }
};

// Excluir peça (ADMIN, GERENCIADOR)
export const excluirPeca = async (req, res) => {
  try {
    const peca = await Peca.findByPk(req.params.id);
    if (!peca) return res.status(404).json({ error: "Peça não encontrada" });
    await peca.destroy();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir peça" });
  }
};
