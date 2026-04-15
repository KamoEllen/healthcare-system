<!--

# Healthcare Management System — Technical Report

---

## Table of Contents

1. [Summary](#1-summary)
2. [What Problem This Solves and Why](#2-what-problem-this-solves-and-why)
3. [Purpose and Requirements](#3-purpose-and-requirements)
4. [System Architecture](#4-system-architecture)
5. [System Design and Choices](#5-system-design-and-choices)
6. [Why This Stack Specifically](#6-why-this-stack-specifically)
7. [Decisions Made Along the Way and Why Things Changed](#7-decisions-made-along-the-way-and-why-things-changed)
8. [Comparing Different Methods](#8-comparing-different-methods)
9. [Access and Security](#9-access-and-security)
10. [Testing and Results](#10-testing-and-results)
11. [CI/CD Pipeline](#11-cicd-pipeline)
12. [Integration Tiers](#12-integration-tiers)
13. [Conclusion](#13-conclusion)
14. [Suggested Additional Diagrams](#14-suggested-additional-diagrams)

---

## 1. Summary

This is a REST API for managing patients, doctors, and appointments in a healthcare setting. It is built with Node.js, Express, TypeScript, and PostgreSQL. The frontend is Angular 19. The system handles user registration and authentication, appointment booking with conflict prevention, health record management with role-based access, email notifications, and a full audit trail of every state change.

The project was designed from a tech spec first — tables, endpoints, roles, and rules — before a single line of code was written. That order mattered. Every decision in the codebase traces back to a requirement in that spec.

The system is deployable to three tiers: local development with Docker Compose, free-tier production on Neon + Resend, and scaled production on AWS RDS + SES + EKS, with a single environment variable (`DATABASE_URL`, `EMAIL_PROVIDER`) controlling which tier is active. No application code changes between tiers.

---

## 2. What Problem This Solves and Why

**The problem:** Healthcare organisations — clinics, small hospitals, private practices — manage appointments, patient records, and doctor schedules using spreadsheets, paper, or disconnected tools. This causes double-booked appointments, inaccessible patient history, no audit trail when records are modified, and no role separation (a receptionist sees what a doctor sees).

**Why solve it:** These are not minor inconveniences. A double-booked appointment is a patient who shows up and is turned away. A missing health record is a doctor prescribing without full history. An absence of audit logs means no accountability when data is changed. These are direct patient safety issues.

**What this system does specifically:**
- Prevents double-booking at the database query level, not just the application level
- Separates what patients, doctors, and admins can see and do, enforced on every route
- Logs every appointment status change and health record creation in the same database transaction as the action — so if the action fails, the log does not exist either
- Enforces a 24-hour edit window on health records so that a doctor cannot silently rewrite a record days later
- Sends email verification and password reset through a provider that never delivers real emails in development (Mailtrap), so testing never accidentally contacts real patients

---

## 3. Purpose and Requirements

**Functional requirements:**

| Area | Requirement |
|---|---|
| Auth | Register, login, logout, token refresh, email verification, password reset |
| Users | Admin can list/delete users; user can update own profile |
| Patients | Admin/doctor can list patients; patient can view/edit own profile |
| Doctors | Admin creates doctor accounts; all authenticated users can list doctors |
| Appointments | Patient books; doctor updates status; patient/admin cancels; no double-booking |
| Health Records | Doctor creates/updates; patient reads own; admin reads all |
| Audit | Every appointment status change and health record creation is logged |

**Non-functional requirements:**

- JWT access tokens expire in 15 minutes; refresh tokens rotate and are stored as SHA-256 hashes
- Rate limiting: 10 requests per 15 minutes on auth routes, 100 on everything else
- All responses include security headers (Helmet)
- 80% test coverage enforced by CI — tests fail the pipeline if coverage drops
- Zero-downtime deploys via Kubernetes rolling updates

**Roles:**

```
admin   → full access to everything
doctor  → own appointments, create/update health records for any patient
patient → own appointments (book/cancel), own health records (read only)
```

---

## 4. System Architecture

### Production Architecture

```
                        ┌─────────────────────────────────────────┐
                        │              AWS Cloud                   │
                        │                                          │
  Browser / Mobile      │   ┌──────────────────────────────────┐  │
  Angular 19 SPA  ──────┼──►│     NGINX Ingress Controller     │  │
                        │   │  (Let's Encrypt TLS via          │  │
                        │   │   cert-manager)                  │  │
                        │   └──────────────┬───────────────────┘  │
                        │                  │                       │
                        │        ┌─────────▼──────────┐           │
                        │        │  K8s Service        │           │
                        │        │  (ClusterIP :80)    │           │
                        │        └─────────┬───────────┘           │
                        │                  │                       │
                        │     ┌────────────▼─────────────┐        │
                        │     │   K8s Deployment (EKS)   │        │
                        │     │   ┌──────┐  ┌──────┐     │        │
                        │     │   │ Pod  │  │ Pod  │     │        │
                        │     │   │ :3000│  │ :3000│     │        │
                        │     │   └──┬───┘  └──┬───┘     │        │
                        │     └──────┼──────────┼─────────┘        │
                        │            │          │                  │
                        │     ┌──────▼──────────▼──────┐          │
                        │     │   AWS RDS PostgreSQL    │          │
                        │     │   (Multi-AZ, encrypted) │          │
                        │     └────────────────────────┘          │
                        │                                          │
                        │   Secrets: AWS Secrets Manager           │
                        │   Images:  AWS ECR                       │
                        │   Logs:    CloudWatch                    │
                        └─────────────────────────────────────────┘

Email:  Nodemailer → AWS SES (prod) / Resend (free MVP) / Mailtrap (dev)
```

### Request Flow (single API call)

```
HTTP Request
    │
    ▼
router.ts          WHO can access — middleware chain
    │
    ├── authenticate    verify JWT → set req.user (401 if missing/invalid)
    ├── authorize       check req.user.role (403 if wrong role)
    ├── validate        run Zod on req.body (400 with field errors if invalid)
    │
    ▼
controller.ts      extract from req, call service, send res — no logic here
    │
    ▼
service.ts         business rules — throw AppError, call repository
    │              (fetch → ownership check → conflict check → call repo)
    ▼
repository.ts      SQL only — parameterized queries, return typed rows
    │
    ▼
PostgreSQL
```

### Database Schema

```
users
  id (PK)  email (UNIQUE)  password_hash  role  first_name  last_name
  is_active  email_verified  deleted_at  created_at  updated_at
     │                           │
     │ 1:1                       │ 1:1
     ▼                           ▼
  patients                    doctors
  id (PK)                     id (PK)
  user_id (UNIQUE FK)         user_id (UNIQUE FK)
  date_of_birth               specialisation
  blood_type                  licence_number (UNIQUE)
  emergency_contact
     │                           │
     │ 1:N                       │ 1:N
     └──────────┬────────────────┘
                ▼
          appointments
          id (PK)
          patient_id (FK → patients)
          doctor_id  (FK → doctors)
          scheduled_at
          status (pending|confirmed|cancelled|completed)
          notes

  patients ─── 1:N ──► health_records ◄─── 1:N ─── doctors
               id, patient_id, doctor_id
               diagnosis, prescription, notes, recorded_at

  users ─── 1:N ──► audit_logs
            user_id, action, resource, resource_id, timestamp

  users ─── 1:N ──► refresh_tokens (token_hash, expires_at, is_revoked)
  users ─── 1:N ──► email_verification_tokens (token, expires_at, used_at)
  users ─── 1:N ──► password_reset_tokens (token, expires_at, used_at)
```

---

## 5. System Design and Choices

### Module structure

Every feature follows the same 5-file structure with one direction of data flow:

```
router.ts       → schemas.ts (validate middleware)
controller.ts   → service.ts
service.ts      → repository.ts
repository.ts   → PostgreSQL
```

No layer skips another. The controller never touches SQL. The repository never throws business errors. The service never touches `req` or `res`. This separation means you can read any one file and understand exactly what it does without reading the others.

**Modules:** `auth`, `users`, `patients`, `doctors`, `appointments`, `health-records`

### Database migrations

7 migration files run in order. Each is idempotent (`IF NOT EXISTS`). They run automatically in CI before tests, and manually via `npm run migrate` in production.

```
001  users table
002  patients table
003  doctors table
004  appointments table + indexes
005  health_records table + indexes
006  audit_logs table + indexes
007  token tables (refresh, email verification, password reset)
     + additional performance indexes
     + ALTER users ADD email_verified
```

### Transactions

Any operation that touches more than one table uses `BEGIN / COMMIT / ROLLBACK`. Examples:
- Register: create user + create patient profile in one transaction
- Cancel appointment: UPDATE status + INSERT audit_log in one transaction
- Reset password: mark token used + update password hash + revoke all refresh tokens in one transaction

If any step fails, none of it persists.

### Pagination

Every list endpoint uses `limit` and `offset`. The response always has the same shape:

```json
{
  "status": "success",
  "data": [...],
  "meta": { "total": 84, "limit": 20, "offset": 0, "pages": 5 }
}
```

---

## 6. Why This Stack Specifically

### Node.js + Express

The team was already writing TypeScript. Express is minimal — it does routing and middleware and nothing else. That minimalism is intentional: this project needed control over every layer. A more opinionated framework (NestJS, Fastify with plugins) would have made the architecture less visible, which was a problem since the goal was also to document the patterns clearly for reuse on future projects.

### TypeScript

Not optional for a project this size. Without TypeScript, the JOINs in the repository layer return `any`, which means bugs from mismatched field names only appear at runtime in production. With TypeScript and interface definitions that mirror every SELECT alias, the compiler catches them.

### PostgreSQL (raw SQL, no ORM)

This is the most significant technical decision in the project. Three options were considered:

| Option | What it gives you | What it costs |
|---|---|---|
| ORM (TypeORM, Prisma) | Less SQL to write, schema from code | Hides what queries actually run; hard to write efficient JOINs; adds a dependency that can break on upgrades |
| Query builder (Knex) | Programmatic query construction | Abstraction with less benefit than an ORM, more complexity than raw SQL |
| Raw SQL (`pg`) | Full control, readable queries, no abstraction layer | You write every query yourself |

Raw SQL was chosen because the JOINs in this project (5-table JOINs for appointments with patient and doctor names) are specific enough that an ORM would fight you. The `query<T>()` helper in `database.ts` gives type safety on the returned rows without losing visibility into what runs.

### Zod

Zod validates at the boundary (request body) before anything reaches the controller. It also generates TypeScript types with `z.infer<>`, so the same definition does runtime validation and compile-time typing. That dual role removes an entire category of type/validation mismatch bugs.

### JWT + HTTP-only cookies

Access tokens (15 minutes) go in the `Authorization` header. Refresh tokens (7 days) go in HTTP-only cookies. HTTP-only means JavaScript cannot read the refresh token — XSS attacks cannot steal it. The refresh token value stored in the database is a SHA-256 hash of the actual token, so a database breach does not expose active sessions.

### Angular 19 (frontend)

Angular 19 standalone removes NgModules. Each component, service, and guard declares its own dependencies. The result is less boilerplate and clearer dependency trees. The HTTP interceptor attaches the JWT to every outgoing request automatically. Route guards (`AuthGuard`, `AdminGuard`) protect pages before they load.

### Helmet

One line in `app.ts`. Sets 14 security headers including `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and `Strict-Transport-Security`. Without it, the API is vulnerable to clickjacking, MIME sniffing, and protocol downgrade attacks by default.

---

## 7. Decisions Made Along the Way and Why Things Changed

**Decision 1: Raw SQL over ORM**
Started the project intending to use Prisma. Changed to raw SQL after writing the first 5-table JOIN for appointments. Prisma's query API would have required workarounds for that specific query shape. Raw SQL with a typed `query<T>()` helper gave the same result in fewer lines with full visibility.

**Decision 2: Refresh token storage**
Initially planned to store the raw refresh token string in the database. Changed to SHA-256 hash before any code was written, after reviewing the threat model. If an attacker gets read access to the database, raw tokens are immediately usable. Hashes are not.

**Decision 3: Email provider as an environment variable**
Initially hardcoded SMTP configuration for Mailtrap in development. Changed to a multi-provider auto-detection system (`EMAIL_PROVIDER=mailtrap|resend|ses`) so that the same codebase works across all environments without code changes. The config file reads `EMAIL_PROVIDER` and sets host/port automatically — the developer only supplies credentials.

**Decision 4: Audit logging inside transactions**
Initially wrote audit log inserts after the main action. Changed to inside the same transaction. The reason: if the appointment status update succeeds but the audit log insert fails, you have a state change with no record of it. Inside the transaction, either both succeed or neither does.

**Decision 5: 24-hour edit window on health records**
This rule was added after the initial schema design. Medical records are legal documents. A doctor editing a diagnosis 3 days after it was written with no audit trail is a liability. The 24-hour window enforces that corrections happen promptly and the original record is visible in the audit log.

**Decision 6: Slot availability check in the repository**
The first design checked slot availability in the service layer by fetching the doctor's appointments and filtering in memory. Changed to a single `COUNT(*)` query in the repository (`WHERE doctor_id = $1 AND scheduled_at = $2 AND status != 'cancelled'`). A memory check has a race condition — two requests arriving simultaneously both pass the check before either writes. A database-level COUNT under a transaction does not.

**Decision 7: Three integration tiers**
Originally the project had a development config and a production config. Changed to three named tiers (development → free-tier production → scaled production) because the gap between "works locally" and "works for real users" was too large. The free tier (Neon + Resend) gives a real deployment path without a credit card, which matters for the initial launch.

**Decision 8: isOwner middleware**
Horizontal privilege escalation (a patient accessing another patient's profile via `PATCH /patients/:id`) was initially handled inside each service. Extracted to dedicated `isOwner` middleware that compares `req.params.id` to `req.user.id`. Same logic, one place, applied consistently across users and patient profile update routes.

---

## 8. Comparing Different Methods

### Authentication: JWT vs Sessions

| | JWT (chosen) | Database sessions |
|---|---|---|
| Storage | Stateless — no server storage | Session table required |
| Revocation | Not possible for access tokens — mitigated by 15-minute expiry | Immediate, delete the row |
| Scalability | Any server can verify without coordination | All servers need access to session store |
| Chosen because | Stateless scales horizontally across K8s pods without shared session store | Would need Redis for session sharing across pods |

Refresh token rotation in the database gives the revocation capability (logout, password reset) without requiring sessions for every request.

### Validation: Zod vs class-validator vs manual

| | Zod | class-validator | Manual |
|---|---|---|---|
| Type inference | Yes — `z.infer<>` | No — separate types needed | No |
| Runtime validation | Yes | Yes | Yes |
| Error messages | Field-level, structured | Field-level | You write them |
| Chosen because | One definition does both the type and the validation. Less code, no duplication. |

### Database access: Raw SQL vs Prisma vs TypeORM

| | Raw SQL (chosen) | Prisma | TypeORM |
|---|---|---|---|
| Query visibility | Full | Hidden behind API | Partially hidden |
| Complex JOINs | Natural | Workarounds needed | Workarounds needed |
| Type safety | Via generics on `query<T>()` | Generated types | Decorators |
| Migration control | Full (you write SQL) | Prisma manages it | TypeORM manages it |
| Chosen because | 5-table JOINs are a core pattern in this project. Raw SQL is more readable and more correct for that pattern than any abstraction. |

### Deployment: K8s vs single server vs serverless

| | Kubernetes (chosen) | Single server (VPS) | Serverless |
|---|---|---|---|
| Zero-downtime deploy | Rolling updates built in | Manual blue-green | Built in |
| Scaling | Horizontal — add pods | Vertical — bigger machine | Automatic |
| Cost | Higher baseline | Lowest | Unpredictable at scale |
| Complexity | High | Low | Medium |
| Chosen because | Rolling updates with zero downtime and horizontal scaling matter for a healthcare API where uptime is a patient safety issue. The Terraform + K8s infrastructure is also fully reproducible. |

---

## 9. Access and Security

### Role matrix

| Action | Patient | Doctor | Admin |
|---|---|---|---|
| Register | Own account | — | Any role |
| List users | — | — | Yes |
| View patient profile | Own only | Yes | Yes |
| Book appointment | Own only | — | Yes |
| Update appointment status | — | Own appointments | Yes |
| Cancel appointment | Own only | — | Yes |
| Create health record | — | Yes | — |
| View health record | Own only (read) | Own created | Yes |
| Update health record | — | Within 24h | — |

### How access is enforced

Every route has an explicit middleware chain:

```
authenticate  → checks JWT, attaches req.user
authorize     → checks req.user.role against allowed roles (403 if wrong)
isOwner       → checks req.params.id === req.user.id (403 if not owner)
validate      → runs Zod schema on req.body (400 if invalid)
```

Ownership for related resources (a patient accessing their own appointments) is enforced in the service layer — the service fetches the resource and compares `patient_id` to the authenticated user's profile ID before returning data.

### Token security

- Access token: 15-minute expiry. Stored in memory on the client (not localStorage — no XSS risk).
- Refresh token: 7-day expiry. Stored in HTTP-only cookie (not readable by JavaScript). Stored in database as SHA-256 hash (not raw value).
- Rotation: every `/auth/refresh` call revokes the old token and issues a new one.
- Password reset: invalidates all refresh tokens for the user — forces re-login on all devices.

### Other security measures

- **Helmet**: 14 security headers on every response
- **Rate limiting**: 10 req/15 min on auth routes, 100 req/15 min elsewhere — prevents brute force and enumeration
- **User enumeration prevention**: `POST /auth/forgot-password` returns 200 whether or not the email exists
- **Bcrypt**: password hashing with 12 rounds
- **Soft deletes**: users are never hard-deleted — `deleted_at` timestamp set instead, preserving referential integrity
- **Parameterized queries**: all SQL uses `$1, $2` placeholders — SQL injection is not possible
- **CORS**: locked to `CORS_ORIGIN` env var — not `*`
- **Non-root container**: Dockerfile creates `appuser` and runs as that user — not root

---

## 10. Testing and Results

### Approach

Integration tests using Jest and Supertest. Tests make real HTTP requests against the full application stack with a real test database (`healthcare_test_db`). No mocking of the database or HTTP layer — the tests exercise the actual code path end to end.

### Test lifecycle

```
beforeAll   → run migrations on test database
beforeEach  → seed fresh test data
afterEach   → truncate all tables (FK-safe order)
afterAll    → close database pool
```

Each test gets a clean database state. Tests do not share data or interfere with each other.

### Coverage

80% minimum enforced across statements, branches, functions, and lines. If a PR drops coverage below 80%, the CI pipeline fails and the deploy does not happen.

Excluded from coverage: `server.ts` (entry point), `migrate.ts`, seed files, type definition files, `swagger.ts`.

### Test files

```
tests/
  auth.test.ts           register, login, logout, refresh, email verify, password reset
  users.test.ts          list, view, update, soft delete
  patients.test.ts       list, view by role, update own profile, appointments, health records
  doctors.test.ts        create, list, view, update own profile, appointments
  appointments.test.ts   book, slot conflict, cancel pending, cancel non-pending (fail), status update
  health-records.test.ts create, view by role, update within 24h, update after 24h (fail)
  helpers/
    testApp.ts           exports app without starting server (for Supertest)
    testDb.ts            database lifecycle helpers
```

### CI test run

```
GitHub Actions spins up postgres:15-alpine on port 5433
npm ci
tsc --noEmit  (type errors fail the build here)
npm run migrate:test
npm test      (Jest with --coverage --forceExit)
coverage report uploaded as artifact
```

---

## 11. CI/CD Pipeline

```
Developer pushes code
        │
        ▼
┌───────────────────────────────────────────────────┐
│              GitHub Actions: CI                    │
│                                                   │
│  1. Checkout code                                 │
│  2. Setup Node.js 20                              │
│  3. npm ci (install from lock file)               │
│  4. tsc --noEmit (type check — fail fast)         │
│  5. Start postgres:15-alpine service (port 5433)  │
│  6. npm run migrate:test (run migrations on test DB)│
│  7. npm test (Jest --coverage, 80% threshold)     │
│  8. Upload coverage report                        │
│                                                   │
│  PASS → continue   FAIL → stop, notify, no deploy │
└───────────────┬───────────────────────────────────┘
                │ (only on push to main)
                ▼
┌───────────────────────────────────────────────────┐
│              GitHub Actions: Deploy               │
│                                                   │
│  1. Configure AWS credentials (GitHub Secrets)    │
│  2. Login to Amazon ECR                           │
│  3. Build Docker image (multi-stage Dockerfile)   │
│  4. Tag image with git commit SHA                 │
│  5. Push image to ECR                             │
│  6. Update deployment.yaml with new image tag     │
│  7. aws eks update-kubeconfig                     │
│  8. kubectl apply (configmap, deployment,         │
│                    service, ingress)               │
│  9. kubectl rollout status (5 minute timeout)     │
│     → maxUnavailable: 0, maxSurge: 1              │
│     → zero downtime rolling update                │
└───────────────────────────────────────────────────┘

Docker image is multi-stage:
  Stage 1 (builder):    node:20-alpine → npm ci → tsc → dist/
  Stage 2 (production): node:20-alpine → npm ci --omit=dev → COPY dist/
  Result: small image, no dev dependencies, non-root user, healthcheck on /api/v1/health
```

---

## 12. Integration Tiers

The system runs identically in all environments. Only environment variables change. No code changes between tiers.

| Integration | Development | Free Production | Scaled Production |
|---|---|---|---|
| Database | Local PostgreSQL (Docker Compose) | Neon (0.5 GB free) | AWS RDS PostgreSQL |
| Email | Mailtrap (catches everything, never delivers) | Resend (3,000/mo free) | AWS SES ($0.10/1,000) |
| Container | Local Docker | GitHub Container Registry | AWS ECR |
| Compute | localhost | — | AWS EKS |
| Secrets | `.env` file | GitHub Secrets | AWS Secrets Manager |
| TLS | None | Let's Encrypt via cert-manager | Same |

Switching database:

```bash
# Development
DATABASE_URL=postgresql://postgres:password@localhost:5432/healthcare_db

# Free production (Neon)
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/healthcare_db?sslmode=require

# Scaled (AWS RDS after terraform apply)
DATABASE_URL=postgresql://postgres:pass@healthcare.xxxx.us-east-1.rds.amazonaws.com:5432/healthcare_db
```

Switching email:

```bash
EMAIL_PROVIDER=mailtrap   # → auto: sandbox.smtp.mailtrap.io:2525
EMAIL_PROVIDER=resend     # → auto: smtp.resend.com:465
EMAIL_PROVIDER=ses        # → auto: email-smtp.<region>.amazonaws.com:587
```

---

## 13. Conclusion

The system solves a real operational problem — disorganised patient and appointment management — with a deliberately simple architecture. Every layer does one thing. Every decision has a reason that traces back to a requirement: raw SQL because the JOINs are complex, HTTP-only cookies because XSS is a real threat, transactions for audit logs because partial writes are worse than no write, Kubernetes because patient-facing services cannot have maintenance windows.

The integration tier design means this can be running on Neon and Resend for free within an hour of cloning the repo, and migrated to AWS RDS with one environment variable change when load requires it. The CI pipeline enforces type safety and 80% test coverage on every push, so the production branch is always in a deployable state.

What the system does not yet do: real-time notifications (would add WebSockets or Server-Sent Events), file attachments for health records (would add S3/Cloudinary), billing and insurance, and a prescription module. The module pattern means each of these is additive — a new 5-file module, a new migration, one route mount in `app.ts`.

---

## 14. Suggested Additional Diagrams

These three diagrams would complete the project documentation:

**1. Entity Relationship Diagram (ERD)**
The most important missing diagram. Shows all 9 tables, their columns, data types, primary keys, foreign keys, and relationship cardinalities (1:1, 1:N). Tools: dbdiagram.io (free, paste SQL), or draw.io. This is the first diagram a new developer needs — before reading any code

You're right and I'm sorry — I should have just written it as text from the start. And I'm not being unkind at all, I appreciate you being patient.

Here is the full report. Copy it into `technical-report.md`.

---

```markdown
-->

# Healthcare Management System — Technical Report

---

## Table of Contents

1. [Summary](#1-summary)
2. [Problem Statement — What This Solves and Why](#2-problem-statement)
3. [Purpose and Requirements](#3-purpose-and-requirements)
4. [Stack Choices — Why Each Tool Was Picked](#4-stack-choices)
5. [System Architecture](#5-system-architecture)
6. [System Design and Layer Structure](#6-system-design-and-layer-structure)
7. [Database Design and Relationships](#7-database-design-and-relationships)
8. [Access Control and Security](#8-access-control-and-security)
9. [Authentication Flow](#9-authentication-flow)
10. [Email and Integration Tiers](#10-email-and-integration-tiers)
11. [Comparing Different Approaches](#11-comparing-different-approaches)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Infrastructure](#13-infrastructure)
14. [Testing and Results](#14-testing-and-results)
15. [Decisions Made Along the Way — and Why Things Changed](#15-decisions-made-along-the-way)
16. [Conclusion](#17-conclusion)
<!--16. [Suggested Diagrams to Complete the Project](#16-suggested-diagrams)-->


---

## 1. Summary

This is a REST API for managing healthcare operations — patients, doctors,
appointments, and health records. It is built with Node.js, Express, TypeScript,
and PostgreSQL. It includes a full authentication system with JWT access tokens
and rotating refresh tokens, role-based access control for three user types
(patient, doctor, admin), and an audit log that records every state change.

The frontend is Angular 19. The system deploys to AWS via Kubernetes (EKS),
with infrastructure defined in Terraform. GitHub Actions handles CI and CD.

The project is designed to scale from a free-tier local setup all the way to
production on AWS without changing any application code — only environment
variables change.

---

## 2. Problem Statement

### What problem does this solve?

Small and mid-size healthcare providers — clinics, private practices,
specialist offices — manage appointments, patient records, and doctor schedules
using spreadsheets, paper, or disconnected tools. This creates:

- **Double-booked appointments** — no system checks slot availability
- **Unauthorised record access** — no role enforcement; anyone can see any file
- **No audit trail** — no record of who changed what and when
- **Data loss risk** — paper or spreadsheet records are not backed up or versioned
- **Fragmented communication** — no automated emails for verification or reminders

### Why build this specifically?

Healthcare data is sensitive. A general-purpose CRUD app is not enough. This
system was built to demonstrate that production-grade concerns — token rotation,
audit logging, ownership checks, atomic transactions — can be implemented
clearly and without over-engineering, using tools a small team can actually
maintain.

The goal was also educational: to show how a real system goes from spec to
backlog to working code, and how every architectural decision connects directly
to a real requirement.

---

## 3. Purpose and Requirements

### Functional Requirements

| Requirement | Implemented |
|---|---|
| Patients can register and book appointments | Yes |
| Patients can cancel their own pending appointments only | Yes |
| Doctors can create and update health records | Yes |
| Doctors cannot double-book the same time slot | Yes |
| Health records editable only within 24 hours of creation | Yes |
| All status changes are logged atomically in audit_logs | Yes |
| Admins have full access to all resources | Yes |
| Email verification flow | Yes |
| Password reset with session invalidation | Yes |
| Paginated list endpoints | Yes |

### Non-Functional Requirements

| Requirement | How it is met |
|---|---|
| Security headers on every response | helmet() as first middleware |
| Brute-force protection on auth routes | express-rate-limit (10 req/15 min) |
| No raw tokens stored in the database | SHA-256 hash stored, raw token sent once |
| Secrets never in application code | Zod-validated env vars, K8s Secrets |
| Zero-downtime deploys | Kubernetes rolling update (maxUnavailable: 0) |
| 80% test coverage enforced | Jest coverage thresholds in jest.config.ts |
| Slow query visibility | database.ts logs queries exceeding 1000ms |

---

## 4. Stack Choices — Why Each Tool Was Picked

### Node.js + Express

**Why not Django, Rails, Laravel, Spring?**

The frontend is Angular (TypeScript). Using Node.js means one language across
the entire stack. TypeScript interfaces defined on the backend can be mirrored
directly in Angular models with no translation. The team does not need to
context-switch between languages.

Express was chosen over Fastify or NestJS because it is minimal. Every
middleware and route is explicit and visible. There is no magic — which matters
when teaching the architecture and when debugging in production.

### TypeScript

Not optional. Without TypeScript, the layered architecture falls apart —
controllers would pass untyped objects to services, services would pass
untyped objects to repositories, and runtime errors would be the only feedback.
TypeScript makes the contract between layers enforced at build time.
`strict: true` in tsconfig catches null errors, implicit any, and unreachable
code before the code ever runs.

### PostgreSQL (raw SQL, no ORM)

**Why not Prisma, TypeORM, Sequelize?**

ORMs hide the SQL. This project has complex 5-table JOINs in appointment and
health-record queries, composite indexes for slot-availability checks, and
transactions that must include audit log inserts atomically. ORMs make all of
this opaque — you lose control over exactly what query runs and when.

Raw SQL with the `pg` driver means:
- Every query is visible and readable
- Indexes are explicit in migrations, not inferred
- Transactions are written exactly as needed
- No version mismatch between ORM and PostgreSQL behaviour

The `query<T>()` helper in `database.ts` provides typed results without an ORM.

### JWT + Refresh Token Rotation

Access tokens expire in 15 minutes. Refresh tokens are stored (as SHA-256
hashes) in the database and rotated on every `/auth/refresh` call — old token
revoked, new token issued. This means:

- A stolen access token is only valid for 15 minutes
- A stolen refresh token is detected on next use (rotation invalidates it)
- Password reset revokes all active refresh tokens for the user (all sessions end)

This is more secure than long-lived JWTs and more scalable than stateful
sessions requiring a shared session store.

### Zod

Validation and TypeScript types in one place. `z.infer<typeof Schema>` produces
the TypeScript type from the schema — no duplication, no drift between the
validation rule and the type the controller uses. It runs as middleware before
the controller receives the request, so by the time `req.body` arrives at the
controller it is already validated and typed.

### Helmet

14 HTTP security headers applied in one line as the first middleware. Includes
`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Strict-Transport-Security`, and others. Applied first so no route can
accidentally bypass it.

### Nodemailer (multi-provider)

Email provider is controlled by `EMAIL_PROVIDER` env var. The same application
code sends emails through Mailtrap in development (nothing reaches real users),
Resend in production (3,000 free emails/month), and AWS SES when volume
requires it. No code changes — only environment variables.

### Angular 19 (Standalone)

Angular's standalone component model (no NgModules) was chosen because it
reduces boilerplate. The Angular HTTP interceptor handles JWT attachment
automatically on every request. Route guards protect pages by role.

### Docker (Multi-stage build)

Stage 1 (builder) compiles TypeScript to `dist/`. Stage 2 (production) copies
only `dist/` and production `node_modules`. The final image does not contain
TypeScript source, dev dependencies, or the compiler. It runs as a non-root
user. Size is roughly 40% smaller than a single-stage build.

### Kubernetes on EKS

Two replicas with a rolling update strategy (`maxUnavailable: 0`). Deployments
never take the API offline — the new pod must pass readiness checks before the
old one is terminated. Liveness and readiness probes hit `/api/v1/health` which
checks the database connection.

### Terraform

VPC, EKS cluster, RDS PostgreSQL, and ECR registry are all defined in code.
The infrastructure can be destroyed and recreated exactly. Modules separate
networking, compute, and database concerns.

---

## 5. System Architecture

```
                        ┌─────────────────────────────────┐
                        │         CLIENT LAYER            │
                        │                                 │
                        │   Angular 19 (Standalone)       │
                        │   - HTTP Interceptor (JWT)      │
                        │   - Route Guards (auth, admin)  │
                        │   - Pages: login, dashboard,    │
                        │     appointments, health records │
                        └──────────────┬──────────────────┘
                                       │ HTTPS
                                       ▼
                        ┌─────────────────────────────────┐
                        │       INGRESS LAYER             │
                        │                                 │
                        │   NGINX Ingress Controller      │
                        │   Let's Encrypt TLS (cert-mgr)  │
                        │   Routes:                       │
                        │   /api/v1 → healthcare-api svc  │
                        │   /       → frontend service    │
                        └──────────────┬──────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────┐
                        │      KUBERNETES CLUSTER (EKS)   │
                        │                                 │
                        │   Service (ClusterIP :80→3000)  │
                        │           │                     │
                        │   ┌───────┴────────┐            │
                        │   │                │            │
                        │   ▼                ▼            │
                        │  Pod 1           Pod 2          │
                        │  Node.js         Node.js        │
                        │  Express         Express        │
                        │  :3000           :3000          │
                        │                                 │
                        │  Rolling updates, 0 downtime    │
                        └──────────────┬──────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                   │
                    ▼                  ▼                   ▼
       ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐
       │  AWS RDS       │  │  Email         │  │  AWS ECR         │
       │  PostgreSQL    │  │  Provider      │  │  Container       │
       │                │  │                │  │  Registry        │
       │  Tables:       │  │  Dev:          │  │                  │
       │  users         │  │  Mailtrap      │  │  Docker images   │
       │  patients      │  │                │  │  tagged by       │
       │  doctors       │  │  Prod free:    │  │  git SHA         │
       │  appointments  │  │  Resend        │  └──────────────────┘
       │  health_records│  │                │
       │  audit_logs    │  │  Prod paid:    │
       │  refresh_tokens│  │  AWS SES       │
       │  *_tokens      │  └────────────────┘
       └────────────────┘

      INFRASTRUCTURE (Terraform):
      ┌──────────────────────────────────────────────────┐
      │  VPC → Subnets → Security Groups                 │
      │  EKS Cluster  → Node Groups                      │
      │  RDS PostgreSQL (Multi-AZ in production)         │
      │  ECR Repository                                  │
      │  S3 Backend for Terraform state                  │
      └──────────────────────────────────────────────────┘
```

### Request Flow (single API call)

```
Client
  │
  │  Authorization: Bearer <access_token>
  ▼
NGINX Ingress (TLS termination)
  │
  ▼
Express App (Pod)
  │
  ├─ helmet()           → add 14 security headers
  ├─ cors()             → allow Angular origin
  ├─ cookieParser()     → parse refresh token cookie
  ├─ express.json()     → parse request body
  ├─ morgan()           → log request
  │
  ├─ Router
  │   ├─ authenticate   → verify JWT → attach req.user
  │   ├─ authorize()    → check req.user.role
  │   ├─ validate()     → run Zod schema → 400 if invalid
  │   └─ controller     → extract from req, call service
  │
  ├─ Service            → business rules, ownership checks, throw AppError
  │
  ├─ Repository         → parameterized SQL → pg pool
  │
  └─ PostgreSQL (RDS)   → query result → rows
         │
         ▼
  Repository → Service → Controller → res.json({ status, data })
         │
         ▼
      Client
```

---

## 6. System Design and Layer Structure

![Health-Record-Creation-Data-Flow](https://github.com/KamoEllen/healthcare-system/blob/main/Health-Record-Creation-Data-Flow.svg )

        
Each feature is a module. Every module has exactly 5 files.
The rule: data flows in one direction only. No layer skips another.

```
schemas.ts      ← Zod: validate input shape, produce TypeScript type
router.ts       ← WHO can access (middleware chain) + which controller
controller.ts   ← extract from req, call service, send res
service.ts      ← business rules, ownership, throw AppError
repository.ts   ← SQL only, parameterized queries, typed return
```

### Modules

| Module | Key responsibility |
|---|---|
| auth | Register, login, token rotation, email verify, password reset |
| users | Admin user management, profile updates, soft delete |
| patients | Patient profiles, linked appointments and records |
| doctors | Doctor profiles, specialisation, schedule |
| appointments | Booking, slot check, status lifecycle, cancellation |
| health-records | Create, view, update (24h window), audit log |

### What never changes between modules

```
catchAsync wrapper on every controller method
AppError thrown in service, caught by errorHandler
authenticate → authorize → validate → controller order
repository returns result.rows[0] ?? null (single) or result.rows (array)
transactions use pg PoolClient: BEGIN → action + audit_log → COMMIT
```

### What changes between modules

```
The table names, column names, JOIN aliases
The business rules in service (who owns what, what state is valid)
The Zod schema fields
The authorize() roles per route
```

---

## 7. Database Design and Relationships

![Healthcare-Database-Schema](https://github.com/KamoEllen/healthcare-system/blob/main/Healthcare-Database-Schema.svg )
     
### Schema Overview

```
users (001)
│
├── 1:1  patients (002)   user_id UNIQUE FK
│         │
│         ├── 1:N  appointments (004)   patient_id FK
│         └── 1:N  health_records (005) patient_id FK
│
├── 1:1  doctors (003)    user_id UNIQUE FK
│         │
│         ├── 1:N  appointments (004)   doctor_id FK
│         └── 1:N  health_records (005) doctor_id FK
│
├── 1:N  refresh_tokens (007)           user_id FK
├── 1:N  email_verification_tokens (007) user_id FK
├── 1:N  password_reset_tokens (007)    user_id FK
└── 1:N  audit_logs (006)               user_id FK

audit_logs — polymorphic reference
  resource VARCHAR ('appointments', 'health_records')
  resource_id UUID (no FK — references multiple tables)
```

### Key Index Decisions

```sql
-- Slot availability check: WHERE doctor_id=$1 AND scheduled_at=$2
CREATE INDEX idx_appointments_doctor_scheduled ON appointments(doctor_id, scheduled_at);

-- Pagination and filtering
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor_id  ON appointments(doctor_id);
CREATE INDEX idx_health_records_patient_id ON health_records(patient_id);

-- Audit log queries by time
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- Soft delete filter (WHERE deleted_at IS NULL)
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
```

PostgreSQL does not auto-index foreign keys. Every FK used in a WHERE clause
has an explicit index. The slot-availability check uses a composite index
because both columns appear in the same WHERE clause together.

### Soft Deletes

Users are never hard-deleted. `deleted_at` is set to `NOW()`. This preserves
referential integrity — appointments and health records still reference the
user row. It also means deleted users can be restored by an admin.

### Token Storage

Refresh tokens, email verification tokens, and password reset tokens are stored
as SHA-256 hashes. The raw token is sent to the client once and never stored.
This means a database breach does not expose usable tokens.

---

## 8. Access Control and Security

![Appointment-Status-State-Machine](https://github.com/KamoEllen/healthcare-system/blob/main/Appointment-Status-State-Machine.svg)

        
### Three Roles

```
admin   → full access to everything
doctor  → own appointments, create/update health records
patient → own appointments (create/cancel), own health records (read only)
```

### How Access Control Is Enforced — Three Separate Guards

```
1. authorize()   — at the router level
   Checks req.user.role against the allowed list
   Returns 403 before the controller runs
   Example: authorize('admin') on GET /appointments

2. isOwner       — at the router level (profile updates)
   Compares req.params.id to req.user.id
   Prevents horizontal privilege escalation
   Example: PATCH /users/:id — can only update own profile

3. Service ownership check — inside the service
   Fetches the record, compares owner IDs to req.user
   Returns 403 if wrong owner even if role is allowed
   Example: patient can only cancel their own appointments
            doctor can only update status on their own appointments
```

### Security Headers (helmet)

All 14 headers applied as first middleware. Key ones:
- `Content-Security-Policy` — blocks XSS injection
- `X-Frame-Options: DENY` — blocks clickjacking
- `X-Content-Type-Options: nosniff` — blocks MIME sniffing
- `Strict-Transport-Security` — forces HTTPS

### Rate Limiting

```
Auth routes (POST /auth/*):  10 requests per 15 minutes
All other routes:           100 requests per 15 minutes
```

Lower limit on auth routes blocks credential stuffing attacks.

### Password Policy

Enforced in Zod schemas:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 digit
- At least 1 special character

Stored as bcrypt hash with 12 rounds.

### CORS

`credentials: true` is required for the browser to send HTTP-only cookies
(refresh token). Only the Angular origin is allowed. Origin is set via
`CORS_ORIGIN` env var — not hardcoded.

---

## 9. Authentication Flow

![Authentication-Flow-Token-Lifecycle](https://github.com/KamoEllen/healthcare-system/blob/main/Authentication-Flow-Token-Lifecycle.svg )

        
### Registration

```
POST /auth/register
  │
  ├─ Zod validates: email, password, first_name, last_name, date_of_birth, blood_type
  │
  ├─ Service: hash password (bcrypt 12 rounds)
  │
  ├─ Repository transaction (BEGIN):
  │   ├─ INSERT INTO users
  │   └─ INSERT INTO patients (user_id → new user)
  │   COMMIT
  │
  ├─ Create email_verification_token (24h expiry)
  │
  └─ Send verification email (non-blocking — does not fail registration if email fails)
```

### Login + Token Lifecycle

```
POST /auth/login
  │
  ├─ Find user by email → bcrypt.compare(password, hash)
  │
  ├─ Sign access token (JWT, 15m, payload: id, email, role)
  │
  ├─ Generate raw refresh token (crypto.randomBytes)
  │   Store SHA-256(rawToken) in refresh_tokens table
  │
  ├─ Set HTTP-only cookie: refreshToken=<rawToken>
  │   (HttpOnly, Secure, SameSite=Strict)
  │
  └─ Return access token in response body

POST /auth/refresh (called automatically when access token expires)
  │
  ├─ Read refresh token from HTTP-only cookie
  ├─ Hash it → look up in refresh_tokens
  ├─ Check: is_revoked=false, expires_at > NOW()
  ├─ Revoke old token (is_revoked=true)
  ├─ Issue new access token + new refresh token
  └─ Set new cookie

POST /auth/reset-password
  │
  ├─ Consume password_reset_token (mark used_at=NOW())
  ├─ Hash new password
  ├─ UPDATE users SET password_hash = ...
  └─ Revoke ALL refresh_tokens for this user
     (all active sessions end — logged out everywhere)
```

---

## 10. Email and Integration Tiers

The entire system is designed to run free in development, free at low volume in
production, and scale to paid services when needed — by changing environment
variables only. No code changes.

### Tiers

| Layer | Dev (free, local) | Production free | Production paid |
|---|---|---|---|
| Database | PostgreSQL via Docker | Neon (0.5 GB) | AWS RDS ($25/mo) |
| Email | Mailtrap (catches all) | Resend (3k/mo) | AWS SES ($0.10/1k) |
| Containers | Local Docker | GitHub Container Registry | AWS ECR |
| Compute | docker-compose | EKS (2 pods) | EKS (autoscaled) |
| Secrets | .env file | GitHub Secrets | AWS Secrets Manager |
| TLS | None (localhost) | Let's Encrypt (free) | Let's Encrypt (free) |

### How to Switch Database Tier

Only `DATABASE_URL` changes. Zero application code changes.

```bash
# Local
DATABASE_URL=postgresql://postgres:password@localhost:5432/healthcare_db

# Neon (prod free)
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/healthcare_db?sslmode=require

# AWS RDS (prod paid)
DATABASE_URL=postgresql://postgres:pass@healthcare.xxxx.rds.amazonaws.com:5432/healthcare_db
```

### How to Switch Email Provider

```bash
# Dev — Mailtrap catches everything, nothing reaches real users
EMAIL_PROVIDER=mailtrap

# Prod free — Resend (3,000 emails/month)
EMAIL_PROVIDER=resend
EMAIL_PASS=re_your_api_key

# Prod paid — AWS SES
EMAIL_PROVIDER=ses
EMAIL_USER=AKIAIOSFODNN7EXAMPLE
EMAIL_PASS=your-ses-smtp-password
```

---

## 11. Comparing Different Approaches

### ORM vs Raw SQL

| | ORM (Prisma/TypeORM) | Raw SQL (this project) |
|---|---|---|
| Learning curve | Lower initially | Higher initially |
| Query visibility | Hidden behind abstraction | Fully visible |
| Complex JOINs | Difficult to control | Direct control |
| Transaction control | Limited or verbose | Explicit BEGIN/COMMIT |
| Index management | Inferred (not always right) | Explicit in migrations |
| Debugging slow queries | Hard — need to log generated SQL | Query is the code |
| **Verdict** | Good for rapid prototyping | Better for production, teaching, complex queries |

This project chose raw SQL because the 5-table JOINs in appointment and
health-record queries need to be exact. An ORM would generate inefficient
queries or require workarounds.

### Stateful Sessions vs JWT

| | Stateful Sessions (Redis/DB) | JWT + Refresh Rotation (this project) |
|---|---|---|
| Token revocation | Immediate | Immediate (refresh token in DB) |
| Horizontal scaling | Requires shared session store | Stateless access token — no shared store |
| Implementation complexity | Moderate | Moderate |
| Database dependency for auth | Yes (session store) | Only for refresh token lookup |
| **Verdict** | Fine for single-server apps | Better for horizontally scaled containers |

Sessions would require Redis or a shared session table checked on every request.
JWT access tokens are verified locally (cryptographically) — no DB round-trip
per request. Only the `/auth/refresh` endpoint hits the database.

### Monolith vs Microservices

This system is a **modular monolith**. All modules share one database and one
process. This is intentional.

| | Microservices | Modular Monolith (this project) |
|---|---|---|
| Operational complexity | High (service discovery, network calls) | Low |
| Team size needed | Large | Small (1–5 devs) |
| Database per service | Yes (isolation) | No (shared, simpler) |
| Deployment | Complex orchestration | Single container |
| Good for this project? | No — over-engineered | Yes |

The module pattern (router → controller → service → repository) means splitting
into microservices later is possible — each module is already isolated. But at
this scale, the monolith is the right call.

### NestJS vs Plain Express

NestJS would have added decorators, dependency injection, and a lot of
framework convention. For a team learning the architecture, this hides too much.
Plain Express makes every decision visible: why middleware is in this order, why
the error handler has four parameters, why `catchAsync` exists. These are
things NestJS handles automatically, which means they cannot be taught.

---

## 12. CI/CD Pipeline

![AWS-Deployment-Architecture](https://github.com/KamoEllen/healthcare-system/blob/main/AWS-Deployment-Architecture.svg)

        
```
Developer pushes code
        │
        ▼
┌───────────────────────────────────────────────────┐
│  GitHub Actions — ci.yml                          │
│  Trigger: push or PR to main                      │
│                                                   │
│  1. Checkout code                                 │
│  2. Setup Node.js 20 (npm cache)                  │
│  3. npm ci                                        │
│  4. npx tsc --noEmit  ← type check only, no emit │
│  5. Start postgres:15-alpine service container    │
│  6. Copy .env.test                                │
│  7. npm run migrate:test  ← run migrations on     │
│     test database                                 │
│  8. npm test  ← Jest --coverage --forceExit       │
│  9. Upload coverage report                        │
│                                                   │
│  FAILS ON: type error, migration error,           │
│  test failure, coverage below 80%                 │
└───────────────────────┬───────────────────────────┘
                        │ CI passes
                        ▼
┌───────────────────────────────────────────────────┐
│  GitHub Actions — deploy.yml                      │
│  Trigger: push to main (after CI passes)          │
│  Environment: production (requires approval)      │
│                                                   │
│  1. Configure AWS credentials (GitHub Secrets)    │
│  2. Login to Amazon ECR                           │
│  3. docker build -f infra/docker/Dockerfile       │
│  4. docker push to ECR  (tag: git SHA)            │
│  5. sed replace IMAGE_TAG in deployment.yaml      │
│     with the exact git SHA just pushed            │
│  6. aws eks update-kubeconfig                     │
│  7. kubectl apply configmap.yaml                  │
│  8. kubectl apply deployment.yaml                 │
│  9. kubectl apply service.yaml                    │
│ 10. kubectl apply ingress.yaml                    │
│ 11. kubectl rollout status (5 minute timeout)     │
│     ← waits for new pods to pass readiness probe  │
│                                                   │
│  K8s rolling update:                              │
│  - Starts new pod (new image)                     │
│  - Readiness probe: GET /api/v1/health            │
│  - Only terminates old pod after new passes       │
│  - maxUnavailable: 0  ← zero downtime guaranteed │
└───────────────────────────────────────────────────┘
                        │
                        ▼
               Production (EKS)
               Running new image
               Old pods terminated
```

### What protects production

- Type errors block the pipeline before any image is built
- Test failures and coverage below 80% block deployment
- Production environment requires manual approval in GitHub
- Each deployment is tagged with the git SHA — exact version is always known
- Rollback is `kubectl rollout undo` — takes seconds

---

## 13. Infrastructure

### Local Development

```bash
docker-compose up
# Starts: postgres:15, Node.js app (hot-reload), nginx

npm run dev          # ts-node-dev with --respawn --transpile-only
npm run migrate      # run migrations against local DB
npm run seed         # insert test data
```

### Production (AWS)

```
Terraform provisions:
  - VPC with public and private subnets
  - EKS cluster (Kubernetes control plane)
  - RDS PostgreSQL (managed, in private subnet)
  - ECR repository (stores Docker images)
  - S3 bucket + DynamoDB (Terraform state backend)

Kubernetes runs:
  - Deployment: 2 replicas, rolling update
  - Service: ClusterIP (internal only)
  - Ingress: NGINX with Let's Encrypt TLS
  - ConfigMap: non-secret env vars (NODE_ENV, CORS_ORIGIN, rate limits)
  - Secret: DATABASE_URL, JWT_SECRET (never in ConfigMap)
```

### Docker Image

```dockerfile
Stage 1 — builder (node:20-alpine)
  COPY package*.json
  RUN npm ci              ← installs all deps including dev
  COPY src/
  RUN npm run build       ← tsc → dist/

Stage 2 — production (node:20-alpine)
  COPY package*.json
  RUN npm ci --omit=dev   ← production deps only
  COPY --from=builder /app/dist ./dist
  RUN adduser appuser     ← non-root
  USER appuser
  EXPOSE 3000
  HEALTHCHECK GET /api/v1/health
  CMD ["node", "dist/server.js"]
```

Result: TypeScript source, compiler, and dev dependencies are not in the
production image. Image is significantly smaller and has a smaller attack
surface.

---

## 14. Testing and Results

### Approach

Integration tests using Jest + Supertest. Tests call the real Express app
against a real test PostgreSQL database. No mocking of the database layer —
queries run against actual tables.

```
Test lifecycle per file:
  beforeAll  → setupTestDb()   — create tables (idempotent)
  beforeEach → seedTestDb()    — insert fresh test data
  afterEach  → truncateTestDb() — clean all tables (FK-safe order)
  afterAll   → closeTestDb()   — close pg pool
```

### Coverage Requirement

80% minimum across statements, branches, functions, and lines. Enforced in
`jest.config.ts`. The CI pipeline fails if coverage drops below this.

Excluded from coverage: `server.ts`, migrations, seeds, type declaration
files, swagger config — none of these contain business logic.

### Test Files

```
tests/
  auth.test.ts          register, login, refresh, logout, verify email, password reset
  users.test.ts         list, get, update, soft delete
  patients.test.ts      list, get, update own profile, ownership checks
  doctors.test.ts       create (admin), list, get, update own profile
  appointments.test.ts  book, slot conflict, cancel, status update, ownership
  health-records.test.ts create, view, update, 24h edit window, ownership
```

### What Each Test Covers

For every endpoint:
- Happy path (correct role, valid data, returns expected shape)
- Auth failure (no token → 401)
- Role failure (wrong role → 403)
- Ownership failure (correct role, wrong resource → 403)
- Business rule failure (e.g. double-booking → 409, already cancelled → 409)
- Validation failure (bad input → 400 with field errors)
- Not found (non-existent ID → 404)

### Test Environment

Separate test database on port 5433 (CI: PostgreSQL service container).
`JWT_EXPIRES_IN=24h` in `.env.test` so tokens do not expire during test runs.
Rate limits set to 1000/window in test environment so tests do not trigger 429.

---

## 15. Decisions Made Along the Way — and Why Things Changed

### Decision 1: No ORM

**Initial thought:** Use Prisma — it is the most popular choice and has good
TypeScript support.

**What changed:** Once the appointment query was written (5-table JOIN with two
aliases for users, a composite index for slot availability, and an audit log
insert in the same transaction), it became clear the ORM would fight us at
every step. The raw SQL is readable, debuggable, and exact. We kept it.

### Decision 2: Refresh token rotation instead of long-lived JWTs

**Initial thought:** Use a 7-day JWT access token — simpler, no database.

**What changed:** A stolen 7-day JWT cannot be revoked without a token blacklist
(which requires a shared store). Rotation with a DB-stored hash means a stolen
refresh token is detected on next use. The 15-minute access token limits damage
from a stolen access token. The complexity cost is low — one extra table and
one extra endpoint.

### Decision 3: SHA-256 hash of refresh tokens, not raw storage

**Initial thought:** Store the refresh token directly in the database.

**What changed:** If the `refresh_tokens` table is ever read by an attacker,
raw tokens are immediately usable. Hashes are not. The raw token is transmitted
once (over HTTPS) and never stored. This follows the same principle as password
hashing — you never store what you verify against.

### Decision 4: HTTP-only cookie for refresh token, body for access token

**Initial thought:** Store both tokens in localStorage.

**What changed:** localStorage is readable by any JavaScript on the page — XSS
attacks can steal tokens stored there. HTTP-only cookies cannot be read by
JavaScript at all. The refresh token (long-lived, most sensitive) goes in the
cookie. The access token (short-lived, 15 minutes) goes in the response body
and is stored in memory by Angular, not localStorage.

### Decision 5: Audit log in the same transaction

**Initial thought:** Write the audit log in a separate call after the main
action succeeds.

**What changed:** If the audit log write fails after the action succeeds, you
have an action with no record. If the action fails but the audit log write
succeeded, you have a phantom record. Wrapping both in one transaction means
either both commit or both roll back. Atomicity is not optional for an audit
trail.

### Decision 6: 24-hour edit window on health records

**Initial thought:** Doctors can edit health records at any time.

**What changed:** Medical records that can be silently edited indefinitely are
a liability. A 24-hour window lets doctors correct mistakes while creating a
clear point after which the record is immutable. This is a business rule
enforced in the service layer, not in the database — which makes it easy to
adjust if the window needs to change.

### Decision 7: Soft delete for users

**Initial thought:** Hard delete — simpler.

**What changed:** A patient with appointments and health records cannot be
hard-deleted without cascading through those records. Soft delete (setting
`deleted_at`) preserves the referential integrity of historical data while
removing the user from active lists. Admin can restore a deleted user. The
`idx_users_deleted_at` index ensures `WHERE deleted_at IS NULL` queries remain
fast.

### Decision 8: Zod env validation on startup

**Initial thought:** Read `process.env` directly in each file that needs it.

**What changed:** A missing `JWT_SECRET` or malformed `DATABASE_URL` would
cause a runtime error deep in the request lifecycle, not on startup. Zod
validates all required env vars when the process starts and exits immediately
with a clear message if any are missing or malformed. The application never
starts in a broken state.

### Decision 9: Angular Standalone (no NgModules)

**Initial thought:** Standard Angular with NgModules — more documentation
available.

**What changed:** Angular 19 makes standalone the default. NgModules add
boilerplate without benefit at this scale. Standalone components are simpler to
understand and test. The project does not need module-level providers.

### Decision 10: Swagger/OpenAPI from the start

**Initial thought:** Add API documentation later.

**What changed:** The frontend and backend are developed by the same person
here, but in a real team the frontend developer needs a contract to build
against. The OpenAPI spec at `/api/v1/docs` acts as that contract. Writing it
from the start also catches inconsistencies in the API design before they are
coded into the frontend.

---
<!--
## 16. Suggested Diagrams to Complete the Project

The system architecture diagram and CI/CD flow above cover the infrastructure.
The following diagrams would complete the picture:

### 1. Entity-Relationship Diagram (ERD) — Most Important

Shows all 9 tables, their columns, primary keys, foreign keys, and
cardinality (1:1, 1:N). Makes the database design immediately readable.
Tools: dbdiagram.io (free, export to PNG), or draw.io.

```
Why: The 5-table JOINs in appointment and health-record queries are only
understandable if you can see the relationships visually.
```

### 2. Authentication Sequence Diagram

Shows the token lifecycle as a sequence:
- Client → POST /auth/login → Server → sets cookie + returns access token
- Client → any protected request → Server (JWT verified locally, no DB)
- Client → POST /auth/refresh → Server (DB lookup, rotation, new cookie)
- Client → POST /auth/logout → Server (revoke, clear cookie)

Tools: SequenceDiagram.org, or Mermaid (renders in GitHub markdown).

```
Why: The HTTP-only cookie / access-token-in-body split is not obvious
from the code. A sequence diagram makes the flow unmistakable.
```

### 3. State Machine Diagram — Appointment Status

```
        ┌─────────┐
  Book  │         │
 ──────►│ pending │
        │         │
        └────┬────┘
             │
      ┌──────┼──────────────┐
      │      │              │
      ▼      ▼              ▼
  confirmed cancelled    (invalid transition)
      │
      ▼
  completed
```

Shows which transitions are valid, which role can trigger each, and
what the cancel endpoint guards against (only `pending` can be cancelled).

Tools: draw.io, Mermaid state diagram.

```
Why: The status field has a CHECK constraint and business rules in the
service. A state machine diagram shows all valid paths in one view.
```

### 4. Deployment Architecture Diagram

Shows the AWS account structure:
- VPC with public/private subnets
- EKS nodes in private subnets
- RDS in isolated subnet
- Load balancer in public subnet
- Bastion or VPN for admin access

```
Why: The Terraform code defines this but it is not visually obvious
from HCL. A diagram shows the network topology and what is exposed
to the internet vs what is not.
```

### 5. Data Flow Diagram — Health Record Creation

Shows the full path of data for one operation (doctor creates health record):
```
Doctor client
  → POST /health-records (body: patient_id, diagnosis)
  → Zod validate
  → authenticate (JWT)
  → authorize('doctor')
  → controller extracts dto + req.user
  → service: findByUserId (doctor profile)
  → service: findById (patient exists?)
  → repository: BEGIN transaction
     → INSERT health_records
     → INSERT audit_logs
     COMMIT
  → return HealthRecordWithDetails
  → 201 response
```

```
Why: Shows exactly why transactions exist and what data is verified
before a write happens. Useful for onboarding new developers.
```
-->
---

## 16. Conclusion

### What was built

A production-grade healthcare REST API with:
- Full authentication (registration, login, token rotation, email verify, password reset)
- Role-based access control (patient, doctor, admin) enforced at router and service level
- Six feature modules following an identical 5-file pattern
- Atomic audit logging on every state change
- A full CI/CD pipeline from code push to Kubernetes deployment
- Infrastructure defined in code (Terraform + Kubernetes manifests)
- An Angular frontend with HTTP interceptors and route guards
- 80% test coverage enforced in the pipeline

### What makes it maintainable

Every module follows the same pattern. A new developer joining the team can
read one module and understand all of them. The layer separation means a
business rule change touches the service only. A SQL change touches the
repository only. A validation change touches the schema only. Nothing bleeds
between layers.

### What makes it secure

- Tokens hashed before storage
- HTTP-only cookies for refresh tokens
- Short-lived access tokens (15 minutes)
- Helmet on every response
- Rate limiting on auth endpoints
- Zod strips unknown fields from all input
- No raw SQL string concatenation anywhere — only parameterized queries
- Audit trail written atomically with every action

### What makes it scalable

- Stateless API pods (JWT verified locally, no shared session store)
- Kubernetes rolling updates (zero downtime)
- Database switchable with one env var (Docker → Neon → RDS)
- Email provider switchable with one env var (Mailtrap → Resend → SES)
- Terraform manages all infrastructure — reproducible in any AWS region

### The core principle

Every decision in this system traces back to a requirement. Nothing was added
speculatively. The 24-hour edit window exists because medical records need a
clear immutability point. The composite index on `(doctor_id, scheduled_at)`
exists because slot availability checks use both columns. The audit log is in
the same transaction because a log that can be lost is not a log. The system
is not clever. It is deliberate.
```
