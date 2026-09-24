# LangkahSiswa

LangkahSiswa is a multi-tenant operational platform for schools and Islamic boarding schools.

One installation serves multiple foundations and schools.

Tenant data is isolated using `tenant_id` in a shared PostgreSQL schema.

The platform is used by administrators, teachers, guardians, students, and other roles according to their permissions.

---

# Project Status

Current version:

V1.0

Phase 0–22 and Phase 24 are completed.

Phase 23, hardware integration, is deferred.

Refer to:

`PHASES.md`

for the detailed phase definitions.

---

# Project Structure

```text
langkahsiswa/
├── apps/
│   ├── api/          NestJS backend
│   ├── admin/        React admin dashboard
│   ├── website/      React public website renderer
│   └── mobile/       Flutter application
│
├── packages/
│   ├── shared-types/ Shared type definitions
│   └── validation/   Shared validation schemas
│
├── infra/            Nginx and Docker configuration
├── docs/             Detailed module documentation
└── docker-compose.yml
```

## Primary Scope

This agent primarily works on:

```text
apps/admin
apps/api
apps/website
```

The Flutter application in:

```text
apps/mobile
```

is outside the default scope.

Do not modify mobile code unless explicitly requested.

---

# Technology Stack

## Backend

```text
Node.js
TypeScript
NestJS
PostgreSQL
Redis
BullMQ
MinIO / S3
Firebase Cloud Messaging
```

## Admin

```text
React
TypeScript
Vite
```

## Public Website

```text
React
TypeScript
Vite
```

## Infrastructure

```text
Docker Compose
Nginx / Load Balancer
```

---

# Architecture

```text
Internet
    │
Nginx / LB
    │
    ├── school.sch.id
    │       │
    │    Website
    │
    ├── app.langkahsiswa.id
    │       │
    │    Admin
    │
    └── api.langkahsiswa.id
            │
          NestJS API
            │
     ┌──────┼─────────┐
     │      │         │
PostgreSQL Redis    MinIO/S3
```

The API is consumed by:

* Admin
* Website
* Mobile

The backend remains the authoritative source for business rules and authorization.

---

# Modular Monolith

The backend is a modular monolith.

Domain logic belongs inside appropriate backend modules.

Do not introduce microservices unless explicitly requested.

Prefer domain boundaries that could later be extracted into services without redesigning the data model.

---

# Multi-Tenant Architecture

The database uses:

```text
shared PostgreSQL schema
```

Tenant isolation is implemented using:

```text
tenant_id
```

Every tenant-scoped query must enforce the correct tenant boundary.

Never expose data belonging to another tenant.

Never remove tenant filtering simply to make a query easier.

Tenant context can be resolved from:

* Subdomain
* Custom domain
* JWT `tenant_id`

Tenant resolution must be consistent with the existing implementation.

---

# Authentication

JWT contains:

```text
sub
tenant_id
roles
permissions
```

The system supports users with multiple roles.

A user may be bound to multiple schools under a foundation.

School context can change without requiring another login.

Refresh tokens are rotated on use.

Revoked tokens are recorded in:

```text
revoked_tokens
```

Do not weaken authentication or token validation.

---

# Authorization

Authorization exists at multiple levels:

* Role
* Permission
* Tenant
* School context
* Backend endpoint
* Admin UI
* UI action

Never rely only on frontend permission checks.

The backend must enforce authorization.

The admin UI should reflect the same authorization model.

When adding a feature, inspect the existing permission system before implementing custom checks.

Refer to:

```text
docs/PERMISSIONS.md
```

when permission behavior is unclear.

---

# Domain Modules

The platform contains these domains:

```text
Platform
Auth
School
People
Academic
Attendance
Assessment
Report Cards
Finance
Wallet
POS
PPDB
Events
Notifications
Files
Website
Boarding
Library
Security
```

Respect existing domain boundaries.

Do not place business logic randomly in controllers or UI components when an existing domain service/module is appropriate.

---

