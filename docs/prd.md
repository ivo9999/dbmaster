# PRD: Lightweight PostgreSQL Manager

## Overview

A minimal, fast web-based PostgreSQL management tool focused on developer productivity. Built with Next.js 15 (App Router), designed for self-hosted PostgreSQL on Coolify.

**Target user:** Full-stack developers and teams managing multiple databases locally and in production

**Core value prop:** Neon-like UX without the managed service overhead, with team collaboration

---

## Core Features

### 1. **Authentication & User Management**

#### Authentication

- **GitHub OAuth only** (simple, no password management)
- First user to sign in = automatic Admin access
- All subsequent users = Pending approval state
- Session management with JWT
- Auto-logout after 30 days

#### User States

- **Admin:** First user + manually promoted users. Full access.
- **Approved:** Approved by admin, can access assigned databases
- **Pending:** Waiting for admin approval, cannot access anything
- **Rejected:** Cannot sign in (optional state)

#### User Roles (for approved users)

- **Admin:** Full access (create/edit/delete connections, manage users, all operations)
- **Developer:** Read/write access to assigned databases, can create branches
- **Viewer:** Read-only access to assigned databases

#### Team Management (Admin only)

- View pending user requests with GitHub profile info
- Approve/reject pending users
- Assign approved users to database connections
- Set user roles per connection
- Remove users
- Promote users to Admin
- View user activity log

#### User Settings

- View GitHub profile
- API key generation (for CLI access)
- Preferences (theme, default connection)
- Sign out

### 2. **Connection Management**

- Add/edit/delete database connections (Admin only)
- Test connection status
- Store connections encrypted in database
- Support multiple environments (dev, staging, prod)
- Color-coded environment badges
- **Permissions:** Admins assign users to specific connections
- Connection groups/folders for organization
- Share connections with team members
- Connection metadata:
  - Name
  - Environment type
  - Description
  - Created by
  - Assigned users

### 3. **Table Browser**

- List all tables with row counts
- Search/filter tables
- Show table size (disk usage)
- Click table → open table view
- Keyboard navigation (j/k to navigate tables)
- Favorite tables (pin to top)
- Recent tables history
- Table tags/categories

### 4. **Table Viewer**

- Paginated data grid (50 rows per page, configurable)
- Column sorting (click header, multi-column support)
- Advanced filtering (per column, with operators: =, !=, >, <, LIKE, IN)
- Show column types, nullable, default values
- Copy cell value (click + Cmd/Ctrl+C)
- Select rows (checkbox)
- Column visibility toggle
- Column reordering (drag & drop)
- Freeze columns (sticky left columns)
- Virtual scrolling for large tables (>1000 rows)
- Row count badge
- Export visible data

### 5. **Schema Inspector**

- View table schema (columns, types, constraints)
- Show indexes with index type
- Show foreign keys with navigation
- Display enum values when clicking enum column
- One-click copy column definition
- Show table dependencies
- View triggers and functions
- Primary key highlighting
- View table DDL (CREATE TABLE statement)

### 6. **Inline Editing**

**Permissions:**

- Admin/Developer: Can edit
- Viewer: Read-only

**Features:**

- Double-click cell to edit
- Type-aware inputs:
  - Text/varchar: input
  - Number: number input
  - Boolean: checkbox/toggle
  - Enum: dropdown with all values
  - JSON/JSONB: code editor with validation
  - Date/timestamp: date picker
  - Array: multi-input
  - UUID: generator button
  - NULL: special indicator
- Save changes (debounced, 500ms)
- Undo/redo (Cmd+Z / Cmd+Shift+Z)
- Validation errors inline
- Bulk edit (select rows → edit column)
- Track unsaved changes indicator
- Confirm before navigating away with unsaved changes
- Show who last edited (timestamp + user)

### 7. **Row Operations**

**Permissions:**

- Admin/Developer: Full CRUD
- Viewer: Read-only

**Features:**

- Insert new row (with defaults pre-filled)
- Delete row(s) with confirmation
- Duplicate row
- Export selected rows as SQL INSERT
- Batch insert (paste CSV data)
- Keyboard shortcuts (N for new, D for delete)
- Audit trail (who created/edited/deleted, when)

### 8. **Query Runner**

**Permissions:**

- Admin/Developer: Can execute queries
- Viewer: Read-only queries (SELECT only)

**Features:**

