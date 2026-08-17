// Considera "movimentação/leitura" para efeito do aviso de dias sem movimentação
// apenas quando o relógio da máquina foi usado (contador_in ou contador_out
// preenchidos). Abastecimentos feitos por funcionário abastecedor sem leitura
// de contador não contam como visita ao ponto.
const movimentacaoUsouContadores = (mov) =>
  (mov.contadorIn !== null && mov.contadorIn !== undefined) ||
  (mov.contadorOut !== null && mov.contadorOut !== undefined);

// --- DIAS SEM MOVIMENTAÇÃO POR LOJA NO ROTEIRO ---
export const roteiroDiasSemMovimentacao = async (req, res) => {
  try {
    const { roteiroId, dataInicio, dataFim } = req.query;
    if (!roteiroId || !dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "roteiroId, dataInicio e dataFim são obrigatórios" });
    }
    const roteiro = await Roteiro.findByPk(roteiroId, {
      include: [{ model: Loja, as: "lojas", attributes: ["id", "nome"] }],
    });
    if (!roteiro) {
      return res.status(404).json({ error: "Roteiro não encontrado" });
    }
    const lojas = roteiro.lojas || [];
    const inicio = new Date(`${dataInicio}T00:00:00`);
    const fim = new Date(`${dataFim}T23:59:59`);
    // Gerar lista de dias do período
    const diasPeriodo = [];
    let d = new Date(inicio);
    while (d <= fim) {
      diasPeriodo.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    const lojasResp = [];
    for (const loja of lojas) {
      // Buscar movimentações da loja no período
      const movimentacoes = await Movimentacao.findAll({
        where: {
          dataColeta: { [Op.between]: [inicio, fim] },
        },
        include: [
          {
            association: "maquina",
            where: { lojaId: loja.id },
            attributes: [],
          },
        ],
        raw: true,
      });
      // Mapear dias com movimentação (só conta quem usou contador/relógio)
      const diasComMov = new Set();
      for (const mov of movimentacoes) {
        if (mov.dataColeta && movimentacaoUsouContadores(mov)) {
          diasComMov.add(new Date(mov.dataColeta).toISOString().slice(0, 10));
        }
      }
      const diasSemMovimentacao = diasPeriodo.filter(
        (dia) => !diasComMov.has(dia),
      );
      lojasResp.push({ id: loja.id, nome: loja.nome, diasSemMovimentacao });
    }
    res.json({ lojas: lojasResp });
  } catch (error) {
    console.error("[roteiroDiasSemMovimentacao] Erro:", error);
    res.status(500).json({ error: "Erro ao buscar dias sem movimentação" });
  }
};
import { Roteiro, Loja } from "../models/index.js";
// --- RELATÓRIO DE ROTEIRO ---
export const relatorioRoteiro = async (req, res) => {
  try {
    const { roteiroId, dataInicio, dataFim } = req.query;
    if (!roteiroId || !dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "roteiroId, dataInicio e dataFim são obrigatórios" });
    }

    const paraNumero = (valor) => {
      const n = Number(valor);
      return Number.isFinite(n) ? n : 0;
    };

    const arredondar2 = (valor) => Number(paraNumero(valor).toFixed(2));

    const resolverValorUnitarioSaida = (detalheProduto) => {
      const custoUnitarioMov = paraNumero(detalheProduto?.custoUnitario);
      if (custoUnitarioMov > 0) return custoUnitarioMov;

      const valorUnitarioMov = paraNumero(detalheProduto?.valorUnitario);
      if (valorUnitarioMov > 0) return valorUnitarioMov;

      const precoCadastro = paraNumero(detalheProduto?.produto?.preco);
      if (precoCadastro > 0) return precoCadastro;

      return paraNumero(detalheProduto?.produto?.custoUnitario);
    };

    const adicionarProdutoSaida = (mapa, detalheProduto) => {
      const quantidade = paraNumero(detalheProduto?.quantidadeSaiu);
      if (quantidade <= 0) return;

      const produto = detalheProduto?.produto || {};
      const produtoId = detalheProduto?.produtoId || produto?.id;
      if (!produtoId) return;

      const key = String(produtoId);
      if (!mapa[key]) {
        mapa[key] = {
          produtoId: key,
          id: key,
          nome: produto?.nome || "Produto",
          codigo: produto?.codigo || "S/C",
          emoji: produto?.emoji || null,
          quantidade: 0,
          valorTotalBruto: 0,
          preco: paraNumero(produto?.preco),
          custoUnitario: paraNumero(produto?.custoUnitario),
        };
      }

      const valorUnitario = resolverValorUnitarioSaida(detalheProduto);
      mapa[key].quantidade += quantidade;
      mapa[key].valorTotalBruto += quantidade * valorUnitario;
    };

    const mapearProdutosSaida = (mapa) =>
      Object.values(mapa)
        .map((item) => {
          const quantidade = paraNumero(item.quantidade);
          const valorTotal = arredondar2(item.valorTotalBruto);
          const valorUnitario =
            quantidade > 0 ? arredondar2(valorTotal / quantidade) : 0;

          return {
            produtoId: item.produtoId,
            id: item.id,
            nome: item.nome,
            codigo: item.codigo,
            emoji: item.emoji,
            quantidade,
            valorUnitario,
            valorTotal,
            preco: item.preco,
            custoUnitario: item.custoUnitario,
          };
        })
        .sort(
          (a, b) =>
            b.quantidade - a.quantidade ||
            a.nome.localeCompare(b.nome, "pt-BR"),
        );

    const calcularCustoProdutos = (produtos = []) =>
      arredondar2(
        produtos.reduce((acc, produto) => {
          if (produto?.valorTotal !== undefined) {
            return acc + paraNumero(produto.valorTotal);
          }
          return (
            acc +
            paraNumero(produto?.quantidade) *
              paraNumero(produto?.custoUnitario || produto?.valorUnitario)
          );
        }, 0),
      );

    // Buscar roteiro e lojas
    const roteiro = await Roteiro.findByPk(roteiroId, {
      include: [{ model: Loja, as: "lojas", attributes: ["id", "nome"] }],
    });
    if (!roteiro) {
      return res.status(404).json({ error: "Roteiro não encontrado" });
    }
    const lojas = roteiro.lojas || [];
    const inicio = new Date(`${dataInicio}T00:00:00`);
    const fim = new Date(`${dataFim}T23:59:59`);

    // Gerar lista de dias do período
    const diasPeriodo = [];
    let d = new Date(inicio);
    while (d <= fim) {
      diasPeriodo.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }

    const respostasFinanceiras = await Promise.allSettled(
      lojas.map((loja) =>
        obterRelatorioImpressaoInterno({
          lojaId: loja.id,
          dataInicio,
          dataFim,
          roteiroId,
        }),
      ),
    );

    const relatorioFinanceiroPorLoja = new Map(
      lojas.map((loja, index) => {
        const resposta = respostasFinanceiras[index];
        if (resposta?.status === "fulfilled") {
          return [loja.id, resposta.value];
        }
        return [loja.id, null];
      }),
    );

    // Novos agregadores globais
    let totaisRoteiro = {
      fichas: 0,
      sairam: 0,
      abastecidas: 0,
      movimentacoes: 0,
    };
    const produtosSairamMap = {};
    const produtosEntraramMap = {};
    const lojasResp = [];
    const totaisFinanceirosRota = {
      lucroBrutoTotal: 0,
      produtosSairamTotal: 0,
      custoProdutosTotal: 0,
      custoFixoTotal: 0,
      custoQuebraCaixaTotal: 0,
      custoVariavelTotal: 0,
      custoTotal: 0,
      lucroLiquidoTotal: 0,
      valorEsperadoTotal: 0,
    };

    // Busca movimentações e máquinas de TODAS as lojas do roteiro de uma vez
    // (antes: 1 findAll de movimentações + 1 getMaquinas POR LOJA dentro do
    // loop abaixo — N lojas viravam N*2 queries pesadas sequenciais).
    const lojaIds = lojas.map((loja) => loja.id);

    const todasMovimentacoesRoteiro = lojaIds.length
      ? await Movimentacao.findAll({
          where: {
            dataColeta: { [Op.between]: [inicio, fim] },
          },
          include: [
            {
              association: "maquina",
              where: { lojaId: { [Op.in]: lojaIds } },
              attributes: ["id", "codigo", "nome", "valorFicha", "lojaId"],
            },
            {
              association: "detalhesProdutos",
              include: [
                {
                  association: "produto",
                  attributes: [
                    "id",
                    "nome",
                    "codigo",
                    "emoji",
                    "preco",
                    "custoUnitario",
                  ],
                },
              ],
            },
            {
              association: "produtoNaMaquina",
              required: false,
              attributes: [
                "id",
                "nome",
                "codigo",
                "emoji",
                "preco",
                "custoUnitario",
              ],
            },
          ],
        })
      : [];

    const movimentacoesPorLoja = new Map();
    for (const mov of todasMovimentacoesRoteiro) {
      const lojaIdMov = mov.maquina?.lojaId;
      if (!lojaIdMov) continue;
      if (!movimentacoesPorLoja.has(lojaIdMov)) {
        movimentacoesPorLoja.set(lojaIdMov, []);
      }
      movimentacoesPorLoja.get(lojaIdMov).push(mov);
    }

    const todasMaquinasRoteiro = lojaIds.length
      ? await Maquina.findAll({
          where: { lojaId: { [Op.in]: lojaIds } },
          attributes: ["id", "nome", "codigo", "lojaId"],
        })
      : [];

    const maquinasPorLoja = new Map();
    for (const maquina of todasMaquinasRoteiro) {
      if (!maquinasPorLoja.has(maquina.lojaId)) {
        maquinasPorLoja.set(maquina.lojaId, []);
      }
      maquinasPorLoja.get(maquina.lojaId).push(maquina);
    }

    for (const loja of lojas) {
      // Movimentações da loja no período, já carregadas em lote acima
      const movimentacoes = movimentacoesPorLoja.get(loja.id) || [];

      // Mapear máquinas da loja
      const maquinasMap = {};
      const produtosSairamLoja = {};
      const produtosEntraramLoja = {};
      for (const mov of movimentacoes) {
        const maq = mov.maquina;
        if (!maq) continue;
        if (!maquinasMap[maq.id]) {
          maquinasMap[maq.id] = {
            maquina: {
              id: maq.id,
              codigo: maq.codigo,
              nome: maq.nome,
              valorFicha: maq.valorFicha,
            },
            totais: {
              fichas: 0,
              produtosSairam: 0,
              produtosEntraram: 0,
              movimentacoes: 0,
              dinheiro: 0,
              cartaoPix: 0,
            },
            produtosSairam: {},
            produtosEntraram: {},
          };
        }
        const m = maquinasMap[maq.id];
        m.totais.fichas += mov.fichas || 0;
        m.totais.produtosSairam += mov.sairam || 0;
        m.totais.produtosEntraram += mov.abastecidas || 0;
        m.totais.movimentacoes++;

        let quantidadeSaiuDetalhadaMov = 0;

        // Produtos por máquina, loja e agregação global
        for (const dp of mov.detalhesProdutos || []) {
          const prod = dp.produto;
          if (!prod) continue;
          // Saíram
          if (dp.quantidadeSaiu > 0) {
            quantidadeSaiuDetalhadaMov += paraNumero(dp.quantidadeSaiu);
            adicionarProdutoSaida(m.produtosSairam, dp);
            adicionarProdutoSaida(produtosSairamLoja, dp);
            adicionarProdutoSaida(produtosSairamMap, dp);
          }
          // Entraram
          if (dp.quantidadeAbastecida > 0) {
            if (!m.produtosEntraram[prod.id])
              m.produtosEntraram[prod.id] = {
                ...prod.dataValues,
                quantidade: 0,
              };
            m.produtosEntraram[prod.id].quantidade += dp.quantidadeAbastecida;
            if (!produtosEntraramLoja[prod.id])
              produtosEntraramLoja[prod.id] = {
                ...prod.dataValues,
                quantidade: 0,
              };
            produtosEntraramLoja[prod.id].quantidade += dp.quantidadeAbastecida;
            if (!produtosEntraramMap[prod.id])
              produtosEntraramMap[prod.id] = {
                ...prod.dataValues,
                quantidade: 0,
              };
            produtosEntraramMap[prod.id].quantidade += dp.quantidadeAbastecida;
          }
        }

        const quantidadeSemDetalhe = Math.max(
          0,
          paraNumero(mov.sairam) - quantidadeSaiuDetalhadaMov,
        );

        if (quantidadeSemDetalhe > 0 && mov.produtoNaMaquina?.id) {
          const detalheProdutoNaMaquina = {
            produtoId: mov.produtoNaMaquina.id,
            produto: mov.produtoNaMaquina,
            quantidadeSaiu: quantidadeSemDetalhe,
            custoUnitario: mov.produtoNaMaquina.custoUnitario,
            valorUnitario: mov.produtoNaMaquina.preco,
          };

          adicionarProdutoSaida(m.produtosSairam, detalheProdutoNaMaquina);
          adicionarProdutoSaida(produtosSairamLoja, detalheProdutoNaMaquina);
          adicionarProdutoSaida(produtosSairamMap, detalheProdutoNaMaquina);
        }
      }

      // Somar totais da loja
      const totais = {
        fichas: 0,
        sairam: 0,
        abastecidas: 0,
        movimentacoes: movimentacoes.length,
      };
      const diasComMov = new Set();
      for (const mov of movimentacoes) {
        totais.fichas += mov.fichas || 0;
        totais.sairam += mov.sairam || 0;
        totais.abastecidas += mov.abastecidas || 0;
        if (mov.dataColeta && movimentacaoUsouContadores(mov)) {
          diasComMov.add(new Date(mov.dataColeta).toISOString().slice(0, 10));
        }
      }
      totaisRoteiro.fichas += totais.fichas;
      totaisRoteiro.sairam += totais.sairam;
      totaisRoteiro.abastecidas += totais.abastecidas;
      totaisRoteiro.movimentacoes += totais.movimentacoes;

      const relatorioLoja = relatorioFinanceiroPorLoja.get(loja.id) || {};
      const totaisLoja = relatorioLoja?.totais || {};
      const produtosSairamFinanceiroLoja = relatorioLoja?.produtosSairam || [];

      const custoProdutosLoja = calcularCustoProdutos(
        produtosSairamFinanceiroLoja,
      );
      const custoFixoLoja = paraNumero(
        totaisLoja.custoFixoPeriodo ?? totaisLoja.gastoFixoTotalPeriodo ?? 0,
      );
      const custoQuebraCaixaLoja = paraNumero(
        totaisLoja.custoQuebraCaixaTotal ??
          totaisLoja.custoQuebraCaixaPeriodo ??
          totaisLoja.quebraCaixaTotal ??
          0,
      );
      const custoVariavelLoja = paraNumero(
        totaisLoja.custoVariavelPeriodo ??
          totaisLoja.gastoVariavelTotalPeriodo ??
          0,
      );

      const dinheiroLoja = paraNumero(totaisLoja.valorDinheiroLoja);
      const dinheiroMaquinas = paraNumero(totaisLoja.valorDinheiroMaquinas);
      const cartaoPixLoja = paraNumero(totaisLoja.valorCartaoPixLoja);
      const cartaoPixMaquinas = paraNumero(
        totaisLoja.valorCartaoPixMaquinasBruto,
      );
      const lucroBrutoLoja = paraNumero(
        totaisLoja.faturamentoBrutoConsolidado ??
          totaisLoja.valorBrutoConsolidadoLojaMaquinas ??
          dinheiroLoja + dinheiroMaquinas + cartaoPixLoja + cartaoPixMaquinas,
      );
      const custoTotalLoja = arredondar2(
        custoProdutosLoja +
          custoFixoLoja +
          custoQuebraCaixaLoja +
          custoVariavelLoja,
      );
      const lucroLiquidoLoja = arredondar2(lucroBrutoLoja - custoTotalLoja);

      const produtosSairamLojaDetalhados =
        mapearProdutosSaida(produtosSairamLoja);
      const produtosSairamLojaTotal = arredondar2(
        produtosSairamLojaDetalhados.reduce(
          (acc, item) => acc + paraNumero(item.quantidade),
          0,
        ),
      );
      const custoProdutosSairamLoja = arredondar2(
        produtosSairamLojaDetalhados.reduce(
          (acc, item) => acc + paraNumero(item.valorTotal),
          0,
        ),
      );

      const valorEsperadoLoja = paraNumero(
        totaisLoja.valorEsperadoContadores ?? 0,
      );

      totaisFinanceirosRota.lucroBrutoTotal += lucroBrutoLoja;
      totaisFinanceirosRota.produtosSairamTotal += produtosSairamLojaTotal;
      totaisFinanceirosRota.custoProdutosTotal += custoProdutosSairamLoja;
      totaisFinanceirosRota.custoFixoTotal += custoFixoLoja;
      totaisFinanceirosRota.custoQuebraCaixaTotal += custoQuebraCaixaLoja;
      totaisFinanceirosRota.custoVariavelTotal += custoVariavelLoja;
      totaisFinanceirosRota.custoTotal += custoTotalLoja;
      totaisFinanceirosRota.lucroLiquidoTotal += lucroLiquidoLoja;
      totaisFinanceirosRota.valorEsperadoTotal += valorEsperadoLoja;

      // Dias sem movimentação
      const diasSemMovimentacao = diasPeriodo.filter(
        (dia) => !diasComMov.has(dia),
      );

      // Formatar máquinas para resposta
      const maquinas = Object.values(maquinasMap).map((m) => ({
        maquina: m.maquina,
        totais: m.totais,
        produtosSairam: mapearProdutosSaida(m.produtosSairam),
        produtosEntraram: Object.values(m.produtosEntraram),
      }));

      // Todas as máquinas da loja (mesmo sem movimentação), já carregadas em lote acima
      const todasMaquinas = maquinasPorLoja.get(loja.id) || [];

      // Mapear movimentações por dia e máquina (só conta quem usou contador/relógio)
      const movPorDiaMaquina = {};
      for (const mov of movimentacoes) {
        if (!mov.maquina || !mov.dataColeta) continue;
        if (!movimentacaoUsouContadores(mov)) continue;
        const dia = new Date(mov.dataColeta).toISOString().slice(0, 10);
        movPorDiaMaquina[dia] = movPorDiaMaquina[dia] || new Set();
        movPorDiaMaquina[dia].add(mov.maquina.id);
      }

      // Para cada dia, listar máquinas sem movimentação
      const maquinasNaoFeitas = diasPeriodo.map((dia) => {
        const maquinasFeitas = movPorDiaMaquina[dia] || new Set();
        const maquinasSemMov = todasMaquinas.filter(
          (m) => !maquinasFeitas.has(m.id),
        );
        return {
          data: dia,
          maquinas: maquinasSemMov.map((m) => ({
            id: m.id,
            nome: m.nome,
            codigo: m.codigo,
          })),
        };
      });

      lojasResp.push({
        id: loja.id,
        lojaId: loja.id,
        nome: loja.nome,
        loja: { id: loja.id, nome: loja.nome },
        totais,
        resumoFinanceiro: {
          lucroBruto: arredondar2(lucroBrutoLoja),
          produtosSairamTotal: produtosSairamLojaTotal,
          custoProdutosTotal: custoProdutosSairamLoja,
          custoFixoTotal: arredondar2(custoFixoLoja),
          custoQuebraCaixaTotal: arredondar2(custoQuebraCaixaLoja),
          custoVariavelTotal: arredondar2(custoVariavelLoja),
          custoTotal: arredondar2(custoTotalLoja),
          lucroLiquidoTotal: arredondar2(lucroLiquidoLoja),
        },
        diasSemMovimentacao,
        maquinas,
        produtosSairam: produtosSairamLojaDetalhados,
        produtosEntraram: Object.values(produtosEntraramLoja),
        maquinasNaoFeitas,
      });
    }

    const existeProdutoRealConsolidado = Object.keys(produtosSairamMap).some(
      (id) => id !== "__SEM_DETALHE__",
    );

    if (!existeProdutoRealConsolidado && totaisRoteiro.sairam > 0) {
      const quantidadeConsolidadaSemDetalhe = paraNumero(totaisRoteiro.sairam);
      if (quantidadeConsolidadaSemDetalhe > 0) {
        adicionarProdutoSaida(produtosSairamMap, {
          produtoId: "__SEM_DETALHE__",
          produto: {
            id: "__SEM_DETALHE__",
            nome: "Produto não detalhado",
            codigo: "SEM-DETALHE",
            emoji: "📦",
            preco: 0,
            custoUnitario: 0,
          },
          quantidadeSaiu: quantidadeConsolidadaSemDetalhe,
          custoUnitario: 0,
          valorUnitario: 0,
        });
      }
    }

    // Consolidar arrays globais
    const produtosSairam = mapearProdutosSaida(produtosSairamMap);
    const produtosEntraram = Object.values(produtosEntraramMap).sort(
      (a, b) => b.quantidade - a.quantidade,
    );

    const resumoRoteiroConsolidado = {
      totais: {
        lucroBrutoTotal: arredondar2(totaisFinanceirosRota.lucroBrutoTotal),
        produtosSairamTotal: arredondar2(
          produtosSairam.reduce(
            (acc, item) => acc + paraNumero(item.quantidade),
            0,
          ),
        ),
        custoProdutosTotal: arredondar2(
          produtosSairam.reduce(
            (acc, item) => acc + paraNumero(item.valorTotal),
            0,
          ),
        ),
        custoFixoTotal: arredondar2(totaisFinanceirosRota.custoFixoTotal),
        custoQuebraCaixaTotal: arredondar2(
          totaisFinanceirosRota.custoQuebraCaixaTotal,
        ),
        custoVariavelTotal: arredondar2(
          totaisFinanceirosRota.custoVariavelTotal,
        ),
        valorEsperadoTotal: arredondar2(
          totaisFinanceirosRota.valorEsperadoTotal,
        ),
        custoTotal: 0,
        lucroLiquidoTotal: 0,
        lucroEsperadoTotal: 0,
      },
      produtosSairam,
    };

    resumoRoteiroConsolidado.totais.custoTotal = arredondar2(
      resumoRoteiroConsolidado.totais.custoProdutosTotal +
        resumoRoteiroConsolidado.totais.custoFixoTotal +
        resumoRoteiroConsolidado.totais.custoQuebraCaixaTotal +
        resumoRoteiroConsolidado.totais.custoVariavelTotal,
    );

    resumoRoteiroConsolidado.totais.lucroLiquidoTotal = arredondar2(
      resumoRoteiroConsolidado.totais.lucroBrutoTotal -
        resumoRoteiroConsolidado.totais.custoTotal,
    );

    resumoRoteiroConsolidado.totais.lucroEsperadoTotal = arredondar2(
      resumoRoteiroConsolidado.totais.valorEsperadoTotal -
        resumoRoteiroConsolidado.totais.custoTotal,
    );

    res.json({
      tipo: "roteiro",
      roteiro: { id: roteiro.id, nome: roteiro.nome },
      periodo: { inicio: dataInicio, fim: dataFim },
      totaisRoteiro,
      resumoRoteiroConsolidado,
      produtosSairam,
      produtosEntraram,
      lojas: lojasResp,
    });
  } catch (error) {
    console.error("[RelatorioRoteiro] Erro:", error);
    res.status(500).json({ error: "Erro ao gerar relatório do roteiro" });
  }
};
// src/controllers/relatorioController.js
import { Sequelize, Op, fn, col, literal } from "sequelize";
import {
  Movimentacao,
  MovimentacaoProduto,
  Maquina,
  Produto,
  AlertaIgnorado,
  FluxoCaixa,
  ValorEsperadoMovimentacao,
} from "../models/index.js";
import {
  getUltimaMovimentacaoPorMaquina,
  getInatividadePorLoja,
} from "../utils/movimentacaoQueries.js";

