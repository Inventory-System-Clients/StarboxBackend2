# Prompt para o frontend: novo role ABASTECEDOR e rotas simplificadas

## Contexto

O backend agora suporta um novo role de usuário: `ABASTECEDOR`. Quando uma rota (roteiro) tem como funcionário responsável um usuário com esse role, ela funciona de forma mais simples que as rotas normais: sem veículo, sem gastos e sem finalização manual. Nada mudou para rotas de `FUNCIONARIO` / `FUNCIONARIO_TODAS_LOJAS` / `CONTROLADOR_ESTOQUE` / `GERENCIADOR` / `ADMIN` — o comportamento delas continua idêntico.

## O que muda para rotas de funcionário ABASTECEDOR

1. **Sem botão "Finalizar rota"**: não mostrar o botão de finalizar (nem desfinalizar) para essas rotas. O backend agora rejeita essas chamadas com `400` e a mensagem `"Rotas com funcionário abastecedor não precisam ser finalizadas manualmente..."` — então mesmo que o botão apareça por engano, o usuário verá um erro claro em vez de algo quebrado.
2. **Sem cálculo/exibição de mensagem de finalização (resumo WhatsApp)**: como não há finalização manual, não existe `mensagemResumoWhatsapp` para essas rotas. Não exibir essa seção na tela.
3. **Sem veículo associado**: não exibir campo de veículo, KM inicial/final, nem pedir para vincular veículo nessas rotas.
4. **Sem aba de gastos**: não exibir a aba/seção de gastos da rota. O backend agora responde `400` com `"Rotas com funcionário abastecedor não possuem gastos."` em `GET/POST /roteiros/:id/gastos` para essas rotas.
5. **Reset semanal**: nenhuma mudança de comportamento aqui — todas as rotas (inclusive as de abastecedor) já resetam automaticamente no **domingo às 21h** (horário de São Paulo). Isso é automático no backend, o frontend não precisa fazer nada especial além de não esperar um botão de finalizar antes disso.

## Como identificar que uma rota é de abastecedor

O backend agora expõe um jeito direto de checar isso, para não ser necessário hardcodar lógica de role no frontend:

- `GET /roteiros/:id/executar` → resposta agora inclui `funcionarioAbastecedor: boolean`.
- `GET /roteiros/com-status` → cada item da lista agora inclui `funcionarioAbastecedor: boolean`.
- `GET /roteiros` e `GET /roteiros/do-dia` → o objeto `funcionario` incluído em cada roteiro agora também traz `role` (além de `id` e `nome`), então dá para checar `roteiro.funcionario?.role === "ABASTECEDOR"`.

Use `funcionarioAbastecedor === true` (ou `funcionario.role === "ABASTECEDOR"`, dependendo do endpoint) como a fonte única de verdade para decidir a UI condicional descrita acima.

## Cadastro de usuário / atribuição de rota

- Ao criar/editar usuário (tela de admin), `ABASTECEDOR` agora é um role válido, igual aos demais (`ADMIN`, `FUNCIONARIO`, `FUNCIONARIO_TODAS_LOJAS`, `CONTROLADOR_ESTOQUE`, `GERENCIADOR`). Adicionar essa opção no seletor de role.
- `GET /usuarios/funcionarios` agora também retorna usuários com role `ABASTECEDOR`, então o dropdown de "funcionário responsável" ao criar/editar uma rota (`PATCH /roteiros/:id`) já deve listar esses usuários automaticamente sem mudança adicional — só confirmar que o dropdown não filtra roles no próprio frontend de forma mais restritiva do que a API retorna.
- Abastecedores podem ter lojas permitidas (`lojasPermitidas`) atribuídas normalmente, igual a um FUNCIONARIO.

## O que NÃO muda

- Login, autenticação, permissões de loja.
- Lógica de rotas normais (finalização, veículo, gastos, WhatsApp) para os demais roles.
- Uso de produtos / registro de movimentação de máquina.
- Início de rota (`POST /roteiros/:id/iniciar`) continua igual — abastecedor consegue iniciar sua rota normalmente, só não terá campos de veículo para preencher (já que a rota não tem veículo).

## Cenários de teste

1. Admin cria/edita um usuário com role `ABASTECEDOR` com sucesso.
2. Admin atribui esse usuário como funcionário responsável de uma rota (`PATCH /roteiros/:id`).
3. Ao abrir essa rota (lista ou detalhe), a UI não mostra: botão de finalizar, campo de veículo/KM, aba de gastos.
4. O abastecedor consegue iniciar a rota e visitar as lojas normalmente (fichas/produtos funcionam igual).
5. Uma rota de `FUNCIONARIO` comum continua mostrando tudo normalmente (veículo, gastos, botão finalizar, mensagem de resumo).
6. Rota de abastecedor reseta automaticamente no domingo às 21h junto com as demais, sem precisar ser finalizada manualmente antes disso.
