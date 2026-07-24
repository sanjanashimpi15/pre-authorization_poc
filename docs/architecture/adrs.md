# Architecture Decision Records (ADRs) — Aivana Insurance OS

This document records the foundational architectural decisions made for the Aivana platform. Each record follows a standard format: Context, Decision, and Consequences.

---

## ADR-001: Adoption of "Deterministic First" Philosophy
**Date**: 2026-07-14
**Status**: Accepted

### Context
Aivana handles financial and medical transactions where hallucination or probabilistic errors are unacceptable (e.g., denying a valid ₹5 Lakh claim due to an LLM glitch). Pure GenAI pipelines lack explainability and guarantee.

### Decision
We adopt a "Deterministic First" architecture. 70% of the platform logic (Taiga, MCO, EGS, AKS) must be strictly deterministic (Math, Rules, State Machines). 30% (Fairway, Aegis, ID) is AI-assisted but heavily bounded by deterministic guardrails.

### Consequences
- **Positive**: Absolute auditability. Guaranteed rule compliance. Easy to defend decisions in court or to IRDAI.
- **Negative**: Slower development velocity compared to "throwing everything at GPT-4." Requires complex hybrid engineering.

---

## ADR-002: Kafka over RabbitMQ for Event Bus
**Date**: 2026-07-14
**Status**: Accepted

### Context
The platform requires a centralized message broker to connect 25+ microservices. The broker must handle massive spikes in traffic (e.g., a hospital uploading 5 years of historical claims) and support event replay for auditing.

### Decision
We chose Apache Kafka over RabbitMQ.

### Consequences
- **Positive**: Kafka's persistent, append-only log allows the Replay Engine to rewind time and replay claims. It handles high-throughput batch ingestion seamlessly.
- **Negative**: Kafka is operationally more complex to host and manage than RabbitMQ. Requires Zookeeper/KRaft and careful partition planning.

---

## ADR-003: Neo4j (GraphDB) for Evidence and Policy
**Date**: 2026-07-14
**Status**: Accepted

### Context
Evaluating medical claims requires deeply nested relational queries (e.g., "Find the bounding box of the lab value that supports the diagnosis that triggered the rule that caused the ₹500 deduction"). Relational databases (PostgreSQL) struggle with 6-hop joins.

### Decision
We use Neo4j for the Evidence Graph Service (EGS) and Policy Knowledge Graph (PKG).

### Consequences
- **Positive**: Natively models evidence chains. Instant traversal of complex medical/policy relationships. Enables Graph Data Science for fraud detection.
- **Negative**: Requires engineers to learn Cypher. Graph databases are harder to shard horizontally than document stores.

---

## ADR-004: Immutable Final Claim Packet (FCP)
**Date**: 2026-07-14
**Status**: Accepted

### Context
Hospitals frequently append documents to a claim *after* it has been submitted to the TPA, leading to versioning chaos ("Which version of the bill did the TPA actually see?").

### Decision
The Final Claim Packet (FCP) is strictly immutable. Once `FCP_GENERATED` is emitted, that JSON/PDF payload is cryptographically hashed and locked. Any new documents must trigger a distinct `FCP_AMENDMENT` packet.

### Consequences
- **Positive**: Perfect legal repudiation. Aivana can mathematically prove exactly what data was submitted at `T=0`.
- **Negative**: Increased storage costs (storing multiple large versions of a claim). Slightly higher friction for hospital billing clerks who want to silently fix a typo.

---

## ADR-005: Temporal.io for Saga Orchestration
**Date**: 2026-07-14
**Status**: Accepted

### Context
A claim lifecycle spans multiple days and involves human-in-the-loop steps (e.g., waiting 48 hours for a doctor to sign a form). Managing this state across 25 event-driven microservices risks dropped events and stuck claims.

### Decision
We use Temporal.io (Master Claim Orchestrator) to manage the Saga pattern for claim lifecycles.

### Consequences
- **Positive**: Temporal natively handles long-running workflows, automatic retries, compensating transactions (rollbacks), and timers out-of-the-box.
- **Negative**: Adds a heavy infrastructure dependency. Requires writing workflow logic in a specific SDK (Go/TypeScript).

---

## ADR-006: Centralized AI Model Gateway
**Date**: 2026-07-14
**Status**: Accepted

### Context
Fairway, Aegis, and Document ID all need to call LLMs. If each service integrates the OpenAI/Gemini SDKs directly, we have no centralized way to control costs, enforce fallbacks, or rotate API keys.

### Decision
All generative AI traffic must route through a single internal AI Model Gateway.

### Consequences
- **Positive**: Instant failover from Gemini to Claude during an outage. Centralized PII scrubbing. Global Semantic Caching reduces LLM costs by ~30%.
- **Negative**: The Gateway becomes a single point of failure (SPOF). Must be engineered for extreme high availability (99.99%).

---

## ADR-007: Plugin Architecture for Integration
**Date**: 2026-07-14
**Status**: Accepted

### Context
Every hospital uses a different EMR (Epic, Cerner, local custom software). Building hospital-specific parsing logic into the core platform leads to unmaintainable spaghetti code.

### Decision
The Integration Hub uses an isolated V8 Javascript engine to execute dynamically loaded "Adapter Plugins" for mapping HL7/FHIR to Canonical JSON.

### Consequences
- **Positive**: Field engineers can write and deploy a new hospital integration in hours without a backend deployment. The core platform remains pristine.
- **Negative**: Managing the lifecycle, security, and versioning of hundreds of small Javascript snippets requires rigorous Hub tooling.

---

## ADR-008: Snowflake/ClickHouse for Analytics instead of Postgres
**Date**: 2026-07-14
**Status**: Accepted

### Context
The Analytics Platform needs to calculate complex aggregations across millions of historical claims instantly for real-time executive dashboards.

### Decision
We use an OLAP columnar database (ClickHouse or Snowflake) for the Insurance Analytics Platform, populated via Kafka Connect.

### Consequences
- **Positive**: Sub-second queries on massive datasets. Clean separation of transactional (OLTP) and analytical (OLAP) workloads.
- **Negative**: Eventual consistency (analytics dashboards might be 10-60 seconds behind live production state).

---
*Document Version: 1.0*