// --- DASHBOARD GERAL ---
export const dashboardRelatorio = async (req, res) => {
  let lucroAtual = 0;
  let lucroAnterior = 0;
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    // 1. Configuração de Datas
    const fim = dataFim ? new Date(`${dataFim}T23:59:59`) : new Date();
    const inicio = dataInicio
      ? new Date(`${dataInicio}T00:00:00`)
      : new Date(new Date().setDate(fim.getDate() - 30));

    // --- CÁLCULO DE COMPARAÇÃO DE LUCRO (mês atual vs anterior) ---
    try {
      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mesAtual = hoje.getMonth();
      const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
      const anoAnterior = mesAtual === 0 ? ano - 1 : ano;
      const diaAtual = hoje.getDate();
      // Antes: 1 findAll de movimentações + 1 findAll de itens vendidos POR DIA
      // (até 31 iterações), chegando a 60+ queries por mês comparado. Agora: 1
      // findAll de movimentações + 1 findAll de itens vendidos para o mês
      // inteiro, com a mesma lógica por linha aplicada em memória.
      async function somaLucro(ano, mes, dias) {
        const inicio = new Date(ano, mes, 1, 0, 0, 0, 0);
        const fim = new Date(ano, mes, dias, 23, 59, 59, 999);
        const whereMov = { dataColeta: { [Op.between]: [inicio, fim] } };
        const whereMaquina = {};
        if (lojaId) whereMaquina.lojaId = lojaId;

        try {
          const movimentacoes = await Movimentacao.findAll({
            where: whereMov,
            include: [
              {
                model: Maquina,
                as: "maquina",
                where: whereMaquina,
                attributes: ["valorFicha", "lojaId", "comissaoLojaPercentual"],
              },
              {
                model: FluxoCaixa,
                as: "fluxoCaixa",
                required: false,
                attributes: ["valorRetirado", "conferencia"],
              },
            ],
          });

          let receitaBruta = 0;
          let comissaoTotal = 0;
          for (const m of movimentacoes) {
            const fichas = parseInt(m.fichas) || 0;
            const valorFicha = parseFloat(m.maquina?.valorFicha || 0);
            const dinheiro = parseFloat(m.quantidade_notas_entrada || 0);
            const pix = parseFloat(m.valor_entrada_maquininha_pix || 0);

            let valorFichas = fichas * valorFicha;
            // Se é retirada de dinheiro e tem valor conferido no fluxo de caixa, usa esse valor
            if (
              m.retiradaDinheiro &&
              m.fluxoCaixa &&
              m.fluxoCaixa.valorRetirado !== null
            ) {
              valorFichas = parseFloat(m.fluxoCaixa.valorRetirado);
            }

            const receitaMaquina = valorFichas + dinheiro + pix;
            receitaBruta += receitaMaquina;
            const percentual = parseFloat(
              m.maquina?.comissaoLojaPercentual || 0,
            );
            comissaoTotal += (receitaMaquina * percentual) / 100;
          }

          // Custo dos produtos saídos no período
          const itensVendidos = await MovimentacaoProduto.findAll({
            attributes: ["quantidadeSaiu"],
            include: [
              {
                model: Produto,
                as: "produto",
                attributes: ["custoUnitario"],
              },
              {
                model: Movimentacao,
                attributes: [],
                where: whereMov,
                include: [
                  {
                    model: Maquina,
                    as: "maquina",
                    where: lojaId ? { lojaId } : undefined,
                    attributes: [],
                  },
                ],
              },
            ],
            raw: true,
            nest: true,
          });
          const custoProdutos = itensVendidos.reduce((acc, item) => {
            const qtd = item.quantidadeSaiu || 0;
            const custo = parseFloat(item.produto?.custoUnitario || 0);
            return acc + qtd * custo;
          }, 0);

          return receitaBruta - custoProdutos - comissaoTotal;
        } catch (errPeriodo) {
          console.error(
            `[comparacaoLucro] Erro no período ${mes + 1}/${ano}:`,
            errPeriodo,
          );
          return 0;
        }
      }
      lucroAtual = await somaLucro(ano, mesAtual, diaAtual);
      lucroAnterior = await somaLucro(anoAnterior, mesAnterior, diaAtual);
      if (isNaN(lucroAtual)) lucroAtual = 0;
      if (isNaN(lucroAnterior)) lucroAnterior = 0;
    } catch (errComp) {
      console.error("[comparacaoLucro] Erro geral:", errComp);
      lucroAtual = 0;
      lucroAnterior = 0;
    }

    // 2. Filtros
    const whereMovimentacao = {
      dataColeta: { [Op.between]: [inicio, fim] },
    };

    const whereMaquina = {};
    if (lojaId) whereMaquina.lojaId = lojaId;

    // --- QUERY 1: TOTAIS GERAIS (in-memory para compatibilidade com valorFaturado nulo) ---
    const allMovs = await Movimentacao.findAll({
      where: whereMovimentacao,
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: [
            "id",
            "nome",
            "valorFicha",
            "capacidadePadrao",
            "comissaoLojaPercentual",
          ],
        },
        {
          model: FluxoCaixa,
          as: "fluxoCaixa",
          required: false,
          attributes: ["valorRetirado", "conferencia"],
        },
      ],
    });

    let totalFichasQtd = 0,
      totalFichasValor = 0,
      totalDinheiro = 0,
      totalPix = 0,
      totalSairam = 0;
    for (const m of allMovs) {
      const fqtd = parseInt(m.fichas) || 0;
      const vf = parseFloat(m.maquina?.valorFicha || 0);
      totalFichasQtd += fqtd;

      // Se é retirada de dinheiro e tem valor conferido no fluxo de caixa, usa esse valor
      if (
        m.retiradaDinheiro &&
        m.fluxoCaixa &&
        m.fluxoCaixa.valorRetirado !== null
      ) {
        totalFichasValor += parseFloat(m.fluxoCaixa.valorRetirado);
      } else {
        totalFichasValor += fqtd * vf;
      }

      totalDinheiro += parseFloat(m.quantidade_notas_entrada || 0);
      totalPix += parseFloat(m.valor_entrada_maquininha_pix || 0);
      totalSairam += parseInt(m.sairam) || 0;
    }

    const faturamento = parseFloat(
      (totalFichasValor + totalDinheiro + totalPix).toFixed(2),
    );
    const saidas = totalSairam;
    const fichas = totalFichasQtd;
    const dinheiro = parseFloat(totalDinheiro.toFixed(2));
    const pix = parseFloat(totalPix.toFixed(2));

    // --- QUERY 2: CUSTO TOTAL ---
    const itensVendidos = await MovimentacaoProduto.findAll({
      attributes: ["quantidadeSaiu"],
      include: [
        {
          model: Produto,
          as: "produto",
          attributes: ["custoUnitario"],
        },
        {
          model: Movimentacao,
          attributes: [],
          where: whereMovimentacao,
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: whereMaquina,
              attributes: [],
            },
          ],
        },
      ],
      raw: true,
      nest: true,
    });

    const custoTotal = itensVendidos.reduce((acc, item) => {
      const qtd = item.quantidadeSaiu || 0;
      const custo = parseFloat(item.produto?.custoUnitario || 0);
      return acc + qtd * custo;
    }, 0);

    const lucro = faturamento - custoTotal;

    // --- QUERY 3: GRÁFICO FINANCEIRO (in-memory a partir de allMovs) ---
    const timelineMap = {};
    for (const m of allMovs) {
      if (!m.dataColeta) continue;
      const dia = new Date(m.dataColeta).toISOString().slice(0, 10);
      if (!timelineMap[dia]) timelineMap[dia] = 0;
      const fqtd = parseInt(m.fichas) || 0;
      const vf = parseFloat(m.maquina?.valorFicha || 0);
      timelineMap[dia] +=
        fqtd * vf +
        parseFloat(m.quantidade_notas_entrada || 0) +
        parseFloat(m.valor_entrada_maquininha_pix || 0);
    }
    const timelineRaw = Object.entries(timelineMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, fat]) => ({
        data,
        faturamento: parseFloat(fat.toFixed(2)),
      }));

    // --- QUERY 4: PERFORMANCE POR MÁQUINA (in-memory a partir de allMovs) ---
    const perfMap = {};
    for (const m of allMovs) {
      const maq = m.maquina;
      if (!maq) continue;
      if (!perfMap[maq.id]) {
        perfMap[maq.id] = {
          id: maq.id,
          nome: maq.nome,
          capacidadePadrao: maq.capacidadePadrao,
          faturamento: 0,
        };
      }
      const fqtd = parseInt(m.fichas) || 0;
      const vf = parseFloat(maq.valorFicha || 0);
      perfMap[maq.id].faturamento +=
        fqtd * vf +
        parseFloat(m.quantidade_notas_entrada || 0) +
        parseFloat(m.valor_entrada_maquininha_pix || 0);
    }

    const perfMaquinaIds = Object.keys(perfMap);
    const ultimasMovimentacoesPorMaquina =
      await getUltimaMovimentacaoPorMaquina(perfMaquinaIds);
    const performanceMaquinas = perfMaquinaIds.map((maquinaId) => {
      const p = perfMap[maquinaId];
      const ultimaMov = ultimasMovimentacoesPorMaquina.get(maquinaId);
      const estoqueAtual = ultimaMov ? Number(ultimaMov.totalPos) : 0;
      const capacidade = p.capacidadePadrao || 100;
      return {
        nome: p.nome,
        faturamento: parseFloat(p.faturamento.toFixed(2)),
        ocupacao: ((estoqueAtual / capacidade) * 100).toFixed(1),
      };
    });

    // --- QUERY 5: RANKING DE PRODUTOS ---
    const rankingRaw = await MovimentacaoProduto.findAll({
      attributes: [
        [col("produto.nome"), "nome"],
        [fn("SUM", col("quantidadeSaiu")), "quantidade"],
      ],
      include: [
        { model: Produto, as: "produto", attributes: ["id", "nome"] },
        {
          model: Movimentacao,
          attributes: [],
          where: whereMovimentacao,
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: whereMaquina,
              attributes: [],
            },
          ],
        },
      ],
      group: ["produto.id", "produto.nome"],
      order: [[fn("SUM", col("quantidadeSaiu")), "DESC"]],
      limit: 10,
      raw: true,
    });

    const rankingProdutos = rankingRaw.map((r) => ({
      nome: r.nome || "Desconhecido",
      quantidade: parseInt(r.quantidade || 0),
    }));

    // --- RESPOSTA FINAL ---
    res.json({
      totais: {
        faturamento,
        lucro,
        saidas,
        fichas,
        dinheiro,
        pix,
      },
      comparacaoLucro: {
        lucroAtual: parseFloat(lucroAtual.toFixed(2)),
        lucroAnterior: parseFloat(lucroAnterior.toFixed(2)),
      },
      graficoFinanceiro: timelineRaw.map((t) => ({
        data: t.data,
        faturamento: t.faturamento,
        custo: 0,
      })),
      performanceMaquinas,
      rankingProdutos,
    });
  } catch (error) {
    console.error("Erro Crítico no Dashboard:", error);
    res.status(500).json({
      error: "Erro interno ao processar dashboard.",
      details: error.message,
    });
  }
};

