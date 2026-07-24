# Enterprise Security Architecture

Aivana processes highly sensitive Protected Health Information (PHI) and financial data. A single breach is an existential threat. This document defines the enterprise security posture.

---

## 1. Zero Trust Architecture
Aivana does not rely on a "soft inner core." Every microservice must mutually authenticate with every other microservice.
- **mTLS (Mutual TLS)**: A service mesh (e.g., Istio or Linkerd) enforces mTLS between all internal pods. Fairway cannot talk to Taiga unless both present valid cryptographic certificates issued by the internal Certificate Authority (CA).
- **Service-to-Service Authorization**: Even with a valid certificate, Istio enforces ABAC (Attribute-Based Access Control). E.g., The Integration Hub is allowed to `POST` to the Kafka `Ingest` topic, but is strictly denied from `GET`ing from the `Settlements` API.

## 2. Identity and Access Management (IAM)
### External Users (Hospital Staff, TPA Users)
- **OIDC/OAuth 2.0**: All UI logins route through an Identity Provider (Okta, Auth0, or AWS Cognito).
- **JWT**: The IdP issues a short-lived (15 min) JSON Web Token (JWT).
- **ABAC (Attribute-Based Access Control)**: The JWT contains `hospitalId` and `branchId`. The API Gateway strictly filters all requests. A user with `branchId: Delhi` attempting to access `branchId: Mumbai` claims receives a 403 Forbidden, enforced at the API Gateway level (not inside the microservices).

### Internal API Clients (EMRs)
- **API Keys / Client Credentials**: EMRs connecting to the Integration Hub use OAuth2 Client Credentials flow to obtain a token, or long-lived API keys signed and rotated every 90 days.

## 3. Data Encryption
### At Rest
- **Volume Encryption**: All EBS volumes, S3 buckets, PostgreSQL databases, and Kafka logs are encrypted using AES-256.
- **KMS (Key Management Service)**: Encryption keys are managed by AWS KMS (or Azure Key Vault).
- **Tenant Isolation (Optional)**: For Enterprise Platinum hospitals, Aivana supports Customer-Managed Keys (CMK). The hospital holds the KMS key. If the hospital revokes the key, their data on Aivana becomes instantly cryptographically shredded.

### In Transit
- All external traffic requires TLS 1.3.
- All internal traffic requires mTLS.

## 4. PII / PHI Redaction
The AI Gateway acts as the egress firewall.
- **Pre-LLM Scrubbing**: Before a prompt containing a doctor's note is sent to a public API (like OpenAI), a local, fast NLP model replaces `John Doe` with `[PATIENT_1]`, and `+91-9876543210` with `[PHONE]`.
- **Post-LLM Rehydration**: When the LLM returns the payload, the AI Gateway swaps the tokens back to real data before returning it to the internal Aivana service.

## 5. Secrets Management
- **No Hardcoded Secrets**: Code repositories contain zero passwords, API keys, or certificates.
- **HashiCorp Vault / AWS Secrets Manager**: Microservices fetch database passwords at runtime. Passwords are automatically rotated every 30 days without human intervention.

## 6. Audit & Logging
- **Immutable Audit Trail**: Every mutating action (`POST`, `PUT`, `DELETE`) is logged to an immutable S3 bucket.
- **Log Schema**: `Timestamp | Actor (User/Service) | Action | Resource ID | IP Address`.
- **SIEM Integration**: All logs are forwarded to a SIEM (Datadog, Splunk, or AWS CloudWatch) where SOC (Security Operations Center) alerts trigger on anomalous behavior (e.g., A doctor downloading 500 claims in 1 minute).

## 7. Compliance Standards
Aivana is architected to be certifiable for:
- **SOC 2 Type II**: Proving security, availability, and confidentiality controls over time.
- **ISO 27001**: Global standard for Information Security Management Systems.
- **HIPAA-Ready**: BAA (Business Associate Agreement) compliant infrastructure.
- **IRDAI (India)**: Compliant with data localization laws (All Indian hospital data remains physically in AWS ap-south-1 Mumbai region).
- **ABDM / NABH**: Compliant with India's Ayushman Bharat Digital Mission data privacy and consent architectures.

## 8. Incident Response (Break-Glass)
If a critical production bug occurs, engineers cannot SSH into production servers.
- **Session Manager**: Engineers use AWS Systems Manager Session Manager, which logs every keystroke they type in the terminal.
- **Just-In-Time (JIT) Access**: Access is granted for 1 hour after approval from a Tech Lead in PagerDuty.

## 9. Dependency Scanning
- **CI/CD Security**: GitHub Actions runs Snyk/Dependabot to scan for CVEs in Node.js/Python packages. Docker images are scanned by Trivy before being pushed to the Elastic Container Registry (ECR). Any `CRITICAL` or `HIGH` vulnerability immediately breaks the build.
