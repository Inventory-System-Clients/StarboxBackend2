import { WhatsAppAlerta } from "../models/index.js";

// Faixa esperada de "jogadas médias por pelúcia" (R$ jogado por pelúcia
// liberada) por valor de ficha da máquina. Só essas duas por enquanto —
// máquinas com outro valor de ficha não geram esse alerta.
// Mantenha em sync com FAIXAS_MEDIA_POR_VALOR_FICHA em
// frontend2/src/components/MovimentacaoMaquinaForm.jsx (usada pra dar o
// aviso na hora, antes de salvar).
export const FAIXAS_MEDIA_POR_VALOR_FICHA = {
  2: { min: 34, max: 45 },
  5: { min: 65, max: 85 },
};

const TIPO_ALERTA = "media_jogadas_fora_padrao";
const REFERENCIA_TIPO = "maquina";

const arredondar2 = (valor) => Math.round(Number(valor || 0) * 100) / 100;

const ehUsaFichas = (maquina) =>
  maquina?.usaFichas === true ||
  maquina?.usa_fichas === true ||
  maquina?.usaFichas === 1 ||
  maquina?.usa_fichas === 1;

/**
 * Verifica se a leitura recém-registrada está fora da faixa esperada de
 * "jogadas médias por pelúcia" pro valor de ficha da máquina, e mantém o
 * alerta pendente (WhatsAppAlerta) em dia: cria/atualiza se estiver fora,
 * resolve automaticamente se a leitura voltou pra dentro da faixa.
 *
 * Best-effort: quem chama deve envolver em try/catch e não deixar isso
 * quebrar o registro da movimentação em si.
 */
export async function verificarMediaJogadasForaPadrao({
  movimentacao,
  maquina,
  contadorInAnterior,
  contadorOutAnterior,
  usuario,
}) {
  if (!maquina || !ehUsaFichas(maquina)) return null;

  const valorFicha = Number(maquina.valorFicha || 0);
  const faixa = FAIXAS_MEDIA_POR_VALOR_FICHA[valorFicha];
  if (!faixa) return null;

  const contadorIn = Number(movimentacao.contadorIn);
  const contadorOut = Number(movimentacao.contadorOut);
  const inAnterior = Number(contadorInAnterior);
  const outAnterior = Number(contadorOutAnterior);

  if (
    !Number.isFinite(contadorIn) ||
    !Number.isFinite(contadorOut) ||
    !Number.isFinite(inAnterior) ||
    !Number.isFinite(outAnterior)
  ) {
    return null;
  }

  const diferencaIn = Math.max(0, contadorIn - inAnterior);
  const quantidadeSaiu = Math.max(0, contadorOut - outAnterior);

  // Sem pelúcia liberada nessa leitura não dá pra avaliar "por pelúcia" —
  // não mexe em nenhum alerta existente.
  if (quantidadeSaiu <= 0) return null;

  const saldo = diferencaIn * valorFicha;
  const mediaCalculada = arredondar2(saldo / quantidadeSaiu);
  const dentroDaFaixa =
    mediaCalculada >= faixa.min && mediaCalculada <= faixa.max;

  const alertaExistente = await WhatsAppAlerta.findOne({
    where: {
      tipo: TIPO_ALERTA,
      referenciaTipo: REFERENCIA_TIPO,
      referenciaId: maquina.id,
      status: "pendente",
    },
  });

  if (dentroDaFaixa) {
    if (!alertaExistente) return null;

    await alertaExistente.update({
      status: "enviado",
      metadata: {
        ...alertaExistente.metadata,
        resolvidoAutomaticamente: true,
        resolvidoPor: null,
        resolvidoEm: new Date().toISOString(),
        movimentacaoResolucaoId: movimentacao.id,
      },
    });

    return alertaExistente;
  }

  const direcao = mediaCalculada > faixa.max ? "acima" : "abaixo";
  const limiteViolado = direcao === "acima" ? faixa.max : faixa.min;
  const diferenca = arredondar2(Math.abs(mediaCalculada - limiteViolado));

  const metadataAtualizada = {
    movimentacaoId: movimentacao.id,
    usuarioId: usuario?.id || null,
    usuarioNome: usuario?.nome || null,
    maquinaId: maquina.id,
    maquinaCodigo: maquina.codigo || null,
    maquinaNome: maquina.nome || null,
    lojaId: maquina.lojaId || null,
    valorFicha,
    diferencaIn,
    quantidadeSaiu,
    saldo: arredondar2(saldo),
    mediaCalculada,
    faixaMin: faixa.min,
    faixaMax: faixa.max,
    direcao,
    diferenca,
    dataColeta: movimentacao.dataColeta,
    ocorrencias: (alertaExistente?.metadata?.ocorrencias || 0) + 1,
  };

  const mensagem =
    `Máquina ${maquina.codigo || maquina.id}: jogadas médias por pelúcia ` +
    `fora da faixa esperada (R$${faixa.min.toFixed(2)} a R$${faixa.max.toFixed(2)} ` +
    `pra ficha de R$${valorFicha.toFixed(2)}). Leitura atual: ` +
    `R$${mediaCalculada.toFixed(2)} (${diferenca.toFixed(2)} ${direcao} do limite).`;

  if (alertaExistente) {
    await alertaExistente.update({ mensagem, metadata: metadataAtualizada });
    return alertaExistente;
  }

  return WhatsAppAlerta.create({
    tipo: TIPO_ALERTA,
    mensagem,
    status: "pendente",
    referenciaTipo: REFERENCIA_TIPO,
    referenciaId: maquina.id,
    metadata: metadataAtualizada,
  });
}

