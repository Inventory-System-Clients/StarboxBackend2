import {
  listarAlertasMediaFichas,
  resolverAlertaMediaFichas,
} from "../services/alertaMediaFichasService.js";

const ehAdminLike = (role) => ["ADMIN", "GERENCIADOR"].includes(role);

/**
 * GET /alertas-media-jogadas
 * Lista alertas pendentes de "jogadas médias por pelúcia fora da faixa".
 * Admin/gerenciador vê todos; qualquer outro usuário só vê os que ele
 * mesmo registrou.
 */
export const listarAlertas = async (req, res) => {
  try {
    const alertas = await listarAlertasMediaFichas({
      isAdmin: ehAdminLike(req.usuario?.role),
      usuarioId: req.usuario?.id,
    });
    res.json({ alertas });
  } catch (error) {
    console.error("[AlertaMediaFichas] Erro ao listar alertas:", error);
    res.status(500).json({ error: "Erro ao listar alertas de média fora do padrão" });
  }
};

/**
 * POST /alertas-media-jogadas/:id/resolver
 * Resolve manualmente um alerta pendente. Admin/gerenciador resolve
 * qualquer um; qualquer outro usuário só resolve o que ele mesmo registrou.
 */
export const resolverAlerta = async (req, res) => {
  try {
    const { id } = req.params;
    const alerta = await resolverAlertaMediaFichas(id, {
      usuarioId: req.usuario?.id,
      isAdmin: ehAdminLike(req.usuario?.role),
    });
    res.json({ message: "Alerta resolvido", alerta });
  } catch (error) {
    console.error("[AlertaMediaFichas] Erro ao resolver alerta:", error);
    res.status(error.status || 500).json({
      error: error.message || "Erro ao resolver alerta de média fora do padrão",
    });
  }
};
