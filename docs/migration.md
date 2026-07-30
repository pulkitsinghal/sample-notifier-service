# Migration and rollback guide

The 2016 repository is a useful architecture sketch, not a safe deployment
target. This guide helps an adopter move the lesson or an adapted service to
the v2 contract without treating a socket connection as identity or Redis
Pub/Sub as durable storage.

The last pre-modernization default-branch snapshot is commit `4ec72a8`. It is
useful for source comparison only: its clean-clone container path does not
install dependencies, its runtimes are end-of-life, and its task and
notification paths can lose work.

## Compatibility boundary

This is a replacement, not an in-place dependency upgrade.

| Legacy contract | v2 contract | Required migration |
| --- | --- | --- |
| Three Node services plus Redis | API, durable queue, and worker | Deploy API and worker from one versioned artifact |
| `socketId` crosses every service | Server-derived owner and notification room | Remove socket IDs from public and worker payloads |
| Redis `PUBLISH` is the work queue | BullMQ stores jobs and terminal state | Use a new queue namespace; do not reinterpret old messages |
| Worker calls unauthenticated `/notify` | Worker saves state, then publishes a live hint | Remove public notifier credentials and routing |
| Browser waits for one socket event | Browser reads task state on load, reconnect, and event | Add task list/read and acknowledgement handling |
| No stable identity | Signed local session or validated OIDC tenant and subject | Choose the identity boundary before production cutover |
| Host-published Redis | Private Redis with production TLS and ACLs | Provision and validate the datastore boundary |

Legacy socket IDs, Pub/Sub messages, and in-flight work have no compatible v2
representation. Do not point v2 at a legacy Redis database and assume those
items were migrated. Drain or explicitly abandon legacy work according to the
product's recovery policy.

## Application migration

1. Inventory every producer, worker operation, browser client, retention
   requirement, and notification claim. Decide what a completed, failed, and
   acknowledged task means for the product.
2. Make the real worker operation idempotent. BullMQ can redeliver a job after
   a failure or stalled lock; retries do not make side effects safe.
3. Give the v2 queue, indexes, rate limits, and event channel a dedicated Redis
   namespace. Configure private networking, TLS, a named ACL user, capacity,
   backups, restore exercises, and monitoring.
4. Select production identity claims. Configure one issuer, audience, JWKS
   URL, asymmetric algorithm allowlist, tenant claim, and an authorization
   policy that verifies tenant membership.
5. Replace client use of `socketId` with the v2 API:
   - create work with `POST /api/tasks`;
   - recover state with `GET /api/tasks` and `GET /api/tasks/:id`;
   - treat `task:update` as a prompt to reread saved state; and
   - acknowledge terminal state with `POST /api/tasks/:id/ack`.
6. Exercise token refresh and a second device for the same identity, plus
   cross-user and cross-tenant denial. Do not place access tokens in URLs,
   logs, local storage, or task messages.
7. Choose retention, rate limits, replay size, and worker concurrency from
   product and operational requirements. The sample defaults are not a
   compliance decision or capacity plan.

Read [the production guide](production.md) and
[privacy and data handling](privacy.md) before adapting the tutorial to real
data.

## Cutover

Use a parallel, observable cutover rather than changing the legacy queue in
place:

1. Deploy an immutable v2 candidate with a new queue namespace and no public
   traffic.
2. Run unit, Redis integration, container, security, and failure tests against
   that exact artifact.
3. Submit synthetic tasks through the intended ingress and prove queueing,
   completion, reconnect recovery, acknowledgement, health, and logs.
4. Stop legacy task creation. Let legacy workers drain or record every item
   that the owner deliberately abandons.
5. Route a bounded share of new traffic to v2 while watching API readiness,
   queue age, retries, terminal failures, Redis capacity, and WebSocket
   disconnects.
6. Complete the cutover only after the rollback target and datastore snapshot
   are still usable.

No step in this repository deploys infrastructure or migrates production data.

## Rollback

Rollback means returning traffic to a previously validated v2 artifact and
configuration. Do **not** roll production traffic back to the 2016 stack: it
cannot safely read v2 jobs, does not provide stable authorization, and can lose
both tasks and notifications.

1. Stop or rate-limit new task creation while preserving reads.
2. Record the candidate image or commit, configuration version, queue
   namespace, and counts of waiting, active, completed, and failed work.
3. Keep compatible v2 workers available to drain already accepted jobs. Never
   send v2 jobs to a legacy worker.
4. Restore the previously validated v2 API and worker together. Preserve the
   Redis namespace, `SESSION_SECRET`, OIDC identity mapping, and retention
   settings when retained tasks must remain recoverable.
5. Prove `/health/live`, `/health/ready`, task creation, completion, list/read,
   reconnect replay, and idempotent acknowledgement with synthetic data.
6. Keep the failed candidate and Redis evidence isolated for diagnosis until
   the recovery window closes. Revert source through a normal reviewed commit
   or pull request; do not rewrite shared history.

For a local tutorial rollback, `docker compose down` preserves the named Redis
volume. Check out the previously validated v2 commit in a clean worktree,
rebuild, and rerun the Compose smoke. Avoid `docker compose down --volumes`
unless deleting all queued jobs and saved tutorial results is the explicit
goal.

To inspect the original teaching source without altering the active checkout:

```sh
git worktree add ../sample-notifier-legacy 4ec72a8
```

Treat that worktree as historical evidence, not as a runnable or deployable
rollback artifact.
