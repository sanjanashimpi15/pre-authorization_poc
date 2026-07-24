# AIVANA INSURANCE OS — MASTER ARCHITECTURE INDEX

This is the definitive reference architecture for the Aivana platform. It organizes the 25+ microservices and 15 conceptual layers into a single, navigable CTO-level blueprint.

---

## 1. Platform Vision & Principles
- **Vision**: To build the Autonomous Revenue Cycle for Indian Healthcare.
- **Core Philosophy**: Deterministic First. AI only where ambiguity exists.
- **Architectural Tenets**: [Architecture Decision Records (ADRs)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/adrs.md)

---

## 2. Core Service Layers (The 25+ Microservices)

### Layer 1: Integration & Edge
- [Integration Hub](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/integration_hub.md): Inbound/Outbound protocol adapters (HL7/API).
- [Submission Adapter Service](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/submission_adapter_service.md): Translates Canonical FCP into Insurer-specific APIs.

### Layer 2: Document Intelligence
- [Docling Ingestion Gateway](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/docling_ingestion_gateway_design.md): Ingests and registers physical PDFs.
- [Document Identification Service](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/document_identification_service.md): Classifies and splits PDFs (Discharge Summary vs. Lab Report).
- [Patient Information Extraction Service](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/patient_information_extraction_service.md): OCR and raw NLP extraction.

### Layer 3: Truth & Structuring
- [Patient Consolidation (TPR)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/patient_consolidation_service.md): Resolves contradictory facts into a single state.
- [Evidence Graph Service (EGS)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/evidence_graph_service.md): Anchors facts to physical bounding boxes on PDFs.

### Layer 4: Clinical & Financial Intelligence
- [Fairway Clinical Evidence Review](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/fairway_clinical_evidence_review.md): Checks medical necessity against policy.
- [Taiga Financial Compliance Engine](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/taiga_financial_compliance_engine.md): Calculates room rent caps, surgical unbundling, and math.

### Layer 5: Policy Knowledge
- [Aivana Knowledge Studio (AKS)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/aivana_knowledge_studio.md): The CMS for Authoring Insurance Rules.
- [Policy Knowledge Graph (PKG)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/policy_knowledge_graph.md): The machine-readable Neo4j graph of those rules.

### Layer 6: Submission Intelligence
- [Submission Intelligence Engine (SIE)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/submission_intelligence_engine.md): Calculates overall Readiness Score (SRA).
- [TPA Query Prediction Service](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/tpa_query_prediction_design.md): Predicts likelihood of TPA RFIs.
- [Final Claim Packet (FCP)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/final_claim_packet.md): Generates the immutable JSON/PDF payload.

### Layer 7: Denial & Appeal Intelligence
- [Denial Analysis Service (DAS)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/denial_analysis_service.md): Parses incoming rejection letters.
- [Aegis Appeal Intelligence](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/aegis_appeal_intelligence.md): Generates legal/medical appeal drafts.
- [Denial Knowledge Service (DKS)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/denial_knowledge_service.md): Tracks success rates of appeals.

### Layer 8: Orchestration & Configuration
- [Master Claim Orchestrator (MCO)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/master_claim_orchestrator.md): Temporal-based Saga workflow manager.
- [Hospital Configuration Service (HCS)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/hospital_configuration_service.md): Multi-tenant feature flags and overrides.

### Layer 9: Explainability & Collaboration
- [Explainability Service](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/explainability_service.md): Generates the universal Reason Graph for humans.
- [Notification & Collaboration Service (NCS)](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/notification_collaboration_service.md): Human-in-the-loop chat and alerts.

### Layer 10: AI Infrastructure & Learning
- [AI Model Gateway](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/ai_model_gateway.md): Central LLM router, cacher, and guardrail.
- [Prompt Registry](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/prompt_registry.md): Versioned CMS for AI Prompts.
- [Feature Store](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/feature_store.md): Offline ML training data pipeline.
- [Digital Twin Replay Engine](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/digital_twin_replay_engine.md): Sandbox for regression testing rules on historical claims.
- [Universal Rule Simulation Engine](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/rule_simulation_engine.md): "What if" impact analysis for policy changes.

### Layer 11: Analytics
- [Insurance Analytics Platform](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/insurance_analytics_platform.md): ClickHouse/Snowflake OLAP for executive dashboards.

---

## 3. Data & Communication Models
- **Data Standard**: [Enterprise Canonical Data Model](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/canonical_data_model.md)
- **Event Bus**: [Enterprise Event Catalog](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/event_catalog.md)
- **Error Codes**: [Enterprise Error Catalog](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/error_catalog.md)

---

## 4. Governance & Operations
- **Security**: [Enterprise Security Architecture](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/security_architecture.md) (Zero Trust, mTLS, HIPAA).
- **AI Safety**: [AI Governance Framework](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/ai_governance.md) (HitL, Guardrails, Prompts).
- **Deployment**: [DevOps Architecture](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/devops_architecture.md) (GitOps, ArgoCD, IaC).
- **Monitoring**: [Enterprise Observability Platform](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/observability_platform.md) (OpenTelemetry, Traces).
- **SLAs**: [Enterprise Performance Benchmarks](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/performance_benchmarks.md) (<15 seconds total latency).

---

## 5. Vision
- **Future Growth**: [Platform Roadmap](file:///Users/abhishekpravinnahire/.gemini/antigravity-ide/brain/c7e10147-ef15-4e6c-85fa-604870a7992e/platform_roadmap.md) (V1 Insurance to V6 Autonomous Execution).
