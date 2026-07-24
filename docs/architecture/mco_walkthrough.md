# Design Walkthrough & Justifications — Master Claim Orchestrator (MCO)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Master Claim Orchestrator (MCO)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why introduce an Orchestrator? Aren't event-driven microservices better?
Pure event-driven architectures (Choreography) are great for decoupling, but terrible for monitoring complex business processes. In Choreography, no single service knows the overall status of the claim. If a message is lost, the claim simply "vanishes." An Orchestrator (Saga/Command pattern) explicitly manages the workflow, guaranteeing that a claim either succeeds or fails with a known error.

### Q2. Why use Temporal.io instead of building a custom state machine?
Building a distributed, fault-tolerant state machine that handles race conditions, database locks, timers, and server crashes is incredibly complex. Temporal solves all of this natively using Event Sourcing. Aivana developers can just write synchronous-looking code (`await runFairway()`), and Temporal handles the distributed complexity.

### Q3. How does MCO handle service failures?
If Taiga goes down, MCO doesn't crash. The workflow simply pauses on the `runTaiga()` activity. Based on the retry policy, MCO will try again every 10 seconds. If it fails for 24 hours, MCO can route the workflow to a "Manual Intervention" state.

### Q4. What is a Compensating Action?
Because microservices don't share a database, you can't use SQL `ROLLBACK`. If Step 1 (Charge Credit Card) succeeds, but Step 2 (Book Flight) fails, you must run a compensating action (Refund Credit Card). In Aivana, if FCP packaging fails, MCO issues commands to Taiga/Fairway to release any snapshot locks.

### Q5. How does MCO handle timeouts?
Temporal allows defining strict timeouts on activities. If the TPA portal takes more than 60 seconds to respond to SAS, MCO cancels the activity context and triggers the fallback logic, ensuring claims don't get stuck in memory indefinitely.

### Q6. Are all Aivana services now synchronous?
No. The services (Fairway, Taiga) are still asynchronous microservices. MCO is the only component that *waits* for them. It invokes an activity, unloads the workflow from memory, and when the service finishes (e.g., via a callback or Kafka event), MCO wakes up and continues.

### Q7. How does MCO "suspend" a workflow for human approval?
By blocking on a Signal. The code literally says `await waitForSignal('APPROVAL')`. Temporal unloads the state from the worker's RAM and stores it in the database. When the UI sends the signal, Temporal reloads the state exactly where it paused. This uses zero CPU while waiting.

### Q8. How does MCO visualize the workflow?
Because workflows are defined as code, the UI can query MCO for the workflow's history (the Event Sourced log). The UI maps these events to a graphical DAG (Directed Acyclic Graph) showing the user exactly what has happened and what is pending.

### Q9. What happens if an MCO worker server crashes mid-execution?
Temporal relies on an external database. If Worker A crashes while running line 5 of the workflow, the Temporal server notices the worker died, reassigns the workflow to Worker B, replays the history from the database to recreate the state, and resumes execution at line 5 seamlessly.

### Q10. Can MCO run multiple versions of a workflow simultaneously?
Yes. Insurance rules change. If Aivana introduces a new `ClaimWorkflow_v2`, any claim started today uses `v2`. Any claim started yesterday continues running on `v1`. Temporal natively supports non-destructive versioning.

### Q11. How does MCO interact with the Notification Service?
If MCO encounters a business error (e.g., "Hospital budget exceeded"), it triggers an activity to call the Notification Service, which then escalates the issue via WhatsApp or SMS to the billing manager.

### Q12. Why doesn't MCO perform business logic?
To prevent it from becoming a monolith. MCO is a traffic cop. If MCO started checking ICD codes, it would duplicate Taiga's job. MCO only routes payloads between specialized engines.

### Q13. How does MCO handle long-running appeals?
Aegis might file an appeal that takes 6 months to resolve. Temporal timers can sleep for months or years reliably. If the TPA doesn't reply in 30 days, MCO automatically wakes up and triggers a follow-up action.

### Q14. What are the tradeoffs of using Temporal?
**Tradeoff**: It introduces a heavy infrastructural dependency (Temporal Server + Postgres/Cassandra) and requires developers to learn its specific programming model (deterministic constraints).
**Justification**: The reliability, auditability, and operational visibility gained for a high-stakes financial platform absolutely dwarf the infrastructural overhead.

### Q15. Does MCO replace Kafka?
No. Kafka is still used for high-throughput domain events (e.g., feeding the Analytics Platform). MCO replaces Kafka *specifically* for microservice choreography (Service A calling Service B).

### Q16. How does MCO handle bulk claim processing?
MCO spawns a separate, lightweight workflow instance for every single claim. 10,000 bulk claims = 10,000 independent workflows. They run in parallel, isolated from one another.

### Q17. How does MCO integrate with FCP?
MCO commands FCP to generate the packet. MCO passes the `claimId` and the specific versions of the upstream outputs (TPR, CEA, FCA) so FCP knows exactly what to package.

### Q18. How do we test workflows without hitting real services?
Temporal provides a robust mocking framework. Developers can mock the Activity Workers (e.g., `mockFairway(returns: APPROVED)`), allowing rapid unit testing of the Orchestration routing logic.

### Q19. What happens if a hospital wants to skip Fairway for low-value claims?
The Hospital Configuration Service feeds flags to MCO at instantiation. The MCO workflow code contains an `if (config.skipFairway)` statement, allowing dynamic routing per hospital.

### Q20. Can MCO undo an approval?
If a doctor approves a claim, but then realizes a mistake, they can send a `CANCEL_CLAIM` signal to MCO. The workflow catches the signal, halts progression, and routes back to the start.

### Q21. How is data passed between steps?
MCO holds the minimal necessary state (e.g., IDs, status flags). Heavy payloads (like PDFs) remain in S3. MCO passes the S3 URIs between the services, preventing the orchestrator database from bloating.

### Q22. How does MCO handle rate limiting?
Activity workers can be rate-limited natively in Temporal. If the SAS service can only handle 5 requests per second, the SAS activity workers are throttled, and MCO simply queues the execution.

### Q23. What is the impact on latency?
MCO adds about 5-10ms of overhead per step to persist state to the database. In an async insurance pipeline where a single LLM call takes 3 seconds, this overhead is completely negligible.

### Q24. How does MCO handle "Child Workflows"?
A single claim might have multiple patient admissions (e.g., a mother and newborn). The parent workflow can spawn Child Workflows for each patient, synchronizing their results before final submission.

### Q25. Ultimately, why is MCO the most critical platform component?
Because in healthcare billing, a dropped claim means lost revenue. Event-driven architectures lose claims silently when queues fail. MCO ensures that every single claim is accounted for, tracked, and driven to a terminal state (Settled or Denied).

---

*End of Document*
