// Script de diagnóstico/correção do bug de "Valor Esperado" descrito para o
// cliente: calcularEsperadoComHistorico() (src/services/fluxoCaixaCalculoService.js)
// calcula o valor esperado como o delta bruto do contador IN/OUT da máquina,
// SEM multiplicar pelo valorFicha (preço em R$ de cada ficha). Esse valor
// bugado foi salvo em `valor_esperado_movimentacao.valor_esperado`, que é a
// tabela que os relatórios somam em "Valor Esperado (Fluxo de Caixa)".
//
// Este script recalcula, registro a registro, o valor que a fórmula (ainda
// não corrigida) produziria hoje e compara com o que está salvo:
//   - Se bater (dentro de 1 centavo) => o registro veio do caminho com bug
//     (delta_in_direto / delta_out_direto). Valor corrigido = delta * valorFicha
//     da máquina.
//   - Se não bater => o registro provavelmente veio do fallback
//     `movimentacao.valorFaturado` (que já multiplica fichas * valorFicha
//     corretamente, ver movimentacaoController.js:709-712) ou foi alterado
//     manualmente depois. Não mexemos nesses — só reportamos para checagem manual.
//
// NÃO toca em `fluxo_caixa.valor_esperado` (tabela de conferência manual do
// admin, ver MINI_PROMPT_VALOR_ESPERADO_EDITAVEL.md) — só corrige
// `valor_esperado_movimentacao`, que é a fonte dos relatórios.
//
// Uso:
//   node scripts/backfill-valor-esperado-fichas.js                 (dry-run, tudo)
//   node scripts/backfill-valor-esperado-fichas.js --loja <lojaId> (dry-run, 1 loja)
//   node scripts/backfill-valor-esperado-fichas.js --inicio 2026-09-01 --fim 2026-09-16
//   node scripts/backfill-valor-esperado-fichas.js --commit         (aplica as mudanças)
//
// Rode primeiro SEM --commit e confira o resumo antes de aplicar. Sempre faça
// backup/snapshot do banco antes de rodar com --commit em produção.

import { sequelize } from "../src/database/connection.js";
import {
  Movimentacao,
  Maquina,
  Loja,
  ValorEsperadoMovimentacao,
} from "../src/models/index.js";
import { Op } from "sequelize";
import { calcularEsperadoMovimentacaoRetirada } from "../src/services/fluxoCaixaCalculoService.js";

const TOLERANCIA_CENTAVOS = 0.01;

const parseArgs = (argv) => {
  const args = { commit: false, loja: null, inicio: null, fim: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--commit") args.commit = true;
    else if (arg === "--loja") args.loja = argv[++i];
    else if (arg === "--inicio") args.inicio = argv[++i];
    else if (arg === "--fim") args.fim = argv[++i];
  }
  return args;
};

const arredondar2 = (valor) => Number(Number(valor || 0).toFixed(2));

const formatarMoeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