- SQL editor with syntax highlighting
- Execute query (Cmd+Enter)
- Show results in table view
- Query history (persistent, per user)
- Save favorite queries with tags
- Share queries with team
- Show execution time + row count + affected rows
- EXPLAIN ANALYZE support
- Multi-query execution (separated by ;)
- Cancel running queries
- Query templates/snippets
- Format SQL (Prettier)
- Export results (CSV, JSON, SQL)
- Query validation (warn on dangerous operations)

### 9. **Database Branching**

**Permissions:**

- Admin/Developer: Can create/delete branches
- Viewer: Can view branches

#### UI Flow:

1. Click "Create Branch" button
2. Name branch (validates: alphanumeric + underscore + hyphen)
3. Select source database (dropdown)
4. Optional: Select specific tables to copy (default: all)
5. Optional: Description/purpose
6. Show progress: "Cloning production_db... 45%"
7. Success → Show new connection string
8. Auto-switch to new branch

#### Features:

- Create new database from existing
- pg_dump source → target (with progress indicator)
- Store branch metadata:
  - Created by (user + GitHub avatar)
  - Created at (timestamp)
  - Source branch
  - Description/purpose
  - Status (active, archived, deleted)
  - Last activity
- List all branches with:
  - Size
  - Last activity
  - Creator (with avatar)
  - Age
  - Number of tables
- Delete branch (with "are you sure?" if has data)
- Archive branch (soft delete)
- Restore archived branch
- Merge branch (copy data back to source) - Admin only
- Compare branches (show schema diff)
- Branch permissions (inherit from source connection)

### 10. **Migrations**

**Permissions:**

- Admin only: Can run migrations
- Developer/Viewer: Can view migration history

**Features:**

- List applied migrations (from schema_migrations table)
- Show pending migrations (from prisma/migrations or custom folder)
- One-click "Run migrations"
- Migration history with timestamps + who ran it
- Rollback last migration (if possible)
- Show migration SQL before running
- Confirm before running migrations
- Lock migrations during execution
- Migration status notifications

### 11. **Additional Features**

#### Export/Import

**Permissions:**

- Admin/Developer: Full export/import
- Viewer: Export only

**Features:**

- Export table as CSV/JSON/SQL
- Import CSV to table (with column mapping)
- Export database as SQL dump
- Export with data or schema only
- Schedule exports (future)

#### Relationships

- Click foreign key → jump to related table
- Show related records count
- Inline related records preview

#### Performance

- EXPLAIN ANALYZE for queries
- Show slow queries (if pg_stat_statements enabled)
- Query execution plan visualization
- Index suggestions
- Table statistics

#### Activity Log (Admin only)

- All user actions logged:
  - Queries executed
  - Data modified
  - Branches created/deleted
  - Users approved/rejected
  - Connections created/modified
- Filterable by user, action type, date
- Export audit log

---

## Technical Requirements

### Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript
- **Auth:** NextAuth.js with GitHub provider
- **UI:** shadcn/ui, TailwindCSS, Radix UI
- **Data Grid:** TanStack Table v8
- **Forms:** React Hook Form + Zod
- **State:** Zustand (for UI state)
- **SQL Editor:** Monaco Editor or CodeMirror
- **Backend:** Next.js API routes (TypeScript)
- **Database:**
  - Application DB: PostgreSQL (stores users, connections, branches, etc.)
  - Target DBs: PostgreSQL (databases being managed)
- **ORM:** Prisma or Drizzle for application database
- **Connection Pooling:** node-postgres (pg) with connection pooling

### Architecture

```
/app
  /auth
    /signin - GitHub OAuth
    /pending - Waiting for approval screen
  /admin
    /users - Approve/manage users
    /connections - Manage connections
  /[connectionId]
    /tables - Browse tables
    /[tableName] - View/edit table
    /query - SQL runner
    /branches - Branch management
    /migrations - Migration runner
/api
  /auth/[...nextauth] - NextAuth endpoints
  /users
    /pending - List pending users
    /approve - Approve user
  /connections/[id]/...
    /tables - List tables
    /tables/[name]/data - CRUD operations
    /query - Execute SQL
    /branch - Create/list/delete branches
    /migrate - Run migrations
/lib
  /auth - Auth utilities, permission checks
  /db - PostgreSQL client with pooling
  /validators - Zod schemas
  /security - SQL injection prevention, permission middleware
/components
  /auth - Auth UI components
  /admin - Admin panels
  /table - Table viewer components
  /query - Query runner components
```

