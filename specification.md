# STQA Multi-Tenant API Gateway Specification

## 1. Project Overview

Build a reusable API gateway for an STQA course assignment platform.

Students will test intentionally buggy backend APIs using Postman, Insomnia, curl, or similar tools. The assignment is completed in teams over approximately two weeks.

The platform must:

* Identify which student made each API request.
* Identify the student’s team.
* Route all team members to the same team-specific database.
* Keep databases isolated between teams.
* Log all API requests and responses.
* Support public and protected application endpoints.
* Remain reusable across multiple semesters.
* Allow the buggy backend, endpoints, database schema, and bugs to change each semester without changing the gateway.

## 2. Scale

Expected scale per assignment offering:

* 40 to 60 teams
* Maximum 4 students per team
* Approximately 160 to 240 students
* Assignment duration: approximately 2 weeks
* Each team must have a separate logical database
* Students may continuously test the API during the assignment period

## 3. Core Design Principle

The system must use two independent authentication layers.

### 3.1 Lab Authentication

The lab authentication layer identifies the student and team using an individual lab credential.

Example:

```http
X-STQA-Key: student-specific-random-key
```

This credential is required for every request passing through the gateway.

It applies to:

* Registration endpoints
* Login endpoints
* Public endpoints
* Protected endpoints
* Authorization-testing endpoints
* GET, POST, PUT, PATCH and DELETE requests

The lab credential must not be part of the buggy application's authentication system.

### 3.2 Application Authentication

The buggy backend may have its own authentication system.

Example:

```http
Authorization: Bearer application-jwt
```

The application authentication system is part of what students test.

The gateway must not enforce application-level roles, permissions, or business rules.

## 4. High-Level Architecture

```text
Student using Postman
        |
        | X-STQA-Key
        v
STQA Gateway
        |
        | Identify offering, student and team
        | Generate request ID
        | Log request
        | Add signed internal context
        v
Semester-Specific Buggy Backend
        |
        | Select team database
        v
Team-Specific Database
```

Permanent platform components:

* API gateway
* Control database
* Logging database
* Provisioning service or script
* Reset service
* Optional instructor dashboard

Replaceable semester components:

* Buggy backend application
* Database schema
* Database template
* Seed data
* Team-specific data variation
* Assignment configuration

## 5. Multi-Semester Model

Each semester or assignment run must be represented as an assignment offering.

Example offering codes:

```text
STQA-SPRING-2027-API01
STQA-SUMMER-2027-API01
STQA-FALL-2027-API01
```

Each offering must define:

* Offering code
* Semester
* Backend URL
* Backend version
* Database template
* Start date and time
* End date and time
* Status
* Maximum team size
* Reset policy
* Logging policy
* Rate-limit policy

The gateway must load this configuration dynamically from the control database.

Changing the buggy endpoints must not require gateway code changes.

## 6. Public Gateway URL

Use one permanent domain.

Example:

```text
https://stqa-lab.uiu.ac.bd
```

Recommended request structure:

```text
/api/{offering-code}/{backend-path}
```

Examples:

```http
POST /api/STQA-SPRING-2027-API01/register
POST /api/STQA-SPRING-2027-API01/login
GET /api/STQA-SPRING-2027-API01/products
DELETE /api/STQA-SPRING-2027-API01/orders/57
```

The gateway must remove the offering prefix before forwarding.

Example:

```text
Incoming:
POST /api/STQA-SPRING-2027-API01/register

Forwarded:
POST /register
```

The gateway must use wildcard forwarding and must not define semester-specific routes.

## 7. Student and Team Credentials

Each student receives an individual random lab key.

Example mapping:

```text
Student 011231001 → Key A → Team 12
Student 011231002 → Key B → Team 12
Student 011231003 → Key C → Team 12
Student 011231004 → Key D → Team 12
```

All members of Team 12 must access the same team database.

The gateway must derive the student and team from the lab key.

Students must not be trusted to directly provide values such as:

```http
X-STQA-Student-ID: 011231001
X-STQA-Team-ID: TEAM-012
X-STQA-Database: team_012
```

The lab key must:

* Be random and unguessable
* Be unique per student and offering
* Be stored as a hash
* Have an expiration date
* Be revocable
* Become invalid after the assignment closes

A shared team key must not be used because individual student activity must remain traceable.