async function main() {
  const { commit, loja, inicio, fim } = parseArgs(process.argv.slice(2));

  console.log(
    `Modo: ${commit ? "COMMIT (vai gravar no banco)" : "DRY-RUN (só relatório, nada é gravado)"}`,
  );
  if (loja) console.log(`Filtro loja: ${loja}`);
  if (inicio || fim) console.log(`Filtro período: ${inicio || "-"} a ${fim || "-"}`);

  const where = {};
  if (loja) where.lojaId = loja;
  if (inicio || fim) {
    where.dataColeta = {};
    if (inicio) where.dataColeta[Op.gte] = new Date(`${inicio}T00:00:00-03:00`);
    if (fim) where.dataColeta[Op.lte] = new Date(`${fim}T23:59:59-03:00`);
  }

  const registros = await ValorEsperadoMovimentacao.findAll({
    where,
    include: [
      {
        model: Loja,
        as: "loja",
        attributes: ["id", "nome"],
      },
    ],
    order: [["dataColeta", "ASC"]],
  });

  console.log(`\n${registros.length} registro(s) de valor_esperado_movimentacao encontrados.\n`);

  let totalCorrigidos = 0;
  let totalIgnorados = 0;
  let somaAntiga = 0;
  let somaNova = 0;
  const porLoja = new Map();
  const paraCorrigir = [];
  const paraRevisar = [];

  for (const registro of registros) {
    const movimentacaoInstance = await Movimentacao.findByPk(registro.movimentacaoId, {
      include: [{ model: Maquina, as: "maquina", attributes: ["id", "valorFicha", "codigo", "nome"] }],
    });

    if (!movimentacaoInstance || !movimentacaoInstance.maquina) {
      paraRevisar.push({
        motivo: "Movimentação ou máquina não encontrada",
        registroId: registro.id,
        movimentacaoId: registro.movimentacaoId,
      });
      totalIgnorados += 1;
      continue;
    }

    // Igual ao padrão usado em fluxoCaixaController.js: converte pra JSON
    // antes de repassar, pra evitar depender de getters de instância do
    // Sequelize dentro de calcularEsperadoComHistorico.
    const movimentacao = movimentacaoInstance.toJSON();
    const valorFicha = Number(movimentacao.maquina.valorFicha || 0);

    const calculo = await calcularEsperadoMovimentacaoRetirada({
      movimentacaoAtual: movimentacao,
      valorFicha, // não usado internamente hoje (é o bug) — repassado por paridade
      permitirFallbackDeltaOut: false,
    });

    const valorAtualSalvo = Number(registro.valorEsperado || 0);
    const deltaBruto = calculo.valorEsperadoCalculado;

    const vemDoCaminhoComBug =
      deltaBruto !== null &&
      Math.abs(deltaBruto - valorAtualSalvo) <= TOLERANCIA_CENTAVOS;

    if (!vemDoCaminhoComBug) {
      paraRevisar.push({
        motivo:
          deltaBruto === null
            ? "Sem delta de contador calculável hoje (provavelmente veio do fallback valorFaturado, já correto)"
            : "Valor salvo não bate com o delta bruto recalculado — pode já estar correto ou editado manualmente",
        registroId: registro.id,
        movimentacaoId: registro.movimentacaoId,
        maquina: movimentacao.maquina.codigo || movimentacao.maquina.nome,
        valorAtualSalvo,
        deltaBrutoRecalculado: deltaBruto,
      });
      totalIgnorados += 1;
      continue;
    }

    const valorCorrigido = arredondar2(deltaBruto * valorFicha);
    somaAntiga += valorAtualSalvo;
    somaNova += valorCorrigido;
    totalCorrigidos += 1;

    const lojaNome = registro.loja?.nome || registro.lojaId;
    if (!porLoja.has(lojaNome)) porLoja.set(lojaNome, { antiga: 0, nova: 0, qtd: 0 });
    const agLoja = porLoja.get(lojaNome);
    agLoja.antiga += valorAtualSalvo;
    agLoja.nova += valorCorrigido;
    agLoja.qtd += 1;

    paraCorrigir.push({
      id: registro.id,
      movimentacaoId: registro.movimentacaoId,
      maquina: movimentacao.maquina.codigo || movimentacao.maquina.nome,
      valorFicha,
      deltaBruto,
      valorAntigo: valorAtualSalvo,
      valorNovo: valorCorrigido,
    });
  }

  console.log("=== Resumo por loja (registros a corrigir) ===");
  for (const [nome, ag] of porLoja.entries()) {
    console.log(
      `${nome}: ${ag.qtd} leitura(s) | ${formatarMoeda(ag.antiga)} -> ${formatarMoeda(ag.nova)} (dif. ${formatarMoeda(ag.nova - ag.antiga)})`,
    );
  }

  console.log("\n=== Total ===");
  console.log(`Corrigíveis: ${totalCorrigidos}`);
  console.log(`Ignorados (revisar manualmente se necessário): ${totalIgnorados}`);
  console.log(`Soma antiga: ${formatarMoeda(somaAntiga)}`);
  console.log(`Soma nova:   ${formatarMoeda(somaNova)}`);
  console.log(`Diferença:   ${formatarMoeda(somaNova - somaAntiga)}`);

  if (paraRevisar.length > 0) {
    console.log(`\n=== ${paraRevisar.length} registro(s) NÃO alterado(s) — revisar manualmente ===`);
    console.table(paraRevisar.slice(0, 30));
    if (paraRevisar.length > 30) {
      console.log(`... e mais ${paraRevisar.length - 30} registro(s).`);
    }
  }

  if (!commit) {
    console.log("\nDry-run concluído. Nada foi gravado. Rode novamente com --commit para aplicar.");
    await sequelize.close();
    return;
  }

  console.log(`\nAplicando ${paraCorrigir.length} correção(ões) em transação...`);
  await sequelize.transaction(async (t) => {
    for (const item of paraCorrigir) {
      await ValorEsperadoMovimentacao.update(
        { valorEsperado: item.valorNovo },
        { where: { id: item.id }, transaction: t },
      );
    }
  });
  console.log("Concluído.");

  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Erro ao rodar backfill:", err);
  await sequelize.close();
  process.exit(1);
});