### Data Model

```typescript
// Application Database Schema

model User {
  id            String   @id @default(cuid())
  githubId      String   @unique
  email         String   @unique
  name          String?
  avatar        String?
  role          UserRole @default(PENDING)
  createdAt     DateTime @default(now())
  approvedAt    DateTime?
  approvedBy    String?
  connections   UserConnection[]
  branches      Branch[]
  queryHistory  Query[]
  auditLogs     AuditLog[]
}

enum UserRole {
  ADMIN
  APPROVED
  PENDING
  REJECTED
}

model Connection {
  id          String   @id @default(cuid())
  name        String
  host        String
  port        Int
  database    String
  username    String
  password    String   // encrypted
  ssl         Boolean  @default(true)
  environment Environment
  color       String
  description String?
  createdBy   String
  createdAt   DateTime @default(now())
  users       UserConnection[]
  branches    Branch[]
}

model UserConnection {
  userId       String
  connectionId String
  role         ConnectionRole
  user         User       @relation(fields: [userId], references: [id])
  connection   Connection @relation(fields: [connectionId], references: [id])

  @@id([userId, connectionId])
}

enum ConnectionRole {
  ADMIN
  DEVELOPER
  VIEWER
}

enum Environment {
  DEVELOPMENT
  STAGING
  PRODUCTION
}

model Branch {
  id            String   @id @default(cuid())
  name          String
  connectionId  String
  sourceDb      String
  description   String?
  status        BranchStatus @default(ACTIVE)
  size          BigInt?
  createdBy     String
  createdAt     DateTime @default(now())
  lastActivity  DateTime @default(now())
  connection    Connection @relation(fields: [connectionId], references: [id])
  creator       User @relation(fields: [createdBy], references: [id])
}

enum BranchStatus {
  ACTIVE
  ARCHIVED
  DELETED
}

model Query {
  id           String   @id @default(cuid())
  userId       String
  connectionId String
  sql          String
  executionTime Int?
  rowCount     Int?
  isFavorite   Boolean  @default(false)
  tags         String[]
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id])
}

model AuditLog {
  id           String   @id @default(cuid())
  userId       String
  action       String
  resource     String
  resourceId   String?
  metadata     Json?
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id])
}
```

---

## UI/UX Requirements

### Design Principles

- **Minimal:** No clutter, focus on data
- **Fast:** <100ms interactions, optimistic updates
- **Keyboard-first:** Every action has keyboard shortcut
- **Dark mode:** Default dark, light mode optional
- **Accessible:** WCAG 2.1 AA compliant

### Key Screens

#### 1. **Sign In**

```
┌─────────────────────────────────────┐
│                                     │
│        PostgreSQL Manager           │
│                                     │
│    [Continue with GitHub]           │
│                                     │
└─────────────────────────────────────┘
```

#### 2. **Pending Approval** (for non-first users)

```
┌─────────────────────────────────────┐
│   ⏳ Waiting for approval            │
│                                     │
│   Your access request has been      │
│   sent to the admin team.           │
│                                     │
│   We'll email you when approved.    │
│                                     │
│   [Sign out]                        │
└─────────────────────────────────────┘
```

#### 3. **Admin - Pending Users**

```
Pending Approvals (3)

┌─────────────────────────────────────────────────────────┐
│ 👤 John Doe (@johndoe)                                  │
│    john@example.com                                     │
│    Requested 2 days ago                                 │
│    [Approve] [Reject]                                   │
├─────────────────────────────────────────────────────────┤
│ 👤 Jane Smith (@janesmith)                              │
│    jane@example.com                                     │
│    Requested 5 hours ago                                │
│    [Approve] [Reject]                                   │
└─────────────────────────────────────────────────────────┘
```

#### 4. **Connections List**

```
[+] Add Connection                    [@johndoe ▾] [Admin]

● PRODUCTION                    postgres@91.98.200.83:5432
  5 tables | 1.2GB | Connected  [Developer]

● DEVELOPMENT                   localhost:5432
  3 tables | 45MB | Connected   [Admin]

[Branch] [Query] [Settings]
```

#### 5. **Table Browser**

```
database: production_db                [Query] [Branch ▾]

🔍 Search tables...

📊 User          1,234 rows | 45MB    →
📊 Project         567 rows | 12MB    →
📊 Member        2,890 rows | 89MB    →
```

#### 6. **Table View**

