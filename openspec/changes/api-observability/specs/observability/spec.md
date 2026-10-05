# observability — deltas

## ADDED Requirements

### Requirement: Structured logging backend

The API SHALL route all application and framework logs through a
winston logger instance, configured at bootstrap so that Nest `Logger`
usage and Nest internal logs share the same backend. The output format
SHALL be a human-readable single-line format in development and
structured JSON (level, timestamp, message, context, stack) in
production. The effective level SHALL come from `LOG_LEVEL`, defaulting
to `debug` in development and `info` in production.

#### Scenario: JSON in production

- **GIVEN** `NODE_ENV=production`
- **WHEN** any component logs a message
- **THEN** the output is one JSON object per line with `level`,
  `timestamp`, `message` and `context` fields.

#### Scenario: Pretty in development

- **GIVEN** `NODE_ENV` is not `production`
- **WHEN** any component logs a message
- **THEN** the output is a readable single line with level, context and
  message.

### Requirement: Request correlation ID

Every HTTP request SHALL be assigned a `requestId`: the value of the
incoming `x-request-id` header when present, else a generated UUID. The
id SHALL be exposed back to the client as the `x-request-id` response
header and SHALL be attached to every log record emitted while handling
that request, via async context propagation.

#### Scenario: Incoming header preserved

- **WHEN** a request arrives with `x-request-id: abc`
- **THEN** all logs for that request and the response header carry
  `abc`.

#### Scenario: Generated when absent

- **WHEN** a request arrives without the header
- **THEN** a UUID is generated, set on the response and attached to the
  request's logs.

### Requirement: Per-request summary log

On response finish the API SHALL emit one summary log line containing
method, route path, status code, duration in ms, `requestId` and, when
a session was resolved, the actor `personId`. Health-check and API-docs
routes SHALL be excluded. Records SHALL be logged at `info` below 400,
`warn` for 4xx and `error` for 5xx.

#### Scenario: Normal request

- **WHEN** `GET /api/events` completes with 200 in 42ms
- **THEN** one info record exists with `method`, `path`, `status:200`,
  `durationMs` and `requestId`.

#### Scenario: Server error

- **WHEN** a request ends with status 500
- **THEN** the summary line is logged at `error` level.

#### Scenario: Excluded routes

- **WHEN** `/api/health` or swagger docs are requested
- **THEN** no summary line is emitted.

### Requirement: Secret redaction

Log records SHALL be scanned before writing: any metadata object key
matching a sensitive pattern (authorization, cookie, password, secret,
token, jwt, session, qr payload) SHALL have its value replaced with a
mask. This is defense-in-depth: business code MUST NOT log credentials
or QR token payloads, and the redactor guarantees it even on mistakes.

#### Scenario: Sensitive key masked

- **WHEN** a log call passes `{ body: { password: "x" } }` or an
  `authorization` header value
- **THEN** the emitted record shows the key with a masked value.