## 8. Request Processing Flow

For each incoming request, the gateway must:

1. Extract the offering code from the URL.
2. Load the assignment offering.
3. Verify that the offering is active.
4. Read the `X-STQA-Key` header.
5. Hash the provided key.
6. Find the matching student credential.
7. Verify that the student belongs to the offering.
8. Find the student’s team.
9. Find the team’s database mapping.
10. Generate a unique request ID.
11. Remove all untrusted internal STQA headers from the incoming request.
12. Build a trusted internal context.
13. Log the incoming request.
14. Forward the request to the configured buggy backend.
15. Receive the backend response.
16. Log response metadata.
17. Add the request ID to the response.
18. Return the response to the student.

## 9. Internal Gateway Context

The gateway must send trusted context to the backend.

Recommended approach:

```http
X-STQA-Context: signed-short-lived-token
```

Example payload:

```json
{
  "offeringId": "STQA-SPRING-2027-API01",
  "teamId": "TEAM-012",
  "studentId": "011231002",
  "databaseName": "stqa_sp27_api01_team_012",
  "requestId": "c1f60958-b420-4433-8205-e6633cf5221e",
  "issuedAt": 1801418300,
  "expiresAt": 1801418360
}
```

The context token must be:

* Signed by the gateway
* Short-lived
* Verified by the backend
* Impossible for students to generate
* Rejected if expired or invalid

The gateway must remove any incoming headers that attempt to provide internal context.

Examples:

```text
X-STQA-Context
X-STQA-Team-ID
X-STQA-Student-ID
X-STQA-Database
X-STQA-Offering-ID
X-STQA-Request-ID
```

## 10. Backend Requirements

Each semester-specific buggy backend must:

* Accept requests only from the gateway
* Verify the signed STQA context
* Read the team database name from the verified context
* Select the correct team database
* Preserve its normal application authentication behaviour
* Expose a health endpoint
* Expose a readiness endpoint if needed
* Return standard HTTP responses
* Avoid writing directly to the platform logging database

Required internal health endpoint:

```http
GET /_internal/health
```

Example response:

```json
{
  "status": "healthy",
  "version": "spring-2027-v1"
}
```

The backend must not be publicly accessible.

## 11. Team Database Isolation

Each team must have a separate logical database.

Example:

```text
stqa_sp27_api01_team_001
stqa_sp27_api01_team_002
stqa_sp27_api01_team_003
```

All members of a team must use the same database.

No request from one team may access another team’s database.

A new set of databases must be created for every offering. Old databases must not be reused for a new semester.

A single PostgreSQL server may host all team databases.

Separate database servers are not required.

## 12. Database Provisioning

Each offering must define a template database.

Example:

```text
stqa_template_sp27_api01
```

Before the assignment begins, a provisioning tool must:

1. Read a roster file.
2. Create the offering.
3. Create teams.
4. Assign students to teams.
5. Create one database per team from the template.
6. Generate one lab credential per student.
7. Store credential hashes.
8. Store team-to-database mappings.
9. Apply team-specific seed data.
10. Export credentials for distribution.

Example database creation:

```sql
CREATE DATABASE stqa_sp27_api01_team_001
TEMPLATE stqa_template_sp27_api01;
```

## 13. Team-Specific Data Variation

All members of a team must receive the same data and bug conditions.

Different teams may receive equivalent but slightly different values.

Examples:

```text
Team 12:
Vulnerable order ID: 581
Boundary value: 17

Team 13:
Vulnerable order ID: 742
Boundary value: 23
```

The bug category and difficulty should remain equivalent.

Team-specific values may be generated using:

```text
team_seed = HMAC(platform_secret, offering_id + team_id)
```

The gateway does not need to understand the seed data or bugs.

## 14. Central Control Database

The control database must be permanent and independent of team databases.

Minimum entities:

### semesters

```text
id
name
starts_at
ends_at
```

### backend_versions

```text
id
name
version
backend_url
healthcheck_path
database_template
status
created_at
```

### assignment_offerings

```text
id
semester_id
backend_version_id
code
active_from
active_until
status
maximum_team_size
reset_limit_per_day
configuration
```

### teams

```text
id
offering_id
team_code
database_name
seed_value
created_at
```

### students

```text
student_id
name
email
section
```

### team_members

```text
team_id
student_id
```