// --- ALERTAS DE INCONSISTÊNCIA (CORRIGIDO) ---
export const buscarAlertasDeInconsistencia = async (req, res) => {
  console.log("--- INICIANDO ALERTAS DE INCONSISTÊNCIA ---");
  try {
    // const usuarioId = req.usuario?.id; // Pode ser usado se necessário no futuro
    const maquinas = await Maquina.findAll({ where: { ativo: true } });
    const alertas = [];

    // Buscar alertas ignorados globalmente
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));

    // Antes: 1 findAll (últimas 2 movimentações) POR MÁQUINA dentro do loop.
    // Agora: 1 findAll para todas as máquinas ativas (janela de 90 dias,
    // suficiente para pegar as 2 últimas de qualquer máquina com uso normal),
    // agrupando as 2 mais recentes por máquina em memória.
    const maquinaIds = maquinas.map((m) => m.id);
    const janelaInicio = new Date();
    janelaInicio.setDate(janelaInicio.getDate() - 90);

    const movimentacoesRecentes = maquinaIds.length
      ? await Movimentacao.findAll({
          where: {
            maquinaId: { [Op.in]: maquinaIds },
            dataColeta: { [Op.gte]: janelaInicio },
          },
          order: [["dataColeta", "DESC"]],
          attributes: [
            "id",
            "maquinaId",
            "contadorIn",
            "contadorOut",
            "fichas",
            "sairam",
            "dataColeta",
          ],
        })
      : [];

    const ultimasDuasPorMaquina = new Map();
    for (const mov of movimentacoesRecentes) {
      const lista = ultimasDuasPorMaquina.get(mov.maquinaId) || [];
      if (lista.length < 2) {
        lista.push(mov);
        ultimasDuasPorMaquina.set(mov.maquinaId, lista);
      }
    }

    for (const maquina of maquinas) {
      const movimentacoes = ultimasDuasPorMaquina.get(maquina.id) || [];

      // Se não houver pelo menos 2 movimentações, pula esta máquina.
      if (movimentacoes.length < 2) {
        continue;
      }

      const atual = movimentacoes[0]; // mais recente
      const anterior = movimentacoes[1];

      // OUT: diferença do campo contadorOut
      const diffOut = (atual.contadorOut || 0) - (anterior.contadorOut || 0);
      const diffIn = (atual.contadorIn || 0) - (anterior.contadorIn || 0);

      const alertaId = `${maquina.id}-${atual.id}`;

      // Pular alertas se a máquina não tem contadores (contador_out é 0 ou null)
      const temContadores =
        atual.contadorOut !== null && atual.contadorOut !== 0;

      // Se a diferença não bate com a quantidade de saída/fichas
      if (
        temContadores &&
        (diffOut !== (atual.sairam || 0) || diffIn !== (atual.fichas || 0)) &&
        !ignoradosSet.has(alertaId)
      ) {
        alertas.push({
          id: alertaId,
          tipo: "inconsistencia_contador",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          contador_out: atual.contadorOut || 0,
          contador_in: atual.contadorIn || 0,
          fichas: atual.fichas,
          sairam: atual.sairam,
          dataMovimentacao: atual.dataColeta,
          mensagem: `Inconsistência detectada: OUT (${diffOut}) esperado ${
            atual.sairam
          }, IN (${diffIn}) esperado ${atual.fichas}.\nOUT registrado: ${
            atual.contadorOut || 0
          } | IN registrado: ${atual.contadorIn || 0} | Fichas: ${
            atual.fichas
          }`,
        });
      }
    }

    res.json({ alertas });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar alertas de movimentação",
      message: error.message,
    });
  }
};

// --- IGNORAR ALERTA ---
export const ignorarAlertaMovimentacao = async (req, res) => {
  try {
    const { id } = req.params; // alertaId
    const usuarioId = req.usuario?.id;
    const { maquinaId } = req.body;
    if (!usuarioId || !maquinaId || !id) {
      return res.status(400).json({ error: "Dados obrigatórios ausentes." });
    }
    await AlertaIgnorado.create({
      alertaId: id,
      maquinaId,
      usuarioId,
    });
    res.json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao ignorar alerta", message: error.message });
  }
};

