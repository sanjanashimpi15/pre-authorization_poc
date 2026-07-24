# Final Claim Packet (FCP) Service — Architectural Specification

This document presents the complete production-grade architecture, workflows, schemas, and API contracts for Aivana's **Final Claim Packet (FCP)** service.

---

## 1. Position in Aivana Pipeline & Realignment

To minimize unnecessary invalidate-and-regenerate cycles, the Final Claim Packet (FCP) service runs **after** TPA Query Prediction has identified and resolved likely query objections.

```
✅ TPR & Upstream Inputs
      │
      ▼
✅ Fairway (CEA) & Taiga (FCA)
      │
      ▼
✅ Submission Intelligence Engine (SRR)
      │
      ▼
✅ TPA Query Prediction (Objections pre-emptively cleared)
      │
      ▼
 ╔═════════════════════════════════════════════════════╗
 ║             Final Claim Packet (FCP)                ║
 ║  (Assembles and seals the immutable claim package)  ║
 ╚═════════════════════════════════════════════════════╝
      │
      ▼
 ╔═════════════════════════════════════════════════════╗
 ║             Submission Adapter Layer                ║
 ║    (Translates FCP to insurer-specific formats)     ║
 ╚═════════════════════════════════════════════════════╝
      │
      ├── Star Health Adapter
      ├── Niva Bupa Adapter
      ├── FHPL Adapter
      └── MediAssist / MDIndia / Custom TPA Portal API
```

---

## 2. Overall Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Final Claim Packet (FCP) Service                      │
│                                                                              │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐  │
│  │   Submission Lock    │ │   Packet Normalizer  │ │    Evidence Index    │  │
│  │   (Token Engine)     │ │ (Order/Naming/Class) │ │ (Lineage & Coords)   │  │
│  └──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘  │
│             │                        │                        │              │
│             └────────────────────────┼────────────────────────┘              │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Packet Assembly Pipeline                        │  │
│  │   (Clinical, Financial, Policy, & Authorization Bundler Pipelines)     │  │
│  └──────────────────────────────────┬─────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                       Bundle Optimization Engine                       │  │
│  │   (Compresses, optimizes PDFs, rescales images, chunks payloads)       │  │
│  └──────────────────────────────────┬─────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                 Transmission Readiness & Quality Cert                  │  │
│  │   (Validates digital signatures, duplicate files, & quality metrics)   │  │
│  └──────────────────────────────────┬─────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │               Signer, Hash, & Certificate Generators                   │  │
│  │   (SHA-256 Checksums, X.509 Cryptographic Signatures, & SRC generation)│  │
│  └──────────────────────────────────┬─────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                      Storage / Archival Database                       │  │
│  │   (Immutable S3 snapshots + transactional SQL mapping records)          │  │
│  └──────────────────────────────────┬─────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                       Submission Adapter Layer                         │  │
│  │   (Star Health / Niva Bupa / FHPL Drivers + API / ZIP Packagers)       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Advanced Packaging Capabilities

### 3.1 Submission Adapter Layer
Insurer-specific delivery portals demand disparate formats. FCP handles core semantic packaging, while the **Submission Adapter Layer** executes driver-based serialization:
- **Star Health Adapter**: Prepares multipart API payloads matching Star pre-auth schemas.
- **Niva Bupa Adapter**: Compiles normalized zip archives named as `[ClaimNo]_[HospID]_preauth.zip`.
- **FHPL & MediAssist Adapters**: Generates custom PDF formats and invokes proprietary SOAP/REST service endpoints.

### 3.2 Packet Normalizer
Files uploaded by hospitals with arbitrary names are mapped into standardized insurer schemes:
- Order Index: `01_AdmissionNote.pdf`, `02_DischargeSummary.pdf`, `03_LabReport.pdf`.
- Formats: Ensures compatibility with PDF/A compliance.

### 3.3 Evidence Index
To eliminate manual search times for auditors and downstream modules (Denial Analysis/Aegis), FCP constructs an inline index connecting diagnosis assertions to concrete proof coordinates:
```json
"evidenceIndex": {
  "diagnosis": "Acute Coronary Syndrome",
  "mappings": [
    {
      "source": "CEA.medicalNecessity",
      "tprEntity": "Troponin-T Test",
      "document": "03_LabReport.pdf",
      "pages": [1],
      "boundingBox": { "x": 12, "y": 45, "w": 180, "h": 24 },
      "ocrText": "TROPONIN-T: POSITIVE (0.85 ng/mL)"
    }
  ]
}
```

### 3.4 Attachment Quality Certification
Every document compiled into the FCP undergoes a quality gate, appending verification metrics to the metadata manifest:
```json
"qualityCertification": {
  "documentId": "doc-discharge-summary-001",
  "ocrConfidence": 0.96,
  "signatureVerified": true,
  "tamperCheck": "PASS",
  "imageQualityScore": 92,
  "completenessScore": 100
}
```

### 3.5 Bundle Optimization Engine
Portal upload limits are strictly capped (often at 25MB). The **Bundle Optimization Engine** prevents manual split failures:
- **Dynamic Optimization**: Compresses PDF vector layers, rescales raster images (e.g. downgrading high-res 4K scans to 150 DPI), and utilizes ZIP multipart chunking.
- **Health Score**: A packet fitness metric computed from duplicate check results, image resolutions, and payload sizing.

