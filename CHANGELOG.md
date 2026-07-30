# Changelog

Notable repository changes are documented here. This project follows semantic
versioning for tagged v2 releases; the original tutorial did not publish
semantic release tags.

## Unreleased

### Added

- A browser-asset contract test that preserves the tutorial form, task list,
  acknowledgement control, same-origin API, WebSocket, and recovery surface.
- Deterministic integration coverage for third-attempt recovery and exhausted
  retries without exposing a magic failure command in the public API.
- Migration, cutover, rollback, privacy, data-handling, and vulnerability
  reporting guidance.

### Changed

- The guided tutorial now explains both retry recovery and terminal failure
  evidence.

## 2.0.0 - 2026-07-27

### Added

- One Node 24 API/worker codebase with pinned dependencies, lockfile, current
  Compose, health checks, graceful shutdown, and non-root read-only containers.
- BullMQ durable jobs, bounded retries, saved task state, cross-instance live
  hints, recent-task recovery, and idempotent acknowledgement.
- Signed anonymous tutorial sessions and production OIDC/JWT identity with
  stable tenant-and-subject ownership.
- Redis-backed per-identity rate limits, bounded retention, Redis TLS/ACL
  validation, unit tests, hermetic Redis integration tests, and least-privilege
  GitHub Actions CI.
- A same-origin browser lab, guided tutorial, architecture analysis, and
  production operations guide.

### Removed

- Node 4 and Redis 2.8 assumptions, legacy Compose v2, public Redis/notifier
  ports, unauthenticated `/notify`, and socket IDs in task routing.
- Redis Pub/Sub as the work queue. Pub/Sub now carries only an optional
  low-latency update.

## Legacy demo - 2016

- Introduced the concise browser, web server, Redis, worker, and notifier
  teaching flow.
- Documented the horizontal-scaling and browser-refresh problems but left them
  unresolved.
- The final pre-modernization default snapshot is `4ec72a8`; it is historical
  source, not a supported release or rollback target.
