# Enterprise Performance Benchmarks

For Aivana to achieve the "Autonomous Revenue Cycle," the system must be fast. If a patient is waiting at the discharge desk, a 30-minute AI processing delay is unacceptable. This document defines the strict SLAs (Service Level Agreements) for P99 latency across the platform.

---

## 1. Global Benchmark Targets

| Workflow | P50 (Average) | P99 (Maximum) | Notes |
| :--- | :--- | :--- | :--- |
| **Admission -> Readiness (SRA)** | 3 seconds | 15 seconds | Assuming 5-page PDF upload. |
| **Final Bill -> Submission (FCP)** | 5 seconds | 25 seconds | Assuming 50-page PDF upload. |
| **Denial -> Appeal Draft (Aegis)** | 10 seconds | 35 seconds | Heavy LLM generation dependency. |

---

## 2. Service-Level SLAs (P99)

Every microservice is bound by a strict internal SLA. If a service exceeds its budget, it triggers an infrastructure alert.

### Ingestion & Edge
- **Integration Hub (Inbound TCP/HTTP)**: < `50 ms` (Acknowledge receipt to EMR instantly).
- **Docling Ingestion Gateway (S3 Upload & Registration)**: < `200 ms`.
- **Document Identification (Classification)**: < `800 ms` (Uses fast local computer vision models).
- **OCR Text Extraction**: < `2 seconds` per page. (Highest latency variance; often offloaded to asynchronous background queues).

### Core Reasoning & Logic
- **Patient Consolidation (TPR)**: < `150 ms`.
- **Fairway (Clinical Evidence Review)**: < `80 ms` (If hitting Semantic Cache) or < `3 seconds` (If hitting live LLM).
- **Taiga (Financial Compliance)**: < `50 ms` (Strictly deterministic rule evaluation).
- **Submission Intelligence Engine (SRA)**: < `40 ms` (Aggregates pre-computed scores).
- **TPA Query Prediction**: < `600 ms` (ML inference over Feature Store).

### Output & Generation
- **Final Claim Packet (FCP) Generation**: < `200 ms` (Assembling the JSON, generating the PDF manifest).
- **Submission Adapter (Outbound)**: < `3 seconds` (Heavily dependent on the TPA's API response time).
- **Aegis (Appeal Generation)**: < `5 seconds` (Generating a 2-page legal document via GPT-4o).

### Infrastructure Support
- **Master Claim Orchestrator (MCO State Transition)**: < `20 ms` (Temporal.io overhead).
- **Hospital Configuration Service (HCS Read)**: < `5 ms` (Served from L1 RAM cache).
- **Prompt Registry (Resolution)**: < `5 ms` (Served from L2 Redis cache).
- **Feature Store (Online Inference)**: < `10 ms` (Served from Redis).
- **Analytics Platform (Dashboard Query)**: < `150 ms` (ClickHouse analytical query).
- **Evidence Graph Service (EGS Read)**: < `30 ms` (Neo4j graph traversal).

---

## 3. Concurrency Limits
- **AI Gateway**: Target sustain of `1,000 requests/second`.
- **Kafka Bus**: Target sustain of `10,000 events/second`.
- **MCO Workflows**: Target sustain of `100,000 concurrent active claims`.

## 4. Latency Mitigation Strategies
- **Parallelization**: Fairway does not evaluate 10 clinical rules sequentially. MCO fans out 10 requests to Fairway in parallel. The slowest LLM call dictates the total latency.
- **Aggressive Caching**: Because medical facts are mostly immutable once extracted, EGS and TPR heavily cache their read endpoints.
- **Compute Optimization**: Document Identification models are compiled to ONNX or TensorRT to execute in sub-millisecond times on GPUs.

## 5. End-to-End Walkthrough (15-Second SLA)

1. **`0.0s`**: Hospital EMR pushes HL7 ADT with a 5-page Admission form.
2. **`0.1s`**: Integration Hub emits `CLAIM_CREATED` and `DOCUMENT_UPLOADED`.
3. **`0.2s`**: Docling registers the PDF in S3.
4. **`1.0s`**: Document ID classifies it as "Admission Note".
5. **`6.0s`**: OCR extracts the text (Parallelized: 5 pages * 1.2s average).
6. **`6.2s`**: TPR extracts "Dengue" and "Heart Rate: 90".
7. **`6.3s`**: EGS writes the bounding boxes to the Graph.
8. **`8.5s`**: Fairway evaluates clinical necessity (Cache miss, hits Gemini).
9. **`8.6s`**: Taiga evaluates financial rules (Instant).
10. **`8.7s`**: SRA aggregates the score to 92%.
11. **`8.9s`**: FCP builds the immutable JSON packet.
12. **`12.0s`**: Submission Adapter POSTs to Star Health API.
13. **`12.1s`**: Star Health API returns `200 OK (Pending Review)`.
14. **`12.2s`**: MCO emits `CLAIM_SUBMITTED`.
15. **`12.3s`**: Notification Service sends WhatsApp message to the Hospital Billing Clerk: "Claim successfully submitted to Star Health."

*Total Time: 12.3 seconds.*