### student_credentials

```text
id
offering_id
student_id
credential_hash
created_at
expires_at
revoked_at
last_used_at
```

### reset_requests

```text
id
offering_id
team_id
requested_by
requested_at
completed_at
status
failure_reason
```

## 15. Central Logging Database

Logs must be stored separately from team databases.

Students must never have access to the logging database.

Minimum request log fields:

```text
request_id
offering_id
team_id
student_id
started_at
completed_at
method
path
query_string
status_code
response_time_ms
request_headers
request_body
request_body_hash
response_headers
response_body_hash
application_user_id
application_role
application_authenticated
application_token_hash
source_ip_hash
user_agent
error_type
```

The log structure must remain generic.

Do not add endpoint-specific fields such as:

```text
product_id
order_id
payment_id
```

## 16. Logging Rules

The gateway must log every request, including:

* Successful requests
* Failed requests
* Public endpoint calls
* Protected endpoint calls
* Invalid application authentication
* Invalid lab credentials
* Invalid offering codes
* Rate-limit violations
* Backend errors
* Timeouts
* Reset requests

The gateway must not log sensitive values directly.

Never store:

* Raw `X-STQA-Key`
* Raw `Authorization` token
* Password
* Confirm password
* Refresh token
* OTP
* Session cookie
* API secret

Sensitive body fields must be redacted.

Example:

```json
{
  "email": "student@example.com",
  "password": "***REDACTED***"
}
```

Application tokens may be stored only as hashes for correlation purposes.

Request and response body logging must have a configurable maximum size.

Large binary uploads should not be stored directly in logs.

## 17. Request IDs

Every request must receive a UUID request ID.

The gateway must return:

```http
X-STQA-Request-ID: c1f60958-b420-4433-8205-e6633cf5221e
```

The request ID may also be added to JSON responses when safe:

```json
{
  "data": {},
  "_lab": {
    "requestId": "c1f60958-b420-4433-8205-e6633cf5221e"
  }
}
```

The gateway must preserve the request ID even when:

* The backend returns an error
* The backend times out
* The gateway rejects the request
* The response is not JSON

Students will include request IDs in their bug reports.

## 18. Application Authentication Behaviour

The gateway must not interfere with application authentication.

Example public request:

```http
POST /api/STQA-SPRING-2027-API01/register
X-STQA-Key: student-lab-key
```

Example application-authenticated request:

```http
DELETE /api/STQA-SPRING-2027-API01/orders/501
X-STQA-Key: student-lab-key
Authorization: Bearer application-token
```

The gateway must forward the application `Authorization` header to the backend.

The gateway may hash the application token for logging, but must not validate its application permissions.

## 19. Database Connection Management

The system must avoid creating large permanent connection pools.

For example, avoid:

```text
60 databases × 10 connections = 600 permanent connections
```

Use one or more of:

* Lazy database pools
* Small per-database pool sizes
* Pool expiration after inactivity
* PgBouncer
* Limited least-recently-used pool registry
* Maximum global connection count

Recommended initial pool size:

```text
Minimum connections per inactive team: 0
Maximum connections per active team: 2
```

## 20. Reset Functionality

Students will test destructive endpoints, including DELETE operations. Teams may damage their own test data.

The platform must support restoring a team database from the offering template.

Possible internal endpoint:

```http
POST /_lab/reset
X-STQA-Key: student-lab-key
```

Alternatively, resets may only be available through the instructor dashboard.

Reset requirements:

* Reset only the requesting student’s team database
* Require a valid offering credential
* Log who requested the reset
* Limit resets per team per day
* Prevent simultaneous resets
* Recreate the database from the offering template
* Reapply deterministic team seed data
* Record reset success or failure
* Never affect other teams

## 21. Shared Resources Outside the Database

If the backend uses external resources, they must also be isolated by team.

Examples:

### File uploads

```text
uploads/{offering_id}/{team_id}/
```

### Redis

```text
{offering_id}:{team_id}:session:{id}
```

### Cache

```text
{offering_id}:{team_id}:product:{id}
```

### Background jobs

Each job payload must include:

```text
offering_id
team_id
request_id
```

### Email testing

Use a local email capture service or team-specific mailbox namespace.

## 22. Rate Limiting

Rate limiting must be configurable per offering.

