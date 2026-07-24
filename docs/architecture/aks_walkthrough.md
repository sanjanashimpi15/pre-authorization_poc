# Design Walkthrough & Justifications — Aivana Knowledge Studio (AKS)

This document explains every architectural decision in the Aivana Knowledge Studio and its role as the knowledge management backbone of the Aivana platform.

---

## 1. Why "Knowledge Studio" and Not "Policy Studio"

The name change from Policy Studio to **Aivana Knowledge Studio** is not cosmetic — it reflects the actual scope of the service.

If AKS only manages insurance policies, it becomes a domain-specific tool. But the platform's downstream services need more than policy rules:

| Knowledge Type | Consumer | Without AKS |
| :--- | :--- | :--- |
| Insurer rule packs | Taiga | Hardcoded per insurer |
| Clinical specialty templates | Fairway | Hardcoded per specialty |
| ICD chapter lock rules | Taiga | Hardcoded in engine |
| Hospital tariff sheets | Taiga | Uploaded manually per case |
| TPA documentation requirements | Claim Readiness | Hardcoded or manual |
| IRDAI circulars | All services | Read by engineers, implemented manually |
| Aegis appeal templates | Aegis | Hardcoded per insurer |
| NABH / ABDM rules | Future services | Not implemented |

Every one of these knowledge types follows the same lifecycle: **authored externally → ingested → parsed → structured → versioned → approved → published → consumed**. AKS manages this lifecycle uniformly across all knowledge types using a single platform.

> AKS is the "GitHub for Insurance Rules." Every piece of knowledge that Aivana services need to behave correctly lives in AKS as a versioned, auditable, publishable pack.

---

## 2. Architectural Q&A (All 12 Questions)

### Q1. What is the best production architecture?
A **pipeline orchestration model** built around five stages:

```
Import → Parse → Build → Version → Approve → Publish → Consume
```

Each stage is a separate service module. The modules are loosely coupled — you can re-run Parse without re-importing, re-run Build without re-parsing, and publish without triggering a rebuild.

The storage model is **metadata in PostgreSQL + YAML artifacts in S3**. This gives:
- Relational query power for version history, approval state, and audit
- Immutable artifact storage in S3 with SHA256 integrity verification
- Redis caching for sub-20ms read latency for Taiga/Fairway/Aegis on every claim

The parsing model follows the same **Docling-first** philosophy as the Ingestion Gateway. Docling handles structural parsing; AI is invoked conditionally only for ambiguous clause interpretation.

---

### Q2. Should rule packs use YAML, JSON, or Decision Tables?

**Primary: YAML. Supplementary: Decision Tables for matrix rules.**

| Format | Use |
| :--- | :--- |
| YAML | All rule packs (primary representation stored in S3) |
| JSON | API transport format (derived from YAML at serve time) |
| Decision Tables | Complex matrix rules (co-pay by age band × room category × procedure type) |
| Drools | ❌ — JVM runtime, complex deployment, not readable by compliance teams |

**Why YAML over JSON for storage?**
- YAML supports inline comments — critical for compliance annotation
- YAML is git-diffable with clean human-readable diffs
- YAML is the format Taiga already consumes
- Compliance teams can read and review YAML without engineering support

**Why Decision Tables for matrix rules?**
Some rules cannot be expressed cleanly in YAML. A co-pay rule that varies by age band (< 60 / ≥ 60) AND room category (Normal / ICU / Private) AND procedure type (Daycare / Inpatient) produces 12 combinations. A decision table represents this cleanly; a nested YAML structure becomes difficult to audit.

---

### Q3. How should insurer-specific rules be organized?

Each insurer × product × scheme-year combination is a separate Knowledge Pack:

