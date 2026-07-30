# Security policy

## Supported versions

| Version | Security fixes |
| --- | --- |
| Current `master` and the latest v2 release | Supported |
| 2016 legacy demo | Unsupported |

The legacy demo uses end-of-life runtimes, treats a socket ID as authorization,
publishes internal services to the host, and has lossy task and notification
paths. It should not be deployed.

## Report a vulnerability

Do not open a public issue with an undisclosed vulnerability, exploit,
credential, token, private certificate, Redis dump, or real task payload.

Use GitHub's private vulnerability-reporting flow from the repository's
**Security** tab when it is available. If that flow is unavailable, contact
the repository owner through the GitHub profile without sending exploit
details or sensitive data until a private channel is agreed.

Include only synthetic evidence:

- the affected commit or release;
- the component and configuration mode;
- minimum reproduction steps;
- expected and observed behavior;
- likely impact and prerequisites; and
- a proposed mitigation, if known.

There is no guaranteed response or remediation service-level agreement for
this educational repository. Do not test against systems you do not own or
have explicit authorization to assess.

## Security boundary

The local lab is intentionally loopback-only and uses anonymous signed
sessions. Production mode requires external OIDC identity, HTTPS origin, and
ACL-authenticated Redis TLS, but it remains a starter. The operator owns TLS
termination, authorization policy, secrets, dependency updates, network
controls, capacity, backups, monitoring, incident response, and safe worker
side effects.

Review [the production guide](docs/production.md),
[privacy and data handling](docs/privacy.md), and
[migration and rollback](docs/migration.md) before adapting the sample.
