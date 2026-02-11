<p align="center">
  <img src="src/app/icon.svg" alt="dbmaster" width="80" height="80" />
</p>

<h1 align="center">dbmaster</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-supported-336791?style=flat-square&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/ClickHouse-supported-FFCC00?style=flat-square&logo=clickhouse" alt="ClickHouse" />
  <img src="https://img.shields.io/badge/license-Commons%20Clause-orange?style=flat-square" alt="License" />
</p>

A self-hosted database management tool for teams. Connect to PostgreSQL and ClickHouse servers, browse tables, run queries, create branches, and manage access — all from a clean, modern interface.

Built for developers who want a Neon-like experience on their own infrastructure.

---

## Features

### Database Management
- **Multi-database support** — PostgreSQL and ClickHouse via a unified adapter
- **Server connections** — manage multiple servers with environment tagging (dev/staging/prod)
- **Database browser** — list databases with sizes, create new ones, export full backups
- **Table browser** — search tables, view row counts and sizes, recent table history

### Data Viewer & Editor
- **Paginated data grid** — sort, filter, and paginate through table data
- **Inline editing** — double-click cells to edit with type-aware inputs (text, number, boolean, JSON, date, enum)
- **Row operations** — insert, delete, and modify rows with undo support
- **Foreign key previews** — hover over FK columns to see a mini-table preview of the referenced row
- **Copy cell values** — click to copy any cell

### SQL Query Runner
- **CodeMirror editor** — syntax highlighting, autocomplete, and keyboard shortcuts
- **Query history** — persistent per-user history with favorites and tags
- **Results table** — sortable, scrollable results with execution time and row count
- **Execute with Cmd+Enter**

### Database Branching
- **Create branches** — clone databases for development or testing
- **Full or schema-only** mode with per-table row limits
- **Branch tracking** — metadata, creator, status, connection strings
- **One-click connection strings** — copy direct, PgBouncer, or dev URLs

### Team & Access Control
- **GitHub OAuth** — sign in with GitHub, no passwords
- **Role-based access** — Admin, Developer, Viewer roles per connection
- **User approval flow** — first user becomes admin, others require approval
- **Audit logging** — every action tracked with user, timestamp, and metadata

### Security
- **AES-256-GCM encryption** for stored database passwords
- **Parameterized queries** throughout — no SQL injection vectors
- **JWT sessions** with 30-day expiration
- **Permission checks** on every API route
- **SSL/TLS** support for database connections

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI |
| Data Grid | TanStack Table |
| SQL Editor | CodeMirror 6 |
| ORM | Prisma 6 |
| Auth | NextAuth.js 5 (GitHub OAuth) |
| PostgreSQL | node-postgres (pg) |
| ClickHouse | @clickhouse/client |
| State | React hooks, Zustand |
| Notifications | Sonner |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (for the application's own database)
- GitHub OAuth App credentials

### 1. Install

```bash
git clone <repository-url>
cd db-masterclass
npm install
```

### 2. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set the callback URL to `http://localhost:3000/api/auth/callback/github`
4. Save the **Client ID** and **Client Secret**

### 3. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:

```bash
# App
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=          # openssl rand -base64 32
AUTH_TRUST_HOST=true

# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Application database (Prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/dbmaster

# Encryption key for stored passwords
ENCRYPTION_KEY=           # openssl rand -base64 32
```

### 4. Set Up the Database

```bash
createdb dbmaster
npx prisma migrate dev
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first user to sign in becomes the admin.

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access — manage users, connections, databases, run any query |
| **Developer** | Read/write on assigned connections, create branches, run queries |
| **Viewer** | Read-only access, SELECT queries only |

Roles are assigned per connection, so a user can be a Developer on staging and a Viewer on production.

---

## Deployment

### Docker

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

### Coolify

1. Create a new service and connect the repository
2. Set the environment variables
3. Deploy — migrations run automatically on start

---

## Scripts

```bash
npm run dev          # Start dev server (runs migrations first)
npm run build        # Production build
npm run start        # Start production server (runs migrations first)
npm run lint         # ESLint
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
```

---

## Project Structure

```
src/
  app/
    (dashboard)/             # Authenticated routes
      [connectionId]/        # Server view — database browser
        db/[database]/       # Database view — tables, query runner
          tables/[tableName] # Table view — data grid, schema, editor
    admin/                   # User management
    api/                     # API routes (connections, queries, branches, etc.)
    auth/                    # Sign in, pending, rejected pages
  components/
    ui/                      # shadcn/ui primitives
    layout/                  # Header, navigation
    sql-editor/              # CodeMirror wrapper
  lib/
    db.ts                    # PostgreSQL pool management
    clickhouse.ts            # ClickHouse client management
    db-adapter.ts            # Unified database adapter interface
    encryption.ts            # AES-256-GCM password encryption
    auth.ts                  # NextAuth configuration
    prisma.ts                # Prisma client singleton
prisma/
  schema.prisma              # Data models
  migrations/                # Database migrations
```

---

## License

This project is licensed under the [Commons Clause License](LICENSE.md) (MIT base).

You are free to use, modify, and self-host this software. You may **not** sell it or offer it as a paid hosted service. See [LICENSE.md](LICENSE.md) for details.