```
insurers/
├── star_health/
│   ├── medi_classic/
│   │   ├── 2026.2.yaml   ← PUBLISHED
│   │   ├── 2025.1.yaml   ← SUPERSEDED
│   │   └── 2024.3.yaml   ← RETIRED
│   └── comprehensive/
│       └── 2026.1.yaml
├── new_india/
│   └── floater/
│       └── 2026.1.yaml
└── lic_health/
    └── arogya/
        └── 2026.1.yaml
```

Insurer packs are versioned independently. A change to Star Health Medi Classic does not affect Star Health Comprehensive. A hospital override for Apollo Mumbai does not affect Apollo Delhi.

Taiga resolves the correct pack using: `insurer + product + admissionDate`. The Rule Version Resolver picks the PUBLISHED pack whose `effectiveFrom ≤ admissionDate ≤ effectiveTo`.

---

### Q4. How should hospital overrides work?

Hospital overrides are a **separate, linked Knowledge Pack** — not a modification to the insurer rule pack.

This is the most important architectural decision in the override model:

> **The insurer rule pack is never modified. The hospital override pack inherits from it and extends it.**

This means:
- The insurer's room rent cap (e.g., 1% of SI) cannot be overridden by a hospital
- The insurer's exclusion list cannot be overridden by a hospital
- The insurer's waiting period rules cannot be overridden by a hospital

What hospitals CAN override:
- Package rate (e.g., Apollo Mumbai negotiated cataract rate = ₹38,000 vs standard ₹35,000)
- Implant pricing (e.g., premium knee implant = ₹95,000)
- Room tariff category mapping (e.g., "Deluxe" room mapped to "Normal Ward" billing category per MOU)
- Department-specific procedure pricing

The override hierarchy is enforced at Taiga's rule merge step:
```
Hospital Override Pack → overrides → Insurer Rule Pack → overrides → IRDAI Standard
```

Hospital admins upload overrides via the Hospital Admin Portal. Hospital Finance approval is required before the override pack is published.

---

### Q5. How should package tariffs be stored?

Package tariffs are stored within the Insurer Rule Pack as a `packages[]` array in YAML. Each entry contains:
- `packageCode` — unique identifier
- `icdCodes[]` — valid ICD codes this package applies to
- `rateNormal` — normal ward rate
- `rateICU` — ICU rate (if applicable)
- `implantIncluded` — boolean
- `implantCap` — maximum reimbursable implant cost
- `_provenance` — clause reference and extraction confidence

Hospital-specific negotiated rates override the base package rate in the Hospital Override Pack.

CGHS and PMJAY packages are stored as separate reference packs under `packages/cghs/` and `packages/pmjay/`. These can be linked by hospitals that have CGHS or PMJAY empanelment.

---

### Q6. How should versioning work?

Every Knowledge Pack has an independent version identifier (format: `YYYY.N`, e.g., `2026.2`).

Versioning rules:
1. Versions are **immutable once PUBLISHED** — the YAML content in S3 is never modified
2. A new policy update always creates a NEW version in DRAFT state
3. Versions carry `effectiveFrom` and `effectiveTo` dates — Taiga always resolves the correct version by admission date
4. A case's FCA always records which exact pack version was used — historical FCAs remain accurate even after a rollback

The version lifecycle:
```
DRAFT → IN_REVIEW → APPROVED → PUBLISHED → SUPERSEDED → RETIRED
```

A SUPERSEDED pack remains valid for historical case lookups but is not used for new cases.

---

### Q7. How should policy updates work?

A policy update triggers a full new version cycle:

1. Insurance desk uploads the new insurer PDF (e.g., revised brochure)
2. Policy Parsing Engine extracts new/modified clauses
3. Rule Comparison Engine generates a diff against the previous version
4. Rule Builder creates a new DRAFT YAML pack with changes applied
5. Approval Workflow circulates the diff report for review
6. After approval, the new version is PUBLISHED with the new `effectiveFrom` date
7. Taiga picks up the new version automatically on the first case whose admission date falls within the new effective range

Zero engineering work is required for a policy update. Compliance teams handle the entire lifecycle through the AKS portal.

