# Design Walkthrough & Justifications — Aegis Appeal Intelligence

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding **Aegis Appeal Intelligence**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why does Aegis use Generative AI instead of deterministic templates?
Because insurer denials and clinical nuances are infinitely variable. While a deterministic template works for "Missing ECG," it fails for complex clinical arguments like, "The patient's hypertension was secondary to the dengue infection, justifying the ICU admission." GenAI is required to synthesize persuasive clinical narratives.

### Q2. How do you prevent the LLM from hallucinating clinical facts?
By strictly constraining the prompt. The LLM is provided with the DDR, the specific AKS policy clauses, and the extracted FCP text. The system prompt explicitly states: "Do NOT invent clinical facts. You may only argue using the provided evidence block." Furthermore, the Footnote Inserter acts as a deterministic guardrail.

### Q3. Why must human review be mandatory for Aegis?
Because Aivana is sending legal and clinical correspondence to an insurer on behalf of a hospital. Sending a hallucinated or aggressive letter autonomously carries massive reputational and financial risk. Aegis acts as a drafting assistant, not an autonomous agent.

### Q4. How does the Strategy Engine work?
It is a deterministic decision tree. If the DDR root cause is `HOSPITAL_ERROR_MISSING_DOC`, the strategy is `APOLOGETIC_SUBMISSION` (e.g., "Please find attached the inadvertently omitted ECG"). If the root cause is `INSURER_MISTAKE`, the strategy is `FIRM_REBUTTAL`.

### Q5. Why does Aegis compile the PDF bundle? Why not just send the letter?
Insurers process thousands of appeals. If you send a letter saying "See Admission Note", the insurer's processing agent will not spend 10 minutes digging through their portal to find it. Aegis prepends the appeal letter to the *exact* pages of evidence cited, creating a single, undeniable PDF package.

### Q6. How does Aegis handle page numbering in the compiled bundle?
It uses a Python library (`PyPDF2` or `pdf-lib`) to extract the cited pages from the FCP, stitch them together, and then map the letter's citations to the *new* relative page numbers of the created bundle.

### Q7. What is the Appeal Intelligence Report?
It is a meta-summary for the hospital administrator. Before reading the 3-page appeal letter, the admin reads a 3-bullet point summary: "We are arguing clinical necessity. You have an 85% chance of winning. No further documents are required."

### Q8. How does the Success Estimator work?
It is a lightweight ML model trained on the hospital's historical appeal data. It correlates the `DDR.classifiedTaxonomy` and the `Strategy` against past win/loss outcomes. Over time, as the Denial Knowledge Service feeds data back, this model becomes highly accurate.

### Q9. What happens if the appeal requires a document the hospital never uploaded?
Aegis recognizes the gap during the `Evidence Gathering` phase. It generates the appeal letter but halts bundle generation, flagging the `missingDocumentsChecklist`. The UI prompts the hospital: "Upload the X-Ray to proceed."

### Q10. Does Aegis use the same LLM as Fairway?
Not necessarily. Fairway focuses on clinical extraction (often using specialized Med-tuned models). Aegis focuses on persuasive argumentation and legal drafting, meaning a model like Claude 3.5 Sonnet or GPT-4o often performs better at tone and structure.

### Q11. Why is the Footnote & Citation Inserter deterministic?
If the LLM writes "See Annexure A, Page 4", but the ECG is actually on Page 7, the appeal loses credibility. The GenAI is instructed to use placeholders (e.g., `[[DOC:ECG]]`). The deterministic inserter replaces these placeholders with the actual physical page numbers during PDF compilation.

### Q12. How does Aegis handle multi-claim denials (bulk rejections)?
Aegis processes appeals at the Claim ID level. Bulk rejections are parsed by DAS into individual DDRs, and Aegis generates individual appeal packages for each claim.

### Q13. Can Aegis write appeals for different levels of grievance?
Yes. The Strategy Engine accepts an optional `appealLevel` parameter. Level 1 is a standard rebuttal. Level 2 (Ombudsman) uses a highly legal, escalated tone citing IRDAI regulations (from AKS).

### Q14. What are the tradeoffs of generating the PDF bundle asynchronously?
**Tradeoff**: The user clicks "Generate Appeal" and must wait 3-5 seconds for the PDF to stitch.
**Justification**: PDF manipulation is CPU-heavy. Doing it synchronously would block the Node.js event loop. Offloading to a Python worker queue ensures system stability.

### Q15. How does Aegis integrate with the Submission Adapter?
Once the human clicks `Approve`, the `AppealPackage` state changes to `APPROVED`. The Submission Adapter listens for this state change, downloads the `bundleUrl`, and pushes it to the insurer's portal.

### Q16. How is PII secured in the generated PDF?
Because the evidence pages are extracted from the FCP (which already passed through the extraction and TPR layers), the documents are natively secure. The generated letter uses the TPR data to accurately reflect the patient's name and policy number as required by the insurer.

### Q17. What if the insurer has a specific appeal form that must be filled out?
The Strategy Engine detects the insurer via the FCP. If the insurer (e.g., Star Health) requires a specific PDF form, Aegis uses `pdf-lib` to programmatically fill the form fields and appends it to the bundle.

### Q18. How does Aegis handle "Partial Denials" (deductions)?
Aegis treats deductions identically to outright denials. The DDR specifies the deducted amount and reason (e.g., "Consumables rejected"). Aegis generates an appeal specifically targeting the un-bundling of those consumables using Taiga's logic.

### Q19. Why does Aegis need access to Taiga (FCA)?
Because many appeals are financial. If an insurer denies a claim based on a "Room Rent Cap," Aegis uses Taiga's math to prove that the hospital's proportional deduction was already applied correctly.

### Q20. Can Aegis be bypassed?
Yes. A hospital admin can choose to write their own appeal letter from scratch in the UI, bypassing the GenAI, but they still benefit from Aegis's PDF bundler and evidence extractor.

### Q21. How is the generative prompt versioned?
Prompt versioning is critical. Every generated appeal stores the exact prompt hash in its DB payload. If a specific prompt version starts generating aggressive tones, it can be easily rolled back.

### Q22. What happens if Aegis is triggered multiple times for the same DDR?
It is idempotent. It will overwrite the `PENDING_REVIEW` appeal package. However, once an appeal is `APPROVED`, further generations create a `v2` package.

### Q23. How does the system prevent the LLM from outputting markdown formatting that breaks the PDF?
The LLM is prompted to return structured JSON containing paragraphs. The PDF generation script (e.g., using `ReportLab` or `Jinja2` to HTML to PDF) handles all styling, font sizes, and layout deterministically.

### Q24. How does Aegis handle signatures?
The hospital configures an authorized digital signature (image) in their profile. During PDF generation, Aegis stamps the approved signature at the bottom of the letter.

### Q25. What is the ultimate value proposition of Aegis?
It turns a 45-minute manual task (digging through files, writing a letter, combining PDFs, checking policy rules) into a 5-second automated task that merely requires a doctor's 30-second review.

---

*End of Document*
