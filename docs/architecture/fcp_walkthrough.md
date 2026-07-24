# Design Walkthrough & Justifications — Final Claim Packet (FCP) Service

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Final Claim Packet (FCP)** service.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why does Aivana need a dedicated Final Claim Packet (FCP) Service if the Submission Intelligence Engine (SIE) already determines readiness?
SIE is a validation engine; it calculates scores, flags warnings, and outputs status reports. FCP, by contrast, is a packaging and archiving system. Separation of concerns dictates that the service evaluating readiness (SIE) should not be the same component performing document grouping, digital signing, encryption, and physical manifest construction. This keeps SIE lightweight and fast while ensuring FCP is the sole compiler of truth.

### Q2. Why is the FCP designed to be completely immutable?
To prevent downstream audit corruption. If an insurer disputes a claim payment 12 months after submission, Aivana must be able to prove the exact bytes, doctor signatures, and rule versions that were sent to the TPA. Allowing inline edits to an existing FCP would destroy this chain of custody.

### Q3. How does FCP enforce the "Invalidate and Regenerate" rule when upstream assets change?
When any change occurs (e.g. a billing clerk updates a line item or a new lab report is uploaded), the existing FCP's `is_active` status is set to `FALSE` (invalidated), and the current `Submission Token` is revoked. The hospital must re-evaluate the claim through SIE, generate a new SRR, and invoke FCP to write a new packet version (e.g. version `2`).

### Q4. What is the role of the Submission Lock Engine?
It prevents race conditions. When a claim achieves a `READY` state, a `Submission Token` is generated with a short expiration TTL (default 15 minutes). While this token is active, the hospital is permitted to compile the final packet. If any underlying document changes during this window, the lock is immediately broken.

### Q5. How does the Token prevent double-submissions or stale data submissions?
Once the token is consumed to generate the packet, or if it expires, it is marked as `invalidated = TRUE`. No packet can be generated without an active, unexpired token.

### Q6. What is the Submission Readiness Certificate (SRC)?
A cryptographic document generated inside FCP that serves as Aivana's certified approval. It seals the version metadata of all inputs under our private key signature, assuring TPA systems that this packet passed every regulatory check.

### Q7. How does the Packet Difference Engine assist billing teams?
When a claim must be re-evaluated and a new packet version generated, the difference engine compares the current FCP manifest with the previous version. It prints structural deltas (e.g., "Added: `cbc_report_v2.pdf`", "Removed: `cbc_report_v1.pdf`", "Changed: Room Rent from ₹6,000 to ₹5,000").

### Q8. Why is the FCP 100% deterministic?
Because AI models are non-deterministic; running a claim through an LLM to assemble files or write signatures introduces hallucinations, payload inconsistencies, and latency spikes. The FCP must yield the exact same file outputs for the same inputs every single time.

### Q9. How do future services like Denial Analysis and Aegis utilize FCP?
They ingest the FCP as their sole input. Since the FCP contains all collected files, signatures, and rule states, Aegis does not need to query the database or re-fetch files from the hospital's HIS; it simply reads the FCP snapshot.

### Q10. What compression strategy does FCP use?
Files are bundled into a zip archive using deflate compression (level 6) with file-level CRC-32 hashes mapped inside the ZIP headers.

### Q11. What encryption standard is used?
AES-256 in GCM mode (Galois/Counter Mode) for all archived packets, providing both confidentiality and data origin authentication.

### Q12. What are the file naming conventions for components inside the FCP zip?
All files are normalized:
`[FCP_ID]_[COMPONENT]_[DOC_CLASS]_[HASH_PREFIX].[EXT]`  
Example: `fcp_00123_clinical_discharge_summary_4a737f26.pdf`.

### Q13. What is the storage retention policy for FCP?
Following IRDAI regulations, final claim packets must be retained in active/cold archive storage for a minimum of 7 years post-discharge.

### Q14. How are digital signatures implemented for doctors?
Doctors register their PKCS#12 certificates. The FCP validates the private key signature on the PDF's signature block, extracts the certificate serial, and appends it to the FCP metadata.

### Q15. When is the FCP_INVALIDATED event emitted?
Whenever a document modification is detected by the event listener while the FCP is in a pre-submission state.

### Q16. How does FCP differ from Fairway?
Fairway scores medical necessity. FCP is blind to medical necessity; it only packages what Fairway and other services already produced.

### Q17. How does FCP differ from Taiga?
Taiga maps ICD codes and evaluates room rent rules. FCP bundles Taiga's outputs into the final submission JSON.

### Q18. How does FCP differ from AKS?
AKS is the repository of active insurer rule packs. FCP records the exact version of the AKS pack used but does not execute the rules.

### Q19. How does FCP differ from SIE?
SIE calculates readiness scores (SRR). FCP compiles the physical packet once SIE approves.

### Q20. How does FCP differ from TPA Query Prediction?
TPA Query Prediction forecasts reviewer objections. FCP does not predict queries; it formats the claim files for TPA ingestion.

### Q21. How does FCP differ from Denial Analysis?
Denial Analysis evaluates rejection letters post-submission. FCP compiles the pre-submission package.

### Q22. How does FCP differ from Aegis?
Aegis generates appeal letters for denied claims. FCP is the baseline snapshot Aegis references to build its appeal case.

### Q23. Why use SHA-256 over MD5 or SHA-1?
MD5 and SHA-1 have known collision vulnerabilities. Insurers and auditors require SHA-256 for certified compliance.

### Q24. How is scalability handled for 1000+ hospitals?
The service is completely stateless; file packaging is delegated to worker processes scaling horizontally in a Kubernetes cluster.

### Q25. What happens if a database write fails during FCP commit?
The transaction is rolled back, the storage files are deleted from the staging bucket, and the token is set to a temporary error lock state to prevent incomplete packet submissions.

### Q26. Why should FCP execute AFTER TPA Query Prediction?
Because TPA Query Prediction may recommend crucial claim modifications, such as attaching an extra ECG report, including a doctor's clarificatory note, or correcting an ICD code description. Performing these modifications *before* generating the FCP avoids unnecessarily creating, invalidating, and writing multiple versions of the final claim packet.

### Q27. What is the value of the Submission Adapter Layer?
It acts as a driver layer for insurer portal integrations. By abstracting Star Health, Niva Bupa, or FHPL portal requirements into isolated adapter modules, the core FCP logic remains completely clean, standardized, and free of proprietary insurer payload conventions.

### Q28. What is the purpose of the Evidence Index?
It maps claim diagnoses to exact physical coordinates (page numbers, bounding boxes, and OCR text blocks) within the uploaded documents. This allows insurers, auditors, and downstream engines (like Aegis) to instantly navigate to the exact proof supporting any clinical assertion.

### Q29. How does the Bundle Optimization Engine solve the 25MB portal file size limit?
It dynamically scales raster image resolutions, compresses PDF vector assets, and partitions files into multi-part zip streams if required. This prevents upload rejections without requiring manual intervention from hospital billing staff.

### Q30. Why separate the SRR score from the FCP Health Score?
The SRR (Submission Readiness Report) checks clinical and policy compliance (e.g., "Is this clinically justified?"). The FCP Health Score evaluates packaging hygiene (e.g., "Are there duplicate scans? Are the images high-resolution? Is the layout clean?"). A claim could be clinically ready (SRR = 100) but packaged poorly (FCP Health = 75).

---

*End of Document*
