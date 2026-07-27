import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Queue } from "bullmq";
import express from "express";
import helmet from "helmet";
import IORedis from "ioredis";
import { Server as SocketServer } from "socket.io";

import { DEFAULT_JOB_OPTIONS, redisConnectionOptions } from "./queue.js";
import {
  createSession,
  deriveNotificationRoom,
  readSessionId,
  serializeSessionCookie,
} from "./session.js";
import {
  parseTaskMessage,
  presentJob,
  publicTaskEvent,
} from "./task.js";

const publicDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);

function expectedOrigin(request, configuredOrigin) {
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const host = request.headers.host;
  if (!host) {
    return null;
  }
  const protocol = request.socket.encrypted ? "https" : "http";
  return `${protocol}://${host}`;
}

function originIsAllowed(request, configuredOrigin) {
  const origin = request.headers.origin;
  return Boolean(origin && origin === expectedOrigin(request, configuredOrigin));
}

function sessionMiddleware({ sessionSecret, secure }) {
  return (request, response, next) => {
    let sessionId = readSessionId(
      request.headers.cookie,
      sessionSecret,
    );

    if (!sessionId) {
      const session = createSession(sessionSecret);
      sessionId = session.sessionId;
      response.setHeader(
        "Set-Cookie",
        serializeSessionCookie(session.token, { secure }),
      );
    }

    request.notificationRoom = deriveNotificationRoom(
      sessionId,
      sessionSecret,
    );
    next();
  };
}

function requireSameOrigin(configuredOrigin) {
  return (request, response, next) => {
    if (!originIsAllowed(request, configuredOrigin)) {
      response.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
    next();
  };
}

function closeHttpServer(server) {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function createNotifierApi({
  redisUrl,
  queueName,
  eventChannel,
  sessionSecret,
  publicOrigin,
  host = "127.0.0.1",
  port = 3000,
  isProduction = false,
  logger = console,
}) {
  const queue = new Queue(queueName, {
    connection: redisConnectionOptions(redisUrl),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  const subscriber = new IORedis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  const healthRedis = new IORedis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  subscriber.on("error", (error) => {
    logger.error("Notification subscriber error", error.message);
  });
  healthRedis.on("error", () => {
    // Readiness reports the failure without logging connection details.
  });

  await Promise.all([
    queue.waitUntilReady(),
    subscriber.connect(),
    healthRedis.connect(),
  ]);

  const app = express();
  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    allowRequest: (request, callback) => {
      const allowed = originIsAllowed(request, publicOrigin);
      callback(
        allowed ? null : "origin is not allowed",
        allowed,
      );
    },
    serveClient: true,
    transports: ["websocket"],
  });

  io.use((socket, next) => {
    const sessionId = readSessionId(
      socket.request.headers.cookie,
      sessionSecret,
    );
    if (!sessionId) {
      next(new Error("session is required"));
      return;
    }

    socket.data.notificationRoom = deriveNotificationRoom(
      sessionId,
      sessionSecret,
    );
    next();
  });

  io.on("connection", (socket) => {
    socket.join(socket.data.notificationRoom);
    socket.emit("notifier:ready", {
      connectedAt: new Date().toISOString(),
    });
  });

  subscriber.on("message", (channel, payload) => {
    if (channel !== eventChannel) {
      return;
    }

    try {
      const event = JSON.parse(payload);
      const publicEvent = publicTaskEvent(event);
      if (publicEvent) {
        io.to(event.notificationRoom).emit("task:update", publicEvent);
      }
    } catch {
      logger.warn("Ignored an invalid notification event");
    }
  });
  await subscriber.subscribe(eventChannel);

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "base-uri": ["'none'"],
          "connect-src": ["'self'"],
          "font-src": ["'self'"],
          "form-action": ["'self'"],
          "frame-ancestors": ["'none'"],
          "img-src": ["'self'", "data:"],
          "object-src": ["'none'"],
          "script-src": ["'self'"],
          "style-src": ["'self'"],
        },
      },
    }),
  );

  app.get("/health/live", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/health/ready", async (_request, response) => {
    try {
      await healthRedis.ping();
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "not-ready" });
    }
  });

  app.use(express.json({ limit: "8kb", strict: true }));
  app.use(sessionMiddleware({ sessionSecret, secure: isProduction }));

  app.get("/api/session", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.status(204).end();
  });

  app.post(
    "/api/tasks",
    requireSameOrigin(publicOrigin),
    async (request, response, next) => {
      try {
        const message = parseTaskMessage(request.body);
        const taskId = randomUUID();
        await queue.add(
          "demo-task",
          {
            message,
            notificationRoom: request.notificationRoom,
            requestedAt: new Date().toISOString(),
          },
          { jobId: taskId },
        );

        response
          .status(202)
          .location(`/api/tasks/${taskId}`)
          .json({ taskId, status: "queued" });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/tasks/:taskId", async (request, response, next) => {
    try {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          request.params.taskId,
        )
      ) {
        response.status(404).json({ error: "Task not found." });
        return;
      }

      const job = await queue.getJob(request.params.taskId);
      if (
        !job ||
        job.data.notificationRoom !== request.notificationRoom
      ) {
        response.status(404).json({ error: "Task not found." });
        return;
      }

      response.setHeader("Cache-Control", "no-store");
      response.json(await presentJob(job));
    } catch (error) {
      next(error);
    }
  });

  app.use(
    express.static(publicDirectory, {
      etag: true,
      maxAge: 0,
    }),
  );

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "API route not found." });
  });

  app.use((error, _request, response, _next) => {
    const statusCode =
      Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode < 500
        ? error.statusCode
        : error.type === "entity.too.large"
          ? 413
          : 500;

    if (statusCode >= 500) {
      logger.error("Request failed", error.message);
    }
    response.status(statusCode).json({
      error:
        statusCode === 500
          ? "Unexpected server error."
          : error.message,
    });
  });

  let closed = false;

  return {
    app,
    httpServer,
    io,
    queue,
    async start() {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          httpServer.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          httpServer.off("error", onError);
          resolve(httpServer.address());
        };
        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(port, host);
      });
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;

      await new Promise((resolve) => io.close(resolve));
      await closeHttpServer(httpServer);
      await Promise.allSettled([
        queue.close(),
        subscriber.quit(),
        healthRedis.quit(),
      ]);
    },
  };
}
