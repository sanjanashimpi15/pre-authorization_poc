# Design Walkthrough & Justifications — Digital Twin / Replay Engine

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Digital Twin / Replay Engine**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. What is the difference between this Replay Engine and the Universal Rule Simulation Engine (URSE)?
- **URSE** is a fast, synchronous UI tool for *business users* (like hospital billing clerks) to ask "What if I change this rule on this specific claim?"
- **Replay Engine** is an asynchronous CI/CD tool for *Aivana engineers* to test platform-wide code changes (e.g., deploying Taiga v2.0) against 10,000 historical claims to ensure 0% regression before merging a Pull Request.

### Q2. How do you "Time-Travel" a claim?
If a claim from 2023 was bound by a 30-day waiting period, replaying it in 2026 would normally pass that check (since 3 years have passed). The Replay Engine injects a gRPC interceptor into the isolated test cluster. Every time the code calls `Date.now()`, the interceptor returns the exact timestamp of the original 2023 claim admission.

### Q3. How does the Engine handle external dependencies (Twilio, Insurers)?
**Tradeoff**: Hitting real APIs during tests causes spam and costs money.
**Justification**: The Replay Engine uses a strict "Stubbing Layer." It configures the isolated cluster's DNS to route external calls (like `api.twilio.com`) to a local Mock Server that immediately returns HTTP 200. This guarantees tests are fast and hermetically sealed.

### Q4. How do you test Generative AI Prompts (Fairway)?
This is notoriously difficult because LLMs are non-deterministic. If Fairway v1 extracted "Requires Surgery", and v2 extracts "Surgery Required", a pure string diff will fail. The Replay Engine's Comparator uses a small, local semantic similarity model. If the cosine similarity between the old JSON and new JSON is > 0.95, it counts as a "Pass."

### Q5. What is a "Golden Dataset"?
It is a curated collection of highly complex, edge-case claims. For example, a claim with 10 comorbid conditions that crosses 3 different policy rule thresholds. Aivana maintains multiple datasets (e.g., `Maternity_Edge_Cases`, `Cataract_Anomalies`). A PR modifying Taiga must pass the `Core_Regression_Suite` dataset.

### Q6. How are datasets anonymized?
Before a live production claim is saved to a Golden Dataset, it runs through an aggressive PII scrubbing pipeline. "John Doe" becomes "Patient_1". This ensures that offshore developers or CI runners never have access to sensitive health data.

### Q7. Can Replay Engine find improvements, not just regressions?
Yes! If a developer improves Taiga's logic, the Replay Engine might output: "15 claims that were incorrectly approved historically are now correctly denied." The developer reviews this diff and explicitly marks it as an *Expected Improvement*, approving the CI build.

### Q8. Why spin up a whole Kubernetes Namespace for this?
To prevent "Noisy Neighbor" problems. If we ran Replays on the staging cluster, 10,000 parallel claims would saturate the database and block other developers. An ephemeral namespace gets its own dedicated Postgres DB, runs the test, and deletes itself.

### Q9. Does Replay Engine test the Master Claim Orchestrator (MCO)?
Yes. It doesn't just test the microservices in isolation; it tests the entire flow. It injects the initial Admission event, and verifies that MCO routes it through Extraction, TPR, Fairway, Taiga, and FCP correctly, ensuring the Saga pattern itself hasn't regressed.

### Q10. How does it deal with long-running MCO workflows?
Some workflows wait 30 days for a human. The Time-Travel mutator accelerates this. It sends the `MOCK_CURRENT_DATE` signal, rapidly advancing time in the isolated cluster so a 30-day workflow completes in 3 seconds.

### Q11. What if the JSON schema changes between versions?
If v1 output `total_amount` and v2 outputs `totalAmount`, the generic JSON-diff will flag 10,000 regressions. The developer must provide a `migration_map.json` in their PR, teaching the Comparator to map the old schema to the new one before diffing.

### Q12. How does the Replay Engine fetch data so quickly?
Historical FCP and TPR JSONs are stored in S3/Data Lake. When a replay starts, a high-throughput worker fetches the JSONs and loads them into a fast Redis instance inside the ephemeral cluster. The microservices then read from Redis instead of S3.

### Q13. Can the Replay Engine test Aegis (Appeals)?
Yes. Aegis is fed historical denial letters. The Replay Engine verifies that the newly drafted appeal still covers the essential legal and medical arguments present in the historically successful baseline appeal.

### Q14. What happens if a test flakes?
If a claim fails due to a random network timeout inside the ephemeral cluster, the Replay Engine automatically retries that specific claim 3 times before permanently marking it as a regression.

### Q15. How do you visualize the Regression Report?
The Engine outputs a standard JSON report that integrates with GitHub Actions/GitLab CI. Developers see a web dashboard highlighting the exact nodes in the JSON tree that changed, similar to a Git diff view.

### Q16. Can Replay Engine test the Notification Service?
Partially. It tests the routing logic (e.g., "Did the system attempt to send an SMS?"). The Stubber intercepts the outbound Twilio call and logs it. The Comparator verifies that the *correct* SMS template was triggered.

### Q17. How does it handle hospital-specific configurations?
The Golden Datasets include the `hospitalId`. When injected into the ephemeral cluster, the services query the Hospital Config Service (which is also replicated in the cluster) to apply the correct overrides.

### Q18. How long does a full regression suite take?
Running 10,000 claims through the entire Aivana pipeline takes roughly 15-20 minutes, leveraging massive Kubernetes autoscaling.

### Q19. Can I run a Replay locally on my laptop?
Yes, using Docker Compose or Minikube. A developer can pull a "Mini Dataset" (e.g., 50 claims) from S3 and run the Replay Engine locally to test their code before even opening a PR.

### Q20. How does this prevent "Silent Failures"?
Sometimes code changes don't cause crashes (500 errors), but they quietly return empty arrays `[]` instead of data. Standard unit tests might miss this. The Replay Engine catches it instantly because the baseline had data, and the replay has an empty array.

### Q21. Does Replay Engine test the AI Gateway?
Yes. It intercepts requests going to the AI Gateway and can either allow them to hit the real OpenAI API (costly, slow) or hit a mocked LLM that returns pre-recorded responses for deterministic testing of the surrounding gateway logic.

### Q22. How do you build new Golden Datasets?
The Analytics Platform monitors production. If a claim generates a novel edge-case (e.g., a highly unusual combination of diseases that triggered a complex Taiga deduction), it is automatically tagged and proposed for addition to the Golden Dataset.

### Q23. Why is this critical for Enterprise Insurance?
Because millions of dollars flow through the system. A "small bug" in a billing rule can cost a hospital 10% of its monthly revenue before it is noticed. Replay testing provides absolute mathematical confidence.

### Q24. How is the Comparator configured to ignore timestamps?
Every service generates random UUIDs and timestamps (e.g., `createdAt`). The developer configures the Replay request with `ignorePaths: ["$.traceId", "$.createdAt"]` to ensure the Comparator ignores meaningless infrastructural differences.

### Q25. What is the ultimate ROI of the Replay Engine?
It accelerates engineering velocity. Without it, deploying to production requires a 2-week manual QA cycle. With it, developers can merge PRs multiple times a day, knowing the Replay Engine has exhaustively proven their code is safe.

---

*End of Document*
