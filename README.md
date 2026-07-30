# Sample Notifier Service

[![CI](https://github.com/pulkitsinghal/sample-notifier-service/actions/workflows/ci.yml/badge.svg)](https://github.com/pulkitsinghal/sample-notifier-service/actions/workflows/ci.yml)

A modern tutorial for a durable background-job notification pattern:

1. a browser asks an API to start work;
2. the API returns immediately with a task ID;
3. a separate worker processes the durable job;
4. Socket.IO provides a fast, targeted update; and
5. the browser reads saved task state after a reload or missed event; and
6. the user explicitly acknowledges a terminal notification.

The original 2016 demo made this flow unusually easy to see. This replacement
keeps that teaching intent while fixing its clean-clone, authentication,
delivery, scaling, and dependency problems.

## Run the lab

Requirements:

- Docker with Docker Compose v2
- a browser

```sh
git clone https://github.com/pulkitsinghal/sample-notifier-service.git
cd sample-notifier-service
docker compose up --build
```

Open <http://localhost:3000>, run a task, and watch it move from queued to
running to completed.

Stop the lab with:

```sh
docker compose down
```

The named volume keeps queued jobs and recent results between ordinary
restarts. Nothing in this repository deploys cloud infrastructure or invokes a
paid service.

## What changed

| Concern | 2016 demo | Replacement |
| --- | --- | --- |
| Runtime | EOL Node 4, Redis 2.8, legacy Compose v2 | Node 24 LTS, pinned packages and images, current Compose Specification |
| Clean start | Dockerfiles did not install dependencies | Multi-stage image uses `npm ci` and a lockfile |
| Job delivery | Redis Pub/Sub could lose work while the worker was offline | BullMQ keeps jobs in Redis and retries failures with backoff |
| Browser delivery | Result existed only as a socket event | Socket event is a fast hint; recent task state and acknowledgement are durable |
| Identity | Socket ID was treated as a short-lived password | Local signed sessions; production JWT access tokens validated by issuer, audience, algorithm, expiry, tenant, and subject |
| Redelivery | Refresh produced an unrelated delivery target | Unacknowledged terminal tasks replay when the same identity reconnects |
| Internal notify API | Public, unauthenticated `/notify` endpoint | Worker publishes an internal event; browsers cannot choose the target room |
| Multiple API instances | Each notifier owned an isolated socket map | Every API replica subscribes to completion events and emits to its local room |
| Exposure | Redis and notifier ports were published to the host | Only the web API binds to `127.0.0.1`; Redis stays on the container network |
| Safety | No validation, security headers, limits, health checks, or graceful stop | Bounded JSON, exact-origin writes, Redis-backed per-identity limits, Helmet CSP, health endpoints, shutdown handlers |
| Verification | Test scripts intentionally failed | Unit and Redis integration suites locally, in Compose, and in GitHub Actions |

See [the architectural analysis](docs/architecture.md) for the evidence and
tradeoffs behind each change.

## Architecture

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API and notifier gateway
    participant Q as Redis and BullMQ
    participant W as Worker

    B->>A: Local signed session or production access token
    B->>A: POST /api/tasks
    A->>Q: Rate limit identity; index and add durable job
    A-->>B: 202 Accepted and taskId
    Q->>W: Claim job
    W->>Q: Save completion and publish live hint
    Q-->>A: Fan out task update to every API replica
    A-->>B: Socket.IO task:update
    B->>A: GET /api/tasks/:taskId
    A->>Q: Read durable state and verify identity owner
    A-->>B: Authoritative task state
    B->>A: POST /api/tasks/:taskId/ack
    A->>Q: Save idempotent acknowledgement
```

The queue and saved result carry the reliability requirement. Redis Pub/Sub
and Socket.IO carry only the low-latency update. Losing that update does not
lose the result.

## Learn by experimenting

The [guided tutorial](docs/tutorial.md) walks through:

- the normal request, queue, worker, and notification path;
- a worker outage;
- a browser disconnect and result recovery;
- the cross-instance integration test;
- explicit acknowledgement and reconnect replay;
- the exact security boundary of the anonymous demo session; and
- the provider-neutral production identity contract.

## Adopt or evaluate it

- [Architecture notes](docs/architecture.md) preserve the original teaching
  intent and explain why the 2016 design is obsolete.
- [Migration and rollback](docs/migration.md) maps the old contracts to v2 and
  gives a cutover and recovery procedure.
- [Production guide](docs/production.md) defines the identity, Redis, delivery,
  scaling, and pre-deployment boundaries.
- [Privacy and data handling](docs/privacy.md) inventories stored and transient
  data, retention limits, and safe tutorial inputs.
- [Security policy](SECURITY.md) describes supported versions and private
  vulnerability reporting.
- [Changelog](CHANGELOG.md) separates the legacy demo, v2 release, and
  unreleased safeguards.

## Validate

Unit tests need Node 24:

```sh
npm ci
npm test
```

The integration suite needs a real Redis-compatible server. The reproducible
container path builds the test image, starts Redis, and runs both suites:

```sh
docker compose --profile test run --build --rm test
docker compose down
```

The integration suite covers two-API fan-out, durable recovery, retry
exhaustion, production identity across devices, tenant isolation,
acknowledgement replay, and distributed rate limiting.

## Production starter

`AUTH_MODE=oidc` turns the API into a provider-neutral authenticated resource
server. It validates signed JWT access tokens against a configured JWKS,
derives authorization only from the validated tenant and subject claims, and
requires production Redis to use `rediss://` with a named ACL user and
password. Optional CA and mutual-TLS certificate files are supported.

See the [production configuration and operations guide](docs/production.md)
for the identity contract, client example, Redis ACL/TLS guidance, retention,
rate-limit and acknowledgement semantics, health behavior, and deployment
checklist.

This is a production **starter**, not a deployment:

- the checked-in secret, anonymous mode, Redis container, and UI are local-only;
- production mode is API-only and requires external OIDC login/token acquisition;
- an operator must supply HTTPS termination, a secret manager, secured Redis,
  backups, capacity limits, monitoring, and tested recovery;
- A real worker operation must be idempotent because durable queues can
  redeliver after failures.
- Configurable retention and rate limits are mechanisms, not a product,
  compliance, or data-classification decision.
- Redis 8 is tri-licensed. This sample uses its unmodified official image for
  local development; an owner should select and review the applicable Redis
  license before redistribution or product use.

## Primary references

Design choices were checked against current primary documentation on
2026-07-27:

- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Express security best practices](https://expressjs.com/en/advanced/best-practice-security/)
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)
- [Socket.IO with multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/)
- [Redis Pub/Sub delivery semantics](https://redis.io/docs/latest/develop/pubsub/)
- [Redis security and ACL guidance](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)
- [Redis TLS](https://redis.io/docs/latest/operate/oss_and_stack/management/security/encryption/)
- [Redis 8 licensing options](https://redis.io/legal/licenses/)
- [BullMQ retry behavior](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725)
- [`jose` JWT/JWKS documentation](https://github.com/panva/jose)
- [GitHub Actions Node.js guidance](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
- [GitHub Actions service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers)
- [Docker Compose Specification](https://docs.docker.com/reference/compose-file/)
- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)

## License

Apache-2.0. See [LICENSE](LICENSE).