// --- BALANÇO SEMANAL ---
export const balançoSemanal = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    const fim = dataFim ? new Date(dataFim) : new Date();
    const inicio = dataInicio
      ? new Date(dataInicio)
      : new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);

    const whereMovimentacao = {
      dataColeta: {
        [Op.between]: [inicio, fim],
      },
    };

    const includeMaquina = {
      model: Maquina,
      as: "maquina",
      attributes: ["id", "codigo", "lojaId", "valorFicha"],
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
      ],
    };

    if (lojaId) {
      includeMaquina.where = { lojaId };
    }

    const movimentacoes = await Movimentacao.findAll({
      where: whereMovimentacao,
      include: [
        includeMaquina,
        {
          model: MovimentacaoProduto,
          as: "detalhesProdutos",
          include: [
            {
              model: Produto,
              as: "produto",
              attributes: ["id", "nome", "categoria"],
            },
          ],
        },
      ],
    });

    const totais = movimentacoes.reduce(
      (acc, mov) => {
        const fqtd = mov.fichas || 0;
        const vf = parseFloat(mov.maquina?.valorFicha || 0);
        const dinheiro = parseFloat(mov.quantidade_notas_entrada || 0);
        const cartaoPix = parseFloat(mov.valor_entrada_maquininha_pix || 0);
        const fat = fqtd * vf + dinheiro + cartaoPix;
        acc.totalFichas += fqtd;
        acc.totalFaturamento += fat;
        acc.totalSairam += mov.sairam || 0;
        acc.totalAbastecidas += mov.abastecidas || 0;
        acc.totalDinheiro += dinheiro;
        acc.totalCartaoPix += cartaoPix;
        return acc;
      },
      {
        totalFichas: 0,
        totalFaturamento: 0,
        totalSairam: 0,
        totalAbastecidas: 0,
        totalDinheiro: 0,
        totalCartaoPix: 0,
      },
    );

    totais.mediaFichasPremio =
      totais.totalSairam > 0
        ? (totais.totalFichas / totais.totalSairam).toFixed(2)
        : 0;
    totais.receitaReal = totais.totalDinheiro + totais.totalCartaoPix;

    const produtosMap = {};
    movimentacoes.forEach((mov) => {
      mov.detalhesProdutos?.forEach((dp) => {
        const produtoNome = dp.produto?.nome || "Não especificado";
        if (!produtosMap[produtoNome]) {
          produtosMap[produtoNome] = {
            nome: produtoNome,
            quantidadeSaiu: 0,
            quantidadeAbastecida: 0,
          };
        }
        produtosMap[produtoNome].quantidadeSaiu += dp.quantidadeSaiu || 0;
        produtosMap[produtoNome].quantidadeAbastecida +=
          dp.quantidadeAbastecida || 0;
      });
    });

    const distribuicaoProdutos = Object.values(produtosMap)
      .map((p) => ({
        ...p,
        porcentagem:
          totais.totalSairam > 0
            ? ((p.quantidadeSaiu / totais.totalSairam) * 100).toFixed(2)
            : 0,
      }))
      .sort((a, b) => b.quantidadeSaiu - a.quantidadeSaiu);

    const lojasMap = {};
    movimentacoes.forEach((mov) => {
      const lojaNome = mov.maquina?.loja?.nome || "Não especificado";
      if (!lojasMap[lojaNome]) {
        lojasMap[lojaNome] = {
          nome: lojaNome,
          fichas: 0,
          faturamento: 0,
          sairam: 0,
          abastecidas: 0,
        };
      }
      const fqtdL = mov.fichas || 0;
      const vfL = parseFloat(mov.maquina?.valorFicha || 0);
      lojasMap[lojaNome].fichas += fqtdL;
      lojasMap[lojaNome].faturamento +=
        fqtdL * vfL +
        parseFloat(mov.quantidade_notas_entrada || 0) +
        parseFloat(mov.valor_entrada_maquininha_pix || 0);
      lojasMap[lojaNome].sairam += mov.sairam || 0;
      lojasMap[lojaNome].abastecidas += mov.abastecidas || 0;
    });

    const distribuicaoLojas = Object.values(lojasMap)
      .map((l) => ({
        ...l,
        mediaFichasPremio: l.sairam > 0 ? (l.fichas / l.sairam).toFixed(2) : 0,
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    res.json({
      periodo: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
      totais,
      distribuicaoProdutos,
      distribuicaoLojas,
      totalMovimentacoes: movimentacoes.length,
    });
  } catch (error) {
    console.error("Erro ao gerar balanço semanal:", error);
    res.status(500).json({ error: "Erro ao gerar balanço semanal" });
  }
};

// --- ALERTA DE INATIVIDADE POR LOJA ---
// Lojas sem movimentação e sem retirada de dinheiro há mais de N dias.
// Calculado com 2 queries agregadas (MAX por loja) em vez de baixar todas as
// movimentações/fluxo de caixa do período pro frontend calcular na mão.
export const alertaInatividadeLojas = async (req, res) => {
  try {
    const diasLimite = parseInt(req.query.dias, 10) || 15;
    const diasJanela = parseInt(req.query.diasJanela, 10) || 90;

    const hoje = new Date();
    const dataInicio = new Date(hoje.getTime() - diasJanela * 24 * 60 * 60 * 1000);

    const [{ ultimaMovimentacaoPorLoja, ultimaRetiradaPorLoja }, lojas] =
      await Promise.all([
        getInatividadePorLoja(dataInicio),
        Loja.findAll({
          attributes: ["id", "nome", "isDepositoPrincipal"],
          raw: true,
        }),
      ]);

    const MS_DIA = 24 * 60 * 60 * 1000;
    const lojasComAlerta = lojas
      .filter((loja) => !loja.isDepositoPrincipal)
      .map((loja) => {
        const ultimaMovimentacao = ultimaMovimentacaoPorLoja.get(loja.id) || null;
        const ultimaRetirada = ultimaRetiradaPorLoja.get(loja.id) || null;

        const diasSemMov = ultimaMovimentacao
          ? Math.floor((hoje - new Date(ultimaMovimentacao)) / MS_DIA)
          : 9999;
        const diasSemRetirada = ultimaRetirada
          ? Math.floor((hoje - new Date(ultimaRetirada)) / MS_DIA)
          : 9999;

        return {
          lojaId: loja.id,
          lojaNome: loja.nome,
          ultimaMovimentacao,
          ultimaRetirada,
          diasSemMov,
          diasSemRetirada,
        };
      })
      .filter(
        (loja) => loja.diasSemMov > diasLimite && loja.diasSemRetirada > diasLimite,
      )
      .sort((a, b) => b.diasSemMov - a.diasSemMov);

    res.json({ lojas: lojasComAlerta });
  } catch (error) {
    console.error("Erro ao calcular alerta de inatividade de lojas:", error);
    res.status(500).json({ error: "Erro ao calcular alerta de inatividade de lojas" });
  }
};

// --- ALERTAS DE ESTOQUE ---
export const alertasEstoque = async (req, res) => {
  try {
    const { lojaId } = req.query;
    const whereMaquina = { ativo: true };

    if (lojaId) {
      whereMaquina.lojaId = lojaId;
    }

    const maquinas = await Maquina.findAll({
      where: whereMaquina,
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
      ],
    });

    const alertas = [];

    // Antes: 1 findOne (última movimentação) POR MÁQUINA dentro do loop.
    // Agora: 1 query batched via DISTINCT ON para todas as máquinas de uma vez.
    const ultimasMovimentacoesPorMaquina = await getUltimaMovimentacaoPorMaquina(
      maquinas.map((m) => m.id),
    );

    for (const maquina of maquinas) {
      const ultimaMovimentacao = ultimasMovimentacoesPorMaquina.get(maquina.id);

      const estoqueAtual = ultimaMovimentacao
        ? Number(ultimaMovimentacao.totalPos)
        : 0;
      const estoqueMinimo =
        (maquina.capacidadePadrao * maquina.percentualAlertaEstoque) / 100;
      const percentualAtual = (estoqueAtual / maquina.capacidadePadrao) * 100;

      if (estoqueAtual < estoqueMinimo) {
        alertas.push({
          maquina: {
            id: maquina.id,
            codigo: maquina.codigo,
            nome: maquina.nome,
            loja: maquina.loja?.nome,
          },
          estoqueAtual,
          capacidadePadrao: maquina.capacidadePadrao,
          estoqueMinimo,
          percentualAtual: percentualAtual.toFixed(2),
          percentualAlerta: maquina.percentualAlertaEstoque,
          nivelAlerta:
            percentualAtual < 10
              ? "CRÍTICO"
              : percentualAtual < 20
                ? "ALTO"
                : "MÉDIO",
          ultimaAtualizacao: ultimaMovimentacao?.dataColeta,
        });
      }
    }

    alertas.sort(
      (a, b) => parseFloat(a.percentualAtual) - parseFloat(b.percentualAtual),
    );

    res.json({
      totalAlertas: alertas.length,
      alertas,
    });
  } catch (error) {
    console.error("Erro ao buscar alertas de estoque:", error);
    res.status(500).json({ error: "Erro ao buscar alertas de estoque" });
  }
};

// --- ALERTAS DE LEITURA ANTIGA ---
// Máquinas cuja última leitura (movimentação/coleta) foi feita há mais de N
// dias — mesmo padrão de alertasEstoque, reaproveitando a mesma query batched
// de última movimentação por máquina.
export const alertasLeituraAntiga = async (req, res) => {
  try {
    const { lojaId } = req.query;
    const diasLimite = parseInt(req.query.dias, 10) || 15;
    const whereMaquina = { ativo: true };

    if (lojaId) {
      whereMaquina.lojaId = lojaId;
    }

    const maquinas = await Maquina.findAll({
      where: whereMaquina,
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
      ],
    });

    const ultimasMovimentacoesPorMaquina = await getUltimaMovimentacaoPorMaquina(
      maquinas.map((m) => m.id),
    );

    const MS_DIA = 24 * 60 * 60 * 1000;
    const hoje = new Date();

    const alertas = maquinas
      .map((maquina) => {
        const ultimaMovimentacao = ultimasMovimentacoesPorMaquina.get(maquina.id);
        const ultimaLeitura = ultimaMovimentacao?.dataColeta || null;
        const diasSemLeitura = ultimaLeitura
          ? Math.floor((hoje - new Date(ultimaLeitura)) / MS_DIA)
          : 9999;

        return {
          maquina: {
            id: maquina.id,
            codigo: maquina.codigo,
            nome: maquina.nome,
            loja: maquina.loja?.nome,
          },
          ultimaLeitura,
          diasSemLeitura,
        };
      })
      .filter((item) => item.diasSemLeitura > diasLimite)
      .sort((a, b) => b.diasSemLeitura - a.diasSemLeitura);

    res.json({
      totalAlertas: alertas.length,
      alertas,
    });
  } catch (error) {
    console.error("Erro ao buscar alertas de leitura antiga:", error);
    res.status(500).json({ error: "Erro ao buscar alertas de leitura antiga" });
  }
};

// --- PERFORMANCE MÁQUINAS ---
export const performanceMaquinas = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    const fim = dataFim ? new Date(dataFim) : new Date();
    const inicio = dataInicio
      ? new Date(dataInicio)
      : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);

    const whereMovimentacao = {
      dataColeta: {
        [Op.between]: [inicio, fim],
      },
    };

    const whereMaquina = {};
    if (lojaId) {
      whereMaquina.lojaId = lojaId;
    }

    const movimPerf = await Movimentacao.findAll({
      where: whereMovimentacao,
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: ["id", "codigo", "nome", "tipo", "valorFicha"],
          include: [
            {
              model: Loja,
              as: "loja",
              attributes: ["id", "nome"],
            },
          ],
        },
      ],
    });

    // Agrupar em memória por máquina
    const perfMaqMap = {};
    for (const m of movimPerf) {
      const maq = m.maquina;
      if (!maq) continue;
      if (!perfMaqMap[maq.id]) {
        perfMaqMap[maq.id] = {
          maquina: maq,
          totalMovimentacoes: 0,
          totalFichas: 0,
          totalFaturamento: 0,
          totalSairam: 0,
          fichasPremioSum: 0,
        };
      }
      const e = perfMaqMap[maq.id];
      const fqtd = parseInt(m.fichas) || 0;
      const vf = parseFloat(maq.valorFicha || 0);
      e.totalMovimentacoes++;
      e.totalFichas += fqtd;
      e.totalFaturamento +=
        fqtd * vf +
        parseFloat(m.quantidade_notas_entrada || 0) +
        parseFloat(m.valor_entrada_maquininha_pix || 0);
      e.totalSairam += parseInt(m.sairam) || 0;
      if (m.sairam > 0) e.fichasPremioSum += fqtd / m.sairam;
    }

    const resultado = Object.values(perfMaqMap)
      .sort((a, b) => b.totalFaturamento - a.totalFaturamento)
      .map((p) => ({
        maquina: {
          id: p.maquina.id,
          codigo: p.maquina.codigo,
          nome: p.maquina.nome,
          tipo: p.maquina.tipo,
          loja: p.maquina.loja?.nome,
        },
        metricas: {
          totalMovimentacoes: p.totalMovimentacoes,
          totalFichas: p.totalFichas,
          totalFaturamento: parseFloat(p.totalFaturamento.toFixed(2)),
          totalSairam: p.totalSairam,
          mediaFichasPremio:
            p.totalMovimentacoes > 0
              ? parseFloat(
                  (p.fichasPremioSum / p.totalMovimentacoes).toFixed(2),
                )
              : 0,
        },
      }));

    res.json({
      periodo: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
      performance: resultado,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório de performance:", error);
    res.status(500).json({ error: "Erro ao gerar relatório de performance" });
  }
};

