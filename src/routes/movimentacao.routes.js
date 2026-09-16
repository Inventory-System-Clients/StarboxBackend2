import express from "express";
import { Movimentacao } from "../models/index.js";
import {
  registrarMovimentacao,
  listarMovimentacoes,
  obterMovimentacao,
  atualizarMovimentacao,
  registrarAbastecimentoExtra,
  listarAbastecimentosExtras,
  buscarAbastecimentosExtras,
  atualizarAbastecimentoExtra,
  deletarAbastecimentoExtra,
  deletarMovimentacao,
  relatorioMovimentacoesDia,
  relatorioLucroTotalDia,
  relatorioComissaoTotalDia,
  atualizarResumoWhatsAppMovimentacao,
  listarLeiturasWhatsAppDaLoja,
} from "../controllers/movimentacaoController.js";
import { autenticar, autorizar, registrarLog } from "../middlewares/auth.js";

const router = express.Router();
// Ocultar justificativa de quebra de ordem
router.patch("/:id/ocultar-justificativa", async (req, res) => {
  try {
    const { id } = req.params;
    const mov = await Movimentacao.findByPk(id);
    if (!mov)
      return res.status(404).json({ error: "Movimentação não encontrada" });
    await mov.update({ status_justificativa: "oculta" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erro ao ocultar justificativa" });
  }
});

router.get("/", autenticar, listarMovimentacoes);

// Relatório routes MUST come before /:id to avoid being caught by the param route
router.get(
  "/relatorio/movimentacoes-dia",
  autenticar,
  relatorioMovimentacoesDia,
);
router.get("/relatorio/lucro-dia", autenticar, relatorioLucroTotalDia);
router.get("/relatorio/comissao-dia", autenticar, relatorioComissaoTotalDia);

// Leituras de um ponto (loja) do roteiro para montar a mensagem de WhatsApp.
// Precisa vir antes de "/:id" para nao ser capturada pela rota de parametro.
router.get(
  "/leituras-whatsapp",
  autenticar,
  listarLeiturasWhatsAppDaLoja,
);

// Busca/edição de lançamentos individuais de abastecimento extra (tela de
// suporte). Precisa vir antes de "/:id" para não ser capturada por ela.
router.get(
  "/abastecimentos-extras",
  autenticar,
  autorizar(["ADMIN"]),
  buscarAbastecimentosExtras,
);
router.put(
  "/abastecimentos-extras/:id",
  autenticar,
  autorizar(["ADMIN"]),
  registrarLog("EDITAR_ABASTECIMENTO_EXTRA", "AbastecimentoExtra"),
  atualizarAbastecimentoExtra,
);
router.delete(
  "/abastecimentos-extras/:id",
  autenticar,
  autorizar(["ADMIN"]),
  registrarLog("DELETAR_ABASTECIMENTO_EXTRA", "AbastecimentoExtra"),
  deletarAbastecimentoExtra,
);

router.get("/:id", autenticar, obterMovimentacao);
router.post(
  "/",
  autenticar,
  registrarLog("REGISTRAR_MOVIMENTACAO", "Movimentacao"),
  registrarMovimentacao,
);
router.put(
  "/:id",
  autenticar,
  registrarLog("EDITAR_MOVIMENTACAO", "Movimentacao"),
  atualizarMovimentacao,
);
router.patch(
  "/:id/abastecimento-extra",
  autenticar,
  registrarLog("ABASTECIMENTO_EXTRA_MOVIMENTACAO", "Movimentacao"),
  registrarAbastecimentoExtra,
);
router.get(
  "/:id/abastecimentos-extras",
  autenticar,
  listarAbastecimentosExtras,
);
router.patch(
  "/:id/resumo-whatsapp",
  autenticar,
  atualizarResumoWhatsAppMovimentacao,
);
router.delete(
  "/:id",
  autenticar,
  autorizar(["ADMIN"]),
  registrarLog("DELETAR_MOVIMENTACAO", "Movimentacao"),
  deletarMovimentacao,
);

export default router;
