export interface DemoFallbackReasoning {
  challengesConsidered: string[];
  anchors: string[];
  discriminators: Array<{
    challenge: string;
    evidence: string;
    reason: string;
  }>;
}

export const DEMO_FALLBACKS: Record<string, DemoFallbackReasoning> = {
  diabetes: {
    challengesConsidered: [
      "could this be managed as OPD?",
      "could this be a pre-existing condition?",
      "is the stated diagnosis supported by documented findings?"
    ],
    anchors: [
      "Random or fasting blood glucose values (with dates)",
      "HbA1c result to establish glycaemic control level",
      "Documented symptom severity (e.g., dehydration, vomiting, altered sensorium, ketonuria)",
      "Exact onset and duration of the current acute episode",
      "Past prescription / treatment records for diabetes"
    ],
    discriminators: [
      {
        challenge: "could this be managed as OPD?",
        evidence: "Vitals instability, documented inability to maintain oral hydration, or blood glucose persistently above 300 mg/dL despite outpatient-equivalent oral medication",
        reason: "A reviewer would query why inpatient admission is needed rather than an outpatient glucose adjustment visit — documented severity markers establish this justification."
      },
      {
        challenge: "could this be a pre-existing condition?",
        evidence: "Clinical notes or prescriptions showing when diabetes was first diagnosed and what treatment has been ongoing",
        reason: "Without a documented disease timeline, a reviewer would likely query whether this is a known pre-existing condition subject to a policy waiting period."
      },
      {
        challenge: "is the stated diagnosis supported by documented findings?",
        evidence: "Objective lab report with blood glucose or HbA1c confirming hyperglycaemia meeting diagnostic thresholds",
        reason: "The diagnosis of Type 2 Diabetes Mellitus with hyperglycaemia requires documented laboratory values — narrative description alone is insufficient for a TPA reviewer."
      }
    ]
  },
  pneumonia: {
    challengesConsidered: [
      "could this be managed as OPD?",
      "could this be a pre-existing condition?",
      "is the stated diagnosis supported by documented findings?"
    ],
    anchors: [
      "Chest X-ray report confirming infiltrate or consolidation",
      "Documented SpO2 saturation reading on admission",
      "Elevated WBC count or CRP / inflammatory marker result",
      "Temperature recording demonstrating fever on admission"
    ],
    discriminators: [
      {
        challenge: "could this be managed as OPD?",
        evidence: "SpO2 below 94% on room air, or documented respiratory distress / tachypnoea requiring oxygen therapy",
        reason: "A reviewer would query inpatient necessity unless documented hypoxia or respiratory instability justifies continuous monitoring and oxygen — PSI/CURB-65 severity criteria support this."
      },
      {
        challenge: "could this be a pre-existing condition?",
        evidence: "Documented acute onset with symptom duration of less than 7–10 days, with no prior chest hospitalisation record",
        reason: "A reviewer would query whether this represents a chronic or recurrent respiratory condition rather than an acute community-acquired infection."
      },
      {
        challenge: "is the stated diagnosis supported by documented findings?",
        evidence: "Chest X-ray or CT chest report confirming radiological infiltrates consistent with pneumonia",
        reason: "Pneumonia diagnosis requires radiological confirmation; a clinical presentation alone without imaging is routinely queried by reviewers."
      }
    ]
  },
  appendicitis: {
    challengesConsidered: [
      "could this be managed as OPD?",
      "could this be a pre-existing condition?",
      "is the stated diagnosis supported by documented findings?"
    ],
    anchors: [
      "USG abdomen or CT abdomen report confirming non-compressible appendix (diameter > 6 mm)",
      "Elevated WBC count on admission",
      "Documented fever and RLQ tenderness on examination",
      "Surgeon's note documenting indication for appendicectomy"
    ],
    // Intentionally near-empty: a well-documented acute appendicitis note satisfies nearly all
    // reviewer challenges. This models the Metacognitive Loop self-check — if the note already
    // answers the challenge, do NOT raise the query (sufficient case behaviour).
    discriminators: [
      {
        challenge: "is the stated diagnosis supported by documented findings?",
        evidence: "Imaging report (USG/CT) confirming acute appendicitis with periappendiceal inflammation or fluid",
        reason: "Radiological or sonographic confirmation is the standard anchor for acute appendicitis — if already documented in the note, this challenge is resolved."
      }
    ]
  }
};

