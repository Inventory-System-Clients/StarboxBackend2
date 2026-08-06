import express from "express";
import {
  listarGastosFixosPorLoja,
  listarGastosFixosPorLojasEmLote,
  salvarGastosFixosPorLoja,
} from "../controllers/gastosFixosLojaController.js";
import { autenticar, autorizar } from "../middlewares/auth.js";

const router = express.Router();

// Rota específica antes de "/:id" pra não ser confundida com um id de loja.
router.get(
  "/lote",
  autenticar,
  autorizar("ADMIN"),
  listarGastosFixosPorLojasEmLote,
);
router.get("/:id", autenticar, autorizar("ADMIN"), listarGastosFixosPorLoja);
router.post("/:id", autenticar, autorizar("ADMIN"), salvarGastosFixosPorLoja);

export default router;