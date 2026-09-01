# Arquitetura — Raze Pet ERP

## Visão geral

Monólito modular **Next.js 16 (App Router) + TypeScript**:

| Camada | Local | Responsabilidade |
|--------|-------|------------------|
| UI | `src/app/(dashboard)`, `src/components` | Telas responsivas, tema claro/escuro |
| API | `src/app/api/*` | HTTP, auth, validação Zod |
| Domínio | `src/modules/*` | Regras de negócio e transações |
| Persistência | Prisma 7 + PostgreSQL + adapter `pg` | Schema, migrations, seeds |
| Auth | `src/lib/auth.ts` + middleware | Sessão cookie HTTP-only |

## Módulos de domínio

```
src/modules/
  auth, products, stock, purchases, sales,
  customers, coupons, crm, campaigns, reports, users, audit
```

Cada módulo expõe **services** usados pelas rotas API. Componentes React não contêm regras críticas de estoque/venda/compra.

## Banco

- PostgreSQL 16+
- Migrations em `prisma/migrations`
- Seed em `prisma/seed.ts` (admin via `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- Soft delete / inativação onde há histórico

## Runtime and delivery

- Next.js standalone production output
- Local PostgreSQL through `docker-compose.yml`
- Versioned Prisma migrations
- Healthcheck at `GET /api/health`
- GitHub Actions validates install, migrations, seed, tests, lint and build

## Integrações futuras (preparado)

- `externalId` + `externalSource` em clientes e pedidos de venda
- Campanhas sem provider de envio (portas prontas para WhatsApp/e-mail)
- Campos de cupom e canal para importação de e-commerce

## Segurança

- Secrets apenas em variáveis de ambiente (`.env.example` contém placeholders)
- Prisma previne SQL injection
- Validação Zod em entradas
- Cookies `secure` em produção
- Produção recusa inicialização sem `AUTH_SECRET` forte
- Rate limit em memória no login (Redis em escala futura)
