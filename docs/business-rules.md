# Regras de negócio — Raze Pet ERP

## Autenticação e permissões

- Login por e-mail/senha com hash bcrypt (custo 12).
- Sessão em cookie HTTP-only (`iron-session`).
- Rate limit no login e na recuperação de senha.
- Permissões validadas no backend em toda mutação.
- Perfis: Administrador, Gerente, Vendedor, Estoquista.
- Usuário inativo não autentica; último acesso registrado no login.

## Estoque e lotes

- Estoque **nunca** fica negativo (transação + validação).
- Toda alteração gera `StockMovement` com saldo anterior/delta/final, usuário e justificativa.
- Produtos com `trackExpiry` exigem lote em entradas.
- **FEFO**: saída prioriza o lote com validade mais próxima e quantidade disponível.
- Lotes vencidos não entram no FEFO de venda; baixas por vencimento/perda/avaria são permitidas.
- Alerta de validade configurável (`days_to_expiry_alert`).

## Compras

- Status: Rascunho → Aguardando aprovação → Aprovado → Enviado → Parcialmente recebido / Recebido | Cancelado.
- Recebimento parcial ou total em transação: estoque, lotes, custo e histórico de preço.
- Pedido **Recebido** não é editado diretamente.

## Vendas

- Cliente e pet são opcionais (consumidor não identificado permitido).
- Confirmação da venda baixa estoque (FEFO) em transação.
- Cancelamento de venda confirmada **estorna** estoque.
- Multi-pagamento; soma deve fechar o total.
- Desconto manual limitado por perfil; cupom validado no servidor.
- Orçamento/rascunho não baixam estoque até confirmação.

## Cupons

- Tipos: percentual ou valor fixo.
- Validam período, valor mínimo, limite total, limite por cliente, canais e produtos/categorias.

## CRM e campanhas

- Métricas derivadas de vendas finalizadas.
- Segmentos rápidos (inativos, recorrentes, aniversariantes, etc.).
- Campanhas **sem** disparo automático no MVP.
- WhatsApp/E-mail: exclui clientes sem `marketingConsent`.
- Exportação de contatos registrada em auditoria.

## Auditoria

Ações sensíveis gravam usuário, entidade, before/after e timestamp (login, preços, estoque, compras, vendas, permissões, cupons, campanhas, exports).

## Formatação

- Moeda: BRL · Datas: pt-BR · Fuso: America/Sao_Paulo.
