# Design Walkthrough & Justifications — Denial Knowledge Service (DKS)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Denial Knowledge Service (DKS)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. What is the fundamental purpose of DKS?
To close the loop. Without DKS, Aivana is just a fast pipe for claims. With DKS, Aivana is a learning organism. It ensures that a mistake made by one hospital today becomes an automated, system-wide prevention rule tomorrow.

### Q2. Why do we need ML Clustering? Why not just group by DAS taxonomy?
DAS taxonomy (e.g., `MISSING_EVIDENCE`) is too broad. If 1,000 denials are tagged `MISSING_EVIDENCE`, you don't know *what* is missing. ML clustering groups the actual text embeddings, allowing the system to discover specific sub-patterns, like: "Missing Trop-I for Chest Pain."

### Q3. Why use Unsupervised Learning (DBSCAN) instead of Classification?
Because insurers invent new denial reasons constantly. If we used supervised classification, we could only detect denial types we already know about. Unsupervised clustering groups data organically, allowing it to highlight completely new, undocumented TPA behaviors.

### Q4. How does DKS achieve "Herd Immunity"?
If Apollo Hospital gets hit with a wave of rejections for a new rule that Star Health secretly implemented, DKS detects the cluster. DKS drafts a new AKS rule. Once the AKS Admin approves it, Fortis Hospital will immediately be blocked from making that same mistake, even though Fortis never experienced the denial.

### Q5. Why doesn't DKS automatically update AKS rules?
Because automated rule deployment is too dangerous. An ML cluster might correctly identify a trend (e.g., "Insurers are denying all ICU stays"), but the resulting AI-drafted rule might say "Block all ICU submissions." That would bankrupt a hospital. Human domain experts *must* review the draft before it goes live.

### Q6. What is the "Efficacy Tracker"?
It analyzes Aegis appeal outcomes. If DKS detects a new denial trend, but Aegis wins 95% of the appeals against it, DKS flags the trend as "TPA Stalling Tactic." It won't suggest an AKS rule to block the hospital, because the hospital is legally right. If Aegis wins 0%, it's a real rule change, and DKS drafts an AKS update.

### Q7. How does DKS help with TPA negotiations?
It generates TPA Behavior Profiles. Hospital executives can take this data to annual TPA rate negotiations and say, "You denied 40% of our Cataract claims for X reason, which contradicts IRDAI guidelines. We demand a rate increase to offset this friction."

### Q8. Why is DKS a batch process instead of real-time?
Macro-trends don't emerge in seconds; they emerge over days or weeks. Running heavy vector clustering on every single DDR in real-time is an immense waste of compute. A nightly or weekly batch job is highly efficient and perfectly suits the domain.

### Q9. How does DKS handle data privacy?
Before any denial text is embedded or clustered, the PII/PHI scrubbing engine (part of DAS) ensures no patient names or IDs exist in the payload. DKS operates entirely on de-identified, analytical datasets.

### Q10. What happens if a cluster is too small?
DKS configuration defines a `min_cluster_size` (e.g., N=50). If a denial pattern only happens 3 times, it's considered anomalous noise and ignored. It must hit a critical mass to trigger the Rule Synthesizer.

### Q11. Can DKS propose rules for both Fairway and Taiga?
Yes. If the cluster reveals a clinical dispute (e.g., "Admission unjustified based on vitals"), it drafts a Fairway rule. If it reveals a billing dispute (e.g., "Surgeon fee exceeds room rent proportion"), it drafts a Taiga rule.

### Q12. How does the GenAI Rule Synthesizer work?
It is given the text of the 50 denials in the cluster, the current AKS rules for that TPA/Condition, and the strict JSON schema for an AKS rule. It is prompted to "Write a logic block that would have caught these 50 denials before submission."

### Q13. How does DKS account for hospital-specific overrides?
It typically strips them out. DKS looks for *insurer* behavior, not hospital behavior. However, if an insurer only applies a secret rule to *one specific hospital*, DKS will flag the cluster and note that it is highly localized.

### Q14. What are the tradeoffs of using LLMs to draft rules?
**Tradeoff**: LLMs might struggle to write perfect boolean logic or complex JSON nesting.
**Justification**: The LLM is only drafting a proposal for a human admin. Even if the JSON is slightly malformed, the natural language `justification` provides the insight. The human admin can easily correct the JSON syntax in the UI.

### Q15. Does DKS integrate with the Ingestion Gateway?
Indirectly. If DKS notices a trend of "Missing Page 2 of Discharge Summary," it might propose a rule for the Document Identification service to strictly enforce page continuity checks.

### Q16. How is the Embedding Model managed?
Aivana uses a managed service like Vertex AI Text Embeddings. If the model is upgraded (e.g., from v1 to v2), DKS must re-embed the last 30 days of DDRs to ensure the clustering algorithm has a uniform vector space.

### Q17. How does DKS handle time-series analysis?
It uses standard statistical models (e.g., ARIMA) to look at the volume of specific taxonomy tags over time. If `ROOM_RENT_CAP` denials historically hover at 50/week and suddenly spike to 300/week, DKS triggers an alert even if the clustering engine didn't find a new semantic pattern.

### Q18. What is the value of the `justification` field in the AKS Draft?
Explainability. An AKS admin won't approve a rule change blindly. The justification provides the exact statistical evidence (N=412 denials) that proves the rule is necessary, removing guesswork from policy management.

### Q19. How does DKS differentiate between TPA stalling and IRDAI changes?
By cross-referencing external data (Future scope). Currently, it relies on the Efficacy Tracker. If all hospitals suddenly lose all appeals for a specific issue, it usually indicates a macro-level regulatory change (IRDAI) that the insurers have adopted.

### Q20. Why use Snowflake/BigQuery for this?
Because clustering and time-series analysis on millions of JSON payloads requires massive columnar scanning and analytical processing power, which standard PostgreSQL (used by FCP) is not optimized for.

### Q21. Can hospitals see DKS data?
Yes, through the Insurance Analytics Platform (IAP). They can view the macro-trends, but they cannot see the specific rule drafts, which are managed by Aivana's centralized AKS team.

### Q22. How does DKS prevent "Over-fitting" rules?
If DKS proposes a rule that is too strict (e.g., blocking 40% of all claims), the AKS admin will reject it. The GenAI prompt includes a directive to "propose the most narrowly scoped rule possible to address the cluster."

### Q23. What happens to "Discarded" proposals?
They are saved in the database with status `DISCARDED`. If DKS detects the same cluster next week, it checks the history. If a similar proposal was recently discarded, DKS suppresses the duplicate alert to avoid spamming the admins.

### Q24. Does DKS run on real-time stream processing (e.g. Flink)?
No. As established, it's a batch process. Real-time stream processing for ML clustering adds immense architectural complexity with very little business value in the insurance domain, where SLAs are measured in days.

### Q25. What is the ultimate ROI of DKS?
It reduces the platform's reliance on human experts constantly reading insurance manuals. It makes Aivana reactive to reality, rather than theoretical policy, directly lowering the overall denial rate of the network week over week.

---

*End of Document*
