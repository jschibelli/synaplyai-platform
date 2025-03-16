# AI Content Creation Platform

## Overview

A scalable, multi-tenant AI content creation platform with enterprise-grade compliance controls, usage tracking, and collaborative editing features. This platform empowers organizations to leverage AI for content generation while maintaining strict governance, tenant isolation, and comprehensive usage monitoring.

![Platform Architecture](https://via.placeholder.com/800x400?text=Platform+Architecture)

## Key Features

### Core Capabilities

- 🚀 **Rich text editor** with AI-assisted content generation and completion
- 🔒 **Strong multi-tenant isolation** architecture with AsyncLocalStorage
- 📊 **Comprehensive usage tracking** and budget controls
- 🛡️ **Advanced content filtering** and compliance mechanisms
- ⚡ **Real-time collaborative editing** with conflict resolution

### Enterprise-Grade Compliance Framework

- **Partitioned Immutable Logging**: Tamper-proof audit trails with SHA-256 integrity verification
- **Multi-Stage Content Filtering**: Progressive filtering pipeline (regex → embedding → LLM)
- **Circuit Breakers & Bulkheads**: Fault isolation with tenant-aware circuit breaking
- **Time-Bucketed Metrics**: Performance tracking with p95/p99 latency visualization
- **Operational Dashboards**: Real-time monitoring of system health and compliance

## Architecture

### Multi-Tenant Isolation

The system uses AsyncLocalStorage to maintain strict tenant boundaries across all operations. Each tenant's data and operations are completely isolated, preventing any cross-tenant access.

```typescript
// Example of tenant context middleware
export function withTenantContext(handler) {
  return async (req, res) => {
    const tenantId = getTenantIdFromRequest(req);
    return tenantContextStorage.run({ tenantId }, () => {
      return handler(req, res);
    });
  };
}
```

### Compliance Framework

The compliance framework consists of several key components that work together to ensure governance and regulatory requirements:

1. **Immutable Logging**
   - PostgreSQL partitioned tables with automatic rotation
   - Cryptographic integrity verification
   - REVOKE-based immutability constraints

2. **Content Filtering Pipeline**
   - Fast regex filters for prohibited terms
   - Semantic matching with embedding models
   - LLM-based nuanced content evaluation (feature-flagged)
   - Early-exit optimization for performance

3. **Circuit Breakers**
   - Tenant-specific failure thresholds
   - Automatic recovery with half-open state
   - Redis-backed distributed state
   - Adaptive thresholds based on error rates

4. **Metrics Collection**
   - Time-bucketed Redis storage (minute/hour/day)
   - TTL-based cleanup strategy
   - Tenant-aware sharding
   - Percentile latency calculations

### CQRS and Event Sourcing (In Progress)

The document editing system is being built on an event-sourced architecture:

- All document changes are stored as immutable events
- Document state can be reconstructed by replaying events
- Snapshots provide performance optimization for large documents
- Undo/redo functionality uses command inversion pattern

## Tech Stack

- **Frontend**: React, Tiptap Rich Text Editor, Socket.io
- **Backend**: Node.js, TypeScript, Next.js
- **Database**: PostgreSQL with Prisma ORM
- **AI Integration**: OpenAI GPT-4, Anthropic Claude 3
- **Infrastructure**: Redis for metrics/caching, Event-sourced persistence

## Getting Started

### Prerequisites

- Node.js v16+
- PostgreSQL 14+
- Redis 7+
- OpenAI API key (for GPT-4 integration)
- Anthropic API key (for Claude integration)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ai-content-platform.git
   cd ai-content-platform
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. Initialize the database:
   ```bash
   npx prisma migrate dev
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Access the application at http://localhost:3000

## Project Status

The project is currently in active development, with the following milestones:

- ✅ **Week 1-2**: Project foundations and initial setup
- ✅ **Week 3-4**: Core features and multi-tenant isolation
- ✅ **Week 5-6**: Enhanced governance and compliance framework
- 🔄 **Week 7-8**: Command pattern and event sourcing (in progress)
- 📅 **Week 9-10**: Advanced features and integration (planned)
- 📅 **Week 11-12**: Polish and production readiness (planned)

## Development Guide

### Tenant Isolation

All code that accesses data must respect tenant boundaries:

```typescript
import { getCurrentTenantId } from '../lib/tenantContext';

async function getDocuments() {
  const tenantId = getCurrentTenantId();
  
  if (!tenantId) {
    throw new Error('Tenant context missing');
  }
  
  return prisma.document.findMany({
    where: { tenantId }
  });
}
```

### Compliance Logging

Use the ComplianceLogger for any security or compliance-relevant events:

```typescript
import { ComplianceLogger } from '../compliance/logger';

await ComplianceLogger.log({
  eventType: 'document.created',
  resourceId: document.id,
  description: 'Document created by user',
  metadata: { documentType: document.type }
});
```

### Circuit Breaker Usage

Wrap external service calls with circuit breakers to prevent cascading failures:

```typescript
import { getCircuitBreaker } from '../circuit-breaker/factory';

const breaker = getCircuitBreaker('openai-service');

try {
  const result = await breaker.execute(() => {
    return openaiService.generateContent(prompt);
  });
  
  return result;
} catch (error) {
  // Handle circuit open or service failure
  return fallbackContent();
}
```

## Testing

Run the test suite with:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:tenant-isolation
npm run test:compliance
npm run test:usage
```

## Documentation

Detailed documentation is available in the `docs` directory:

- [Project Plan](docs/project-plan.md) - Overview, goals, milestones
- [Compliance Framework](docs/COMPLIANCE-FRAMEWORK.md) - Audit & governance architecture
- [Circuit Breaker Pattern](docs/CIRCUIT-BREAKER.md) - Fault tolerance implementation
- [Filtering System](docs/FILTERING-SYSTEM.md) - Content filtering pipeline
- [Redis Setup](docs/REDIS-SETUP.md) - Redis configuration for metrics & caching
- [Usage Tracking](docs/USAGE-TRACKING.md) - Consumption monitoring & reporting
- [Tenant Isolation](docs/POC-TENANT-ISOLATION.md) - Multi-tenant architecture
- [Changelog](docs/CHANGELOG.md) - Project history and updates

## Deployment

### Environment Configuration

Configure your production environment with the following variables:

```
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Redis
REDIS_URL=redis://user:password@host:port

# AI Services
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Authentication
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://your-domain.com

# Compliance
COMPLIANCE_LOG_RETENTION_MONTHS=24
```

### Deployment Checklist

- [ ] Set up database with partitioning enabled
- [ ] Configure Redis with persistence and appropriate memory limits
- [ ] Set up automated database backups
- [ ] Enable database encryption at rest
- [ ] Configure SSL/TLS for all connections
- [ ] Set up monitoring and alerting
- [ ] Configure auto-scaling policies
- [ ] Test failover and recovery procedures

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit your changes: `git commit -m 'Add new feature'`
4. Push to the branch: `git push origin feature/new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenAI for GPT-4 API
- Anthropic for Claude API
- Tiptap for rich text editing capabilities
- Redis Labs for Redis implementation guidance
- All contributors and reviewers

## Contact

For questions or support, please contact the project maintainers at jschibelli@gmail.com.