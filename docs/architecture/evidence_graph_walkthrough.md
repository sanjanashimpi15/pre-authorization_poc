# Design Walkthrough & Justifications — Evidence Graph Service (EGS)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Evidence Graph Service (EGS)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why use a Graph Database (Neo4j) for Evidence? Why not just Elasticsearch?
Elasticsearch is excellent for finding keywords (e.g., "Find the word Dengue in these 50 PDFs"). However, Aivana needs relational awareness. We don't just want the word "Dengue"; we want to know *which* lab test supports that Dengue diagnosis, and *which* invoice line item billed for that lab test. Elasticsearch struggles with deeply nested, multi-hop relationships. A graph database natively models these chains of evidence.

### Q2. How does EGS prevent AI Hallucination?
This is its most critical function. EGS enforces a strict constraint: A clinical node (like `HeartRate`) cannot exist in the graph unless it has an `[:EXTRACTED_FROM]` edge pointing to a physical bounding box on a document. If the AI Gateway returns a JSON payload saying "HeartRate: 150", but cannot provide the X/Y coordinates on the ECG report where it found that number, EGS rejects the insertion. The fact is purged, preventing hallucinations from leaking into downstream logic.

### Q3. What is the difference between the Policy Knowledge Graph (PKG) and the Evidence Graph Service (EGS)?
- **PKG** maps the *rules* (e.g., "Dengue requires Platelets < 100k"). It is static and changes only when policies change.
- **EGS** maps the *reality* of a specific claim (e.g., "John's Platelets are 80k on Page 2"). It is dynamic and created per claim.

### Q4. How does Fairway use EGS?
When Fairway evaluates a claim against the PKG rule for Dengue, it queries EGS for the patient's Platelet count. Because EGS returns the physical bounding box data alongside the value, Fairway can embed the exact snippet of the lab report into its output.

### Q5. How does Aegis use EGS?
Aegis uses EGS to write highly specific appeal letters. Instead of a generic LLM prompt ("Write an appeal saying we did a CBC test"), Aegis queries the graph and generates: "As evidenced on Page 3 of the attached Lab Reports (Snippet: 'CBC - 12/Oct - Normal'), the test was indeed conducted."

### Q6. How do you link financial data (the bill) to clinical data (the doctor's notes)?
This is notoriously difficult in healthcare. EGS uses a hybrid approach:
1. **Deterministic**: Matching standardized codes (if the bill lists CPT-123 and the surgical note lists CPT-123).
2. **AI-Assisted Fuzzy Matching**: If the bill says "Appendectomy Surg Fee" and the note says "Laparoscopic removal of appendix", an LLM creates an embedding, and EGS draws a `[:BILLED_FOR]` edge between the two nodes.

### Q7. What if a hospital uploads a new document later in the claim lifecycle?
The OCR Extraction listener processes the new document. The EGS Builder adds the new `(Document)` and `(Page)` nodes, extracts the new entities, and seamlessly merges them into the existing graph.

