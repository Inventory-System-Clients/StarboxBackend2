-- Execute no DBeaver (PostgreSQL)
-- 1) Guarda o resumo estruturado usado para montar a mensagem de WhatsApp
--    de cada leitura. Antes essa informacao ficava so no localStorage do
--    navegador, entao o botao "Enviar leituras do ponto no WhatsApp" so
--    funcionava no mesmo navegador/dispositivo onde a leitura foi lancada.
--    Nao existe coluna de "ja enviado" de proposito: cada leitura desde o
--    inicio da execucao semanal atual sempre entra na mensagem, permitindo
--    reenviar quantas vezes for preciso (inclusive leituras repetidas na
--    mesma maquina, que entram como blocos separados).
ALTER TABLE movimentacoes
ADD COLUMN IF NOT EXISTS resumo_whatsapp JSON;

-- 2) (Opcional) Verificar se a coluna foi criada
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'movimentacoes'
  AND column_name = 'resumo_whatsapp';