```
User                          [+ New] [Delete] [Export ▾]
                              Last edited by @johndoe 5m ago

🔍 Quick filter...

┌────────┬─────────────┬────────────┬────────────┬─────────┐
│ id ↓   │ name        │ email      │ role       │ created │
├────────┼─────────────┼────────────┼────────────┼─────────┤
│ 1      │ John Doe    │ john@...   │ ADMIN ▾    │ 2024... │
│ 2      │ Jane Smith  │ jane@...   │ USER ▾     │ 2024... │
└────────┴─────────────┴────────────┴────────────┴─────────┘

Showing 1-50 of 1,234                    [← 1 2 3 ... 25 →]
```

### Keyboard Shortcuts

```
Global:
  Cmd+K         - Quick search (tables/connections)
  Cmd+P         - Open query runner
  Cmd+B         - Toggle sidebar
  ?             - Show shortcuts

Table View:
  N             - New row (if has permission)
  D             - Delete selected (if has permission)
  Enter         - Edit cell (if has permission)
  Esc           - Cancel edit
  Cmd+S         - Save changes
  Cmd+Z         - Undo
  j/k           - Navigate rows
  Tab           - Next cell
```

---

## Non-Functional Requirements

### Performance

- Initial page load: <1s
- Table load (1000 rows): <200ms
- Query execution: Show results as they stream
- Optimistic updates for edits
- Virtual scrolling for large tables (>1000 rows)
- Lazy load GitHub avatars
- Cache connection metadata

### Security

- **Authentication:**
  - GitHub OAuth only (no passwords stored)
  - JWT tokens with 30-day expiration
  - Secure session storage (httpOnly cookies)
- **Authorization:**
  - Role-based access control (RBAC)
  - Permission checks on every API call
  - Row-level security where applicable
- **SQL Injection Prevention:**
  - Parameterized queries ONLY
  - Whitelist table/column names
  - Block DROP/TRUNCATE in query runner for non-admins
- **Connection Security:**

  - Encrypt passwords at rest (AES-256)
  - Support SSL connections
  - No connection strings in URL params
  - No connection strings in frontend code

- **Access Control:**
  - Read-only mode for Viewer role
  - Confirm destructive operations (DELETE, DROP)
  - Audit log all actions
  - Rate limiting on API endpoints

### Reliability

- Connection pooling (max 10 connections per database)
- Automatic reconnect on connection loss
- Transaction support for batch edits
- Error handling with user-friendly messages
- Graceful degradation if features unavailable
- Rollback on failed operations

---

## Out of Scope (Keep Minimal)

❌ Email/password authentication (GitHub only)
❌ Multi-tenancy (single team per instance)
❌ ER diagram visualization
❌ Query builder (drag-and-drop)
❌ Scheduled queries/backups
❌ Redis/MongoDB support
❌ Mobile app
❌ Chart/visualization builder
❌ Real-time collaboration (multiple users editing same cell)

---

## Success Metrics

1. **Faster than Beekeeper:** <2 clicks to edit data
2. **Neon parity:** Branch creation in <30s
3. **Zero config:** First user signs in with GitHub and it works
4. **Lightweight:** <5MB bundle size
5. **Secure:** All actions audited, role-based access enforced
6. **Daily usage:** Team chooses this over Beekeeper/TablePlus

---

## Development Phases

### Phase 1: Auth & Core

- GitHub OAuth setup
- First user = Admin logic
- Pending user approval flow
- Connection management (CRUD)
- Table browser
- Basic table view (read-only)

### Phase 2: Editing & Permissions

- Role-based permissions
- Inline editing
- Row operations
- Schema inspector
- Validation

### Phase 3: Advanced Features

- Query runner
- Database branching
- Migration runner
- Audit logging

### Phase 4: Polish

- Export/import
- Performance optimizations
- Keyboard shortcuts
- Dark mode polish
- Activity dashboard

---

## Technical Constraints

- **Backend:** Next.js API routes only (no separate services)
- **Deployment:** Single Docker container on Coolify
- **Database:** PostgreSQL 14+ for application DB and target DBs
- **Browser:** Modern browsers (Chrome, Firefox, Safari latest)
- **Self-hosted:** Must work without external dependencies

---

## Environment Variables

```bash
# Application
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-secret-key

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Application Database
DATABASE_URL=postgresql://user:pass@localhost:5432/pg_manager

# Encryption
ENCRYPTION_KEY=your-encryption-key-for-passwords
```

---

Ready for Claude Code to implement!
