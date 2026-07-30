# Privacy and data handling

This repository is a software tutorial and production starter. It is not a
clinical, financial, identity, or regulated-data system. Use synthetic,
non-sensitive messages in the local lab. An adopter must perform its own data
classification, privacy review, threat model, retention decision, and legal
assessment before processing real data.

## Data inventory

| Data | Where it exists | Default behavior |
| --- | --- | --- |
| Task message and derived result | BullMQ job data and terminal state in Redis | Terminal jobs are configured for 24-hour age-based retention |
| Anonymous session identifier | Signed HttpOnly, SameSite cookie | Random local identity; the browser page cannot read it |
| Opaque owner and room keys | Queue data and Redis indexes | HMAC-derived; raw tenant and subject claims are not stored |
| Acknowledgement timestamp | Redis | First write is retained with the task recovery window |
| Recent-task index | Redis sorted set | Bounded on read and expires with configured retention |
| Rate-limit counter | Redis | Expires after the configured fixed window |
| OIDC access token and claims | Request/socket authentication memory | Validated transiently; not written to job or application state |

The simulated result includes the submitted message. Do not type secrets,
access tokens, personal data, or production payloads into the tutorial.
Browser rendering uses `textContent`, but safe rendering does not make stored
content appropriate to collect.

## Network and logging boundary

The local Compose stack publishes only the API on loopback. Redis stays on the
container network. The application has no built-in analytics, advertising, or
telemetry exporter. In production OIDC mode it retrieves signing keys from the
single configured JWKS endpoint.

Application logs avoid task bodies, cookies, access tokens, Redis URLs,
credentials, certificate contents, and raw identity claims. Reverse proxies,
container platforms, identity providers, Redis services, and observability
agents may create their own metadata or logs; configure and review them
separately.

## Retention and deletion

`TASK_RETENTION_SECONDS` applies to terminal BullMQ jobs, recent-task indexes,
and acknowledgements. It defaults to 24 hours and accepts 5 minutes through 30
days. Age-based queue cleanup can be lazy, and queued or active work is not a
terminal retention promise. Backups, replicas, logs, browser storage, and
infrastructure snapshots are outside the application deletion path.

The local named Redis volume survives `docker compose down`. Running
`docker compose down --volumes` intentionally deletes queued work and saved
results from that local volume and cannot be undone through this application.

An adopter must define and test:

- the data owner and purpose for every task field;
- minimum necessary collection and message bounds;
- deletion behavior for queued, active, terminal, acknowledged, and failed
  work;
- backup, replica, and log expiration;
- subject-access or deletion workflows where applicable; and
- incident response and notification duties.

An acknowledgement proves only that an authorized client called the endpoint.
It is not evidence that a person read, understood, or acted on a notification.

## Privacy-safe verification

Use generated identifiers and synthetic messages for tests, screenshots, logs,
and bug reports. Never attach Redis dumps, access tokens, cookies, private
certificates, real task payloads, or environment files to a public issue.

See [the security policy](../SECURITY.md), [production guide](production.md),
and [migration and rollback guide](migration.md) for the surrounding
operational controls.
