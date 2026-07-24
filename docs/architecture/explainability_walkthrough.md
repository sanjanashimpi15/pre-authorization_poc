# Design Walkthrough & Justifications — Explainability Service

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Explainability Service**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why build a dedicated Explainability Service? Why not let Taiga/Fairway explain themselves?
If every service returns its own explanations, the frontend UI has to implement 5 different parsing logics to render tooltips. By centralizing explanations, the UI only has to talk to one standard GraphQL API. Furthermore, it keeps the core engines (Taiga/Fairway) lightweight, offloading the heavy string manipulation and graph storage.

### Q2. Why use a Graph Database (Neo4j)?
Explanations are highly relational. A single PDF page (Evidence) might support three different clinical findings (Reasons), which trigger two different billing deductions (Decisions), based on one policy (Rule). SQL databases require complex, slow `JOIN` operations for this. Graph databases natively map these relationships, making "Explain this decision" a sub-millisecond graph traversal.

### Q3. How does this service handle bounding boxes?
When the OCR gateway ingests a document, it assigns IDs and X/Y coordinates to every word block. Upstream AI models output these IDs when making assertions. The Explainability Service stores these IDs. When the UI asks for an explanation, the service returns the `boundingPolygon` coordinates, allowing the React frontend to draw a yellow box over the exact text on the PDF canvas.

### Q4. What is the role of the Natural Language Generator (NLG)?
Graph data looks like code (`Rule: AKS_4.1 -> Action: DENY`). A doctor doesn't want to read that. The NLG passes the graph path to a small, fast LLM (like Llama 3 8B or Gemini Flash) with the prompt: "Summarize this logic path in one plain English sentence." This creates the `humanReadableSummary` for the UI tooltip.

### Q5. Why is NLG done asynchronously?
Generating human text via LLM takes ~500ms. If we did this on the fly when the user hovered over a tooltip, the UI would feel sluggish. Because claim decisions are immutable, the service pre-generates and caches the NLG sentences the moment the explanation fragment is ingested.

### Q6. How does this service prevent "AI Hallucination" in explanations?
The NLG LLM is *strictly* forbidden from adding new information. It is acting only as a translator for the deterministic Graph nodes. If the Graph says "₹500", the LLM must say "₹500". The underlying decision logic is entirely deterministic or AI-extracted from verified OCR.

### Q7. How does the UI know *what* can be explained?
When Taiga or Fairway returns a payload (e.g., `deductions: [{ amount: 5000, actionId: "act-123" }]`), they embed the `actionId`. The UI sees this ID and renders a small `(?)` icon next to the ₹5,000 deduction. When hovered, the UI fires a GraphQL query using that `actionId`.

### Q8. What happens if an explanation fragment is lost in Kafka?
The UI will attempt to query an `actionId` that doesn't exist in the Graph DB. The API returns a graceful error (`Explanation Not Found`). The MCO is alerted to re-publish the missing fragment.

### Q9. Why is this service decoupled from the Master Claim Orchestrator (MCO)?
MCO ensures the claim moves forward. Explanations do not affect the outcome of a claim; they only explain it to a human. Tying them together would mean a Neo4j database timeout could halt a hospital's billing pipeline. Decoupling ensures maximum resilience for the core business flow.

### Q10. Can the Explainability Service explain Aegis appeals?
Yes. When Aegis writes an appeal letter, it emits fragments linking the generated paragraphs to the FCP evidence. When a hospital admin reviews the Aegis draft, they can hover over a paragraph, and the UI will show exactly which medical document justified that argument.

### Q11. How does this help with debugging?
For Aivana engineers, the Explainability Service is the ultimate debugging tool. If a hospital complains, "Why did Aivana deduct this?", an engineer pulls up the Unified Explanation Graph. If the Rule node is wrong, they fix AKS. If the Evidence node is wrong, they fix the OCR/Extraction model.

### Q12. What are the tradeoffs of storing every single decision in a Graph DB?
**Tradeoff**: Massive storage requirements. A single claim might have 200 micro-decisions (every line item, every clinical vital).
**Justification**: Explainability is Aivana's core market differentiator. Hospital trust is paramount. Storing dense graphs is cheap compared to losing a hospital contract due to "Black Box" mistrust.

### Q13. How is the database purged?
Explanations are bound to the retention policy of the FCP (usually 7 years for medical compliance). Older graphs are archived to cold S3 storage and deleted from the hot Graph DB to maintain traversal speed.

### Q14. What if a rule is highly complex (e.g., nested AND/OR conditions)?
The Rule Graph node stores the full AST (Abstract Syntax Tree) of the AKS logic block. The UI can render this as a visual decision tree, highlighting the specific branch (`Condition A = True`, `Condition B = False`) that led to the outcome.

### Q15. Does the Explainability Service translate languages?
Yes. The NLG component can accept a `locale` parameter from the GraphQL query. It can translate the internal graph logic into a Hindi or Tamil tooltip for regional hospital staff.

### Q16. How does it handle "Implicit" decisions (things that *didn't* happen)?
If Taiga reviews an invoice and does *not* apply a deduction, it still emits a "Pass" fragment. The UI shows a green checkmark. Hovering over it queries the Graph: `Rule checked. Value within limits. No action taken.`

### Q17. How does this support the Denial Analysis Service (DAS)?
When DAS outputs an Enriched Denial Report (DDR), it emits fragments linking the Insurer's denial reason to the FCP evidence proving them wrong. This graph fuels the "Insurer Mistake" UI highlighting.

### Q18. Why use GraphQL over REST here?
Because a hospital CFO might just want the `humanReadableSummary` (a lightweight string), while an auditor wants the `boundingPolygon` and the full `aksVersion` JSON. GraphQL prevents massive over-fetching of unnecessary graph data.

### Q19. How is the graph structure versioned?
Using standard database migration tools. If we add a new node type (e.g., `External_Guideline` for IRDAI rules), older graphs simply lack this node, and the API resolves it to `null`.

### Q20. Can hospitals export these explanations?
Yes. The API supports generating a "Claim Audit PDF." It queries the Graph DB for all major decisions on a claim and compiles them into a structured report with screenshots of the bounding boxes.

### Q21. Does this service impact the claim submission speed?
Zero impact. It consumes data from Kafka asynchronously. The FCP is built and sent to the Submission Adapter regardless of whether the Explainability Graph has finished compiling.

### Q22. How does the service handle identical explanations?
If 10 different line items are rejected for the exact same reason ("Invalid Consumable"), the Graph DB points all 10 `Decision` nodes to the exact same `Rule` node, highly optimizing storage and traversal.

### Q23. What happens if the AKS rule pack changes *after* the explanation is generated?
The Rule Graph node stores a hard copy (or a strict version pointer) of the exact rule text *at the time of execution*. Future AKS updates do not retroactively alter historical explanations.

### Q24. How do you monitor the health of this service?
By tracking "Orphaned Fragments." If we see 1,000 `Decision` nodes without matching `Evidence` nodes, it means the Ingestion Normalizer is failing to parse a specific upstream service's schema.

### Q25. Ultimately, what is the value of the Unified Explanation Graph?
It transforms Aivana from a "Black Box AI" into a "Glass Box." It proves to doctors and billers that the system is not guessing—it is strictly reasoning based on their exact documents and the insurer's exact rules.

---

*End of Document*
