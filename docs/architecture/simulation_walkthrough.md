# Design Walkthrough & Justifications — Universal Rule Simulation Engine (URSE)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Universal Rule Simulation Engine (URSE)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why build a dedicated Simulation Engine? Can't we just use a staging environment?
Staging environments are for developers. URSE is a business feature for Hospital Users and AKS Admins. A billing clerk cannot deploy code to staging to test if lowering the room rent will clear a denial. They need a 1-click sandbox inside the production UI that clones their exact production claim data.

### Q2. How do you guarantee the simulation doesn't corrupt production data?
The Context Hydrator extracts the claim FCP/JSON, deeply copies it into RAM, and sends it to an isolated Serverless function. The Serverless function is completely disconnected from the production PostgreSQL cluster. It mathematically cannot save its state back to the core platform.

### Q3. Why use Serverless (Lambda/Knative) for execution?
Simulations are wildly unpredictable. An AKS Admin might select 5,000 historical claims and click "Simulate." If we ran this on the main Kubernetes cluster, it would spike CPU and delay live, revenue-generating claims. Serverless spins up 5,000 ephemeral containers in seconds, runs the math, returns the JSON, and shuts down, costing pennies and isolating compute.

### Q4. What exactly is a "Difference Report"?
It is the output of a deep JSON diff between the actual FCP output and the simulated FCP output. The URSE extracts only the delta. If 99% of the claim is identical, the Difference Report is tiny: `{"deductions": {"old": 500, "new": 1000}}`.

### Q5. Can URSE simulate a brand new AKS Knowledge Pack?
Yes. This is its most critical enterprise use case. When an insurer releases a new policy manual, the Aivana team builds an AKS Pack. Before publishing it live, they feed it to URSE and simulate it against the last 30 days of that insurer's claims to guarantee it behaves exactly as intended.

### Q6. How does URSE help with "Predictive Denials"?
Hospitals want to know: "Will this be denied?" URSE can simulate the Taiga/Fairway engines. If Taiga flags 3 policy violations in the simulation, the UI tells the biller: "If you submit this as-is, you have a 95% chance of a ₹15,000 deduction."

### Q7. Can I simulate the AI models (like Gemini) in URSE?
**Tradeoff**: True AI calls are non-deterministic and cost money.
**Justification**: By default, URSE re-uses the cached clinical extractions from the base claim to save API costs and ensure the diff only reflects rule changes. However, if the user explicitly overrides a clinical note, URSE *will* call the AI Gateway to extract new entities for the simulation.

### Q8. How does URSE handle complex hospital customizations?
Because URSE uses the exact same core libraries as Taiga, it naturally inherits all hospital-specific configuration logic present in the cloned context.

### Q9. What if a simulation requires a document that isn't in the base claim?
The user can upload a hypothetical PDF in the UI. URSE routes it through a fast-tracked OCR/Extraction pipeline just for the sandbox, injects the result into the cloned TPR, and runs the simulation.

### Q10. How fast is a simulation?
Extremely fast. Because there are no database writes, no MCO state management, and no waiting for external TPA APIs, a pure Taiga rule simulation takes less than 200ms.

### Q11. Can a simulation be merged into production?
No. This is a strict architectural constraint to prevent data corruption. If a user likes the simulation result, they must manually replicate the action (e.g., editing the live bill or uploading the new document) to trigger a true MCO execution.

### Q12. How does URSE handle time-travel?
If an AKS rule says "Valid for admissions after Jan 1", and the user is simulating a historical claim from Dec 15, URSE allows overriding the `simulateCurrentDate` parameter. The user can trick the engine into thinking "today" is Jan 10 to test the new rule's behavior.

### Q13. Why use `deep-diff` for the Delta Comparator?
Because Taiga/Fairway outputs are massive nested JSON objects (thousands of lines). Writing custom logic to compare every field is fragile. A generic deep-diff algorithm instantly flags any nested node that changed, ensuring no side effects are missed.

### Q14. Can URSE be used for A/B Testing?
Absolutely. Aivana data scientists can run `Model A` vs `Model B` on 1,000 claims in URSE, compare the output variance, and decide if the new prompt/model is safe for production.

### Q15. Is there a cost impact to running thousands of simulations?
Yes, compute is not free. URSE includes a quota system (via the Hospital Config Service) limiting how many simulations a single clerk can run per day, preventing accidental or malicious cloud bill spikes.

### Q16. How does URSE help during TPA negotiations?
If a TPA says, "We are changing your contract to cap Consumables at 5% instead of 10%," the hospital CFO can use URSE to run that rule against last year's claims. URSE outputs: "This contract change will cost you ₹2.5 Crores." The CFO can now negotiate with hard data.

### Q17. How does the UI visualize the Diff?
Like a Git Pull Request. Red highlighted text for negative financial impacts (increased deductions), Green for positive. The UI suppresses the 99% of the claim that didn't change to prevent information overload.

### Q18. Does URSE simulate the TPA Prediction Service?
Yes. URSE can run the ML prediction models on the mutated context to show how the probability of an external TPA audit/query changes based on the hypothetical edits.

### Q19. How does URSE handle FCP generation?
It usually skips it. Generating a 50-page flattened PDF takes time and compute. URSE focuses on the *JSON intelligence output* (Fairway/Taiga). PDF packaging is only simulated if the user explicitly requests it.

### Q20. Can I simulate the Aegis Appeal Engine?
Yes. You can feed URSE a hypothetical TPA Denial Letter, and URSE will generate a draft appeal based on the claim's evidence, allowing admins to test Aegis's argumentative logic without a real denial.

### Q21. How do you handle schema migrations between versions?
If testing `Taiga v2` against a claim generated in `Taiga v1`, the Context Hydrator includes an up-casting migration script that formats the old FCP into the new schema before running the simulation.

### Q22. Can URSE simulate a claim from scratch?
Yes. Instead of providing a `baseClaimId`, the user can provide a raw JSON payload of an imaginary patient. URSE will execute the entire pipeline from scratch.

### Q23. Why is URSE completely decoupled from MCO?
Because MCO is designed for long-running, persistent, resilient business processes. URSE is an ephemeral, stateless calculator. Putting URSE inside MCO would bloat the workflow engine with junk data.

### Q24. How does URSE ensure fairness in batch simulations?
It randomizes the chunking. If a hospital requests a simulation of 10,000 claims, URSE chunks them into batches of 100 to ensure that no single hospital monopolizes the Serverless concurrency limits.

### Q25. What is the ultimate ROI of URSE?
It prevents catastrophic rule deployments. In the past, a bad billing rule might go live, and it would take 30 days of real hospital denials to notice the bug. URSE catches the bug in 5 seconds before it ever reaches production.

---

*End of Document*
