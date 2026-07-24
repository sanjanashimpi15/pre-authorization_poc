# DevOps Architecture

Aivana handles massive, unpredictable traffic spikes (e.g., hospitals batch uploading claims on Friday evening) and requires 99.99% uptime. The DevOps architecture relies heavily on Kubernetes, GitOps, and Infrastructure-as-Code (IaC).

---

## 1. GitOps with ArgoCD
We strictly follow GitOps. Engineers do not run `kubectl apply` manually.
- **State Repository**: A central Git repository (e.g., `aivana-infra`) contains the desired state of the entire platform written in Helm charts and Kubernetes manifests.
- **ArgoCD**: Runs inside the cluster, constantly monitoring the `aivana-infra` repo. If the repo specifies `taiga:v2.5`, and the cluster is running `v2.4`, ArgoCD automatically synchronizes the cluster to match the Git state.
- **Auditability**: Every infrastructure change requires a Pull Request, providing a perfect history of who deployed what, when, and why.

## 2. Infrastructure as Code (IaC)
- **Terraform**: Used to provision all cloud resources (AWS VPCs, EKS clusters, RDS Postgres databases, MSK Kafka clusters, S3 buckets).
- **Immutability**: If a server (Kubernetes Node) misbehaves, we do not SSH in to fix it. We kill it and let the Auto Scaling Group spin up a fresh one.

## 3. Deployment Strategies
### Blue/Green Deployments
For critical core services (like MCO), we use Blue/Green via Argo Rollouts.
- **Blue**: The current live version (v1.0).
- **Green**: The new version (v2.0) is deployed alongside Blue, but takes 0% traffic.
- Integration tests run against Green. If they pass, the router instantly switches 100% of traffic to Green. If a bug is found 5 minutes later, it instantly switches back to Blue.

### Canary Deployments
For AI/Heuristic services (like Fairway), we use Canary releases.
- v2.0 receives 5% of live hospital traffic.
- Prometheus monitors the 5% error rate for 10 minutes. If stable, it scales to 20%, then 50%, then 100%.

## 4. Shadow Deployments (Dark Launching)
When introducing a massive architectural change (e.g., switching the core extraction OCR engine from Google Vision to AWS Textract):
- The new OCR engine is deployed in "Shadow Mode."
- The Integration Hub duplicates incoming traffic. One copy goes to the live engine (which drives the actual claim). One copy goes to the Shadow engine.
- The Shadow engine's output is written to a database but *ignored* by MCO. Engineers compare the shadow database against the live database for a week to verify accuracy before flipping the switch.

## 5. Feature Flags
Aivana uses a Feature Flag service (integrated with HCS) to decouple *deployment* from *release*.
- Code is deployed to production on Tuesday with `predictive_denials = false`.
- On Thursday, Product Management flips the flag to `true` in the UI. No code deployment is needed.

## 6. Autoscaling
- **HPA (Horizontal Pod Autoscaler)**: Scales the number of microservice pods based on CPU/Memory or custom Kafka lag metrics. If the `Docling_Ingest` Kafka topic spikes to 10,000 pending messages, HPA spins up 50 new Docling pods to burn down the queue.
- **Karpenter / Cluster Autoscaler**: If the cluster runs out of EC2 compute capacity to host the new pods, Karpenter provisions new EC2 instances in under 60 seconds.

## 7. Disaster Recovery (DR) & Backup
- **RPO (Recovery Point Objective)**: < 5 Minutes.
- **RTO (Recovery Time Objective)**: < 1 Hour.
- **Multi-AZ**: All EKS nodes, RDS databases, and Kafka brokers are spread across 3 Availability Zones in the `ap-south-1` region. If an entire AWS data center burns down, Aivana remains online with degraded capacity.
- **Cross-Region DR**: For Platinum hospitals, Aivana replicates Postgres WAL (Write-Ahead Logs) and Kafka topics asynchronously to a cold-standby cluster in `ap-southeast-1` (Singapore).
- **Nightly Backups**: All databases and S3 buckets are backed up nightly. Backups are immutable and protected against ransomware (e.g., AWS Backup Vault Lock).

## 8. Chaos Testing (Chaos Mesh)
Once a month, during low-traffic windows, the DevOps team runs Chaos experiments in Staging and occasionally Production.
- **Pod Kill**: Randomly terminates 10% of Taiga pods to ensure HPA replaces them and MCO retries dropped requests.
- **Network Latency**: Injects 500ms of latency into the Redis cache to ensure the application degrades gracefully rather than crashing.
- **DB Failover**: Forces an RDS primary failover to ensure the microservices reconnect successfully to the new primary within 30 seconds.
