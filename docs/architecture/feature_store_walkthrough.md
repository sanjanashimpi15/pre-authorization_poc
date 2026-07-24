# Design Walkthrough & Justifications — Feature Store

This document provides detailed design rationales, architectural answers, and structural tradeoffs regarding the **Feature Store**.

---

## 1. Architectural Q&A (25+ Questions & Answers)

### Q1. Why build a Feature Store? Why not just query the Postgres DB for ML features?
Postgres is optimized for transactional processing (OLTP). If an ML model queries Postgres for "Calculate the average claim amount for this hospital over the last 3 years", it requires scanning millions of rows. This would slow down the core MCO workflow. A Feature Store pre-computes this mathematically intensive data overnight and stores the final number (`[avg_claim: 14500]`) in a high-speed Redis cache, returning it to the ML model in 5 milliseconds.

### Q2. What is "Training-Serving Skew"?
It is the most common cause of ML failure in production. A Data Scientist writes a complex SQL query to calculate `denial_rate` for training. Six months later, a backend engineer writes a slightly different Node.js function to calculate `denial_rate` for the live API. The model receives different data structures and hallucinates. The Feature Store solves this by guaranteeing that the exact same code generates both the offline training data and the online inference data.

### Q3. What is "Point-in-Time Correctness"?
If we train an ML model on historical claims from 2024 to predict denials, we must provide the model with the hospital's profile *exactly as it was in 2024*. If we provide the hospital's *current* 2026 profile, the model learns from the future (Data Leakage). The Offline Store natively handles "AS OF" joins, recreating the exact feature state for any timestamp in history.

### Q4. How does the Streaming Engine work?
Some features need to be real-time. "Number of identical claims submitted in the last 5 minutes" is a crucial fraud feature. The Feature Store consumes the Kafka `CLAIM_SUBMITTED` topic, uses Apache Flink (or Spark Structured Streaming) to update a rolling window counter, and immediately writes the new value to Redis.

### Q5. Can external data be stored here?
Yes. If Aivana purchases a dataset from a third-party (e.g., "National average cost for appendectomy"), it is ingested into the Feature Store. The ML models can seamlessly join this external feature with internal hospital features.

### Q6. How does this relate to the Universal Rule Simulation Engine (URSE)?
URSE is for deterministic rules. The Feature Store powers the probabilistic models (like TPA Prediction). URSE might say, "Rule 4.1 will deduct ₹500". The ML model, using the Feature Store, might say, "Even though Rule 4.1 deducting ₹500 is technically correct, this hospital's `historical_pushback_score` feature is so high that the TPA has an 80% chance of auditing the claim anyway."

### Q7. How does the Materialization process work?
Batch features (like "90-day averages") are calculated nightly in Snowflake/S3. But the live API (Redis) needs them. Materialization is the daily ETL job that copies the latest batch results from S3 into Redis before the morning hospital shift begins.

### Q8. What happens if Redis runs out of memory?
The Online Store is configured to only store the *latest* value of a feature, and it uses strict TTLs (Time-To-Live). If a hospital hasn't submitted a claim in 6 months, their features drop out of hot RAM. If they submit a claim, the Feature Store experiences a cache miss, recalculates/fetches it from cold storage, and warms the cache.

### Q9. Why separate the Offline Store from the Online Store?
They have contradictory requirements. The Offline Store needs to scan terabytes of historical data efficiently (Parquet/Columnar storage). The Online Store needs to return a 50-byte JSON payload for a single ID in 5 milliseconds (Redis/Key-Value storage).

### Q10. How does a Data Scientist discover features?
Through the Feature Registry UI. If a data scientist is building a new "Fraud Detection Model," they search the Registry for "fraud." They discover that another team already built a feature called `patient_recent_hospital_hops`. They simply import it into their model without rewriting the logic.

### Q11. How are features versioned?
Like code. If the definition of `denial_rate` changes to exclude administrative denials, it becomes `denial_rate_v2`. Existing ML models continue requesting `v1` until they are retrained.

### Q12. Does the Feature Store compute the features?
It acts as the orchestrator. The actual computation happens in the underlying engines (Spark, Snowflake, Flink). The Feature Store manages the scheduling, definitions, and storage routing.

### Q13. Can features be deleted?
Features can be deprecated in the Registry, warning Data Scientists not to use them in new models. However, the historical data in the Offline Store is retained so old models can still be audited or retrained for comparison.

### Q14. What is an Entity?
An Entity is the primary key. Common Aivana entities are `hospitalId`, `doctorId`, `patientId`, `insurerId`. A feature is always bound to an entity.

### Q15. How does this improve the MCO latency?
Without a Feature Store, TPA Prediction would block MCO for 3 seconds while it ran heavy SQL aggregations. With the Feature Store, TPA Prediction fetches the pre-computed array in 5ms, meaning the MCO workflow advances almost instantly.

### Q16. Can hospitals access the Feature Store?
No. The Feature Store is an internal Aivana infrastructure component. However, the *Insurance Analytics Platform (IAP)* reads from the Offline Store to populate dashboards for hospital executives.

### Q17. How do you handle Data Quality?
The Feature Store includes a Data Quality monitor (e.g., Great Expectations). After the nightly batch run, it asserts rules: `denial_rate must be between 0.0 and 1.0`. If a bug causes the rate to spike to 5.0, the monitor halts the materialization job, preventing the corrupted feature from reaching the live Redis cache.

### Q18. How does this service handle missing data?
If a brand new hospital joins Aivana, they have no historical data. The Online Store returns `null` or a predefined default value for their features. Downstream ML models handle this imputation (e.g., using the national average instead).

### Q19. Does the Feature Store contain PHI?
Yes, patient-level features (e.g., `patient_historical_claims_count`) contain PHI by proxy, even if names are stripped. The databases inherit the strict security and encryption protocols of the platform.

### Q20. Is this overkill for a startup?
**Tradeoff**: Setting up Feast/Hopsworks is infrastructural heavy lifting.
**Justification**: Aivana is an Enterprise Platform managing billions in claims. Model accuracy directly impacts hospital revenue. Training-serving skew is unacceptable at this scale.

### Q21. How are categorical features handled?
Features like `hospital_city` are one-hot encoded or embedded during the ML training pipeline. The Feature Store typically stores the raw categorical value (`"Mumbai"`), allowing different models to encode it differently.

### Q22. How does the Feature Store integrate with the AI Gateway?
The AI Gateway doesn't directly query the Feature Store. The calling service (e.g., TPA Prediction) fetches the features and passes them to the AI Gateway as part of the prompt context if an LLM is being used for prediction.

### Q23. What open-source tools power this?
Often built on `Feast` (Feature Store), `Redis` (Online Store), `Parquet/S3` (Offline Store), and `Spark/Airflow` (Compute Orchestration).

### Q24. How is it monitored?
Prometheus/Grafana tracks "Feature Drift". If the statistical distribution of `avg_claim_amount` shifts wildly from yesterday to today, it triggers an alert to the Data Science team.

### Q25. What is the ultimate ROI of the Feature Store?
It turns ML from a bespoke, artisan craft into a standardized engineering assembly line. Data Scientists spend 80% of their time engineering features; the Feature Store allows them to do it once and reuse it across 10 different AI models, massively accelerating AI deployment across the platform.

---

*End of Document*
