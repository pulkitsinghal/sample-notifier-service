export const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 500,
  },
  removeOnComplete: {
    age: 60 * 60,
    count: 1000,
  },
  removeOnFail: {
    age: 24 * 60 * 60,
    count: 1000,
  },
});

export function redisConnectionOptions(redisUrl) {
  const url = new URL(redisUrl);
  const options = {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };

  if (url.username) {
    options.username = decodeURIComponent(url.username);
  }
  if (url.password) {
    options.password = decodeURIComponent(url.password);
  }
  if (url.pathname && url.pathname !== "/") {
    options.db = Number(url.pathname.slice(1));
  }
  if (url.protocol === "rediss:") {
    options.tls = {};
  }

  return options;
}