---

### Q8. How should approvals work?

A three-stage approval workflow:

| Stage | Approver | Validates |
| :--- | :--- | :--- |
| Insurance Desk | Claims/Compliance team | Clause extraction accuracy, source document match |
| Clinical Review | Medical Advisor | Clinical template accuracy, ICD lock rules (clinical packs only) |
| Finance | Finance team | Package tariffs, room rent caps, co-pay percentages |

Approval is enforced at the API level — `PUBLISHED` status cannot be set without all required stages completing. A rejection at any stage returns the pack to `DRAFT` with a mandatory rejection reason stored in the audit log.

For hospital overrides: only one approval stage (Hospital Finance) is required.

---

### Q9. How should rollback work?

Rollback is a **state change, never a content change**:

1. An authorized operator (SUPER_ADMIN or INSURANCE_DESK) calls `POST /v1/packs/{packId}/rollback`
2. The current PUBLISHED version is set to `SUPERSEDED`
3. The specified previous version is set back to `PUBLISHED`
4. Taiga's Redis cache is invalidated for affected insurer/product combinations
5. On the next request, Taiga resolves the newly active (rolled back) version
6. The rollback event is written to the immutable audit log with: actor, timestamp, reason, and affected version numbers

Historical cases (already processed with the reverted version) are not affected — their FCA already records the pack version that was used at processing time.

---

### Q10. How should Taiga consume rule packs?

Taiga consumes Knowledge Packs via the AKS Read API:

```
GET /v1/packs/INSURER_RULE_PACK?insurer=X&product=Y&admissionDate=Z
```

Resolution logic:
1. Find the PUBLISHED pack where `effectiveFrom ≤ admissionDate` and `effectiveTo IS NULL OR ≥ admissionDate`
2. Load the YAML from S3 (or Redis cache if available)
3. Load the Hospital Override Pack for the processing hospital
4. Merge packs according to priority ladder
5. Lock the resolved version identifiers in the FCA audit trail

Cache TTL is 1 hour. On rollback or new publication, the cache is explicitly invalidated via a cache-bust event.

Critically: **Taiga never writes to AKS**. The data flow is one-directional: AKS → Taiga. Taiga is a consumer only.

---

### Q11. How should audit work?

The audit engine writes **append-only, immutable events** for every state transition. No record in the audit table can be modified or deleted (enforced at the PostgreSQL role level with `REVOKE UPDATE, DELETE ON audit_events`).

Every event records:
- WHO: actor ID, role, hospital/organization
- WHAT: action type, pack ID, version before/after
- WHY: mandatory comment field for status transitions
- WHEN: timestamp
- SOURCE: linked source document SHA256

This creates a complete compliance trail: for any claim processed by Taiga, you can trace back to the exact Knowledge Pack version used, the approval history of that pack, the source document it was parsed from, and the extraction confidence of every clause.

---

### Q12. How should explainability work?

Every rule in a Knowledge Pack YAML carries a `_provenance` block:

```yaml
_provenance:
  sourceDocument: "star_health_2026_brochure.pdf"
  sha256: "a3f92...c8"
  pageNumber: 12
  clauseNumber: "4.2"
  paragraph: "Room rent shall not exceed 0.75% of Sum Insured per day..."
  extractionConfidence: 0.98
  extractionMethod: "DETERMINISTIC_PATTERN"
  approvedBy: "usr-admin-0923"
  approvedAt: "2026-07-13T22:55:00+05:30"
```

When Taiga applies a room rent deduction and cites "Clause 4.2", the citation chain is unbroken all the way to the physical PDF page number and paragraph. An insurer auditor, a hospital finance officer, or an IRDAI inspector can trace any FCA decision back to its source document in seconds.

---

## 3. How AKS Differs from Taiga and Fairway

### AKS vs Taiga

