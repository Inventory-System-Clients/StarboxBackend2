import { Op } from "sequelize";
import { Loja, Maquina, UsuarioLoja, RoteiroLoja } from "../models/index.js";
import { parseListParams, buildPaginatedResponse } from "../utils/pagination.js";

// US04 - Listar todas as lojas
export const listarLojas = async (req, res) => {
  try {
    const { busca, ativo, cidade, estado, roteiroId, maquinaId } = req.query;
    const params = parseListParams(req.query, { defaultPageSize: 20 });

    const where = {};
    if (ativo !== undefined) {
      where.ativo = ativo === "true";
    }
    if (cidade) {
      where.cidade = cidade;
    }
    if (estado) {
      where.estado = estado;
    }
    if (busca) {
      where[Op.or] = [
        { nome: { [Op.iLike]: `%${busca}%` } },
        { cidade: { [Op.iLike]: `%${busca}%` } },
      ];
    }

    const podeVerTodasLojas = ["ADMIN", "FUNCIONARIO_TODAS_LOJAS"].includes(
      req.usuario.role,
    );

    // CONTROLADOR_ESTOQUE e FUNCIONARIO veem apenas lojas permitidas
    if (!podeVerTodasLojas) {
      const permissoes = await UsuarioLoja.findAll({
        where: { usuarioId: req.usuario.id },
        attributes: ["lojaId"],
      });
      where.id = { [Op.in]: permissoes.map((p) => p.lojaId) };
    }

    if (roteiroId) {
      const roteiroLojas = await RoteiroLoja.findAll({
        where: { RoteiroId: roteiroId },
        attributes: ["LojaId"],
        raw: true,
      });
      const idsDaRota = roteiroLojas.map((rl) => rl.LojaId);
      where.id = where.id
        ? { [Op.and]: [where.id, { [Op.in]: idsDaRota }] }
        : { [Op.in]: idsDaRota };
    }

    const includeMaquinas = {
      model: Maquina,
      as: "maquinas",
      attributes: ["id", "codigo", "nome", "tipo", "ativo"],
    };
    if (maquinaId) {
      const ehUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          maquinaId,
        );
      includeMaquinas.where = ehUuid
        ? { [Op.or]: [{ id: maquinaId }, { codigo: { [Op.iLike]: `%${maquinaId}%` } }] }
        : { codigo: { [Op.iLike]: `%${maquinaId}%` } };
      includeMaquinas.required = true;
    }
    const include = [includeMaquinas];
    const order = [["nome", "ASC"]];

    if (params.all) {
      const lojas = await Loja.findAll({ where, include, order });
      return res.json(lojas);
    }

    const { rows, count } = await Loja.findAndCountAll({
      where,
      include,
      order,
      limit: params.limit,
      offset: params.offset,
      distinct: true,
    });

    res.json(buildPaginatedResponse(rows, count, params));
  } catch (error) {
    console.error("Erro ao listar lojas:", error);
    res.status(500).json({ error: "Erro ao listar lojas" });
  }
};

// US04 - Obter loja por ID
export const obterLoja = async (req, res) => {
  try {
    const loja = await Loja.findByPk(req.params.id, {
      include: [
        {
          model: Maquina,
          as: "maquinas",
        },
      ],
    });

    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    res.json(loja);
  } catch (error) {
    console.error("Erro ao obter loja:", error);
    res.status(500).json({ error: "Erro ao obter loja" });
  }
};

// US04 - Criar loja
export const criarLoja = async (req, res) => {
  try {
    const {
      nome,
      endereco,
      numero,
      bairro,
      cidade,
      estado,
      responsavel,
      telefone,
    } = req.body;

    if (!nome) {
      return res.status(400).json({ error: "Nome da loja é obrigatório" });
    }

    const loja = await Loja.create({
      nome,
      endereco,
      numero,
      bairro,
      cidade,
      estado,
      responsavel,
      telefone,
    });

    res.locals.entityId = loja.id;
    res.status(201).json(loja);
  } catch (error) {
    console.error("Erro ao criar loja:", error);
    res.status(500).json({ error: "Erro ao criar loja" });
  }
};

// US04 - Atualizar loja
export const atualizarLoja = async (req, res) => {
  try {
    const loja = await Loja.findByPk(req.params.id);

    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    const {
      nome,
      endereco,
      numero,
      bairro,
      cidade,
      estado,
      responsavel,
      telefone,
      ativo,
    } = req.body;

    await loja.update({
      nome: nome ?? loja.nome,
      endereco: endereco ?? loja.endereco,
      numero: numero ?? loja.numero,
      bairro: bairro ?? loja.bairro,
      cidade: cidade ?? loja.cidade,
      estado: estado ?? loja.estado,
      responsavel: responsavel ?? loja.responsavel,
      telefone: telefone ?? loja.telefone,
      ativo: ativo ?? loja.ativo,
    });

    res.json(loja);
  } catch (error) {
    console.error("Erro ao atualizar loja:", error);
    res.status(500).json({ error: "Erro ao atualizar loja" });
  }
};

// US04 - Deletar loja
export const deletarLoja = async (req, res) => {
  try {
    const loja = await Loja.findByPk(req.params.id);

    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    // Verificar se já está inativa (segunda tentativa = hard delete)
    if (!loja.ativo) {
      // Hard delete - deletar permanentemente
      await Maquina.destroy({ where: { lojaId: loja.id } });
      await loja.destroy();
      return res.json({ message: "Loja deletada permanentemente" });
    }

    // Primeira tentativa: Soft delete (marcar como inativo)
    await loja.update({ ativo: false });
    res.json({ message: "Loja desativada com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar loja:", error);
    res.status(500).json({ error: "Erro ao deletar loja" });
  }
};
