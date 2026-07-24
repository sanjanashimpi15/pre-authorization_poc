# The Ultimate Architecture Diagram: Aivana Insurance OS

This diagram provides a high-level visual map of the entire Aivana platform, illustrating the lifecycle of an insurance claim as it moves from the hospital EMR, through the 15 architectural layers, to the TPA, and ultimately into the analytics dashboards.

```mermaid
flowchart TD

    %% ----------------------------------------------------
    %% EXTERNAL ENTITIES
    %% ----------------------------------------------------
    Hospital[Hospital EMR / Staff] --> |HL7 / API / Portal| Ingress
    Insurer[TPA / Insurer Portal]
    Executive[Hospital Executives]
    Admin[Aivana Medical Coders]

    %% ----------------------------------------------------
    %% EDGE & INGESTION LAYER
    %% ----------------------------------------------------
    subgraph Edge ["1. Edge & Integration Layer"]
        Ingress((Ingress)) --> Hub
        Hub[Integration Hub]
        Hub --> SAS[Submission Adapter Service]
        SAS --> |API / RPA| Insurer
    end

    Hub --> |Raw Documents| Docling
    Hub --> |Denial Letters| DAS

    %% ----------------------------------------------------
    %% DOCUMENT INTELLIGENCE LAYER
    %% ----------------------------------------------------
    subgraph DocInt ["2. Document Intelligence Layer"]
        Docling[Docling Ingestion Gateway]
        DocID[Document Identification]
        PIE[Patient Information Extraction (OCR/NLP)]
        Docling --> DocID
        DocID --> PIE
    end

    %% ----------------------------------------------------
    %% MASTER ORCHESTRATION (THE SPINE)
    %% ----------------------------------------------------
    PIE --> MCO
    
    subgraph Core ["3. Orchestration & Truth"]
        MCO((Master Claim Orchestrator))
        TPR[Trusted Patient Record]
        EGS[Evidence Graph Service]
        MCO <--> TPR
        MCO <--> EGS
    end

    %% ----------------------------------------------------
    %% THE AI & REASONING BRAIN
    %% ----------------------------------------------------
    subgraph Reasoning ["4. Core Intelligence Layer"]
        Fairway[Fairway Clinical Review]
        Taiga[Taiga Financial Engine]
        SIE[Submission Intelligence Engine (SRA)]
        TPA_Pred[TPA Query Prediction]
        FCP[Final Claim Packet Builder]
        
        Fairway -.-> MCO
        Taiga -.-> MCO
        SIE -.-> MCO
        TPA_Pred -.-> MCO
        FCP -.-> MCO
    end

    %% MCO calls the reasoning engines
    MCO ==> Fairway
    MCO ==> Taiga
    MCO ==> SIE
    MCO ==> TPA_Pred
    MCO ==> FCP
    
    FCP ==> SAS

    %% ----------------------------------------------------
    %% POST-SUBMISSION / APPEALS LAYER
    %% ----------------------------------------------------
    Insurer --> |Remittance Advice| Hub
    
    subgraph Appeals ["5. Denial & Appeal Layer"]
        DAS[Denial Analysis Service]
        Aegis[Aegis Appeal Intelligence]
        DKS[Denial Knowledge Service]
        DAS --> Aegis
        Aegis --> DKS
        Aegis -.-> |Appeal Letter| SAS
    end

    %% ----------------------------------------------------
    %% SHARED AI INFRASTRUCTURE
    %% ----------------------------------------------------
    subgraph AI_Infra ["6. AI Infrastructure Layer"]
        AIGW[AI Model Gateway]
        PR[Prompt Registry]
        FS[Feature Store]
        Fairway <--> AIGW
        Aegis <--> AIGW
        DocID <--> AIGW
        AIGW <--> PR
        TPA_Pred <--> FS
    end

    %% ----------------------------------------------------
    %% KNOWLEDGE & CONFIGURATION
    %% ----------------------------------------------------
    subgraph Knowledge ["7. Knowledge & Config Layer"]
        AKS[Aivana Knowledge Studio]
        PKG[Policy Knowledge Graph]
        HCS[Hospital Configuration Service]
        Admin --> AKS
        AKS --> PKG
        AKS --> HCS
        PKG -.-> |Rules| Taiga
        PKG -.-> |Rules| Fairway
        HCS -.-> |Overrides| MCO
    end

    %% ----------------------------------------------------
    %% TESTING & COLLABORATION
    %% ----------------------------------------------------
    subgraph CollabTest ["8. Collaboration & QA"]
        NCS[Notification & Collab Service]
        Explain[Explainability Service]
        Replay[Digital Twin Replay Engine]
        Sim[Universal Rule Simulation]
        MCO <--> NCS
        MCO <--> Explain
        AKS --> Replay
        AKS --> Sim
    end

    %% ----------------------------------------------------
    %% ANALYTICS
    %% ----------------------------------------------------
    subgraph Analytics ["9. Analytics & Observability"]
        Kafka[(Enterprise Event Bus)]
        Clickhouse[(Analytics Data Warehouse)]
        Dashboards[Executive Dashboards]
        Kafka --> Clickhouse
        Clickhouse --> Dashboards
        Dashboards --> Executive
    end
    
    %% Implicit Kafka Bus Connection
    MCO -.- Kafka
    Hub -.- Kafka
    FCP -.- Kafka
    DAS -.- Kafka
```

## How to Read This Diagram
1. **Ingestion (Top Left)**: Hospital data enters via the `Integration Hub` and flows through `Docling` to extract raw text and bounding boxes.
2. **Orchestration (Center)**: The `Master Claim Orchestrator (MCO)` acts as the central brain. It passes the raw data to `TPR` (to consolidate facts) and `EGS` (to anchor facts to PDFs).
3. **Reasoning (Center Right)**: MCO invokes `Fairway` (Clinical) and `Taiga` (Financial) in parallel to evaluate the claim against policies. It then builds the `FCP` and sends it outbound.
4. **AI Guardrails (Bottom Center)**: Whenever `Fairway` or `Aegis` needs an LLM, they must route through the `AI Gateway`, which controls costs, checks hallucination, and applies the `Prompt Registry`.
5. **Knowledge Management (Bottom Right)**: Humans (Medical Coders) author rules in `AKS`, test them in the `Replay Engine`, and deploy them to the `Policy Knowledge Graph`, which `Taiga` consumes in real-time.
6. **Data Exhaust (Bottom Left)**: Every state change emits an event to `Kafka`, pouring into `ClickHouse` for real-time Executive Analytics.