| Dimension | AKS | Taiga |
| :--- | :--- | :--- |
| **Purpose** | Author, version, and publish knowledge | Execute compliance checks using knowledge |
| **Timing** | Before claim processing | During claim processing |
| **Output** | Knowledge Packs (YAML + metadata) | Financial Compliance Assessment (FCA) |
| **Users** | Compliance teams, hospital admins | Automated (no human users at runtime) |
| **AI role** | Parse ambiguous clauses in policy PDFs | Normalize medical terminology |
| **Writes claims data?** | ❌ Never | ✅ Writes FCA to MPR |

AKS feeds Taiga. Taiga never feeds AKS. The data flow is strictly one-directional.

---

### AKS vs Fairway

| Dimension | AKS | Fairway |
| :--- | :--- | :--- |
| **Purpose** | Manage clinical specialty templates | Execute clinical evidence checks |
| **Relationship** | Provides the template; doesn't evaluate claims | Reads the template; evaluates evidence |
| **Output** | Clinical Template Pack (YAML) | Clinical Evidence Assessment (CEA) |
| **Users** | Medical advisors, clinical teams | Automated (no human users at runtime) |

AKS creates the Fairway specialty templates (the YAML evidence checklists) and manages their lifecycle. Fairway reads them. Fairway never modifies them.

---

## 4. Why Insurer Rules Must Never Be Hardcoded

Hardcoding insurer rules is one of the most dangerous architectural decisions in a claims platform:

| Problem | Impact |
| :--- | :--- |
| Insurer changes room rent cap (0.75% → 1.0%) | Engineer must modify code, test, deploy; claims processed in the gap may be wrong |
| New insurer added | Engineer must write new code; weeks of delay |
| IRDAI issues new circular changing co-pay rules | Manual code change required; IRDAI compliance at risk |
| Hospital negotiates new package rate | Manual code change for every hospital |
| Policy year changes (April 1st) | Manual code update across all affected insurers |
| Incorrect rule identified in production | Rollback requires code deployment, not just a config change |

With AKS:
- Every one of these changes is handled by compliance teams through the AKS portal
- Zero engineering involvement for standard rule updates
- Rollback takes seconds (a single API call)
- IRDAI inspectors get a complete audit trail showing when every rule changed

The "no hardcoded rules" principle is what makes Aivana scale to 1,000+ hospitals and 50+ insurer products without a proportional engineering headcount.

---

## 5. Production Considerations

### Scalability
- AKS API is stateless; horizontal pod scaling
- Knowledge Pack reads are cached in Redis (TTL 1 hour); S3 is only hit on cold reads
- Pack write operations (import, build, approve) are async — UI receives a job ID and polls for completion
- The PostgreSQL database handles metadata only (pack identifiers, versions, approval state); the heavy YAML content lives in S3

### Performance
- Pack reads for Taiga/Fairway/Aegis complete in < 20ms (cached)
- Policy PDF parsing runs asynchronously (not in the claim processing path)
- Version diff computation (< 500ms) runs on approval submission, not on rule read

### Security
- Multi-tenant isolation: hospitals cannot access each other's override packs
- Insurer data isolation: insurer A cannot access insurer B's rule packs
- Audit log immutability enforced at DB role level (no UPDATE/DELETE)
- All YAML files verified by SHA256 on every read

### Future Extensibility
| Future Knowledge Type | AKS Readiness |
| :--- | :--- |
| NABH / ABDM standards | Add new `packType: NABH_RULES` — no code change |
| PM-JAY package tables | Add new insurer entry under `packages/pmjay/` |
| ICD-11 transition | Add new `ICD_MAPPING_PACK` version with ICD-11 chapter locks |
| New LLM for clause parsing | Swap the parsing adapter — AKS schema unchanged |
| Multi-country expansion | Add country field to pack schema |

AKS is the single change point for all knowledge evolution. As Aivana adds new services, new countries, or new regulatory domains, AKS absorbs the knowledge lifecycle without requiring changes to Taiga, Fairway, or Aegis.
