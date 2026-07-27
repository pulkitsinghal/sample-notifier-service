const DEFAULTS = Object.freeze({
  port: 3000,
  redisUrl: "redis://localhost:6379",
  queueName: "notifier-demo",
  eventChannel: "notifier-demo:events",
  taskDelayMs: 1200,
  workerConcurrency: 4,
});

function parseInteger(name, value, { min, max }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseRedisUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("REDIS_URL must be a valid redis:// or rediss:// URL");
  }

  if (!["redis:", "rediss:"].includes(url.protocol)) {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }
  if (
    url.pathname &&
    url.pathname !== "/" &&
    !/^\/\d+$/.test(url.pathname)
  ) {
    throw new Error("REDIS_URL database path must be a non-negative integer");
  }

  return url.toString();
}

function parsePublicOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_ORIGIN must be a valid http:// or https:// origin");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("PUBLIC_ORIGIN must contain only an http(s) scheme, host, and optional port");
  }

  return url.origin;
}

function parseName(name, value, { allowColon = false } = {}) {
  const pattern = allowColon
    ? /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/
    : /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
  if (!pattern.test(value)) {
    throw new Error(`${name} contains unsupported characters`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";
  const sessionSecret = env.SESSION_SECRET;
  const publicOrigin = parsePublicOrigin(
    env.PUBLIC_ORIGIN ?? `http://localhost:${env.PORT ?? DEFAULTS.port}`,
  );

  if (!sessionSecret || Buffer.byteLength(sessionSecret) < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes");
  }
  if (nodeEnv === "production" && !publicOrigin.startsWith("https://")) {
    throw new Error("PUBLIC_ORIGIN must use https:// in production");
  }

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === "production",
    host: env.HOST ?? "127.0.0.1",
    port: parseInteger("PORT", env.PORT ?? DEFAULTS.port, {
      min: 1,
      max: 65535,
    }),
    redisUrl: parseRedisUrl(env.REDIS_URL ?? DEFAULTS.redisUrl),
    publicOrigin,
    queueName: parseName("QUEUE_NAME", env.QUEUE_NAME ?? DEFAULTS.queueName),
    eventChannel: parseName(
      "EVENT_CHANNEL",
      env.EVENT_CHANNEL ?? DEFAULTS.eventChannel,
      { allowColon: true },
    ),
    sessionSecret,
    taskDelayMs: parseInteger(
      "TASK_DELAY_MS",
      env.TASK_DELAY_MS ?? DEFAULTS.taskDelayMs,
      { min: 10, max: 30000 },
    ),
    workerConcurrency: parseInteger(
      "WORKER_CONCURRENCY",
      env.WORKER_CONCURRENCY ?? DEFAULTS.workerConcurrency,
      { min: 1, max: 64 },
    ),
  });
}
