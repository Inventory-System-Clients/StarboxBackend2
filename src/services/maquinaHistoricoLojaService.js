import { MaquinaHistoricoLoja } from "../models/index.js";

// Maquinas cadastradas antes do historico existir nao possuem nenhuma linha.
// Nesse caso registra o ponto informado desde a data de cadastro da maquina.
export const garantirHistoricoInicial = async ({
  maquina,
  lojaId = maquina.lojaId,
  transaction,
} = {}) => {
  const existente = await MaquinaHistoricoLoja.count({
    where: { maquinaId: maquina.id },
    transaction,
  });

  if (existente > 0) return;

  await MaquinaHistoricoLoja.create(
    {
      maquinaId: maquina.id,
      lojaId,
      dataEntrada: maquina.createdAt || new Date(),
    },
    { transaction },
  );
};

export const registrarEntradaNoPonto = async ({
  maquinaId,
  lojaId,
  usuarioId = null,
  transaction,
} = {}) => {
  return MaquinaHistoricoLoja.create(
    {
      maquinaId,
      lojaId,
      usuarioId,
      dataEntrada: new Date(),
    },
    { transaction },
  );
};

export const registrarTrocaDePonto = async ({
  maquina,
  lojaIdAnterior,
  lojaIdNovo,
  usuarioId = null,
  transaction,
} = {}) => {
  if (!lojaIdNovo || lojaIdNovo === lojaIdAnterior) return;

  await garantirHistoricoInicial({
    maquina,
    lojaId: lojaIdAnterior,
    transaction,
  });

  const agora = new Date();
  await MaquinaHistoricoLoja.update(
    { dataSaida: agora },
    {
      where: { maquinaId: maquina.id, dataSaida: null },
      transaction,
    },
  );

  await registrarEntradaNoPonto({
    maquinaId: maquina.id,
    lojaId: lojaIdNovo,
    usuarioId,
    transaction,
  });
};