It should protect the platform from accidental infinite loops or automated overload without preventing valid testing.

Possible limits:

* Per student
* Per team
* Per IP as a secondary signal
* Separate limits for expensive endpoints
* Temporary burst allowance

Rate-limit events must be logged.

The gateway must return:

```http
429 Too Many Requests
```

with the request ID.

## 23. Security Requirements

The gateway must:

* Use HTTPS
* Store only credential hashes
* Reject expired credentials
* Support credential revocation
* Remove untrusted internal headers
* Sign internal context tokens
* Use short context-token expiration
* Restrict backend access to the private network
* Restrict team database access to backend services
* Keep logging and control databases isolated
* Use parameterized queries
* Protect admin endpoints
* Apply request size limits
* Apply timeouts
* Avoid logging secrets
* Record security-relevant failures

IP addresses and user-agent values are supporting signals only. They must not be treated as definitive evidence of misconduct.

## 24. Instructor Dashboard Requirements

An optional permanent dashboard should provide:

### Offering Overview

* Offering status
* Number of teams
* Number of students
* Backend version
* Start and end dates
* Total request count
* Active teams
* Failed requests
* Backend health

### Team Activity

* Team members
* Database name
* Total requests
* Requests by HTTP method
* First activity
* Last activity
* Reset count
* Status-code distribution

### Student Activity

* Student ID
* Team
* Request count
* GET count
* POST count
* PUT and PATCH count
* DELETE count
* 4xx responses
* 5xx responses
* First and last activity

### Request Lookup

Search by request ID and display:

* Student
* Team
* Offering
* Timestamp
* Method
* Path
* Status code
* Response time
* Sanitized request
* Sanitized response metadata

### Administrative Actions

* Create offering
* Close offering
* Import roster
* Generate credentials
* Revoke credential
* Provision team databases
* Reset team database
* View backend health
* Export activity report

## 25. Recommended Technology Boundaries

The gateway should be framework-independent from the buggy backends.

Possible implementation stack:

```text
Gateway: FastAPI, NestJS, Spring Boot, Go or another reverse-proxy-capable framework
Control database: PostgreSQL
Logging database: PostgreSQL
Team databases: PostgreSQL
Cache or rate limiting: Redis
Reverse proxy or TLS: NGINX, Traefik or Caddy
Deployment: Docker Compose initially, Kubernetes later if needed
```

The implementation should begin as a modular monolith unless scaling requires separate services.

Suggested modules:

```text
authentication
offerings
teams
credentials
proxy
context-signing
logging
provisioning
database-routing
reset
rate-limiting
admin
health
```

## 26. Suggested Repository Structure

```text
stqa-platform/
├── gateway/
│   ├── auth/
│   ├── proxy/
│   ├── logging/
│   ├── offerings/
│   ├── teams/
│   ├── credentials/
│   ├── context/
│   ├── rate_limit/
│   ├── reset/
│   └── admin/
├── backend-sdk/
│   ├── context_verification/
│   ├── database_routing/
│   └── request_correlation/
├── provisioning/
│   ├── import_roster/
│   ├── create_databases/
│   ├── seed_databases/
│   └── generate_credentials/
├── dashboard/
├── database/
│   ├── control_migrations/
│   └── logging_migrations/
├── deployments/
│   ├── docker-compose.yml
│   └── nginx/
└── backends/
    └── example-buggy-api/
```

## 27. Configuration

Important environment variables:

```text
GATEWAY_PUBLIC_URL
CONTROL_DATABASE_URL
LOGGING_DATABASE_URL
TEAM_DATABASE_ADMIN_URL
REDIS_URL

CONTEXT_SIGNING_SECRET
CREDENTIAL_HASH_SECRET
IP_HASH_SECRET

DEFAULT_REQUEST_TIMEOUT_MS
DEFAULT_MAX_BODY_SIZE
DEFAULT_RATE_LIMIT
DEFAULT_CONTEXT_TOKEN_TTL_SECONDS

BACKEND_NETWORK_ALLOWLIST
ADMIN_AUTH_SECRET
```

Assignment-specific settings must be stored in the control database rather than hard-coded in environment variables.

## 28. API Error Format

Gateway-generated errors should use a consistent format.

Example:

