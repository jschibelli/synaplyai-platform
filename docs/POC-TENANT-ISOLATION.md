# Tenant Isolation and Content Filtering POC

This document explains how to run and test the proof-of-concept (POC) implementation for tenant isolation and basic AI content filtering.

## Overview

This POC demonstrates:
1. **Tenant Context Propagation** - Using AsyncLocalStorage to maintain tenant context throughout request handling
2. **Automatic Data Isolation** - Using Prisma middleware to filter all database queries by tenant ID
3. **Basic Content Filtering** - Pre- and post-processing of AI content to prevent disallowed terms
4. **Metrics Collection** - Per-tenant usage tracking and monitoring
5. **Enhanced Logging** - Structured logging with tenant context

## Running the POC

### Prerequisites
- Node.js v18+
- PostgreSQL database
- Redis instance

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables:
   - Copy `.env.example` to `.env.local`
   - Update database connection strings and API keys
4. Run database migrations: `npx prisma migrate dev`
5. Start the development server: `npm run dev`

## Testing Implementation

### 1. Manual Testing with API Endpoints

Use two different tenant contexts to verify isolation:

```bash
# Tenant 1 request
curl -X POST http://localhost:3000/api/ai \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-1" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"model": "gpt-4o", "content": "Write about our company"}'

# Tenant 2 request
curl -X POST http://localhost:3000/api/ai \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-2" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"model": "gpt-4o", "content": "Write about our company"}'
```

### 2. Testing Content Filtering

Test the content filter with various scenarios:

```bash
# Test global disallowed terms
curl -X POST http://localhost:3000/api/ai \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-1" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"model": "gpt-4o", "content": "Write about hate speech"}'

# Test tenant-specific terms
curl -X POST http://localhost:3000/api/ai \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-1" \
  -H "Authorization: Bearer <TOKEN}" \
  -d '{"model": "gpt-4o", "content": "Write about proprietary information"}'
```

### 3. Running Automated Tests

Execute the full test suite:

```bash
# Run all tenant isolation and content filtering tests
npm run test:tenant-isolation

# Run specific test suites
jest --testPathPattern=tests/content-filter
jest --testPathPattern=tests/metrics
```

## Verifying Implementation

### 1. Tenant Isolation
- Each tenant should only see their own data
- Cross-tenant access attempts should be blocked
- Tenant context should persist through async operations

### 2. Content Filtering
- Global disallowed terms should be blocked
- Tenant-specific terms should be blocked
- Filtering events should be logged
- Metrics should be collected

### 3. Metrics and Logging
- Check logs for structured tenant information
- Verify metrics are being collected per tenant
- Monitor filtering events in logs

## Known Limitations
- Simple term-matching for content filtering
- In-memory metrics storage (not production-ready)
- Basic logging implementation

## Next Steps
- Implement more sophisticated content filtering
- Add persistent metrics storage
- Enhance logging with proper error tracking