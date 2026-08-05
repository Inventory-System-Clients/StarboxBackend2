// Helper compartilhado de paginação para endpoints de listagem.
//
// Uso padrão:
//   const params = parseListParams(req.query, { defaultPageSize: 20 });
//   if (params.all) {
//     const rows = await Model.findAll({ where, order });
//     return res.json(rows);
//   }
//   const { rows, count } = await Model.findAndCountAll({ where, order, limit: params.limit, offset: params.offset });
//   return res.json(buildPaginatedResponse(rows, count, params));
//
// `all=true` é um escape-hatch reservado para popular <select>/dropdowns que
// precisam da lista inteira (ex.: formulário de nova movimentação). Não usar
// para telas de tabela/listagem — essas devem sempre paginar.
export function parseListParams(query = {}, opts = {}) {
  const { defaultPageSize = 20, maxPageSize = 100 } = opts;

  const all = String(query.all || "").toLowerCase() === "true";

  const pageRaw = parseInt(query.page, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const pageSizeRaw = parseInt(query.pageSize, 10);
  const pageSize = Math.min(
    Math.max(
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
        ? pageSizeRaw
        : defaultPageSize,
      1,
    ),
    maxPageSize,
  );

  const offset = (page - 1) * pageSize;

  return { all, page, pageSize, offset, limit: pageSize };
}

export function buildPaginatedResponse(rows, count, { page, pageSize }) {
  return {
    data: rows,
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
    },
  };
}
