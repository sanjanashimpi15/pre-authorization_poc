# Design Walkthrough & Justifications — Hospital Configuration Service (HCS)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Hospital Configuration Service (HCS)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why build a dedicated service for Configuration?
If Taiga stores its hospital overrides in the Taiga database, and Fairway stores its overrides in the Fairway database, adding a new hospital to Aivana requires updating 6 different databases. A centralized HCS means onboarding a new hospital takes 1 API call, and all downstream services instantly adapt.

### Q2. How does the Hierarchical Merge work?
It uses a deep-merge algorithm (like `lodash.merge`).
- **Global**: `{ "auto_submit": false, "llm": "gemini" }`
- **Hospital**: `{ "llm": "gpt4" }`
- **Result**: `{ "auto_submit": false, "llm": "gpt4" }`
This prevents duplication. The hospital record only stores the *deltas* (the things they want to do differently than the global default).

### Q3. Why support Branch-level overrides?
Large enterprise hospital chains (like Apollo) have different operational maturity across branches. The main city branch might have a fully digital EMR and want Aivana to operate in fully autonomous mode (`auto_submit: true`). A rural branch might still use scanned handwritten notes and wants a human to review every claim (`auto_submit: false`).

### Q4. How does HCS interact with the Aivana Knowledge Studio (AKS)?
AKS is where the rules (Knowledge Packs) are authored. HCS is where Aivana records *who* is using *which* rule pack. HCS stores the mapping: `Hospital A -> Taiga Clinical Pack v2.4`.

### Q5. How does this support "Staging" environments for hospitals?
A hospital can have a `STAGING` configuration in HCS pointing to `Taiga v3.0`, and a `PROD` configuration pointing to `Taiga v2.0`. When the hospital's IT team sends dummy claims to the Aivana API, they include a header `X-Aivana-Env: STAGING`. MCO reads this, fetches the `STAGING` config from HCS, and routes the claim through `Taiga v3.0`.

### Q6. How do you prevent a bad config from breaking a hospital?
The HCS Management API performs schema validation before saving. If a Customer Success manager tries to type `auto_submit: "maybe"` (string) instead of a boolean, the API rejects it. Furthermore, HCS integrates with the Replay Engine to test config changes against historical claims before they are promoted to PROD.

### Q7. How does HCS handle secrets?
It doesn't. **Tradeoff**: Storing OpenAI API keys in the Postgres config JSON is a massive security risk.
**Justification**: HCS stores Key Vault ARNs (e.g., `aws:secretsmanager:...`). When the AI Gateway needs the key, it reads the ARN from the HCS config and asks AWS Secrets Manager for the actual plaintext string.

### Q8. Why cache in L1 (Memory) and L2 (Redis)?
Because configuration is read *constantly*. Every single microservice asks for the config at the start of every transaction. Network calls to Redis (1ms) add up. An L1 in-memory cache (0ms) ensures HCS can serve millions of requests per second with essentially zero CPU or network overhead.

### Q9. How do you invalidate the L1 Cache?
When a config is updated via the Management API, HCS saves to Postgres, updates Redis, and publishes an event to a Redis Pub/Sub channel: `CONFIG_UPDATED: H-123`. All HCS instances (and any microservice using an HCS SDK) listen to this channel and flush `H-123` from their local RAM.

### Q10. What happens if HCS goes down?
The microservices use an HCS SDK that retains the last known good configuration in RAM. If the Redis Pub/Sub goes down, the services continue using the slightly stale config, allowing the hospital to process claims without interruption.

### Q11. How does HCS assist in billing?
Aivana charges hospitals differently based on features enabled. HCS acts as the source of truth for "Entitlements." If a hospital tries to use the Aegis Appeals service, MCO checks HCS: `entitlements.aegis_enabled`. If false, MCO rejects the request.

### Q12. Can hospitals update their own config?
Yes, via the Aivana Hospital Portal. HCS exposes a scoped GraphQL/REST API that allows Hospital Admins to toggle safe features (like notification preferences) while locking down critical features (like which Taiga Rule Pack they are on).

### Q13. How does this support "Dark Launching" features?
Aivana engineers can deploy a massive new feature (e.g., "Predictive Denials") to production behind a feature flag. HCS sets `feature.predictive_denials = false` globally. Engineers can then enable it for a single friendly hospital (`H-BetaTester`) to test it in production before rolling it out globally.

### Q14. Are there any performance bottlenecks?
The only bottleneck is the Deep Merge algorithm in Javascript/Python. Doing a deep merge of massive JSON objects thousands of times a second is CPU-intensive. HCS mitigates this by pre-computing and caching the *merged* result in Redis, rather than merging on every read.

### Q15. How do you handle configuration drift?
Over time, 1,000 hospitals might have 1,000 slightly different configs. HCS includes an "Analyzer" tool that finds hospitals with identical overrides and suggests promoting those overrides to a new "Tier Defaults" level (e.g., `Tier_Enterprise_Default`).

### Q16. Can HCS trigger workflows?
No. HCS is purely a state store. If a config change requires action (e.g., recalculating all pending claims), HCS emits a Kafka event `HCS_CONFIG_CHANGED`. The Master Claim Orchestrator listens to this event and decides what to do.

### Q17. How does HCS support multi-region deployments?
If Aivana deploys to AWS Europe and AWS India, HCS configuration is replicated globally via CockroachDB or AWS Aurora Global Database. A config change in India propagates to Europe in under 1 second.

### Q18. What is the schema of the `config_json` column?
It is a loosely typed JSONB column in Postgres. This allows Aivana engineers to add new feature flags instantly without running database migrations (`ALTER TABLE`).

### Q19. How do you audit configuration changes?
Every `PUT` request to HCS creates a row in the `audit_logs` table containing a JSON Patch (e.g., `[{ "op": "replace", "path": "/auto_submit", "value": true }]`). This provides a perfect historical timeline of settings.

### Q20. Can HCS define UI themes?
Yes. The Aivana Hospital Portal fetches its configuration from HCS, allowing "White Labeling." HCS returns the hospital's specific logo URL and primary CSS hex colors.

### Q21. Does HCS store hospital operational data (e.g., list of doctors)?
No. That belongs in an Identity/Provider directory. HCS only stores *system configuration* and *feature toggles*.

### Q22. How does HCS help with deprecation?
If Aivana wants to deprecate Taiga Rule Pack v1.0, the Analytics Platform queries HCS to see exactly which 12 hospitals are still configured to use v1.0, allowing targeted outreach.

### Q23. Why use a dedicated service instead of a library (like LaunchDarkly)?
LaunchDarkly is excellent for pure feature flags, but Aivana requires complex Knowledge Pack mapping, multi-level hierarchical merging (Global->Hospital->Branch), and deep integration with the Replay Engine. Building a custom HCS is necessary for this domain-specific complexity.

### Q24. How is HCS secured?
Internal microservices access HCS via internal gRPC using mTLS. External UI access is brokered through the API Gateway, which validates the user's JWT to ensure they only read/write their own hospital's config.

### Q25. What is the ultimate business value?
It enables the "SaaSification" of Aivana. Without HCS, every hospital requires custom code. With HCS, Aivana runs a single unified codebase in production, adapting its behavior dynamically per tenant.

---

*End of Document*
