# Design Walkthrough & Justifications — Prompt Registry

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Prompt Registry**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why decouple prompts from the source code?
Prompts are not code; they are dynamic intelligence rules. If a Prompt Engineer wants to tweak a few words in the Aegis appeal prompt because they noticed a TPA is denying claims for a specific phrase, they shouldn't have to ask a Backend Engineer to open a Pull Request, run unit tests, and deploy the entire microservice. Decoupling allows non-engineering staff to iterate on AI behavior instantly.

### Q2. How do you prevent a bad prompt from breaking production?
Three ways:
1. **Variable Validation**: You cannot publish a prompt that deletes a required variable. If v1 requires `{{diagnosis}}`, v2 must also require it, otherwise the UI blocks the publish.
2. **Offline Evaluation**: A new prompt must score higher than the baseline on the Golden Datasets in the Replay Engine before the 'Publish' button is enabled.
3. **A/B Testing**: New prompts are rolled out to 5% of traffic first. If the AI Gateway detects a spike in JSON validation errors for that 5%, the Registry automatically rolls it back.

### Q3. How does the AI Gateway know *what* variables to inject?
The calling service (Fairway) holds the context. Fairway calls the Gateway: `generate(prompt: "fairway-extraction", inputs: { "noteText": "...", "patientAge": 45 })`. The Gateway fetches the prompt from the Registry, uses a Handlebars library to inject the `inputs` into the template string, and sends the final string to Gemini.

### Q4. What if the Registry is slow? Does it delay the LLM?
No. The Resolution API reads exclusively from Redis. A Redis `GET` command takes ~1 millisecond. Compared to the 3,000 milliseconds it takes Gemini to respond, the Registry overhead is literally invisible.

### Q5. Can a prompt contain hospital-specific logic?
Yes, using Handlebars logic blocks. `{{#if (eq hospitalTier "PLATINUM")}} Be highly aggressive in the appeal tone. {{else}} Be polite. {{/if}}`. However, ideally, this logic is abstracted to the AI Gateway or AKS, keeping prompts as pure as possible.

### Q6. How does A/B Traffic Splitting work mathematically?
The Traffic Splitter hashes a stable identifier (like the `claimId` or `hospitalId`) modulo 100. If the rule is 90% Primary, 10% Canary: if the hash is 0-89, it returns v1. If 90-99, it returns v2. This ensures that the same claim always gets the same prompt if it retries.

### Q7. How does this support "Shadow Mode"?
Sometimes we want to test a prompt without affecting the claim. The Registry can configure a prompt as `SHADOW`. When the MCO executes a claim, it tells the AI Gateway to run both the Primary prompt and the Shadow prompt in parallel. The Primary output drives the claim. The Shadow output is just logged to the DB for offline accuracy comparison.

### Q8. Why not just use GitHub for version control?
GitHub is for code. It lacks native A/B traffic splitting, dynamic runtime resolution, and Redis caching. While the *offline evaluation scripts* live in GitHub, the *runtime configuration* of what prompt serves what traffic must live in a high-speed database.

### Q9. What happens during a 1-Click Rollback?
If v2 is hallucinating, an Admin clicks "Rollback" in the UI. The Management API updates the PostgreSQL `traffic_rules` table to set `primary_version_id = v1`, and instantly overwrites the Redis cache. The very next request (1 millisecond later) gets v1. Zero downtime.

### Q10. How does the Registry handle "Few-Shot" examples?
Few-shot examples (providing the LLM with 3 examples of correct input/output) consume a lot of tokens. The Registry supports importing "Example Blocks" dynamically. E.g., `{{> standard_medical_examples}}`. This allows Prompt Engineers to update a single example block and have it propagate to 50 different prompts instantly.

### Q11. Can prompts be different per LLM Provider?
Yes. Gemini might respond better to `<xml>` tags, while GPT-4 responds better to Markdown headers. The Registry can store provider-specific variants of the same prompt. When the AI Gateway routes to Gemini, it asks the Registry for `aegis-appeal:gemini`.

### Q12. How do you track the effectiveness of a prompt?
Through the Analytics Platform. Because the AI Gateway logs the `promptVersion` with every telemetry event, we can build a dashboard: "Approval rate when using Aegis v1 vs Aegis v2."

### Q13. Are prompts encrypted in the database?
No. Prompts are system configuration, not PHI. They are stored as plain text. However, they are protected by IAM. Only users with `Prompt_Engineer` or `Admin` roles can view or edit them.

### Q14. What happens if a Prompt Engineer deletes a prompt that is actively being used?
The Management API rejects the `DELETE` request if the prompt is currently referenced in any active `traffic_rules`. A prompt can only be deleted if its traffic weight is 0%.

### Q15. How does this service help with compliance?
If a TPA audits a claim from two years ago and asks, "Why did your AI conclude this was medically necessary?", Aivana can query the Registry for the exact prompt version active on that date, proving the AI was operating under compliant instructions.

### Q16. Can internal services bypass the Registry?
Architecturally, no. Internal services shouldn't even *know* the prompt text. They only know the `promptId` (e.g., `extract-vitals`). This forces strict adherence to the centralized AI Gateway flow.

### Q17. How does the Registry handle Prompt Length?
The Registry includes a "Token Estimator" in the UI. When a Prompt Engineer drafts a prompt, the UI warns them: "This prompt uses 4,000 tokens. This will cost ₹X per 1000 claims." This builds cost-awareness into the authoring process.

### Q18. How do we ensure prompts are tested before publishing?
The UI integrates with the Replay Engine. The "Publish" button is greyed out until a valid `RegressionReport_ID` showing a passing score is attached to the Draft version.

### Q19. What is a "System" vs "User" prompt in this context?
The Registry stores the "System" prompt (the rigid instructions). The "User" prompt is dynamically generated by the AI Gateway by injecting the actual claim data (the variables).

### Q20. Can we export the Prompt Registry?
Yes. The entire Registry state can be exported as a JSON file and checked into a GitHub repository nightly as a disaster recovery backup.

### Q21. How do you handle schema migrations?
If v2 of a prompt requires a *new* variable (e.g., `{{bloodPressure}}`), the backend service (Fairway) must be updated to pass that variable. In this rare case, the deployment is coordinated. Fairway is deployed first, passing the new variable. Then the Prompt is upgraded to v2.

### Q22. Does the Prompt Registry support branching?
Conceptually, yes. A Prompt Engineer can branch `v1` into `v1-experimental`. They can run offline tests on the branch without affecting the linear `v1 -> v2` path.

### Q23. Why use PostgreSQL instead of MongoDB?
Prompts are highly relational to Evaluations, Authors, and Traffic Rules. While the template text itself is unstructured, the metadata surrounding it requires strict ACID transactions to ensure a rollback is atomic.

### Q24. How does the AI Gateway handle missing variables?
If the Registry requires `{{age}}`, and Fairway fails to provide it, the Handlebars compiler in the AI Gateway throws a `MissingVariableException`. The request fails fast, rather than sending incomplete context to the LLM.

### Q25. What is the ultimate business value?
Agility. It transforms "Prompt Engineering" from a slow, backend engineering task into a rapid, data-science-driven operational workflow, allowing Aivana to adapt to new TPA denial tactics in minutes instead of weeks.

---

*End of Document*
