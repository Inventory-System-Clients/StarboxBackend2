import { Op } from "sequelize";
import Movimentacao from "../models/Movimentacao.js";
import MovimentacaoStatusDiario from "../models/MovimentacaoStatusDiario.js";

// corteMs desloca o instante antes de calcular a data - usado só para o
// status diário dos roteiros de ABASTECEDOR (ver corteDiaMs em
// registrarMaquinaConcluidaNaExecucao/obterStatusMaquinasConcluidasDaExecucao).
// Sem corteMs (padrão), o dia vira à meia-noite como sempre foi.
export const getDataSaoPaulo = (data = new Date(), corteMs = 0) => {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(new Date(data).getTime() - corteMs));

  const porTipo = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${porTipo.year}-${porTipo.month}-${porTipo.day}`;
};

const getInicioDiaSaoPaulo = (data, corteMs = 0) => {
  const horaCorte = String(Math.floor(corteMs / (60 * 60 * 1000))).padStart(2, "0");
  return new Date(`${data}T${horaCorte}:00:00-03:00`);
};

const deduplicarPorMaquina = (itens, getMaquinaId) => {
  const vistos = new Set();
  const unicos = [];

  for (const item of itens) {
    const maquinaId = getMaquinaId(item);
    if (!maquinaId) {
      unicos.push(item);
      continue;
    }

    const chave = String(maquinaId);
    if (vistos.has(chave)) continue;

    vistos.add(chave);
    unicos.push(item);
  }

  return unicos;
};

export const registrarMaquinaConcluidaNaExecucao = async ({
  maquinaId,
  roteiroId,
  data = new Date(),
  corteDiaMs = 0,
}) => {
  if (!maquinaId || !roteiroId) return null;

  const dataStatus = getDataSaoPaulo(data, corteDiaMs);

  return MovimentacaoStatusDiario.upsert({
    maquina_id: maquinaId,
    roteiro_id: roteiroId,
    data: dataStatus,
    concluida: true,
  });
};

export const obterStatusMaquinasConcluidasDaExecucao = async ({
  roteiroId,
  dataInicio,
  maquinaIds = [],
  corteDiaMs = 0,
}) => {
  if (!roteiroId || !dataInicio) {
    return {
      statusMaquinas: [],
      movimentacoesConsideradas: [],
      maquinasConcluidas: new Set(),
    };
  }

  const statusMaquinas = await MovimentacaoStatusDiario.findAll({
    where: {
      roteiro_id: roteiroId,
      concluida: true,
      data: {
        [Op.gte]: dataInicio,
      },
    },
  });

  const whereMovimentacao = {
    roteiroId,
    dataColeta: {
      [Op.gte]: getInicioDiaSaoPaulo(dataInicio, corteDiaMs),
    },
  };

  if (maquinaIds.length > 0) {
    whereMovimentacao.maquinaId = { [Op.in]: maquinaIds };
  }

  const movimentacoesConsideradas = await Movimentacao.findAll({
    attributes: ["maquinaId", "roteiroId", "dataColeta"],
    where: whereMovimentacao,
  });

  const statusMaquinasUnicas = deduplicarPorMaquina(
    statusMaquinas,
    (item) => item.maquina_id,
  );
  const movimentacoesConsideradasUnicas = deduplicarPorMaquina(
    movimentacoesConsideradas,
    (item) => item.maquinaId,
  );

  const maquinasConcluidas = new Set(
    statusMaquinas.map((item) => item.maquina_id),
  );
  movimentacoesConsideradas.forEach((movimentacao) => {
    if (movimentacao.maquinaId) {
      maquinasConcluidas.add(movimentacao.maquinaId);
    }
  });

  return {
    statusMaquinas: statusMaquinasUnicas,
    movimentacoesConsideradas: movimentacoesConsideradasUnicas,
    maquinasConcluidas,
  };
};