---

## 4. Processing State Machine

```
   [INIT]
     │
     ▼
  ACQUIRING_LOCK ------(Timeout / Document Event)------> [INVALIDATED]
     │
  (Token Issued)
     ▼
  NORMALIZING
     │
  (File naming & order normalized)
     ▼
  ASSEMBLING
     │
  (Bundlers complete, Evidence Index built)
     ▼
  OPTIMIZING --------(Split / Compressing)-----------> [READY_TO_SIGN]
     │
     ▼
  VALIDATING --------(Readiness check fails)----------> [INVALIDATED]
     │
  (Readiness verified, Health Score computed)
     ▼
  SIGNING
     │
  (Hashes, Signatures, & SRC Bound)
     ▼
  COMMITTING -------(Write Fail)---------------------> [FAILED]
     │
  (Immutable snapshot stored)
     ▼
  DELIVERING -------(Submission Adapter Fail)--------> [RETRY_QUEUED]
     │
  (mTLS/Portal API Success)
     ▼
  [COMPLETED] (FCP_SUBMITTED Event Emitted)
```

---

## 5. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Client as Claim Delivery Router
    participant FCP as FCP Orchestrator
    participant Opt as Bundle Optimizer
    participant Signer as Cryptographic Signer
    participant DB as Postgres/S3 Storage
    participant Adapters as Submission Adapter Layer
    participant Insurer as Insurer API / Portal

    Client->>FCP: GeneratePacketRequest(claimId, srrId, token)
    FCP->>FCP: Normalize filenames and build Evidence Index
    FCP->>Opt: Optimize Bundle (Check portal limits, compress PDFs)
    Opt-->>FCP: Optimized files (under 25MB threshold)
    FCP->>Signer: SignPacket(OptimizedPacket)
    Signer-->>FCP: Signed Packet + SRC + Checksums
    FCP->>DB: Write Immutable Snapshot & Manifest
    DB-->>FCP: Write Acknowledged
    FCP->>Adapters: DeliverClaim(FCP_Object, TargetInsurer)
    Adapters->>Adapters: Apply Insurer-Specific Format Driver
    Adapters->>Insurer: Submit Claim via Portal API/Upload
    Insurer-->>Adapters: Acknowledged (Claim Ref No)
    Adapters-->>Client: Claim Submitted Successfully
```

---

## 6. Database & JSON Schemas

### 6.1 Database Schema (Postgres)
```sql
CREATE SCHEMA fcp_service;

CREATE TABLE fcp_service.submission_locks (
    lock_token VARCHAR(64) PRIMARY KEY,
    claim_id VARCHAR(64) NOT NULL,
    srr_id VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    invalidated BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE fcp_service.claim_packets (
    packet_id VARCHAR(64) PRIMARY KEY,
    claim_id VARCHAR(64) NOT NULL,
    packet_version INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verification_hash VARCHAR(64) NOT NULL,
    health_score INT NOT NULL,
    manifest JSONB NOT NULL,
    evidence_index JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    CONSTRAINT uq_claim_version UNIQUE (claim_id, packet_version)
);
```

### 6.2 Complete FCP JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FinalClaimPacket",
  "type": "object",
  "properties": {
    "packetId": { "type": "string" },
    "claimId": { "type": "string" },
    "packetVersion": { "type": "integer" },
    "generatedAt": { "type": "string", "format": "date-time" },
    "submissionToken": { "type": "string" },
    "packetHealthScore": { "type": "integer", "minimum": 0, "maximum": 100 },
    "manifest": { "type": "object" },
    "evidenceIndex": { "type": "object" },
    "submissionCertificate": { "type": "object" },
    "clinicalPackage": { "type": "object" },
    "financialPackage": { "type": "object" },
    "policyPackage": { "type": "object" },
    "authorizationPackage": { "type": "object" },
    "attachmentReferences": { "type": "array" }
  },
  "required": [
    "packetId",
    "claimId",
    "packetVersion",
    "generatedAt",
    "submissionToken",
    "packetHealthScore",
    "manifest",
    "evidenceIndex",
    "submissionCertificate",
    "clinicalPackage",
    "financialPackage",
    "policyPackage",
    "authorizationPackage",
    "attachmentReferences"
  ]
}
```

---

## 7. Event & Lifecycle Hooks

FCP registers event hooks on the Event Bus to drive automated transitions:
- **`FCP_CREATED`**: Triggered when the snapshot is committed.
- **`FCP_SIGNED`**: Emitted once private keys seal the SRC metadata.
- **`FCP_SUBMITTED`**: Sent upon confirmation receipt from the Submission Adapter.
- **`FCP_INVALIDATED`**: Published when files change during an active lock cycle.

---

## 8. Latency Budget

- **Context Normalization & Indexing**: < 30ms
- **Bundle Optimization (PDF Compressing)**: < 120ms (Max processing limit)
- **Encryption & Private-Key Signing**: < 40ms
- **Database Snapshot Commit**: < 30ms
- **Average Execution Duration**: **< 220ms**

---

*End of Document*
