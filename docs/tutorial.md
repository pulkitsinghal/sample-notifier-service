# Guided notifier tutorial

## Learning objectives

By the end of this lab, you should be able to explain:

1. why an API returns `202 Accepted` before background work is complete;
2. which data must be durable and which event may be ephemeral;
3. why a socket ID is not authentication;
4. how a disconnected browser recovers missed state; and
5. what changes when API and worker processes scale independently.

The exercises run locally. They do not create cloud resources or use a paid
service.

## 1. Start from a clean clone

```sh
docker compose up --build
```

Wait for the API health check, then open <http://localhost:3000>.

You should see three services:

- `api` serves the page, validates task requests, owns Socket.IO connections,
  and reads job state;
- `worker` claims queued jobs and produces results; and
- `redis` stores BullMQ state and fans out live update hints.

In another terminal, follow the application logs:

```sh
docker compose logs -f api worker
```

No Redis port is published to your host. Only the demo page is reachable at
`127.0.0.1:3000`.

If port 3000 is already occupied, keep the container port unchanged and choose
another loopback port and matching public origin:

```sh
HOST_PORT=3011 PUBLIC_ORIGIN=http://localhost:3011 docker compose up --build
```

## 2. Trace the normal path

Enter a short message and choose **Run task**.

Observe:

1. The browser receives a task ID and shows `Queued` immediately.
2. A separate worker claims the job.
3. The worker saves the result before publishing a live update hint.
4. The API instance with your socket emits `task:update`.
5. The browser reads the task endpoint and renders the saved result.

The browser never receives or submits its Socket.IO connection ID. Open
Developer Tools and inspect the `POST /api/tasks` response: it contains a task
ID, not a socket target.

The API accepts only same-origin JSON writes. The session cookie is HttpOnly,
so the page's JavaScript cannot read it.

## 3. Prove the queue survives a worker outage

Stop only the worker:

```sh
docker compose stop worker
```

Queue a task in the browser. It remains `Queued` because Redis holds it. Start
the worker again:

```sh
docker compose start worker
```

The worker claims the existing job and the browser receives the result. This
is the key difference between a durable work queue and the original
`PUBLISH`/`SUBSCRIBE` task path.

## 4. Prove a socket event is not the source of truth

Use a longer simulated task:

```sh
docker compose down
TASK_DELAY_MS=8000 docker compose up
```

Queue a task, then close the tab before it finishes. Wait eight seconds and
reopen <http://localhost:3000>.

The original demo could not notify a new socket ID. This page remembers recent
task IDs in local storage, keeps the anonymous session in a signed cookie, and
reads each task from the API after load. The saved result appears even though
the live socket event was missed.

This proves result recovery for the same anonymous browser session. It does
not claim human acknowledgement or cross-device delivery. Those require
product-specific authenticated identity and receipt semantics.

## 5. Exercise cross-instance fan-out

Run the integration suite:

```sh
docker compose --profile test run --build --rm test
```

The test:

1. creates two API instances against one isolated queue;
2. establishes a signed session through API A;
3. connects a Socket.IO client to API B;
4. submits the task to API A;
5. receives the worker's completion through API B;
6. proves another session cannot read the task; and
7. disconnects the socket and recovers a later result through the task API.

That is a bounded functional proof of the sample's scale-out design. It is not
a load, chaos, or production failover test.

## 6. Read the retry policy

`src/queue.js` gives each job three attempts with exponential backoff. In
BullMQ, a worker exception moves the job through the retry policy; the final
failure is retained for inspection and emitted as a generic browser update.

The sample processor only waits and returns a string, so the interactive path
does not intentionally fail. In a real processor:

- throw an `Error` for a retryable failure;
- make the operation idempotent or use an idempotency key;
- classify permanent failures so they are not retried blindly;
- cap concurrency against downstream capacity; and
- alert on exhausted retries and stalled jobs.

Queue retry and browser redelivery are different problems. Queue retry reruns
work. Browser recovery reads the already-saved outcome.

## 7. Inspect the security boundary

The local demo provides:

- a random HMAC-signed session cookie;
- HttpOnly and SameSite=Strict cookie attributes;
- a Secure cookie when `NODE_ENV=production`;
- exact-Origin checks for task creation;
- server-derived, non-public Socket.IO rooms;
- task ownership checks that return 404 across sessions;
- bounded JSON and message length;
- Helmet headers and a restrictive Content Security Policy;
- an unprivileged, read-only application container; and
- no host-published data-store port.

It does not provide:

- user login, tenant authorization, or session revocation;
- TLS termination or reverse-proxy configuration;
- a production secret manager;
- distributed rate limiting;
- Redis ACLs, TLS, backup policy, or high availability;
- audit/event retention policy;
- notification acknowledgement; or
- production deployment configuration.

Those are explicit owner and product decisions, not gaps to hide behind a
tutorial default.

## 8. Clean up

Stop containers while preserving recent Redis state:

```sh
docker compose down
```

If you intentionally want to delete the tutorial's named data volume too:

```sh
docker compose down --volumes
```

The second command permanently removes queued jobs and saved demo results.