// --- RESUMO DE MÁQUINAS DO PONTO (valor esperado, última leitura, média por
// pelúcia) --- Alimenta o card de cada máquina na tela de detalhes do ponto.
// Sem autorizar("ADMIN") de propósito: essa tela já é acessível a qualquer
// usuário autenticado, mesmo padrão de /maquinas/:id/estoque.
export const resumoMaquinasLoja = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    if (!lojaId) {
      return res.status(400).json({ error: "lojaId é obrigatório" });
    }

    const fim = dataFim ? new Date(`${dataFim}T23:59:59.999`) : new Date();
    const inicio = dataInicio
      ? new Date(`${dataInicio}T00:00:00`)
      : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);

    const maquinas = await Maquina.findAll({
      where: { lojaId },
      attributes: ["id", "codigo", "nome", "valorFicha", "usaFichas"],
    });

    if (maquinas.length === 0) {
      return res.json({
        periodo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
        resumo: [],
      });
    }

    const maquinaIds = maquinas.map((m) => m.id);

    const [movimentacoes, valoresEsperados, ultimasMovimentacoesPorMaquina] =
      await Promise.all([
        Movimentacao.findAll({
          where: {
            dataColeta: { [Op.between]: [inicio, fim] },
            retiradaEstoque: false,
          },
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: { id: { [Op.in]: maquinaIds } },
              attributes: ["id", "valorFicha", "usaFichas"],
            },
          ],
        }),
        ValorEsperadoMovimentacao.findAll({
          where: {
            maquinaId: { [Op.in]: maquinaIds },
            dataColeta: { [Op.between]: [inicio, fim] },
          },
          attributes: ["maquinaId", "valorEsperado"],
        }),
        getUltimaMovimentacaoPorMaquina(maquinaIds),
      ]);

    const agregadoPorMaquina = {};
    for (const maquinaId of maquinaIds) {
      agregadoPorMaquina[maquinaId] = {
        totalFichas: 0,
        totalSairam: 0,
        totalFaturamento: 0,
        totalMovimentacoes: 0,
        valorEsperadoPeriodo: 0,
      };
    }

    for (const mov of movimentacoes) {
      const maquinaId = mov.maquina?.id;
      if (!maquinaId || !agregadoPorMaquina[maquinaId]) continue;
      const e = agregadoPorMaquina[maquinaId];
      const fqtd = parseInt(mov.fichas) || 0;
      const vf = parseFloat(mov.maquina?.valorFicha || 0);
      e.totalMovimentacoes += 1;
      e.totalFichas += fqtd;
      e.totalSairam += parseInt(mov.sairam) || 0;
      e.totalFaturamento +=
        fqtd * vf +
        parseFloat(mov.quantidade_notas_entrada || 0) +
        parseFloat(mov.valor_entrada_maquininha_pix || 0);
    }

    for (const registro of valoresEsperados) {
      const maquinaId = registro.maquinaId;
      if (!agregadoPorMaquina[maquinaId]) continue;
      agregadoPorMaquina[maquinaId].valorEsperadoPeriodo += Number(
        registro.valorEsperado || 0,
      );
    }

    const MS_DIA = 24 * 60 * 60 * 1000;
    const hoje = new Date();

    const resumo = maquinas.map((maquina) => {
      const e = agregadoPorMaquina[maquina.id];
      const usaFichas = maquina.usaFichas === true || maquina.usaFichas === 1;
      const valorFicha = Number(maquina.valorFicha || 0);

      const mediaRPorPelucia =
        usaFichas && e.totalSairam > 0
          ? Number(((e.totalFichas * valorFicha) / e.totalSairam).toFixed(2))
          : null;

      const ultimaMovimentacao = ultimasMovimentacoesPorMaquina.get(maquina.id);
      const ultimaLeitura = ultimaMovimentacao?.dataColeta || null;
      const diasSemLeitura = ultimaLeitura
        ? Math.floor((hoje - new Date(ultimaLeitura)) / MS_DIA)
        : 9999;

      return {
        maquinaId: maquina.id,
        maquinaCodigo: maquina.codigo,
        maquinaNome: maquina.nome,
        valorEsperadoPeriodo: Number(e.valorEsperadoPeriodo.toFixed(2)),
        totalSairamPeriodo: e.totalSairam,
        totalFaturamentoPeriodo: Number(e.totalFaturamento.toFixed(2)),
        totalMovimentacoesPeriodo: e.totalMovimentacoes,
        mediaRPorPelucia,
        ultimaLeitura,
        diasSemLeitura,
      };
    });

    res.json({
      periodo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
      resumo,
    });
  } catch (error) {
    console.error("Erro ao gerar resumo de máquinas do ponto:", error);
    res
      .status(500)
      .json({ error: "Erro ao gerar resumo de máquinas do ponto" });
  }
};

// --- RELATÓRIO DE IMPRESSÃO (RESTAURADO E CORRIGIDO) ---
const obterRelatorioImpressaoInterno = async ({
  lojaId,
  dataInicio,
  dataFim,
  roteiroId,
}) =>
  new Promise((resolve, reject) => {
    const reqMock = {
      query: {
        lojaId,
        dataInicio,
        dataFim,
        roteiroId,
      },
    };

    const resMock = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) {
          const erro = new Error(payload?.error || "Erro ao gerar relatório");
          erro.status = this.statusCode;
          erro.payload = payload;
          reject(erro);
          return;
        }
        resolve(payload);
      },
    };

    relatorioImpressao(reqMock, resMock).catch(reject);
  });

const gerarConsolidadoTodasLojas = async ({ dataInicio, dataFim }) => {
  const lojas = await Loja.findAll({ where: { ativo: true }, raw: true });

  if (!lojas.length) {
    const erro = new Error("Nenhuma loja ativa encontrada");
    erro.status = 404;
    throw erro;
  }

  const respostas = await Promise.allSettled(
    lojas.map((loja) =>
      obterRelatorioImpressaoInterno({
        lojaId: loja.id,
        dataInicio,
        dataFim,
      }),
    ),
  );

  const relatoriosPorLoja = respostas
    .map((resposta, index) => {
      if (resposta.status !== "fulfilled") return null;
      return {
        loja: lojas[index],
        dados: resposta.value,
      };
    })
    .filter(Boolean);

  if (!relatoriosPorLoja.length) {
    const erro = new Error(
      "Não foi possível gerar o relatório consolidado para o período selecionado.",
    );
    erro.status = 404;
    throw erro;
  }

  const lojasSemDados = respostas
    .map((resposta, index) => {
      if (resposta.status === "fulfilled") return null;
      return lojas[index]?.nome || `Loja ${index + 1}`;
    })
    .filter(Boolean);

  const produtosMap = new Map();

  const rankingLojas = relatoriosPorLoja.map(({ loja, dados }) => {
    const totais = dados?.totais || {};

    const custoProdutosCalculado = (dados?.produtosSairam || []).reduce(
      (acc, produto) =>
        acc +
        Number(produto.quantidade || 0) *
          Number(produto.custoUnitario || produto.valorUnitario || 0),
      0,
    );

    const custoProdutos = Number(
      totais.custoProdutosTotal ?? custoProdutosCalculado,
    );
    const custoFixo = Number(
      totais.custoFixoPeriodo ?? totais.gastoFixoTotalPeriodo ?? 0,
    );
    const custoVariavel = Number(
      totais.custoVariavelPeriodo ?? totais.gastoVariavelTotalPeriodo ?? 0,
    );
    const taxaDeCartao = Number(totais.taxaDeCartao ?? 0);
    const custoTotal = Number(
      totais.gastoTotalPeriodo ??
        custoProdutos + custoFixo + custoVariavel + taxaDeCartao,
    );

    const dinheiroLoja = Number(totais.valorDinheiroLoja || 0);
    const cartaoPixLojaBruto = Number(totais.valorCartaoPixLoja || 0);

    const dinheiroMaquinas = Number(
      totais.valorDinheiroMaquinas ??
        (dados?.maquinas || []).reduce(
          (acc, maquina) => acc + Number(maquina?.totais?.dinheiro || 0),
          0,
        ),
    );

    const cartaoPixMaquinasBruto = Number(
      totais.valorCartaoPixMaquinasBruto ??
        (dados?.maquinas || []).reduce(
          (acc, maquina) => acc + Number(maquina?.totais?.cartaoPix || 0),
          0,
        ),
    );

    const cartaoPixMaquinasLiquido = Number(
      totais.valorCartaoPixMaquinasLiquido ?? cartaoPixMaquinasBruto,
    );

    const cartaoPixLojaLiquido = Number(
      totais.valorCartaoPixLiquidoLoja ??
        Math.max(cartaoPixLojaBruto - taxaDeCartao, 0),
    );

    const dinheiro = dinheiroLoja + dinheiroMaquinas;
    const cartaoPix = cartaoPixLojaBruto + cartaoPixMaquinasBruto;
    const cartaoPixLiquido = cartaoPixLojaLiquido + cartaoPixMaquinasLiquido;

    const lucroBruto = Number(
      totais.valorBrutoConsolidadoLojaMaquinas ?? dinheiro + cartaoPix,
    );

    const lucroLiquido = Number(
      totais.valorLiquidoConsolidadoLojaMaquinas ??
        dinheiro + cartaoPixLiquido - custoTotal,
    );

    const percentualTaxaCartaoMedia = Number(
      cartaoPix > 0 ? (taxaDeCartao / cartaoPix) * 100 : 0,
    );

    const fichas = Number(totais.fichas || 0);
    const produtosSairam = Number(totais.produtosSairam || 0);
    const produtosEntraram = Number(totais.produtosEntraram || 0);
    const faturamentoBrutoTicket = Number(
      totais.faturamentoBrutoConsolidado ?? lucroBruto,
    );
    const saidasPremio = Number(totais.saidasPremioTotal ?? produtosSairam);
    const ticketPorPremio = Number(
      saidasPremio > 0 ? faturamentoBrutoTicket / saidasPremio : 0,
    );
    const valorEsperado = Number(totais.valorEsperadoContadores ?? 0);

    (dados?.produtosSairam || []).forEach((produto) => {
      const id = String(produto.id ?? produto.codigo ?? produto.nome);
      const existente = produtosMap.get(id);
      const quantidade = Number(produto.quantidade || 0);

      if (!existente) {
        produtosMap.set(id, {
          id,
          nome: produto.nome || "Produto",
          codigo: produto.codigo || "S/C",
          emoji: produto.emoji || "📦",
          quantidade,
        });
        return;
      }

      existente.quantidade += quantidade;
    });

    return {
      lojaId: loja?.id,
      lojaNome: dados?.loja?.nome || loja?.nome || "Loja",
      lucroBruto,
      lucroLiquido,
      custoTotal,
      custoVariavel,
      custoProdutos,
      custoFixo,
      taxaDeCartao,
      dinheiro,
      cartaoPix,
      cartaoPixLiquido,
      percentualTaxaCartaoMedia,
      fichas,
      produtosSairam,
      produtosEntraram,
      faturamentoBrutoTicket,
      saidasPremio,
      ticketPorPremio,
      valorEsperado,
    };
  });

  const totais = rankingLojas.reduce(
    (acc, loja) => {
      acc.lucroBrutoTotal += loja.lucroBruto;
      acc.lucroLiquidoTotal += loja.lucroLiquido;
      acc.custoTotal += loja.custoTotal;
      acc.custoVariavelTotal += loja.custoVariavel;
      acc.custoProdutosTotal += loja.custoProdutos;
      acc.custoFixoTotal += loja.custoFixo;
      acc.taxaDeCartaoTotal += loja.taxaDeCartao;
      acc.dinheiroTotal += loja.dinheiro;
      acc.cartaoPixTotal += loja.cartaoPix;
      acc.cartaoPixLiquidoTotal += loja.cartaoPixLiquido;
      acc.fichasTotal += loja.fichas;
      acc.produtosSairamTotal += loja.produtosSairam;
      acc.produtosEntraramTotal += loja.produtosEntraram;
      acc.faturamentoBrutoTicketTotal += loja.faturamentoBrutoTicket;
      acc.saidasPremioTotal += loja.saidasPremio;
      acc.somaPercentualTaxaPonderado +=
        loja.percentualTaxaCartaoMedia * loja.cartaoPix;
      acc.somaBasePercentualTaxa += loja.cartaoPix;
      acc.valorEsperadoTotal += loja.valorEsperado;
      return acc;
    },
    {
      lucroBrutoTotal: 0,
      lucroLiquidoTotal: 0,
      custoTotal: 0,
      custoVariavelTotal: 0,
      custoProdutosTotal: 0,
      custoFixoTotal: 0,
      taxaDeCartaoTotal: 0,
      dinheiroTotal: 0,
      cartaoPixTotal: 0,
      cartaoPixLiquidoTotal: 0,
      fichasTotal: 0,
      produtosSairamTotal: 0,
      produtosEntraramTotal: 0,
      faturamentoBrutoTicketTotal: 0,
      saidasPremioTotal: 0,
      somaPercentualTaxaPonderado: 0,
      somaBasePercentualTaxa: 0,
      valorEsperadoTotal: 0,
    },
  );

  totais.percentualTaxaCartaoMediaTotal = Number(
    (totais.somaBasePercentualTaxa > 0
      ? totais.somaPercentualTaxaPonderado / totais.somaBasePercentualTaxa
      : 0
    ).toFixed(2),
  );
  totais.ticketPorPremioConsolidado = Number(
    (totais.saidasPremioTotal > 0
      ? totais.faturamentoBrutoTicketTotal / totais.saidasPremioTotal
      : 0
    ).toFixed(2),
  );
  totais.lucroEsperadoTotal = Number(
    (totais.valorEsperadoTotal - totais.custoTotal).toFixed(2),
  );
  delete totais.somaPercentualTaxaPonderado;
  delete totais.somaBasePercentualTaxa;

  const rankingLojasComParticipacao = rankingLojas.map((loja) => ({
    ...loja,
    participacaoLucroBruto:
      totais.lucroBrutoTotal > 0
        ? (loja.lucroBruto / totais.lucroBrutoTotal) * 100
        : 0,
  }));

  const rankingProdutos = Array.from(produtosMap.values())
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 15);

  const rankingLucroBrutoLojas = [...rankingLojasComParticipacao]
    .sort((a, b) => b.lucroBruto - a.lucroBruto)
    .slice(0, 10);

  const rankingLucroLojas = [...rankingLojasComParticipacao]
    .sort((a, b) => b.lucroLiquido - a.lucroLiquido)
    .slice(0, 10);

  const rankingGastoLojas = [...rankingLojasComParticipacao]
    .sort((a, b) => b.custoTotal - a.custoTotal)
    .slice(0, 10);

  const rankingTicketPremioLojas = [...rankingLojasComParticipacao]
    .filter((a) => Number(a.saidasPremio || 0) > 0)
    .sort(
      (a, b) => Number(b.ticketPorPremio || 0) - Number(a.ticketPorPremio || 0),
    )
    .slice(0, 10);

  const participacaoLojas = [...rankingLojasComParticipacao]
    .sort((a, b) => b.participacaoLucroBruto - a.participacaoLucroBruto)
    .slice(0, 10);

  const gastosFixosPorLoja = [...rankingLojasComParticipacao]
    .map((loja) => ({
      lojaNome: loja.lojaNome,
      custoFixo: Number(loja.custoFixo || 0),
    }))
    .filter((item) => item.custoFixo > 0)
    .sort((a, b) => b.custoFixo - a.custoFixo);

  const totalRecebimentos = totais.dinheiroTotal + totais.cartaoPixLiquidoTotal;

  return {
    tipo: "todas-lojas",
    periodo: {
      inicio: dataInicio,
      fim: dataFim,
    },
    totais,
    destaques: {
      lojaMaiorLucro: rankingLucroLojas[0] || null,
      lojaMaiorGasto: rankingGastoLojas[0] || null,
      lojaMaiorParticipacao: participacaoLojas[0] || null,
      produtoMaisSaiu: rankingProdutos[0] || null,
      lojaMaiorTicketPremio: rankingTicketPremioLojas[0] || null,
    },
    graficos: {
      rankingLucroBrutoLojas,
      rankingLucroLojas,
      rankingGastoLojas,
      rankingTicketPremioLojas,
      participacaoLojas,
      rankingProdutos,
      pagamento: [
        {
          metodo: "Dinheiro",
          valor: totais.dinheiroTotal,
          percentual:
            totalRecebimentos > 0
              ? (totais.dinheiroTotal / totalRecebimentos) * 100
              : 0,
        },
        {
          metodo: "Cartão / Pix (Líquido)",
          valor: totais.cartaoPixLiquidoTotal,
          percentual:
            totalRecebimentos > 0
              ? (totais.cartaoPixLiquidoTotal / totalRecebimentos) * 100
              : 0,
        },
      ],
      gastosFixosPorLoja,
    },
    lojasSemDados,
    lojasComDados: relatoriosPorLoja.length,
  };
};

