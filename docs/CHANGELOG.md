# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.4.0] - 2025-03-16

### Added
- Redis integration for usage tracking
- Proper Redis mocking for tests
- Circuit breaker pattern implementation
- Usage metrics repository with tenant isolation
- Cost calculation service with model-specific pricing
- Subscription management with tier-based limits
- Real-time token counting with Redis
- Fallback cache mechanism for Redis failures

### Changed
- Updated test configuration for Redis mocks
- Improved error handling in UsageTracker
- Enhanced tenant isolation in metrics collection
- Modified subscription tiers to include token limits
- Updated Jest configuration for better test isolation

### Fixed
- Redis connection handling in tests
- Tenant context propagation in async operations
- Usage tracking edge cases
- Test suite cleanup and proper mocking

## [0.3.0] - 2025-03-25

### Added
- Tenant isolation implementation with AsyncLocalStorage
- Prisma middleware for automatic tenant filtering
- Content filtering system for AI prompts and responses
- Tenant-specific content filtering rules
- Comprehensive test suite for tenant isolation and content filtering
- Integration with OpenAI and Anthropic services with tenant context
- Logging system for content filtering events
- API middleware for tenant context propagation

### Changed
- Updated database schema to support tenant isolation
- Modified AI services to respect tenant boundaries
- Enhanced error handling with tenant-aware logging
- Updated API routes to use tenant context middleware

### Fixed
- Cross-tenant data access vulnerabilities
- Content filtering edge cases
- Tenant context persistence in async operations

## [0.2.0] - 2025-03-21

### Added
- Rich text editor implementation with Tiptap
- AI content generation integration with the editor
- Real-time collaborative editing with Y.js
- Streaming AI responses via Socket.io
- Model selection UI for switching between ChatGPT and Claude
- Circuit Breaker pattern for API resilience
- Analytics module for tracking AI usage

### Changed
- Extended database schema to support document versioning
- Enhanced AIStreamingProvider with better error handling
- Improved editor performance with optimized rendering

### Fixed
- Socket authentication issues in collaborative editing
- AI service connection failures with timeout handling
- Model selection persistence between editing sessions

## [0.1.0] - 2025-03-14

### Added
- Initial project plan with overview, goals, roles & responsibilities, milestones & timeline, communication plan, risks & challenges, and next steps.

## [Unreleased]

### Added
- Initial project setup and documentation structure.
- Prisma schema for user management, authentication, subscriptions, and usage tracking.
- Environment variables for database connection.
- Communication plan, risks & challenges, and next steps in the project plan.

### Changed
- Updated `.env` file with database connection strings.

### Fixed
- Resolved issues with missing Prisma schema file.
- Fixed database schema drift by resetting and reapplying migrations.
