# Enterprise Event Catalog

Aivana operates as an event-driven architecture over Kafka. This catalog defines the core events that orchestrate the platform.

---

## 1. `CLAIM_CREATED`
**Trigger**: A hospital initiates a new draft claim in the EMR or Aivana Portal.
- **Producer**: Integration Hub (or Portal API)
- **Consumers**: Master Claim Orchestrator (MCO), Feature Store
- **Payload**: `{ "claimId": "UUID", "hospitalId": "UUID", "type": "PRE_AUTH" }`
- **Idempotency Key**: `claimId`
- **Ordering**: Unordered
- **Retry Policy**: DLQ after 3 attempts

## 2. `DOCUMENT_UPLOADED`
**Trigger**: A PDF/Image is attached to a claim.
- **Producer**: Integration Hub
- **Consumers**: Docling Ingestion Gateway
- **Payload**: `{ "documentId": "UUID", "claimId": "UUID", "s3Uri": "string" }`
- **Idempotency Key**: `documentId`
- **Ordering**: Unordered
- **Retry Policy**: Infinite retry (S3 availability)

## 3. `EXTRACTION_COMPLETED`
**Trigger**: NLP pipelines finish processing a document.
- **Producer**: Patient Information Extraction Service
- **Consumers**: Trusted Patient Record (TPR), Evidence Graph Service (EGS)
- **Payload**: `{ "documentId": "UUID", "claimId": "UUID", "extractedEntities": [...] }`
- **Idempotency Key**: `documentId`
- **Ordering**: Unordered
- **Retry Policy**: DLQ after 5 attempts

## 4. `CLAIM_READY_FOR_REVIEW`
**Trigger**: TPR and EGS have settled all facts for the current claim state.
- **Producer**: MCO
- **Consumers**: Fairway (Clinical), Taiga (Financial)
- **Payload**: `{ "claimId": "UUID", "tprSnapshotId": "UUID" }`
- **Idempotency Key**: `tprSnapshotId`
- **Ordering**: Ordered per `claimId`
- **Retry Policy**: DLQ after 3 attempts

## 5. `CLAIM_LOCKED`
**Trigger**: All AI reviews are complete and human overrides (if any) are finalized.
- **Producer**: MCO
- **Consumers**: Final Claim Packet (FCP) Service
- **Payload**: `{ "claimId": "UUID", "finalAssessmentId": "UUID" }`
- **Idempotency Key**: `finalAssessmentId`
- **Ordering**: Ordered per `claimId`
- **Retry Policy**: DLQ after 3 attempts

## 6. `CLAIM_SUBMITTED`
**Trigger**: The FCP is successfully transmitted to the TPA/Insurer.
- **Producer**: Submission Adapter Service (SAS)
- **Consumers**: MCO, Feature Store, Analytics Platform
- **Payload**: `{ "claimId": "UUID", "tpaReferenceId": "string", "timestamp": "ISO8601" }`
- **Idempotency Key**: `claimId`
- **Ordering**: Ordered per `claimId`
- **Retry Policy**: Infinite (Critical audit event)

## 7. `CLAIM_QUERY_RECEIVED`
**Trigger**: The TPA sends an RFI (Request for Information).
- **Producer**: Integration Hub (polling TPA portal/email)
- **Consumers**: MCO, Notification Service
- **Payload**: `{ "claimId": "UUID", "queryText": "string", "deadline": "ISO8601" }`
- **Idempotency Key**: `Hash(claimId + queryText)`
- **Ordering**: Ordered per `claimId`
- **Retry Policy**: DLQ after 3 attempts

## 8. `CLAIM_DENIED`
**Trigger**: The TPA formally rejects or partially deducts the claim.
- **Producer**: Integration Hub
- **Consumers**: MCO, Denial Analysis Service (DAS), Analytics Platform
- **Payload**: `{ "claimId": "UUID", "deductionAmount": "number", "reasonCodes": [...] }`
- **Idempotency Key**: `claimId`
- **Ordering**: Ordered per `claimId`
- **Retry Policy**: Infinite (Critical audit event)

## 9. `CLAIM_APPEALED`
**Trigger**: Aegis generates and submits a rebuttal to the TPA.
- **Producer**: Aegis Appeal Service
- **Consumers**: MCO, Analytics Platform
- **Payload**: `{ "claimId": "UUID", "appealId": "UUID", "appealType": "CLINICAL|FINANCIAL" }`
- **Idempotency Key**: `appealId`
- **Ordering**: Ordered per `claimId`
- **Retry Policy**: DLQ after 3 attempts

## 10. `CLAIM_SETTLED`
**Trigger**: The final UTR (money transfer) is recorded.
- **Producer**: Integration Hub
- **Consumers**: MCO, Feature Store, Analytics Platform
- **Payload**: `{ "claimId": "UUID", "approvedAmount": "number", "utr": "string" }`
- **Idempotency Key**: `claimId`
- **Ordering**: Ordered per `claimId`
- **Retry Policy**: Infinite (Critical audit event)

## 11. `RULE_PUBLISHED`
**Trigger**: An AKS Admin promotes a Knowledge Pack to PRODUCTION.
- **Producer**: Aivana Knowledge Studio (AKS)
- **Consumers**: MCO, Hospital Configuration Service (HCS), Replay Engine
- **Payload**: `{ "packId": "UUID", "version": "string", "affectedHospitals": [...] }`
- **Idempotency Key**: `packId_version`
- **Ordering**: Unordered
- **Retry Policy**: Infinite

## 12. `CONFIG_CHANGED`
**Trigger**: A hospital updates their feature flags or preferences.
- **Producer**: Hospital Configuration Service (HCS)
- **Consumers**: All microservices (via Redis Pub/Sub cache invalidation)
- **Payload**: `{ "hospitalId": "UUID", "changedKeys": [...] }`
- **Idempotency Key**: `UUID()`
- **Ordering**: Ordered per `hospitalId`
- **Retry Policy**: None (Fire and forget, services will TTL cache anyway)