/**
 * Lista os alertas pendentes de "jogadas fora da média". Admin/gerenciador
 * vê todos; qualquer outro usuário só vê os que ele mesmo gerou (comparando
 * metadata.usuarioId, já que Movimentacao não tem conceito de "funcionário
 * responsável" — só quem registrou).
 */
export async function listarAlertasMediaFichas({ isAdmin, usuarioId }) {
  const alertas = await WhatsAppAlerta.findAll({
    where: { tipo: TIPO_ALERTA, status: "pendente" },
    order: [["createdAt", "DESC"]],
  });

  const alertasVisiveis = isAdmin
    ? alertas
    : alertas.filter(
        (alerta) => String(alerta.metadata?.usuarioId || "") === String(usuarioId || ""),
      );

  return alertasVisiveis.map((alerta) => ({
    id: alerta.id,
    ...alerta.metadata,
    createdAt: alerta.createdAt,
    updatedAt: alerta.updatedAt,
  }));
}

/**
 * Resolve manualmente um alerta pendente. Admin/gerenciador pode resolver
 * qualquer um; qualquer outro usuário só pode resolver o que ele mesmo
 * registrou (metadata.usuarioId).
 */
export async function resolverAlertaMediaFichas(alertaId, { usuarioId, isAdmin }) {
  const alerta = await WhatsAppAlerta.findOne({
    where: { id: alertaId, tipo: TIPO_ALERTA },
  });

  if (!alerta) {
    const erro = new Error("Alerta não encontrado.");
    erro.status = 404;
    throw erro;
  }

  const donoDoAlerta = String(alerta.metadata?.usuarioId || "") === String(usuarioId || "");
  if (!isAdmin && !donoDoAlerta) {
    const erro = new Error("Sem permissão para resolver este alerta.");
    erro.status = 403;
    throw erro;
  }

  if (alerta.status !== "pendente") {
    return alerta;
  }

  await alerta.update({
    status: "enviado",
    metadata: {
      ...alerta.metadata,
      resolvidoAutomaticamente: false,
      resolvidoPor: usuarioId || null,
      resolvidoEm: new Date().toISOString(),
    },
  });

  return alerta;
}
