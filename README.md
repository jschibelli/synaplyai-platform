# SynaplyAI: Enterprise Multi-Tenant AI Content Platform

Built and architected by [John Schibelli](https://github.com/jschibelli) — Front-End Lead, UI/UX architect, and platform co-creator.

## At a Glance

SynaplyAI is a secure, scalable AI content creation platform built for enterprise teams who need governance, real-time collaboration, and performance at scale. It features token-level AI interaction (OpenAI + Claude), full tenant isolation, and collaborative editing with real-time feedback loops.

## Key Features

- Real-time collaborative editing (Y.js, Socket.io)
- Multi-model streaming (Claude & OpenAI) with token-level tracking
- Full tenant isolation with AsyncLocalStorage + Prisma middleware
- Command/event-sourced architecture with conflict resolution
- Tiered usage tracking, circuit breaker logic, and audit-compliant logging

## Demo & Screenshots (coming soon)

*Placeholder for demo video or screenshots.*

## Architecture Overview

SynaplyAI is composed of four tightly integrated subsystems:

- Tenant Isolation — async context propagation and Prisma filters enforce per-tenant boundaries across every layer
- Command Pattern + Event Sourcing — type-safe operations with replayable, immutable event logs
- Real-Time Sync — built with Y.js, Socket.io, and document state management for concurrent editing
- AI Stream Handling — token-based suggestion streaming with fine-grained usage tracking and circuit breaking

### Architecture Diagram
```
┌────────────┐     ┌────────────┐     ┌────────────┐
│   Client   │────▶│  Command   │────▶│   Events   │
│ Interface │     │  Registry  │     │   Store    │
└────────────┘     └────────────┘     └────┬───────┘
                                          ▼
┌────────────┐     ┌────────────┐     ┌────────────┐
│ Real-time  │◀───▶│  Document  │◀────│  Handlers  │
│   Sync     │     │   State    │     │            │
└────────────┘     └────────────┘     └────────────┘
      ▲                                        ▲
      └──────────── Tenant Context ───────────┘
```

## Tech Stack

- Frontend: React, TypeScript, Next.js, TailwindCSS, Zustand
- Real-Time: Socket.IO, Y.js, Tiptap
- Backend: Node.js, Express, OpenAI & Claude APIs
- Database: PostgreSQL (Prisma ORM, partitioned per tenant)
- Caching: Redis (metrics, usage, circuit state)

## Security & Compliance

- Context-based tenant enforcement at every access layer
- Tamper-proof audit trails with immutable logs
- Content filtering pipeline with progressive rule stages
- Circuit breakers scoped per tenant for API resilience

## Usage Tracking & Billing

- Token-precise usage logging
- Redis time-bucketed metrics for day/month analytics
- Per-model and per-tenant tracking
- Integrated with subscription tiers for feature gating

## Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL 14+
- Redis 6+

### Installation
```bash
git clone https://github.com/your-org/synaplyai.git
cd synaplyai
npm install
cp .env.example .env.local
# Edit your .env.local
npx prisma migrate dev
npm run dev
```

## Architectural Decisions

### Tenant Isolation
- Approach: AsyncLocalStorage + Prisma Middleware
- Benefit: Request-level enforcement, no shared leakage, full async propagation

### Event Sourcing
- Approach: Immutable event logs, adaptive snapshotting
- Benefit: Replay support, complete audit history, reliable conflict detection

### Circuit Breaker
- Approach: Redis-backed tenant-aware pattern
- Benefit: Self-healing, scoped failure boundaries, real-time thresholds

## Testing Strategy

- Isolation tests to validate multi-tenant safety
- Replay tests for event → state integrity
- Concurrency tests for collaborative conflict resolution
- Load & circuit breaker tests

## Deployment Options

- Kubernetes (multi-tenant pods, autoscaling)
- Serverless (context-aware functions)
- VM-based deployments with API gateways

## Roadmap

- WYSIWYG AI-powered content block editor
- AI session memory + draft persistence
- Multi-doc workspace switching
- Model selection + fine-tuning profiles

## Contributors

- John Schibelli — Project Lead, Front-End & Architecture

For subsystem documentation, see `/docs`.

## License

MIT — see [LICENSE](./LICENSE) for details

