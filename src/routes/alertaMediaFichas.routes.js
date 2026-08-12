import { Router } from "express";
import { listarAlertas, resolverAlerta } from "../controllers/alertaMediaFichasController.js";
import { autenticar } from "../middlewares/auth.js";

const router = Router();

// Sem autorizar(...) por papel: quem vê o quê e quem pode resolver é
// decidido dentro do controller/service, porque esse alerta precisa
// aparecer também pra funcionário (não só admin/gerenciador).
router.use(autenticar);

router.get("/", listarAlertas);
router.post("/:id/resolver", resolverAlerta);

export default router;
