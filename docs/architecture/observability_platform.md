# Enterprise Observability Platform

With 25+ microservices processing a single claim over several days, standard log files are insufficient. If a hospital says "My claim is stuck," Aivana engineers need to instantly pinpoint exactly which service dropped the event. This document outlines the unified Observability Platform.

---

## 1. The Core Stack (OpenTelemetry)
Aivana standardizes entirely on **OpenTelemetry (OTel)**. Every microservice (Go, Node, Python, Java) uses the OTel SDK to emit standard metrics, logs, and traces.
- **Collector**: An OTel Collector runs as a DaemonSet on every Kubernetes node, gathering telemetry and forwarding it to the storage backends.

## 2. Distributed Tracing (Jaeger / Tempo)
A claim flows through the Integration Hub -> MCO -> TPR -> Fairway -> Taiga -> FCP.
- **Correlation ID**: The Integration Hub generates a unique `traceId` the moment a claim enters the system. This ID is passed in every HTTP header (W3C Trace Context) and Kafka header.
- **Span Tracking**: If a claim takes 12 seconds to process, Jaeger visualizes a waterfall chart showing exactly how long each service took (e.g., Fairway took 8s, Taiga took 0.05s). This immediately identifies bottlenecks.

## 3. Metrics (Prometheus)
Microservices emit RED metrics (Rate, Errors, Duration).
- **Prometheus** scrapes these metrics every 15 seconds.
- **Alertmanager** triggers PagerDuty if the Error Rate for Taiga exceeds 1% or if the 99th percentile latency of the AI Gateway exceeds 15 seconds.

## 4. Logging (Loki / Elasticsearch)
Logs are for deep debugging.
- We do not log PHI.
- Logs are strictly JSON formatted to allow fast querying.
- A developer can query Loki: `{app="fairway", level="error"} |= "INS-2003"` to instantly see all ICD-10 mapping failures across the entire cluster.

## 5. Dashboards (Grafana)
Grafana provides the "Single Pane of Glass." We maintain three tiers of dashboards:

### Tier 1: Infrastructure KPIs (DevOps)
- CPU/Memory usage per pod.
- Kafka topic lag (Critical: If the `MCO_INGEST` topic lag grows, claims are piling up).
- Database Connection Pool utilization.

### Tier 2: AI & Service KPIs (Engineering)
- **AI Gateway Cache Hit Rate**: Target 30%.
- **LLM Token Usage vs Budget**.
- **Rule Engine Execution Time**: Taiga must evaluate 100 rules in <50ms.

### Tier 3: Business KPIs (Product)
- **Straight-Through Processing (STP) Rate**: The percentage of claims that went from Admission to Submission with zero human intervention.
- **First-Pass Approval Rate**: The percentage of claims approved by the TPA without a single query.
- **Aegis Win Rate**: The percentage of appealed claims that resulted in a financial reversal.

## 6. Synthetic Monitoring (Blackbox)
We cannot wait for a hospital to tell us the system is down.
- A synthetic bot submits a "Dummy Claim" via the Integration Hub every 5 minutes.
- It tracks the claim through the entire lifecycle to the FCP.
- If the dummy claim takes longer than 60 seconds to process, it triggers a Sev-2 alert.

## 7. Error Tracking (Sentry)
For unhandled exceptions (e.g., a Null Pointer Exception in Node.js), Sentry captures the stack trace, groups identical errors, and creates a Jira ticket automatically.

## 8. Data Retention Policies
- **Metrics (Prometheus)**: 15-second resolution kept for 14 days. 1-hour rollups kept for 1 year.
- **Traces (Jaeger)**: 100% of traces kept for 3 days. 1% sampled traces kept for 30 days.
- **Logs (Loki)**: Hot storage for 30 days. Cold storage (S3 Glacier) for 7 years (Compliance mandate).
