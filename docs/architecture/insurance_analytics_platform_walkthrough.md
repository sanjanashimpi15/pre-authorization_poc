# Design Walkthrough & Justifications — Insurance Analytics Platform (IAP)

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Insurance Analytics Platform (IAP)**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why use a separate OLAP database (ClickHouse) instead of querying the production Postgres databases?
If a hospital executive runs a report for "Show me all denials across 5 years grouped by TPA," executing that on the production Taiga or FCP Postgres databases requires scanning millions of rows. It would lock tables, spike CPU, and potentially cause active claim submissions to time out. OLAP databases are isolated and structurally optimized for this exact analytical workload.

### Q2. How does data get from Postgres to ClickHouse?
Via Change Data Capture (CDC) using a tool like Debezium, or by having microservices natively emit Domain Events to Kafka. IAP uses Kafka as the buffer. Flink or Kafka Streams reads the JSON from Kafka, flattens it, and inserts it into ClickHouse.

### Q3. Why use ClickHouse over Snowflake or BigQuery?
**Tradeoff**: Snowflake/BigQuery are fully managed but charge heavily per query (compute). ClickHouse can be self-hosted or run on ClickHouse Cloud, offering sub-second latency on massive datasets at a significantly lower operational cost for continuous, high-volume dashboard queries.

### Q4. What is a "Materialized View" in this context?
A pre-calculated answer. Instead of forcing ClickHouse to sum up 500,000 rows every time the user refreshes the page, the Materialized View updates a tiny summary table (e.g., total denials per day) in the background every time a new event arrives. The dashboard queries the tiny summary table instantly.

### Q5. Why use GraphQL instead of REST for the API?
Dashboards are highly dynamic. A user might want to see `claimVolume`, `denialRate`, and `topReasons` on one screen, but only `claimVolume` on another. With REST, we'd have to over-fetch data or build 50 custom endpoints. GraphQL allows the React frontend to ask for exactly what it needs in a single request.

### Q6. How is multi-tenancy (Hospital isolation) enforced?
Security is pushed down to the database layer. The API reads the JWT token, extracts `hospitalId`, and forcibly appends `WHERE hospital_id = 'X'` to the underlying SQL query. A hospital physically cannot query another hospital's rows.

### Q7. Can IAP handle real-time dashboards?
Yes. Kafka pushes events in real-time, and ClickHouse ingests them in micro-batches (e.g., every 1-2 seconds). A "Live Operations" dashboard for a billing desk will show a claim transitioning from "Pending" to "Denied" almost instantly.

### Q8. What happens if the Kafka stream goes down?
The transactional systems (FCP, SAS) continue working perfectly. IAP's dashboards will simply show stale data until the Kafka stream is restored, at which point it processes the backlog and catches up. (Decoupling saves the core business).

### Q9. How do we track the "First-Pass Approval Rate"?
IAP links events by `ClaimId`. If a `CLAIM_SETTLED` event arrives without any preceding `QUERY_RAISED` or `DENIAL_RECEIVED` events for that `ClaimId`, it is counted in the "First-Pass" bucket.

### Q10. Does IAP show data from DKS (Denial Knowledge Service)?
Yes. DKS generates macro-level "TPA Behavior Profiles." IAP queries these profiles and visualizes them (e.g., a radar chart showing which TPAs are most hostile to specific clinical conditions).

### Q11. How are CSV or Excel reports generated without crashing the server?
Large exports bypass the GraphQL API. The frontend requests an export; a background Node.js worker streams the data directly from ClickHouse into a CSV file via Node streams, uploads it to S3, and emails a secure download link to the user. Memory usage stays flat.

### Q12. Why don't we just use a BI tool like Tableau or PowerBI?
Licensing costs and embedded user experience. Paying $20/month per hospital clerk for PowerBI is economically unviable. Building custom React dashboards (using Recharts or Tremor) allows deep integration into the Aivana UI without licensing fees, providing a seamless "one app" experience.

### Q13. How does IAP handle currency conversions (if applicable)?
Currently, Taiga handles all financial math (INR). IAP simply aggregates the integers provided by Taiga. It does not perform currency conversion logic.

### Q14. What happens when the schema changes (e.g., we add a new denial taxonomy category)?
ClickHouse is highly flexible with adding columns. Because the ETL layer flattens JSON, adding a new field simply means adding a new column to the ClickHouse table. GraphQL's schema evolution handles the frontend gracefully.

### Q15. Does IAP store PII?
Minimally. Analytics rarely need patient names. The ETL pipeline strips names and phone numbers. It retains `PatientId` (for counting unique patients) and `ClaimId` (for drill-downs), but standard dashboards operate entirely on aggregated numerical data.

### Q16. How does IAP help hospitals track employee performance?
Because the `CLAIM_SUBMITTED` event contains the `userId` of the billing clerk, IAP can generate leaderboards: "Clerk A processed 50 claims today with a 0% query rate. Clerk B processed 20 claims with a 30% query rate."

### Q17. How do we ensure the data in IAP matches the money in the bank?
Reconciliation scripts. Nightly cron jobs run against the source-of-truth Postgres databases and the ClickHouse OLAP databases to ensure the `SUM(claimed_amount)` matches exactly. If data drift is detected, an engineering alert fires.

### Q18. How does IAP visualize the FCP Quality Certification?
It graphs the OCR Confidence Scores over time. If a hospital's average OCR score drops below 75%, IAP flags the hospital's scanner hardware for maintenance, proving that poor scans are increasing TPA rejections.

### Q19. How do we handle "Date Filtering"?
ClickHouse tables are partitioned by `toYYYYMM(submission_date)`. If a user queries for "Last Week," ClickHouse only scans the partition for the current month, drastically reducing disk I/O and speeding up the query.

### Q20. Can IAP support A/B testing of AKS rules?
Yes. If Fairway applies Rule Pack A to half the claims and Rule Pack B to the other half, IAP tracks the downstream denial rates of both cohorts, allowing Aivana to statistically prove which rule pack is superior.

### Q21. How do we prevent users from writing infinitely complex GraphQL queries?
Query Cost Analysis and Depth Limiting. The GraphQL server calculates the "cost" of a query before executing it. If a user tries to nest relations 10 levels deep, the server rejects it with a `429 Too Many Requests` or `Query Too Complex` error.

### Q22. What are the tradeoffs of using CDC (Debezium)?
**Tradeoff**: CDC is complex to set up and tightly couples the database schema to the Kafka stream.
**Justification**: It is the only way to guarantee zero data loss. If a service crashes right after writing to Postgres but before emitting an event, CDC catches the write at the transaction log level and pushes it to Kafka safely.

### Q23. How does IAP handle historical data loading for new hospitals?
If a hospital joins Aivana and brings 5 years of historical XML claims, a specific batch script parses those XMLs and inserts them directly into ClickHouse, allowing the hospital to view 5 years of historical analytics on Day 1.

### Q24. Is there an API limit for dashboards?
Yes. API Gateway rate limits (e.g., 100 requests per minute per IP) protect the infrastructure from abusive automated scraping.

### Q25. What makes IAP different from generic hospital reporting?
Generic HIS (Hospital Information Systems) report on *what happened*. IAP reports on *why it happened*. Because IAP is fed by DAS and Aegis, it connects the financial outcome directly to the clinical rule and the specific TPA behavior, providing actionable intelligence rather than just passive data.

---

*End of Document*