### Q8. How do you handle contradictory evidence?
E.g., The Admission form says "Diabetes: No", but the Discharge summary says "Diabetes: Yes". EGS stores *both* facts. It connects them to their respective documents. The TPR (Trusted Patient Record) service is responsible for resolving the conflict (e.g., preferring the Discharge summary because it's newer), and it updates EGS with a `[:RESOLVED_TO]` edge.

### Q9. Why are the API contracts in gRPC instead of REST?
Graph traversals generate highly nested, complex tree structures. REST (JSON over HTTP/1.1) is bulky and slow for this. gRPC (Protobufs over HTTP/2) provides compressed, strongly-typed binary serialization, allowing Fairway to request subgraphs with microsecond network latency.

### Q10. How large does an Evidence Graph get per claim?
A typical claim (50 pages of PDFs) translates to roughly 2,000 to 5,000 nodes (words, entities, values) and 10,000 edges. Neo4j handles graphs with billions of nodes, so a 5,000-node graph is traversed instantly.

### Q11. Does EGS store the actual PDF files?
No. **Tradeoff**: Storing BLOBs in a graph database is an anti-pattern that kills performance.
**Justification**: EGS stores the *metadata* (S3 URI, page number, coordinates). When the UI needs to render the PDF, it fetches the file directly from S3.

### Q12. How does EGS support the Final Claim Packet (FCP)?
FCP doesn't want to send 50 pages if only 10 are relevant. FCP asks EGS: "Give me all `(Document)` nodes that have at least one incoming `[:EXTRACTED_FROM]` edge connected to a valid `(ClinicalEntity)`." EGS instantly returns the exact list of relevant pages, allowing FCP to drop the junk pages (like hospital cafeteria menus accidentally scanned).

### Q13. Can EGS handle handwritten notes?
Yes, indirectly. If the OCR engine (Google Cloud Vision/AWS Textract) can parse the handwriting and output bounding boxes, EGS ingests it exactly the same as typed text.

### Q14. What happens if the OCR bounding boxes are slightly off?
The Explainability UI handles slight pixel variations by drawing a highlighted box with a slight padding margin around the EGS coordinates, ensuring readability for the human user.

### Q15. How does EGS support auditing?
If a TPA accuses a hospital of fraud (e.g., "You billed for an ICU stay but the patient was in a general ward"), Aivana can pull the EGS graph and demonstrate the exact chain of cryptographic logic linking the ICU room charge to the daily nursing vitals chart.

### Q16. Can EGS be queried by the hospital UI?
Yes, but typically routed through the Explainability Service. A user can click a "Show Proof" button next to any claim attribute, and the UI uses EGS to jump straight to the correct PDF page.

### Q17. How does EGS handle multi-patient documents (e.g., a shared room bill)?
The Document node has edges pointing to the specific line items. If Line 1 is for Patient A, and Line 2 is for Patient B, EGS draws edges linking those specific line items to their respective `(Claim)` nodes, isolating the evidence cleanly.

### Q18. How do you migrate data if the Neo4j schema changes?
Cypher allows powerful mass-update queries. If we rename `[:HAS_PROCEDURE]` to `[:UNDERWENT_SURGERY]`, a simple batch Cypher script updates the edges across the cluster without downtime.

### Q19. Does EGS rely on the AI Gateway?
Yes, for fuzzy linking (like matching clinical notes to bill items). It sends the text strings to the AI Gateway, asking for a confidence score on whether they match.

### Q20. What is the biggest challenge in building EGS?
**Challenge**: Noise. OCR extracts *everything*, including page headers, footers, and stamps.
**Mitigation**: The NLP extraction pipeline filters out noise *before* sending data to EGS. EGS only ingests recognized clinical and financial entities, keeping the graph clean and dense.

### Q21. Can you export the Evidence Graph?
Yes. The graph can be exported as a JSON-LD (Linked Data) file and attached to the FCP submission, allowing advanced TPAs to ingest Aivana's semantic graph directly into their own systems.

### Q22. How is access control enforced?
At the API Gateway level. The caller must provide a JWT containing the `hospitalId`. EGS strictly filters all Cypher queries: `MATCH (c:Claim {hospitalId: $token.hospitalId})`. It is mathematically impossible for Hospital A to traverse Hospital B's graph.

### Q23. Why use Neo4j specifically?
Because Neo4j supports "Graph Data Science" (GDS) libraries natively. Aivana can run algorithms to find isolated nodes (e.g., an invoice item that has zero clinical evidence edges) to instantly flag fraudulent or erroneous billing.

### Q24. How do you backup EGS?
Continuous causal clustering in Neo4j provides high availability. Nightly snapshots are dumped to S3.

### Q25. What is the ultimate ROI of EGS?
It eliminates the "Needle in a Haystack" problem for both AI and Humans. By structuring the evidence, Aivana guarantees that its AI models are grounded in reality, achieving the "Deterministic First" philosophy.

---

*End of Document*