// --- RELATÓRIO DE IMPRESSÃO (RESTAURADO E CORRIGIDO) ---
// Attributes/include compartilhados entre o relatório de uma loja e o
// relatório em lote (várias lojas de uma vez) — `whereMaquina` é o único
// ponto que muda entre os dois (uma loja específica vs. IN de várias).
const ATRIBUTOS_PRODUTO_RELATORIO = [
  "id",
  "nome",
  "codigo",
  "emoji",
  "preco",
  "custoUnitario",
];

const montarIncludeMovimentacaoRelatorio = (whereMaquina) => [
  {
    model: Maquina,
    as: "maquina",
    where: whereMaquina,
    attributes: ["id", "codigo", "nome", "valorFicha", "lojaId"],
  },
  {
    model: FluxoCaixa,
    as: "fluxoCaixa",
    required: false,
    attributes: ["valorRetirado", "conferencia"],
  },
  {
    model: MovimentacaoProduto,
    as: "detalhesProdutos",
    include: [
      {
        model: Produto,
        as: "produto",
        attributes: ATRIBUTOS_PRODUTO_RELATORIO,
      },
    ],
  },
  {
    model: Produto,
    as: "produtoNaMaquina",
    required: false,
    attributes: ATRIBUTOS_PRODUTO_RELATORIO,
  },
];

