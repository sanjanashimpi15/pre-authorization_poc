# Design Walkthrough & Justifications — Policy Knowledge Graph (PKG)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Policy Knowledge Graph (PKG)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why transition AKS from Flat JSON to a Graph Database?
Flat JSON arrays are great for simple `if/then` evaluation (e.g., "If room rent > 5000, deny"). But insurance rules are heavily relational. For example, a single "Cataract" rule might share 80% of its logic across 10 different insurers, but differ in the required lens evidence. A graph models these complex many-to-many relationships naturally, allowing Aivana to scale from 1,000 rules to 100,000 rules without massive data duplication.

### Q2. How does PKG improve the Aegis Appeal Engine?
When Aegis drafts an appeal, it needs to quote regulations. In a flat structure, finding the relevant regulation requires a full-text search. In the PKG, Aegis simply queries: `MATCH (DenialReason)-[:CONTRADICTS]->(Regulation) RETURN Regulation`. It instantly gets the exact IRDAI clause that proves the denial is illegal, feeding highly precise context to the LLM.

### Q3. What is "Entity Resolution"?
An AKS Admin might write a rule referencing "Heart Attack." The medical documents might say "STEMI." The ICD code is "I21". Entity Resolution uses AI embeddings to map all these disparate text strings into a single canonical `(Disease {code: 'I21'})` node in the graph, ensuring that Taiga and Fairway always evaluate the correct rule regardless of phrasing.

### Q4. Does the PKG replace AKS?
No. AKS (Aivana Knowledge Studio) is the frontend UI and the source of truth where humans author the rules. The PKG is the backend representation—it compiles those human-authored rules into a machine-traversable semantic map for the engines to consume.

### Q5. How does PKG handle conflicts (e.g., Rule A says Yes, Rule B says No)?
During the Ingestion Hook, PKG runs a conflict detection algorithm. If a new rule contradicts an existing rule, PKG checks for a `[:SUPERSEDES]` edge (e.g., IRDAI supersedes Hospital Policy). If no clear hierarchy exists, the ingestion is blocked, and an alert is sent to the AKS Admin to resolve the ambiguity manually.

### Q6. Why use GraphQL for querying the Graph?
GraphQL inherently represents data as a graph. It allows Fairway to query exactly the depth of relationships it needs in a single network call. For example: "Give me the Policy, its covered Diseases, and for each Disease, the required Procedures."

### Q7. How does PKG implement "Temporal Querying"?
Insurance rules change. A policy from 2023 is different from 2024. Every Edge in the graph has `validFrom` and `validTo` timestamp properties. When querying, the engines provide the `admissionDate`. The query filters out any Edges that were not active on that specific date.

### Q8. What happens if a hospital has custom overrides?
The PKG creates a `(Hospital)` node. It draws a `[:HAS_OVERRIDE]` edge to a specific `(Clause)`. When the engine queries for that hospital, the graph traversal algorithm prefers the override path over the standard policy path.

### Q9. Can the PKG handle exclusions?
Yes. An `[:EXCLUDES]` edge is mathematically treated as a hard stop during traversal. If Fairway traverses `(Policy) -> [:COVERS] -> (Maternity) -> [:EXCLUDES] -> (IVF)`, it immediately outputs a clinical rejection for the IVF procedure.

### Q10. What is the role of Vector Search in the PKG?
By storing text embeddings as properties on the Nodes, we can combine semantic similarity with graph traversal. E.g., "Find me all rules related to 'eye surgery' (vector search) that apply to Star Health (graph traversal)." This powers incredible RAG (Retrieval-Augmented Generation) precision for the AI models.

### Q11. How does the Explainability Service use the PKG?
The Explainability Service's "Rule Graph" is actually just a pointer to the PKG. When the UI asks for an explanation, it fetches the exact Clause node from the PKG to display the rule text to the user.

### Q12. Why Neo4j over Amazon Neptune?
**Tradeoff**: Neptune is fully managed by AWS, but Neo4j's Cypher query language is the industry standard and its visualization tools (Neo4j Bloom) are far superior.
**Justification**: For a complex knowledge graph, the ability for Aivana data scientists to visually inspect and query the graph using native tools outweighs the slight DevOps overhead of managing Neo4j.

### Q13. How does PKG support the Insurance Analytics Platform (IAP)?
IAP can run global graph algorithms (like PageRank) on the PKG. It can identify the "Most Central Nodes"—for example, discovering that `Clause 4.1 (Room Rent)` is the most highly connected and frequently invoked rule across the entire Indian insurance ecosystem.

### Q14. Can the PKG ingest external data automatically?
Yes. The DKS (Denial Knowledge Service) can identify a new trend in TPA denials, generate a proposed rule, and the PKG can model it as a "Draft Node" for human review.

### Q15. How do you prevent the graph from becoming a "hairball" (too many edges)?
By strictly enforcing the Ontology schema. You cannot draw an edge directly from `(Patient)` to `(Regulation)`. You must adhere to the defined hierarchy.

### Q16. What happens if an AKS admin deletes a rule?
Instead of hard-deleting the Node (which would break historical explanations), the PKG updates the `validTo` property to the current timestamp. The node becomes inactive for new claims but remains in the graph for historical audits.

### Q17. How does PKG handle composite rules (e.g., A AND B)?
Composite rules are modeled as intermediate `(LogicGate)` nodes. E.g., `(Clause) -> [:REQUIRES] -> (LogicGate:AND)`. The AND node then has edges to `Condition A` and `Condition B`. The traversal algorithm evaluates the gate logic.

### Q18. How fast is a Cypher query?
Because relationships are stored as physical pointers in RAM (index-free adjacency), traversing 1,000 hops in Neo4j takes milliseconds. It is exponentially faster than 1,000 SQL joins.

### Q19. How does PKG handle waiting periods?
`[:COVERS]` edges have properties. E.g., `(Policy)-[:COVERS {waitingPeriodDays: 730}]->(Cataract)`. The engines read this property and compare it against the patient's policy inception date.

### Q20. Can PKG map relationships across different insurers?
Yes! This is its superpower. The PKG can reveal that 80% of Niva Bupa's clauses are semantically identical to Star Health's clauses, allowing Aivana to standardize clinical validation logic across the industry.

### Q21. Is the PKG exposed to the Hospital UI?
Yes, in a limited capacity. Hospitals can use an "Explorer" view to visually browse their contracted policies and see exactly what is covered and what is excluded in a graphical interface, rather than reading a 100-page PDF.

### Q22. How is the ontology maintained?
Aivana subscribes to standard medical ontology updates (e.g., SNOMED CT, ICD-10 releases). A scheduled job ingests these updates, creates new Nodes, and deprecates obsolete ones.

### Q23. What if a rule is ambiguous?
If a rule cannot be deterministically modeled with Edges (e.g., "Coverage is subject to medical director discretion"), the Node is tagged `requires_ai: true`. When Taiga hits this node, it knows it must defer to the AI Gateway for an LLM evaluation instead of basic math.

### Q24. How do you backup the Graph?
Standard Neo4j snapshotting to S3. Because the PKG contains no PHI, these backups are highly portable and can be loaded onto developer laptops for local testing.

### Q25. Why is the PKG the "Reasoning Backbone"?
Without it, LLMs hallucinate. If you just feed a 100-page policy PDF to an LLM, it gets confused by contradictory clauses. By feeding the LLM a strictly resolved graph path, you combine the deterministic accuracy of a database with the fluid reasoning of an AI.

---

*End of Document*
