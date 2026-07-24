# Design Walkthrough & Justifications — Integration Hub

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Integration Hub**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why use isolated Javascript VMs for mappings? Why not write them in the core language (e.g., Go/Java)?
Every hospital requires a custom mapping. Hospital A puts the patient's phone number in `PID-13`, while Hospital B puts it in `PID-14`. If these were hardcoded in the core service, the backend team would have to deploy a new microservice version every time a field engineer onboarded a new hospital. By using a secure Javascript VM (like V8 Isolates), field engineers can write and deploy custom mappings via the UI instantly, completely decoupling integration work from core platform engineering.

### Q2. How does the Hub handle legacy HL7 v2 over TCP?
It runs a specialized TCP server implementing the MLLP (Minimum Lower Layer Protocol) standard. It handles the specific byte-framing required to receive and acknowledge HL7 messages, converting them into standard JSON objects internally before passing them to the mapping scripts.

### Q3. Why use Kafka as the boundary?
The Integration Hub is the perimeter defense. If a hospital accidentally dumps 5 years of historical data in 10 minutes, the Hub quickly parses it and writes it to Kafka. Kafka acts as a massive shock absorber. The Master Claim Orchestrator (MCO) can then consume those events at a safe, controlled pace without being overwhelmed.

### Q4. How does the Hub assist with Denials and Appeals?
When Aegis generates an appeal, MCO sends an event: `OUTBOUND_APPEAL_READY`. The Hub consumes this, executes the specific hospital's outbound script, and POSTs the appeal text and PDF back into the hospital's EMR via their proprietary API. This allows billing clerks to see Aivana's work directly inside their existing software.

### Q5. What happens if a hospital EMR goes down for maintenance?
The Hub uses standard event-driven retry logic. If the Hub attempts to push a status update to the hospital EMR and gets a `503 Service Unavailable`, it backs off (e.g., 5 mins, 15 mins, 1 hour) and retries. The MCO isn't blocked; it knows the sync is pending.

### Q6. Can the Hub ingest raw PDFs?
Yes. Many Indian hospitals do not have API-capable EMRs. They simply drop scanned PDFs into an SFTP folder. The Hub runs an SFTP listener. When a file arrives, it wraps it in an `Aivana_Document_Uploaded` canonical event and pushes it to Kafka, triggering the Docling Ingestion Gateway.

### Q7. How do you test mapping scripts?
The UI includes a "Sandbox." A field engineer pastes a raw HL7 message from the hospital, hits "Test," and the Hub executes the script, showing the resulting Canonical JSON instantly. This ensures 100% accuracy before saving the script to production.

### Q8. How does the Hub handle PII/PHI?
It processes PHI in memory but relies on the Aivana infrastructure for encryption at rest if caching or buffering is required. Furthermore, the Hub can be configured to drop certain sensitive fields (like SSN or Aadhaar) during mapping if Aivana doesn't need them, minimizing the platform's data footprint.

### Q9. What is a Canonical Event?
It's the universal language of Aivana. Instead of dealing with HL7 ADT, FHIR Encounters, and custom XML, all core Aivana services (Fairway, Taiga, MCO) only speak "Canonical Admission." The Hub's sole job is to translate the chaos of the outside world into this clean internal schema.

### Q10. How does the Hub enforce security?
Public REST webhooks require an API Key or OAuth token. Enterprise connections use AWS PrivateLink or Site-to-Site VPNs. The Hub immediately rejects any traffic not matching a configured `hospitalId` and valid credential pair.

### Q11. Can the AI Gateway generate mapping scripts?
Yes! A powerful feature in the Admin UI allows a user to paste an example of the hospital's custom XML, and paste the target Aivana Canonical JSON. They click "Generate Adapter", and an LLM writes the Javascript code to map from A to B. The human reviews and saves it.

### Q12. How does the Hub handle massive file sizes (e.g., a 50MB Radiology PDF)?
The Hub doesn't push 50MB through Kafka. It streams the file directly to an S3 staging bucket, generates a UUID, and pushes a lightweight event to Kafka: `{ "documentId": "uuid", "s3_uri": "s3://...", "hospitalId": "H-123" }`.

### Q13. What is the Dead Letter Queue (DLQ) workflow?
If a mapping script fails (e.g., it expects an array but gets a string), the payload is sent to the DLQ. Support engineers can view the DLQ in the UI, identify the bug in the script, fix the script, and then hit "Replay DLQ" to process the stranded messages.

### Q14. Does the Hub interact with the Hospital Configuration Service (HCS)?
Yes. It queries HCS to know which adapter plugin ID is active for a given hospital branch.

### Q15. How does this architecture prevent vendor lock-in for hospitals?
By using a flexible Hub, Aivana doesn't force the hospital to adapt to Aivana's API. Aivana adapts to whatever the hospital is already exporting. This reduces hospital IT onboarding friction to near zero.

### Q16. Can the Hub poll for data instead of waiting for pushes?
Yes. Some legacy databases (like Oracle or MS SQL) don't support pushing events. The Hub can run scheduled "Poller Adapters" that execute a `SELECT * FROM admissions WHERE created_at > LAST_RUN` every 5 minutes and convert the rows into events.

### Q17. How do you monitor connection health?
The Hub tracks the timestamp of the last received message for every active connection. If a busy hospital suddenly sends zero messages for 2 hours, the Hub raises a P1 alert to Aivana Support, suspecting a dropped VPN or crashed EMR process.

### Q18. How does the Hub support multi-tenant isolation?
Even though it's a shared service, the Javascript VM executes each script in a strict isolate (e.g., using Cloudflare Workers `workerd` technology or Node's `vm` module) with memory limits and no network access, ensuring a buggy script for Hospital A cannot crash Hospital B.

### Q19. What happens if the Canonical Schema changes?
If Aivana upgrades the Canonical Admission Schema from v1 to v2, all adapter scripts must be updated. This is handled by a coordinated migration where scripts are updated to emit v2, while MCO is updated to consume both v1 and v2 during the transition window.

### Q20. Can the Hub integrate with SMS/Email gateways?
While the *Notification Service* generates the message content, the Hub can contain the adapters to talk to regional SMS providers (e.g., Gupshup in India, Twilio in US), abstracting the provider details from the Notification Service.

### Q21. How is this different from MuleSoft or Boomi?
MuleSoft is a generic enterprise service bus (ESB) designed to connect anything to anything. The Aivana Integration Hub is a domain-specific edge router designed *only* to connect healthcare protocols to the Aivana Canonical format, making it much simpler and faster.

### Q22. Does the Hub perform data deduplication?
No. If the hospital sends the same admission event twice, the Hub translates it twice and puts it on Kafka twice. The Master Claim Orchestrator (MCO) handles idempotency and deduplication. The Hub remains stateless.

### Q23. How do you version adapter scripts?
Every time a field engineer saves a script, it increments a version number in Postgres. They can rollback to the previous version instantly if a mapping breaks in production.

### Q24. How does the Hub handle timezone differences?
Hospitals might send timestamps in local time (IST). The mapping scripts are responsible for normalizing all timestamps to UTC (ISO 8601) before emitting the Canonical event, ensuring the core platform never deals with timezone arithmetic.

### Q25. What is the ultimate business value?
Rapid scaling. Integration is historically the slowest part of deploying enterprise healthcare software (often taking 6-9 months). The Integration Hub, combined with AI-assisted mapping and decoupled scripts, reduces onboarding time from months to days.

---

*End of Document*