// Toda a agregação do relatório de impressão de UMA loja, a partir de
// movimentações já buscadas — usado tanto pelo relatório de loja única
// quanto pelo relatório em lote (que busca as movimentações de todas as
// lojas pedidas em 1 única query e chama esta função pra cada grupo).
const montarRelatorioDeUmaLoja = async ({
  loja,
  movimentacoes,
  periodoInicio,
  periodoFim,
}) => {
    // Sem RegistroDinheiro, os totais financeiros são consolidados pelas
    // movimentações e valores conferidos no fluxo de caixa por máquina.
    let valorTotalLoja = 0;
    let valorDinheiroLoja = 0;
    let valorCartaoPixLoja = 0;

    // Sem lançamento específico da loja, mantém totais da loja zerados e
    // utiliza os totais de máquinas para o consolidado.

    // Calcular totais
    const totalFichas = movimentacoes.reduce(
      (sum, m) => sum + (m.fichas || 0),
      0,
    );
    const totalSairamMovimentacoes = movimentacoes.reduce(
      (sum, m) => sum + (m.sairam || 0),
      0,
    );
    const totalAbastecidas = movimentacoes.reduce(
      (sum, m) => sum + (m.abastecidas || 0),
      0,
    );

    const paraNumero = (valor) => {
      const numero = Number(valor);
      return Number.isFinite(numero) ? numero : 0;
    };

    const arredondar2 = (valor) => Number(paraNumero(valor).toFixed(2));

    const resolverValorUnitarioSaida = (detalheProduto) => {
      const custoUnitarioMov = paraNumero(detalheProduto?.custoUnitario);
      if (custoUnitarioMov > 0) return custoUnitarioMov;

      const valorUnitarioMov = paraNumero(detalheProduto?.valorUnitario);
      if (valorUnitarioMov > 0) return valorUnitarioMov;

      const precoCadastro = paraNumero(detalheProduto?.produto?.preco);
      if (precoCadastro > 0) return precoCadastro;

      return paraNumero(detalheProduto?.produto?.custoUnitario);
    };

    const adicionarProdutoSaida = (mapa, detalheProduto) => {
      const quantidade = paraNumero(detalheProduto?.quantidadeSaiu);
      if (quantidade <= 0) return;

      const produto = detalheProduto?.produto || {};
      const produtoId = detalheProduto?.produtoId || produto?.id;
      if (!produtoId) return;

      const key = String(produtoId);
      if (!mapa[key]) {
        mapa[key] = {
          produtoId: key,
          nome: produto?.nome || "Produto",
          codigo: produto?.codigo || "S/C",
          emoji: produto?.emoji || null,
          preco: paraNumero(produto?.preco),
          custoUnitario: paraNumero(produto?.custoUnitario),
          quantidade: 0,
          valorTotalBruto: 0,
        };
      }

      const valorUnitario = resolverValorUnitarioSaida(detalheProduto);
      mapa[key].quantidade += quantidade;
      mapa[key].valorTotalBruto += quantidade * valorUnitario;
    };

    const mapearProdutosSaidaDetalhados = (mapa) =>
      Object.values(mapa)
        .map((item) => {
          const quantidade = paraNumero(item.quantidade);
          const valorTotal = arredondar2(item.valorTotalBruto);
          const valorUnitario =
            quantidade > 0 ? arredondar2(valorTotal / quantidade) : 0;

          return {
            produtoId: item.produtoId,
            id: item.produtoId,
            nome: item.nome,
            codigo: item.codigo,
            emoji: item.emoji,
            quantidade,
            valorUnitario,
            valorTotal,
            preco: item.preco,
            custoUnitario: item.custoUnitario,
          };
        })
        .sort(
          (a, b) =>
            b.quantidade - a.quantidade ||
            a.nome.localeCompare(b.nome, "pt-BR"),
        );

    const validarContratoProdutosSairam = ({
      escopo,
      totalProdutosSairam,
      custoProdutosSairam,
      itens,
    }) => {
      if (
        totalProdutosSairam > 0 &&
        (!Array.isArray(itens) || itens.length === 0)
      ) {
        throw new Error(
          `[Contrato] ${escopo}: totais.produtosSairam > 0 sem detalhamento em produtosSairam.`,
        );
      }

      const somaQuantidade = arredondar2(
        (itens || []).reduce(
          (acc, item) => acc + paraNumero(item.quantidade),
          0,
        ),
      );
      const somaValorTotal = arredondar2(
        (itens || []).reduce(
          (acc, item) => acc + paraNumero(item.valorTotal),
          0,
        ),
      );

      if (Math.abs(totalProdutosSairam - somaQuantidade) > 0.01) {
        throw new Error(
          `[Contrato] ${escopo}: soma das quantidades dos itens (${somaQuantidade}) difere de totais.produtosSairam (${totalProdutosSairam}).`,
        );
      }

      if (Math.abs(custoProdutosSairam - somaValorTotal) > 0.01) {
        throw new Error(
          `[Contrato] ${escopo}: soma de valorTotal dos itens (${somaValorTotal}) difere de totais.custoProdutosSairam (${custoProdutosSairam}).`,
        );
      }
    };

    // Consolidar produtos
    const produtosSairamMap = {};
    const produtosEntraramMap = {};
    const dadosPorMaquina = {};
    const leituras = [];

    movimentacoes.forEach((mov) => {
      let quantidadeSaiuDetalhadaMov = 0;

      // Agregação Global Produtos
      mov.detalhesProdutos?.forEach((mp) => {
        if (mp.quantidadeSaiu > 0) {
          quantidadeSaiuDetalhadaMov += paraNumero(mp.quantidadeSaiu);
          adicionarProdutoSaida(produtosSairamMap, mp);
        }
        if (mp.quantidadeAbastecida > 0) {
          const key = mp.produtoId;
          if (!produtosEntraramMap[key]) {
            produtosEntraramMap[key] = { produto: mp.produto, quantidade: 0 };
          }
          produtosEntraramMap[key].quantidade += mp.quantidadeAbastecida;
        }
      });

      // Agregação Por Máquina
      const maquinaId = mov.maquina.id;
      if (!dadosPorMaquina[maquinaId]) {
        dadosPorMaquina[maquinaId] = {
          maquina: {
            id: mov.maquina.id,
            codigo: mov.maquina.codigo,
            nome: mov.maquina.nome,
            valorFicha: mov.maquina.valorFicha,
          },
          fichas: 0,
          totalSairamMovimentacao: 0,
          totalAbastecidas: 0,
          numMovimentacoes: 0,
          dinheiroMovimentacoes: 0,
          cartaoPixMovimentacoes: 0,
          faturamentoBrutoMovimentacoes: 0,
          produtosSairam: {},
          produtosEntraram: {},
        };
      }

      dadosPorMaquina[maquinaId].fichas += mov.fichas || 0;
      dadosPorMaquina[maquinaId].totalSairamMovimentacao += mov.sairam || 0;
      dadosPorMaquina[maquinaId].totalAbastecidas += mov.abastecidas || 0;
      dadosPorMaquina[maquinaId].numMovimentacoes++;

      const valorFichaMaquina = Number(
        mov.maquina?.valorFicha || loja.valorFichaPadrao || 2.5,
      );

      let valorFichas = Number(mov.fichas || 0) * valorFichaMaquina;
      // Se é retirada de dinheiro e tem valor conferido no fluxo de caixa, usa esse valor
      if (
        mov.retiradaDinheiro &&
        mov.fluxoCaixa &&
        mov.fluxoCaixa.valorRetirado !== null
      ) {
        valorFichas = Number(mov.fluxoCaixa.valorRetirado);
      }

      const dinheiroMov =
        valorFichas + Number(mov.quantidade_notas_entrada || 0);
      const cartaoPixMov = Number(mov.valor_entrada_maquininha_pix || 0);
      const faturamentoBrutoMov = dinheiroMov + cartaoPixMov;

      dadosPorMaquina[maquinaId].dinheiroMovimentacoes += dinheiroMov;
      dadosPorMaquina[maquinaId].cartaoPixMovimentacoes += cartaoPixMov;
      dadosPorMaquina[maquinaId].faturamentoBrutoMovimentacoes +=
        faturamentoBrutoMov;

      leituras.push({
        movimentacaoId: mov.id,
        maquinaId,
        maquinaCodigo: mov.maquina.codigo,
        maquinaNome: mov.maquina.nome,
        dataColeta: mov.dataColeta,
        valor: arredondar2(faturamentoBrutoMov),
      });

      mov.detalhesProdutos?.forEach((mp) => {
        if (mp.quantidadeSaiu > 0) {
          adicionarProdutoSaida(dadosPorMaquina[maquinaId].produtosSairam, mp);
        }
        if (mp.quantidadeAbastecida > 0) {
          const key = mp.produtoId;
          if (!dadosPorMaquina[maquinaId].produtosEntraram[key]) {
            dadosPorMaquina[maquinaId].produtosEntraram[key] = {
              produto: mp.produto,
              quantidade: 0,
            };
          }
          dadosPorMaquina[maquinaId].produtosEntraram[key].quantidade +=
            mp.quantidadeAbastecida;
        }
      });

      // Sem fallback por movimentação: placeholder só é aplicado em legado
      // excepcional no pós-processamento quando não houver nenhum item real.

      const quantidadeSaiuMov = paraNumero(mov.sairam);
      const quantidadeSemDetalhe = Math.max(
        0,
        quantidadeSaiuMov - quantidadeSaiuDetalhadaMov,
      );

      if (quantidadeSemDetalhe > 0 && mov.produtoNaMaquina?.id) {
        const detalhePorProdutoNaMaquina = {
          produtoId: mov.produtoNaMaquina.id,
          produto: mov.produtoNaMaquina,
          quantidadeSaiu: quantidadeSemDetalhe,
          custoUnitario: mov.produtoNaMaquina.custoUnitario,
          valorUnitario: mov.produtoNaMaquina.preco,
        };

        adicionarProdutoSaida(produtosSairamMap, detalhePorProdutoNaMaquina);
        adicionarProdutoSaida(
          dadosPorMaquina[maquinaId].produtosSairam,
          detalhePorProdutoNaMaquina,
        );
      }
    });

    const existeProdutoRealConsolidado = Object.keys(produtosSairamMap).some(
      (id) => id !== "__SEM_DETALHE__",
    );

    // Legado excepcional: se há saídas agregadas, mas nenhum item real no período,
    // adiciona placeholder único para manter contrato de resposta estável.
    if (!existeProdutoRealConsolidado && totalSairamMovimentacoes > 0) {
      const produtoSemDetalhe = {
        id: "__SEM_DETALHE__",
        nome: "Produto não detalhado",
        codigo: "SEM-DETALHE",
        emoji: "📦",
        preco: 0,
        custoUnitario: 0,
      };

      const detalheSinteticoConsolidado = {
        produtoId: produtoSemDetalhe.id,
        produto: produtoSemDetalhe,
        quantidadeSaiu: totalSairamMovimentacoes,
        custoUnitario: 0,
        valorUnitario: 0,
      };

      adicionarProdutoSaida(produtosSairamMap, detalheSinteticoConsolidado);

      Object.values(dadosPorMaquina).forEach((m) => {
        const quantidadeSaidaMaquina = paraNumero(m.totalSairamMovimentacao);
        if (quantidadeSaidaMaquina <= 0) return;

        const detalheSinteticoMaquina = {
          produtoId: produtoSemDetalhe.id,
          produto: produtoSemDetalhe,
          quantidadeSaiu: quantidadeSaidaMaquina,
          custoUnitario: 0,
          valorUnitario: 0,
        };

        adicionarProdutoSaida(m.produtosSairam, detalheSinteticoMaquina);
      });
    }

    const produtosSairam = mapearProdutosSaidaDetalhados(produtosSairamMap);
    const totalSairam = arredondar2(
      produtosSairam.reduce(
        (acc, item) => acc + paraNumero(item.quantidade),
        0,
      ),
    );
    const custoProdutosSairam = arredondar2(
      produtosSairam.reduce(
        (acc, item) => acc + paraNumero(item.valorTotal),
        0,
      ),
    );

    if (totalSairamMovimentacoes > 0 && produtosSairam.length === 0) {
      console.warn(
        "[Contrato] Consolidado sem produtosSairam detalhados apesar de saídas nas movimentações.",
      );
    }

    validarContratoProdutosSairam({
      escopo: "Consolidado",
      totalProdutosSairam: totalSairam,
      custoProdutosSairam,
      itens: produtosSairam,
    });

    const produtosEntraram = Object.values(produtosEntraramMap).sort(
      (a, b) => b.quantidade - a.quantidade,
    );

    // Valor esperado (contador): buscado uma única vez pra todas as
    // movimentações da loja, e agrupado por máquina — usado tanto no total
    // da loja (mais abaixo) quanto no "lucro esperado" de cada máquina.
    const movimentacaoIdsRelatorioLoja = movimentacoes
      .map((mov) => mov?.id)
      .filter(Boolean);

    const valoresEsperadosRelatorioLoja = movimentacaoIdsRelatorioLoja.length
      ? await ValorEsperadoMovimentacao.findAll({
          where: {
            movimentacaoId: { [Op.in]: movimentacaoIdsRelatorioLoja },
          },
          attributes: ["movimentacaoId", "maquinaId", "valorEsperado"],
        })
      : [];

    const valorEsperadoPorMaquina = {};
    const valorEsperadoPorMovimentacao = {};
    for (const registro of valoresEsperadosRelatorioLoja) {
      const chave = String(registro.maquinaId);
      valorEsperadoPorMaquina[chave] =
        (valorEsperadoPorMaquina[chave] || 0) +
        paraNumero(registro.valorEsperado);
      valorEsperadoPorMovimentacao[String(registro.movimentacaoId)] =
        paraNumero(registro.valorEsperado);
    }

    leituras.forEach((leitura) => {
      leitura.valorEsperado = arredondar2(
        valorEsperadoPorMovimentacao[String(leitura.movimentacaoId)] || 0,
      );
    });

    // Formatar dados por máquina, incluindo valores de dinheiro/cartão/pix
    const maquinasDetalhadas = Object.values(dadosPorMaquina).map((m) => {
      const dinheiroMaquina = Number(m.dinheiroMovimentacoes || 0);
      const cartaoPixMaquina = Number(m.cartaoPixMovimentacoes || 0);
      const faturamentoBrutoMaquina = Number(
        m.faturamentoBrutoMovimentacoes || 0,
      );
      const produtosSairamMaquina = mapearProdutosSaidaDetalhados(
        m.produtosSairam,
      );
      const totalSairamMaquina = arredondar2(
        produtosSairamMaquina.reduce(
          (acc, item) => acc + paraNumero(item.quantidade),
          0,
        ),
      );
      const custoProdutosSairamMaquina = arredondar2(
        produtosSairamMaquina.reduce(
          (acc, item) => acc + paraNumero(item.valorTotal),
          0,
        ),
      );

      if (m.totalSairamMovimentacao > 0 && produtosSairamMaquina.length === 0) {
        console.warn(
          `[Contrato] Máquina ${m.maquina?.codigo || m.maquina?.id} sem produtosSairam detalhados apesar de saídas nas movimentações.`,
        );
      }

      validarContratoProdutosSairam({
        escopo: `Máquina ${m.maquina?.codigo || m.maquina?.id}`,
        totalProdutosSairam: totalSairamMaquina,
        custoProdutosSairam: custoProdutosSairamMaquina,
        itens: produtosSairamMaquina,
      });

      const ticketPorPremioMaquina =
        Number(totalSairamMaquina || 0) > 0
          ? faturamentoBrutoMaquina / Number(totalSairamMaquina || 0)
          : 0;

      const valorEsperadoMaquina = arredondar2(
        valorEsperadoPorMaquina[String(m.maquina.id)] || 0,
      );
      // Lucro esperado: usa o valor esperado pelo contador (em vez do
      // faturamento realmente conferido) menos o custo dos produtos que
      // saíram — mesma lógica do "lucro esperado" da rota/relatório, só que
      // por máquina.
      const lucroEsperadoMaquina = arredondar2(
        valorEsperadoMaquina - custoProdutosSairamMaquina,
      );

      return {
        maquina: m.maquina,
        totais: {
          fichas: m.fichas,
          produtosSairam: totalSairamMaquina,
          custoProdutosSairam: custoProdutosSairamMaquina,
          produtosEntraram: m.totalAbastecidas,
          movimentacoes: m.numMovimentacoes,
          dinheiro: dinheiroMaquina,
          cartaoPix: cartaoPixMaquina,
          faturamentoBruto: Number(faturamentoBrutoMaquina.toFixed(2)),
          ticketPorPremio: Number(ticketPorPremioMaquina.toFixed(2)),
          valorEsperado: valorEsperadoMaquina,
          lucroEsperado: lucroEsperadoMaquina,
        },
        produtosSairam: produtosSairamMaquina,
        produtosEntraram: Object.values(m.produtosEntraram)
          .map((p) => ({
            id: p.produto.id,
            nome: p.produto.nome,
            codigo: p.produto.codigo,
            emoji: p.produto.emoji,
            quantidade: p.quantidade,
            valorUnitario: parseFloat(
              p.produto.preco || p.produto.custoUnitario || 0,
            ),
            preco: parseFloat(p.produto.preco || 0),
            custoUnitario: parseFloat(p.produto.custoUnitario || 0),
          }))
          .sort((a, b) => b.quantidade - a.quantidade),
      };
    });

    const faturamentoBrutoMovimentacoes = movimentacoes.reduce((acc, mov) => {
      const valorFichaMaquina = Number(
        mov.maquina?.valorFicha || loja.valorFichaPadrao || 2.5,
      );

      let valorFichas = Number(mov.fichas || 0) * valorFichaMaquina;
      // Se é retirada de dinheiro e tem valor conferido no fluxo de caixa, usa esse valor
      if (
        mov.retiradaDinheiro &&
        mov.fluxoCaixa &&
        mov.fluxoCaixa.valorRetirado !== null
      ) {
        valorFichas = Number(mov.fluxoCaixa.valorRetirado);
      }

      return (
        acc +
        valorFichas +
        Number(mov.quantidade_notas_entrada || 0) +
        Number(mov.valor_entrada_maquininha_pix || 0)
      );
    }, 0);

    const faturamentoBrutoMaquinas = maquinasDetalhadas.reduce(
      (acc, item) => acc + Number(item?.totais?.faturamentoBruto || 0),
      0,
    );
    const valorDinheiroMaquinas = maquinasDetalhadas.reduce(
      (acc, item) => acc + Number(item?.totais?.dinheiro || 0),
      0,
    );
    const valorCartaoPixMaquinasBruto = maquinasDetalhadas.reduce(
      (acc, item) => acc + Number(item?.totais?.cartaoPix || 0),
      0,
    );

    // Valor esperado da loja: soma dos valores esperados por máquina já
    // buscados acima (evita repetir a mesma consulta).
    const valorEsperadoContadores = arredondar2(
      Object.values(valorEsperadoPorMaquina).reduce(
        (acc, valor) => acc + paraNumero(valor),
        0,
      ),
    );

    const faturamentoBrutoConsolidado =
      Number(valorTotalLoja || 0) + Number(faturamentoBrutoMaquinas || 0);
    const faturamentoBrutoBaseTicket =
      faturamentoBrutoConsolidado > 0
        ? faturamentoBrutoConsolidado
        : faturamentoBrutoMovimentacoes;
    const ticketPorPremioTotal =
      Number(totalSairam || 0) > 0
        ? faturamentoBrutoBaseTicket / Number(totalSairam || 0)
        : 0;

    const ticketPremioMaquinas = maquinasDetalhadas
      .map((maquina) => ({
        maquinaId: maquina.maquina.id,
        maquinaNome: maquina.maquina.nome,
        maquinaCodigo: maquina.maquina.codigo,
        faturamentoBruto: Number(maquina.totais?.faturamentoBruto || 0),
        produtosSairam: Number(maquina.totais?.produtosSairam || 0),
        ticketPorPremio: Number(maquina.totais?.ticketPorPremio || 0),
      }))
      .sort((a, b) => b.ticketPorPremio - a.ticketPorPremio);

    // Alerta: diferença entre valor das fichas (em reais) e valor total da loja
    // Calcular valor médio da ficha das máquinas
    let valorMedioFicha = 2.5;
    if (Object.values(dadosPorMaquina).length > 0) {
      const somaValorFicha = Object.values(dadosPorMaquina).reduce((acc, m) => {
        // Se houver valorFicha na máquina, use, senão 2.5
        const v = m.maquina.valorFicha ? Number(m.maquina.valorFicha) : 2.5;
        return acc + v;
      }, 0);
      valorMedioFicha = somaValorFicha / Object.values(dadosPorMaquina).length;
    }
    const valorFichasReais = totalFichas * valorMedioFicha;
    const valorTotal = valorTotalLoja;
    const diferenca = valorFichasReais - valorTotal;
    let avisoFichas = null;
    if (valorTotal > 0 && Math.abs(diferenca) > 0.01) {
      avisoFichas = `Atenção: diferença entre valor das fichas em reais (R$ ${valorFichasReais.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) e valor total da loja (R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}). Diferença: R$ ${diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    }

    // Dados para gráficos
    const graficoSaidaPorMaquina = maquinasDetalhadas.map((m) => ({
      maquina: m.maquina.nome,
      produtosSairam: m.totais.produtosSairam,
    }));
    const graficoSaidaPorProduto = produtosSairam.map((p) => ({
      produto: p.nome,
      quantidade: p.quantidade,
    }));

    return {
      loja: {
        id: loja.id,
        nome: loja.nome,
        endereco: loja.endereco,
      },
      periodo: {
        inicio: periodoInicio.toISOString(),
        fim: periodoFim.toISOString(),
      },
      totais: {
        fichas: totalFichas,
        produtosSairam: totalSairam,
        custoProdutosSairam,
        saidasPremioTotal: totalSairam,
        produtosEntraram: totalAbastecidas,
        movimentacoes: movimentacoes.length,
        valorTotalLoja,
        valorDinheiroLoja,
        valorCartaoPixLoja,
        valorDinheiroMaquinas: Number(valorDinheiroMaquinas.toFixed(2)),
        valorCartaoPixMaquinasBruto: Number(
          valorCartaoPixMaquinasBruto.toFixed(2),
        ),
        valorCartaoPixMaquinasLiquido: Number(
          valorCartaoPixMaquinasBruto.toFixed(2),
        ),
        faturamentoBrutoMovimentacoes: Number(
          faturamentoBrutoMovimentacoes.toFixed(2),
        ),
        faturamentoBrutoConsolidado: Number(
          faturamentoBrutoBaseTicket.toFixed(2),
        ),
        ticketPorPremioTotal: Number(ticketPorPremioTotal.toFixed(2)),
        valorEsperadoContadores: Number(valorEsperadoContadores.toFixed(2)),
      },
      produtosSairam,
      produtosEntraram: produtosEntraram.map((p) => ({
        id: p.produto.id,
        nome: p.produto.nome,
        codigo: p.produto.codigo,
        emoji: p.produto.emoji,
        quantidade: p.quantidade,
        valorUnitario: parseFloat(
          p.produto.preco || p.produto.custoUnitario || 0,
        ),
        preco: parseFloat(p.produto.preco || 0),
        custoUnitario: parseFloat(p.produto.custoUnitario || 0),
      })),
      maquinas: maquinasDetalhadas,
      leituras: [...leituras].sort(
        (a, b) => new Date(b.dataColeta) - new Date(a.dataColeta),
      ),
      ticketPremio: {
        faturamentoBruto: Number(faturamentoBrutoBaseTicket.toFixed(2)),
        produtosSairam: Number(totalSairam || 0),
        ticketPorPremio: Number(ticketPorPremioTotal.toFixed(2)),
        formula: "Ticket por Prêmio = Faturamento Bruto / Produtos Saíram",
      },
      ticketPremioMaquinas,
      graficoSaidaPorMaquina,
      graficoSaidaPorProduto,
      avisoFichas,
    };
};

export const relatorioImpressao = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    if (!lojaId) {
      return res.status(400).json({ error: "lojaId é obrigatório" });
    }

    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }

    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    fim.setHours(23, 59, 59, 999);

    const loja = await Loja.findByPk(lojaId);
    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    const movimentacoes = await Movimentacao.findAll({
      where: {
        dataColeta: {
          [Op.between]: [inicio, fim],
        },
      },
      include: montarIncludeMovimentacaoRelatorio({ lojaId }),
      order: [["dataColeta", "DESC"]],
    });

    const resultado = await montarRelatorioDeUmaLoja({
      loja,
      movimentacoes,
      periodoInicio: inicio,
      periodoFim: fim,
    });

    res.json(resultado);
  } catch (error) {
    console.error("Erro ao gerar relatório de impressão:", error);
    res.status(500).json({
      error: "Erro ao gerar relatório de impressão",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Mesmo relatório de impressão, mas para várias lojas de uma vez: busca as
// movimentações de todas as lojas pedidas em 1 única query (em vez de 1
// requisição HTTP + 1 query por loja, que com muitas lojas esgotava o pool
// de conexões e demorava minutos), depois roda a mesma agregação por grupo.
export const relatorioImpressaoLote = async (req, res) => {
  try {
    const { lojaIds, dataInicio, dataFim } = req.query;

    const idsArray = String(lojaIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (idsArray.length === 0) {
      return res.status(400).json({ error: "lojaIds é obrigatório" });
    }

    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }

    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    fim.setHours(23, 59, 59, 999);

    const lojasEncontradas = await Loja.findAll({
      where: { id: { [Op.in]: idsArray } },
    });
    const lojaPorId = new Map(
      lojasEncontradas.map((loja) => [String(loja.id), loja]),
    );

    const todasMovimentacoes = await Movimentacao.findAll({
      where: {
        dataColeta: {
          [Op.between]: [inicio, fim],
        },
      },
      include: montarIncludeMovimentacaoRelatorio({
        lojaId: { [Op.in]: idsArray },
      }),
      order: [["dataColeta", "DESC"]],
    });

    const movimentacoesPorLoja = new Map();
    for (const mov of todasMovimentacoes) {
      const lojaIdDaMov = String(mov.maquina?.lojaId || "");
      if (!lojaIdDaMov) continue;
      if (!movimentacoesPorLoja.has(lojaIdDaMov)) {
        movimentacoesPorLoja.set(lojaIdDaMov, []);
      }
      movimentacoesPorLoja.get(lojaIdDaMov).push(mov);
    }

    const porLoja = {};
    for (const idLoja of idsArray) {
      const loja = lojaPorId.get(String(idLoja));
      if (!loja) continue;

      porLoja[idLoja] = await montarRelatorioDeUmaLoja({
        loja,
        movimentacoes: movimentacoesPorLoja.get(String(idLoja)) || [],
        periodoInicio: inicio,
        periodoFim: fim,
      });
    }

    res.json({ porLoja });
  } catch (error) {
    console.error("Erro ao gerar relatório em lote:", error);
    res.status(500).json({
      error: "Erro ao gerar relatório em lote",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const relatorioTodasLojas = async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }

    const consolidado = await gerarConsolidadoTodasLojas({
      dataInicio,
      dataFim,
    });
    return res.json(consolidado);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Erro ao gerar relatório consolidado de lojas:", error);
    return res.status(500).json({
      error: "Erro ao gerar relatório consolidado de lojas",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const rankingLucroBrutoLojas = async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }

    const consolidado = await gerarConsolidadoTodasLojas({
      dataInicio,
      dataFim,
    });
    return res.json({
      rankingLucroBrutoLojas:
        consolidado?.graficos?.rankingLucroBrutoLojas || [],
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Erro ao gerar ranking de lucro bruto:", error);
    return res.status(500).json({
      error: "Erro ao gerar ranking de lucro bruto",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const alertasMovimentacaoOut = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: { ativo: true },
      include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
    });

    const alertas = [];
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));

    for (const maquina of maquinas) {
      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: [
          "id",
          "contadorOut",
          "contadorIn",
          "fichas",
          "sairam",
          "dataColeta",
        ],
      });

      if (!movimentacoes || movimentacoes.length < 2) continue;

      const atual = movimentacoes[0];
      const anterior = movimentacoes[1];
      const diffOut = (atual.contadorOut || 0) - (anterior.contadorOut || 0);
      const alertaId = `${maquina.id}-${atual.id}`;

      if (
        atual.contadorOut !== null &&
        atual.contadorOut !== 0 &&
        diffOut !== (atual.sairam || 0) &&
        !ignoradosSet.has(alertaId)
      ) {
        alertas.push({
          id: alertaId,
          tipo: "movimentacao_out",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          lojaNome: maquina.loja?.nome || null,
          contador_out: atual.contadorOut || 0,
          contador_out_anterior: anterior.contadorOut || 0,
          sairam: atual.sairam ?? 0,
          dataMovimentacao: atual.dataColeta,
        });
      }
    }

    return res.json({ alertas });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Erro ao buscar alertas OUT", message: error.message });
  }
};

export const alertasMovimentacaoIn = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: { ativo: true },
      include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
    });

    const alertas = [];
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));

    for (const maquina of maquinas) {
      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: [
          "id",
          "contadorOut",
          "contadorIn",
          "fichas",
          "sairam",
          "dataColeta",
        ],
      });

      if (!movimentacoes || movimentacoes.length < 2) continue;

      const atual = movimentacoes[0];
      const anterior = movimentacoes[1];
      const diffIn = (atual.contadorIn || 0) - (anterior.contadorIn || 0);
      const alertaId = `${maquina.id}-${atual.id}`;

      if (
        atual.contadorIn !== null &&
        atual.contadorIn !== 0 &&
        diffIn !== (atual.fichas || 0) &&
        !ignoradosSet.has(alertaId)
      ) {
        alertas.push({
          id: alertaId,
          tipo: "movimentacao_in",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          lojaNome: maquina.loja?.nome || null,
          contador_in: atual.contadorIn || 0,
          contador_in_anterior: anterior.contadorIn || 0,
          fichas: atual.fichas,
          dataMovimentacao: atual.dataColeta,
        });
      }
    }

    return res.json({ alertas });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Erro ao buscar alertas IN", message: error.message });
  }
};

// --- CÁLCULO DE COMPARAÇÃO DE LUCRO (mês atual vs anterior) ---
export const calcularLucro = async (lojaId, dataInicio, dataFim) => {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
  const anoAnterior = mesAtual === 0 ? ano - 1 : ano;
  const diaAtual = hoje.getDate();

  let lucroAtual = 0;
  let lucroAnterior = 0;
  try {
    async function somaLucro(ano, mes, dias) {
      let total = 0;
      for (let i = 1; i <= dias; i++) {
        const inicio = new Date(ano, mes, i, 0, 0, 0, 0);
        const fim = new Date(ano, mes, i, 23, 59, 59, 999);
        const whereMov = { dataColeta: { [Op.between]: [inicio, fim] } };
        if (lojaId) whereMov["$maquina.lojaId$"] = lojaId;
        try {
          // Movimentações do dia
          const movimentacoes = await Movimentacao.findAll({
            where: whereMov,
            include: [
              {
                model: Maquina,
                as: "maquina",
                attributes: ["valorFicha", "lojaId", "comissaoLojaPercentual"],
              },
              {
                model: FluxoCaixa,
                as: "fluxoCaixa",
                required: false,
                attributes: ["valorRetirado", "conferencia"],
              },
            ],
          });
          let receitaBruta = 0;
          let comissaoTotal = 0;
          for (const m of movimentacoes) {
            const fichas = parseInt(m.fichas) || 0;
            const valorFicha = parseFloat(m.maquina?.valorFicha || 0);
            const dinheiro = parseFloat(m.quantidade_notas_entrada || 0);
            const pix = parseFloat(m.valor_entrada_maquininha_pix || 0);

            let valorFichas = fichas * valorFicha;
            // Se é retirada de dinheiro e tem valor conferido no fluxo de caixa, usa esse valor
            if (
              m.retiradaDinheiro &&
              m.fluxoCaixa &&
              m.fluxoCaixa.valorRetirado !== null
            ) {
              valorFichas = parseFloat(m.fluxoCaixa.valorRetirado);
            }

            const receitaMaquina = valorFichas + dinheiro + pix;
            receitaBruta += receitaMaquina;
            const percentual = parseFloat(
              m.maquina?.comissaoLojaPercentual || 0,
            );
            comissaoTotal += (receitaMaquina * percentual) / 100;
          }
          // Custo dos produtos saídos no dia
          const itensVendidos = await MovimentacaoProduto.findAll({
            attributes: ["quantidadeSaiu"],
            include: [
              { model: Produto, as: "produto", attributes: ["custoUnitario"] },
              {
                model: Movimentacao,
                attributes: [],
                where: whereMov,
                include: [
                  {
                    model: Maquina,
                    as: "maquina",
                    where: lojaId ? { lojaId } : undefined,
                    attributes: [],
                  },
                ],
              },
            ],
            raw: true,
            nest: true,
          });
          const custoProdutos = itensVendidos.reduce((acc, item) => {
            const qtd = item.quantidadeSaiu || 0;
            const custo = parseFloat(item.produto?.custoUnitario || 0);
            return acc + qtd * custo;
          }, 0);
          // Lucro líquido do dia
          total += receitaBruta - custoProdutos - comissaoTotal;
        } catch (errDia) {
          // Loga erro mas não interrompe o cálculo
          console.error(
            `[comparacaoLucro] Erro no dia ${i}/${mes + 1}/${ano}:`,
            errDia,
          );
        }
      }
      return total;
    }
    lucroAtual = await somaLucro(ano, mesAtual, diaAtual);
    lucroAnterior = await somaLucro(anoAnterior, mesAnterior, diaAtual);
    // Garante que sempre retorna número
    if (isNaN(lucroAtual)) lucroAtual = 0;
    if (isNaN(lucroAnterior)) lucroAnterior = 0;
  } catch (errComp) {
    console.error("[comparacaoLucro] Erro geral:", errComp);
    lucroAtual = 0;
    lucroAnterior = 0;
  }
  return { lucroAtual, lucroAnterior };
};
