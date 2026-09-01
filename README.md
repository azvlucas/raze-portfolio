# Raze Pet ERP — portfolio edition

A production-oriented retail ERP for a specialty pet store, covering the full operational loop from purchasing and inventory to sales, CRM and management reporting.

This repository is a curated portfolio snapshot. Production infrastructure, credentials and private operational history are intentionally excluded; all included seed records are synthetic.

## Product scope

| Area | Capabilities |
| --- | --- |
| Catalog | Products, brands, categories, units, suppliers and bulk pricing |
| Inventory | Stock movements, adjustments, counts, expiry tracking and FEFO rules |
| Purchasing | Purchase orders, partial receipts and cost updates |
| Sales | Orders, payments, discounts, coupons, cancellation and restocking |
| Customer operations | Customers, pets, segmentation, CRM and campaigns |
| Management | Dashboards, rankings, reports, sale costs and subscription analysis |
| Access control | Session authentication, password recovery and role-based permissions |
| Governance | Audit log, input validation and transactional business operations |

## Technical highlights

- Next.js 16 App Router and React 19
- TypeScript with modular domain services
- PostgreSQL 16 and Prisma 7
- Tailwind CSS 4 and accessible component primitives
- Zod validation, iron-session authentication and bcrypt password hashing
- Vitest coverage for permissions, money, stock, purchases, sales, CRM and password flows
- CI with an isolated PostgreSQL service, migrations, synthetic seed data, tests, lint and production build

## Architecture

```text
Browser
  │
  ▼
Next.js App Router
  ├── React dashboard and forms
  ├── API route handlers
  └── session and permission guards
          │
          ▼
Domain services
  ├── catalog / inventory / purchasing / sales
  ├── customers / CRM / campaigns
  └── reporting / users / audit
          │
          ▼
Prisma transactions ── PostgreSQL
```

See [architecture](docs/architecture.md), [business rules](docs/business-rules.md) and the [entity overview](docs/erd.md).

## Run locally

Requirements: Node.js 22+, npm and Docker (or a PostgreSQL 16 instance).

```bash
cp .env.example .env
docker compose up -d db
npm ci
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Before seeding, replace the placeholder values for `AUTH_SECRET`, `ADMIN_PASSWORD` and `SEED_SELLER_PASSWORD` in `.env`. The app is available at `http://localhost:3000`.

## Quality checks

```bash
npm test
npm run lint
npm run build
npm audit
```

The integration tests expect the migrated and seeded local PostgreSQL database described above.

## Security and privacy

- Production refuses to start without an explicit session secret of at least 32 characters.
- Seed passwords must be explicitly supplied and contain at least 16 characters.
- Environment files, generated clients, build artifacts and production operations are excluded.
- The public history begins with the curated snapshot and does not expose private development history.

Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Source is published for portfolio review and evaluation. See [LICENSE](LICENSE) for the permitted scope.