# Important Business Principles

## Wallet

Wallet balance is ledger-based.

Transactions are immutable:

* Topup
* Purchase
* Refund

Cached balance exists for performance.

The ledger remains the source of truth.

Never directly manipulate the wallet balance in a way that bypasses the ledger.

---

## Report Cards

Report cards are stored as structured data.

Do not treat PDF as the primary data source.

PDF is generated during rendering.

Report data must remain queryable and reviewable.

Approval and publication are separate business states where supported by the existing implementation.

Refer to:

```text
docs/IMPLEMENTATION.md
```

and relevant report-card documentation before changing this behavior.

---

## Website Builder

The public website uses a JSON-based page definition.

Pages are not stored as arbitrary HTML.

The renderer uses a component registry.

The website builder supports configurable page composition without allowing arbitrary code injection.

Do not replace the JSON page-definition model with raw HTML unless explicitly requested.

Refer to:

```text
docs/WEBSITE_BUILDER.md
```

for detailed behavior.

---

# Admin Application

Location:

```text
apps/admin
```

The admin application is:

```text
React + TypeScript + Vite
```

It is used for operational management.

When implementing admin features:

* Follow existing UI patterns.
* Follow `UI_STANDARDS.md`.
* Respect RBAC.
* Respect tenant context.
* Use the existing API client and data-fetching patterns.
* Reuse existing components where appropriate.
* Do not duplicate backend business logic unnecessarily.

The admin should consume the API rather than directly accessing PostgreSQL.

---

# Public Website

Location:

```text
apps/website
```

The website is the public renderer for school websites.

Local development uses:

```text
http://localhost:5174/{kode-sekolah}/{slug}
```

The website must render the JSON page definitions provided by the platform.

Follow:

```text
docs/WEBSITE_BUILDER.md
```

when working on:

* Page rendering
* Components
* Blocks
* Page versions
* Assets
* Public routes
* School branding
* Tenant/domain resolution

Do not expose private tenant data through public website routes.

---

# Backend API

Location:

```text
apps/api
```

The backend uses:

```text
NestJS
TypeScript
PostgreSQL
Redis
BullMQ
```

Backend responsibilities include:

* Authentication
* Authorization
* Tenant resolution
* Business logic
* Validation
* Persistence
* Transactions
* File metadata
* Queue processing
* Notifications
* Audit logging

Controllers should remain focused on transport concerns.

Business logic should live in appropriate services/domain modules.

---

# API Rules

Before adding an endpoint:

1. Search for an existing endpoint.
2. Check whether the functionality already exists.
3. Follow existing naming conventions.
4. Follow existing DTO patterns.
5. Follow existing validation.
6. Follow existing authentication and permission guards.
7. Apply tenant filtering.
8. Add appropriate tests.

Do not create duplicate endpoints for functionality that already exists.

Do not guess request or response formats when the existing source can be inspected.

---

# Database

PostgreSQL is the primary database.

Shared schema is used.

Tenant-scoped tables use:

```text
tenant_id
```

Respect existing migrations and schema conventions.

Do not modify production data through ad-hoc application logic.

For schema changes:

* Create proper migrations.
* Preserve existing data.
* Consider tenant isolation.
* Consider indexes.
* Consider foreign keys.
* Consider transaction integrity.

Do not silently change existing schema behavior.

---

# Transactions and Data Integrity

Use database transactions where multiple related writes must succeed or fail together.

This is especially important for:

* Wallet transactions
* Payments
* POS checkout
* Stock mutations
* Enrollment
* Report approval/publication
* Other financial or state-transition operations

Do not implement multi-step financial mutations as unrelated writes when atomicity is required.

---

# Redis and Queues

Redis and BullMQ are used for caching and background processing.

Do not move synchronous business operations into background jobs unless the existing architecture or requirements support it.

Background jobs should be:

* Retryable
* Idempotent where appropriate
* Observable
* Safe against duplicate execution

---

# File Storage

File storage uses:

```text
MinIO
```

