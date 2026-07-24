
export const MTP_PROTOCOL_JSON = {
  "protocol": {
    "protocol_id": "GEN-SEPSIS-001",
    "title": "General Adult Sepsis Protocol (Sepsis-3)",
    "version": "3.0.0",
    "date_effective": "2025-01-01",
    "last_reviewed": "2025-06-01",
    "authors": ["Dr. [Name] (Critical Care)", "Dr. [Name] (Infectious Disease)"],
    "jurisdiction": "International / General Hospital",
    "description": "Emergency management guide for the recognition and resuscitation of sepsis and septic shock.",
    "activation_criteria": [
      "Suspected infection AND qSOFA score ≥ 2",
      "Acute organ dysfunction not explained by other causes",
      "Hypotension (SBP < 90 mmHg) or Lactate > 2 mmol/L"
    ],
    "hour_one_bundle": {
      "actions": [
        {"action": "Measure Lactate Level", "details": "Remeasure if > 2 mmol/L"},
        {"action": "Obtain Blood Cultures", "details": "Prior to antibiotics"},
        {"action": "Administer Antibiotics", "details": "Broad-spectrum, IV"},
        {"action": "Administer Fluid Bolus", "details": "30mL/kg crystalloid for hypotension or lactate >= 4"},
        {"action": "Vasopressors", "details": "If hypotension persists during/after fluid resuscitation (Target MAP >= 65)"}
      ]
    },
    "antibiotic_recommendations": {
      "unknown_source": "Piperacillin-Tazobactam + Vancomycin",
      "abdominal_source": "Piperacillin-Tazobactam or Meropenem",
      "urinary_source": "Ceftriaxone or Ciprofloxacin (if low resistance)"
    },
    "monitoring": [
        {"param": "MAP", "target": ">= 65 mmHg"},
        {"param": "Urine Output", "target": ">= 0.5 mL/kg/hr"},
        {"param": "Lactate", "target": "Normalize"}
    ],
    "provenance": [
      {"source":"Surviving Sepsis Campaign Guidelines 2021","date":"2025-01-01","confidence":"high"}
    ],
    "notes":"Adjust antibiotics based on local antibiogram."
  },
  "test_cases": [
    {
      "id":"SEPSIS-TC-001",
      "scenario":"Septic Shock Presentation",
      "input_text":"55M with fever, BP 80/50, HR 120, Lactate 5. Suspected pneumonia.",
      "expected_output":{
        "actions":[
          "Activate Sepsis Protocol",
          "Fluid Bolus 30mL/kg",
          "Blood Cultures",
          "Start Broad Spectrum Antibiotics (e.g., Pip-Tazo + Vanco)",
          "Prepare Norepinephrine if MAP < 65 after fluids"
        ]
      }
    }
  ]
}