import { Usuario, RoteiroExecucaoSemanal } from "../models/index.js";

const ROLE_ABASTECEDOR = "ABASTECEDOR";

const ROLES_FUNCIONARIO_ROTEIRO = new Set([
  "FUNCIONARIO",
  "FUNCIONARIO_TODAS_LOJAS",
  ROLE_ABASTECEDOR,
]);

const ROLES_RESPONSAVEL_ROTEIRO = new Set([
  "ADMIN",
  "GERENCIADOR",
  "FUNCIONARIO",
  "FUNCIONARIO_TODAS_LOJAS",
  ROLE_ABASTECEDOR,
]);

const valorVazio = (valor) =>
  valor === null || valor === undefined || String(valor).trim() === "";

const erroValidacao = (message, status = 400) =>
  Object.assign(new Error(message), { status });

export const hasFuncionarioPayload = (payload = {}) =>
  Object.prototype.hasOwnProperty.call(payload, "funcionarioId") ||
  Object.prototype.hasOwnProperty.call(payload, "funcionarioNome");

export const resolverAtualizacaoFuncionarioRoteiro = async ({
  funcionarioId,
  funcionarioNome,
}) => {
  if (valorVazio(funcionarioId)) {
    return {};
  }

  const funcionario = await Usuario.findByPk(String(funcionarioId).trim(), {
    attributes: ["id", "nome", "role", "ativo"],
  });

  if (!funcionario) {
    throw erroValidacao("Funcionario nao encontrado", 404);
  }

  if (!funcionario.ativo || !ROLES_RESPONSAVEL_ROTEIRO.has(funcionario.role)) {
    throw erroValidacao(
      "Usuario informado nao e um responsavel ativo permitido para roteiro",
    );
  }

  return {
    funcionarioId: funcionario.id,
    funcionarioNome:
      typeof funcionarioNome === "string" && funcionarioNome.trim()
        ? funcionarioNome.trim()
        : funcionario.nome,
  };
};

export const garantirFuncionarioPersistenteRoteiro = async (
  roteiro,
  { transaction } = {},
) => {
  if (!roteiro || roteiro.funcionarioId) {
    return roteiro;
  }

  const execucao = await RoteiroExecucaoSemanal.findOne({
    where: { roteiroId: roteiro.id },
    transaction,
  });

  if (!execucao?.usuarioId) {
    return roteiro;
  }

  const funcionario = await Usuario.findByPk(execucao.usuarioId, {
    attributes: ["id", "nome", "role", "ativo"],
    transaction,
  });

  if (
    !funcionario ||
    !funcionario.ativo ||
    !ROLES_FUNCIONARIO_ROTEIRO.has(funcionario.role)
  ) {
    return roteiro;
  }

  await roteiro.update(
    {
      funcionarioId: funcionario.id,
      funcionarioNome: funcionario.nome,
    },
    { transaction },
  );

  roteiro.funcionarioId = funcionario.id;
  roteiro.funcionarioNome = funcionario.nome;
  return roteiro;
};

// Roteiros cujo funcionario responsavel e ABASTECEDOR nao usam veiculo, gastos
// ou finalizacao manual - apenas o reset semanal (domingo 21h) encerra o ciclo.
// Falha ao consultar o funcionario nao deve derrubar a acao principal (finalizar,
// gastos etc.) - nesse caso trata como roteiro comum (fallback seguro).
export const roteiroTemFuncionarioAbastecedor = async (roteiro) => {
  if (!roteiro) return false;

  if (roteiro.funcionario && "role" in roteiro.funcionario) {
    return roteiro.funcionario.role === ROLE_ABASTECEDOR;
  }

  if (!roteiro.funcionarioId) return false;

  try {
    const funcionario = await Usuario.findByPk(roteiro.funcionarioId, {
      attributes: ["id", "role"],
    });

    return funcionario?.role === ROLE_ABASTECEDOR;
  } catch (error) {
    console.warn(
      "Erro ao verificar se roteiro pertence a funcionario abastecedor:",
      error.message,
    );
    return false;
  }
};