in development and:

```text
R2 / S3
```

in production.

Do not store large binary files directly in PostgreSQL unless the existing design explicitly requires it.

Store file metadata separately from the object itself.

Follow existing private/public access rules.

---

# UI Standards

The main theme uses:

```text
Primary: #004aad
```

with:

* White light background
* Black/dark dark-mode background
* Light blue accents
* Subtle pastel accents

Refer to:

```text
UI_STANDARDS.md
```

before creating or significantly modifying UI.

Do not invent a separate visual system for a single module.

---

# Frontend / Backend Boundary

The general rule is:

```text
Backend = business rules + authorization + data
Admin = operational interface
Website = public rendering
```

Do not move important business rules into React merely because they are convenient to implement there.

Do not trust frontend validation as a security boundary.

Frontend validation improves UX.

Backend validation protects the system.

---

# Cross-App Feature Workflow

When implementing a feature that touches multiple applications:

1. Inspect the backend domain and API.
2. Implement or update the API contract if required.
3. Implement admin behavior.
4. Implement public website behavior if applicable.
5. Verify cross-app consistency.

When only one application needs changes, do not modify the others unnecessarily.

---

# Documentation

Important documentation:

```text
docs/IMPLEMENTATION.md
docs/START_APP.md
docs/FINANCE.md
docs/MOBILE_NOTIFICATIONS.md
docs/GOOGLE_LOGIN.md
docs/ACCOUNT_LEVELS_PPDB.md
docs/ACCOUNT_REALMS.md
docs/PERMISSIONS.md
docs/ADMISSIONS_FILES.md
docs/WEBSITE_BUILDER.md
docs/BOARDING_MODULES.md
docs/OPERATIONS_SECURITY.md
docs/VERIFICATION.md
docs/PHASE_23_DEFERRED.md
PHASES.md
UI_STANDARDS.md
```

Read the relevant documentation before modifying a complex domain.

Do not assume documentation and implementation are identical when the source code can be inspected.

For behavior questions, prefer the current implementation when documentation is outdated, but do not silently rewrite the documented architecture.

---

# Development

Quick start:

```powershell
npm install

npm run setup

docker compose up -d postgres redis minio

npm run db:migrate

npm run db:seed

npm run dev
```

Development URLs:

```text
Admin:
http://localhost:5173

Website:
http://localhost:5174/{kode-sekolah}/{slug}

API health:
http://localhost:3000/health
```

---

# Testing and Verification

After making changes, verify the smallest relevant scope first.

Examples:

```text
API:
- unit tests
- integration tests
- API behavior
- authorization
- tenant isolation

Admin:
- TypeScript
- lint
- tests
- affected UI behavior

Website:
- TypeScript
- lint
- renderer behavior
- public route behavior
```

Run broader verification when the change affects shared infrastructure or multiple domains.

Never claim verification that was not actually performed.

---

# Security

Treat the following as security-sensitive:

* Tenant isolation
* Authentication
* Authorization
* JWT
* Refresh tokens
* Revoked tokens
* File access
* Public website rendering
* Payment
* Wallet
* Audit logs
* User data

Never expose secrets, tokens, passwords, private files, or cross-tenant data.

Never use client-controlled `tenant_id` as sufficient authorization.

Always validate tenant context server-side.

---

# Change Discipline

Do not:

* Rewrite unrelated modules
* Replace architecture without a requirement
* Add dependencies unnecessarily
* Duplicate existing services
* Bypass permissions
* Bypass tenant filtering
* Hardcode tenant-specific behavior
* Put business logic only in the frontend
* Introduce raw HTML into the website builder without explicit approval
* Modify mobile code unless requested

Prefer the smallest correct change.

---

# Completion Report

After finishing a task, use this format:

## Changed

* Brief list of actual changes.

## Verified

* Actual tests/checks performed.

## Remaining

* Only unresolved issues or unverified areas.

Do not replay the implementation process.

Do not provide a long explanation unless requested.
