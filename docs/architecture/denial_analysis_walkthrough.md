# Design Walkthrough & Justifications — Denial Analysis Service (DAS)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Denial Analysis Service (DAS)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why does Aivana need a standalone Denial Analysis Service?
Because parsing a denial letter and generating an appeal are two entirely different technical domains. Parsing requires OCR, classification, and forensic discrepancy mapping against the FCP. Generating an appeal requires strategic legal formatting and narrative generation. Coupling them into one service would create a monolithic bottleneck.

### Q2. Why is DAS strictly forbidden from generating appeals?
Separation of concerns. By limiting DAS to generating the Enriched Denial Report (DDR), we ensure that the "truth" of the denial is isolated from the "strategy" of the appeal. This allows hospital admins to review the DDR independently, and allows the Aegis engine to consume a perfectly structured JSON input rather than raw denial text.

### Q3. How does DAS differ from Fairway?
Fairway proves clinical necessity before submission. DAS analyzes the insurer's rejection arguments after submission.

### Q4. How does DAS differ from Taiga?
Taiga ensures financial and coding rules are followed during packaging. DAS parses post-facto billing rejections to see if the insurer's math or clause interpretation was flawed.

### Q5. How does DAS differ from TPA Query Prediction?
TPA Prediction forecasts what an insurer *might* say to prevent a query. DAS reacts to what the insurer *actually* said to trigger an appeal.

### Q6. How does DAS differ from Aegis?
DAS creates the diagnostic report (DDR) of the denial. Aegis writes the legal and clinical appeal letter to fight it.

### Q7. Why must DAS consume the Final Claim Packet (FCP)?
The FCP is the immutable source of truth representing exactly what the insurer received. If DAS compared the denial against the hospital's live systems, it might use documents that were uploaded *after* the claim was submitted, resulting in a flawed analysis of the insurer's decision.

### Q8. Why is Taxonomy Classification AI-assisted?
Insurers write denial letters using highly unstructured, non-standardized legal and clinical prose. A deterministic regex approach would fail constantly. An LLM is required to interpret the semantic meaning of the denial and map it to a standardized Aivana taxonomy (e.g., `MISSING_EVIDENCE`, `POLICY_EXCLUSION`).

### Q9. Why is the Evidence Matcher purely deterministic?
Once the LLM categorizes the denial as "Missing ECG", checking if the ECG exists in the submission payload must be deterministic. The system simply checks the FCP manifest for a file classified as `ECG`. AI hallucination in this step would be disastrous.

### Q10. What is the Root Cause Analysis (RCA) Engine?
It is the arbiter of fault. It looks at the denial reason and the FCP evidence to determine if the denial is a legitimate hospital omission or an insurer mistake.

### Q11. How does DAS handle unreadable or handwritten denial letters?
It relies on the Docling-first gateway. If OCR confidence is too low to extract meaningful text, DAS fails gracefully, sets the DDR to `MANUAL_INTERVENTION_REQUIRED`, and flags the claim for a human user to manually input the denial reason.

### Q12. Why doesn't DAS communicate directly with the insurer portals?
To maintain architectural boundaries. Extracting denial PDFs from portals is the responsibility of the Submission Adapter Service (SAS) or a dedicated RPA polling worker, which then passes the raw PDF to DAS via an event hook.

### Q13. How does DAS utilize the AKS Rule Packs?
If a denial cites "Clause 4.1.2 - Waiting Period", DAS pulls the exact version of the AKS rule pack locked in the FCP snapshot to determine what Clause 4.1.2 actually stated on the date of submission.

### Q14. What are the tradeoffs of isolating DAS from Aegis?
**Tradeoff**: It introduces an additional microservice hop (DAS -> Event Bus -> Aegis), adding ~50ms of latency.
**Justification**: Appeals are not real-time transactions; they operate on days-long SLAs. The architectural cleanliness, ease of debugging, and isolated scaling vastly outweigh a 50ms internal network hop.

### Q15. How does DAS scale?
It is completely stateless. It pulls the stateless FCP from the DB, parses a stateless PDF, calls a stateless LLM, and writes a DDR. Kubernetes can scale the DAS pods horizontally based on the queue depth of the `DENIAL_RECEIVED` topic.

### Q16. Why is the appeal viability score generated here instead of Aegis?
Because viability is a function of the root cause, not the appeal writing. If DAS determines the hospital truly forgot to include a mandatory pre-auth letter, the viability score is 0. Aegis shouldn't even be invoked.

### Q17. How does DAS handle multiple denial reasons in one letter?
Docling chunks the text, and the AI taxonomy classifier is prompted to return an array of `classifiedTaxonomy` objects. The Evidence Matcher loops through all identified reasons and maps them individually in the `evidenceDiscrepancyMap`.

### Q18. What happens if the insurer cites a policy clause that doesn't exist in AKS?
The Policy Mapping Engine flags the discrepancy in the DDR as an `INSURER_MISTAKE: INVALID_CLAUSE_CITATION`.

### Q19. How is PII secured during taxonomy classification?
The Denial Parser strips patient names, IDs, and hospital demographics from the text before sending the raw rejection reasoning to the LLM for classification.

### Q20. What is the expected failure rate for AI classification?
Based on the benchmark targets, the system expects < 5% failure/ambiguity rate. These edge cases require human review.

### Q21. Why persist the DDR to the database instead of passing it in memory to Aegis?
Because the DDR acts as an audit artifact. Hospital administrators need to view dashboards of *why* claims were denied (Analytics Platform) irrespective of whether an appeal was actually generated or won.

### Q22. Can hospitals customize the taxonomy?
Yes, but they map custom department codes *onto* the Aivana global taxonomy. The core engine always runs on the global taxonomy to ensure uniform machine learning improvements.

### Q23. Why use Kafka/RabbitMQ for triggering DAS?
Insurers often dump denial updates in large overnight batches. An event-driven queue absorbs this spike, preventing DAS from throttling or crashing under sudden loads.

### Q24. How does DAS support the "Denial Knowledge Service"?
The structured DDRs produced by DAS are the primary training data for the Denial Knowledge Service, allowing the platform to spot macro-trends in insurer behavior.

### Q25. What happens if an insurer sends a follow-up denial letter?
The adapter triggers a new DAS evaluation with a new DDR tied to the same FCP. The DDR schema supports versioning and multiple instances per claim.

---

*End of Document*