```json
{
  "error": {
    "code": "INVALID_LAB_CREDENTIAL",
    "message": "The lab credential is invalid or expired."
  },
  "_lab": {
    "requestId": "c1f60958-b420-4433-8205-e6633cf5221e"
  }
}
```

Recommended gateway error codes:

```text
MISSING_LAB_CREDENTIAL
INVALID_LAB_CREDENTIAL
EXPIRED_LAB_CREDENTIAL
REVOKED_LAB_CREDENTIAL
OFFERING_NOT_FOUND
OFFERING_NOT_ACTIVE
STUDENT_NOT_IN_OFFERING
TEAM_NOT_FOUND
BACKEND_UNAVAILABLE
BACKEND_TIMEOUT
REQUEST_TOO_LARGE
RATE_LIMIT_EXCEEDED
DATABASE_RESET_IN_PROGRESS
INTERNAL_GATEWAY_ERROR
```

Do not replace backend-generated errors with gateway error formats unless the failure occurred inside the gateway.

## 29. Semester Lifecycle

### Before the Assignment

1. Build the buggy backend.
2. Build its database schema.
3. Create seed data.
4. Create a template database.
5. Deploy the backend privately.
6. Register the backend version.
7. Create the offering.
8. Import the team roster.
9. Provision team databases.
10. Generate student credentials.
11. Test gateway-to-backend routing.
12. Test database isolation.
13. Test logging and reset behaviour.

### During the Assignment

1. Validate student credentials.
2. Route requests to the correct backend.
3. Route each team to its own database.
4. Log all activity.
5. Monitor backend health.
6. Support controlled resets.
7. Allow application authentication and authorization testing.

### After the Assignment

1. Mark the offering as closed.
2. Disable credentials.
3. Stop accepting student requests.
4. Export activity summaries.
5. Make logs read-only.
6. Snapshot or archive team databases.
7. Shut down the semester backend when no longer needed.
8. Retain the permanent gateway.

## 30. Minimum Viable Product

The first version must include:

* Assignment offering management
* Student roster import
* Team management
* Individual lab-key generation
* Credential hashing and validation
* Generic wildcard proxying
* Student and team resolution
* Signed backend context
* Separate database per team
* Central request logging
* Request ID generation
* Response request-ID header
* Offering start and end enforcement
* Backend health check
* Basic database reset
* Basic admin commands or API

The first version does not require a graphical dashboard. A command-line administration tool or protected admin API is acceptable.

## 31. Acceptance Criteria

The system is complete when all of the following tests pass.

### Credential Identification

* Two students in the same team receive different lab keys.
* Both students are correctly identified in logs.
* Both students access the same team database.
* An invalid key is rejected.
* An expired key is rejected.
* A revoked key is rejected.

### Team Isolation

* Team A creates a record.
* Team B cannot see the record.
* Team B cannot modify or delete Team A’s data.
* Team members can see each other’s changes.

### Endpoint Independence

* The gateway forwards unknown GET endpoints.
* The gateway forwards unknown POST endpoints.
* The gateway forwards PUT, PATCH and DELETE endpoints.
* Adding a new backend endpoint requires no gateway code change.
* Removing a backend endpoint requires no gateway code change.

### Authentication Independence

* Registration works with only the lab key.
* Login works with only the lab key.
* Protected endpoints work with both lab key and application token.
* Removing the application token still reaches the backend.
* The gateway does not enforce application roles.
* Intentional backend authorization bugs remain testable.

### Logging

* Every request receives a request ID.
* Every request is linked to student, team and offering.
* Request method, path, status and duration are logged.
* Passwords are redacted.
* Raw lab keys are not stored.
* Raw application tokens are not stored.
* Gateway errors are logged.
* Backend errors are logged.

### Semester Reusability

* A new offering can point to a new backend URL.
* A new offering can use a different database template.
* The new backend can have completely different endpoints.
* The gateway requires no source-code modification.
* Old offering data remains separate.

### Reset

* Resetting Team A restores only Team A’s database.
* Team B remains unaffected.
* Reset activity is logged.
* Reset limits are enforced.
* Team-specific seed data is restored consistently.

## 32. Primary Routing Formula

The platform’s core resolution chain is:

```text
lab credential
    → student
    → assignment offering
    → team
    → backend version
    → team database
```

This mapping must be controlled entirely by the platform and must never depend on student-supplied team IDs, database names, or student IDs.



