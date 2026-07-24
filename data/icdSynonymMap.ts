/**
 * CLINICAL MAPPING WARNING:
 * These are clinical mappings that MUST be human-verified before production.
 * This synonym map bridges standard Indian physician terminology, local abbreviations,
 * and colloquial Hinglish/Hindi terms to target WHO ICD-10 codes.
 */

export interface IcdSynonym {
  term: string;
  code: string;
  note: string;
}

export const ICD_SYNONYM_MAP: IcdSynonym[] = [
  // Cardiovascular & Stroke
  { term: "mi", code: "I21.9", note: "Myocardial infarction, acute unspecified" },
  { term: "heart attack", code: "I21.9", note: "Myocardial infarction, acute unspecified" },
  { term: "dil ka daura", code: "I21.9", note: "Myocardial infarction, acute unspecified" },
  { term: "stemi", code: "I21.3", note: "ST elevation myocardial infarction of unspecified site" },
  { term: "nstemi", code: "I21.4", note: "Non-ST elevation myocardial infarction" },
  { term: "htn", code: "I10", note: "Essential (primary) hypertension" },
  { term: "high bp", code: "I10", note: "Essential (primary) hypertension" },
  { term: "bp", code: "I10", note: "Essential (primary) hypertension" },
  { term: "high blood pressure", code: "I10", note: "Essential (primary) hypertension" },
  { term: "raktchap", code: "I10", note: "Essential (primary) hypertension" },
  { term: "cad", code: "I25.1", note: "Atherosclerotic heart disease" },
  { term: "heart blockage", code: "I25.1", note: "Atherosclerotic heart disease" },
  { term: "chf", code: "I50.9", note: "Heart failure, unspecified" },
  { term: "heart failure", code: "I50.9", note: "Heart failure, unspecified" },
  { term: "angina", code: "I20.9", note: "Angina pectoris, unspecified" },
  { term: "chest pain", code: "R07.9", note: "Chest pain, unspecified" },
  { term: "cva", code: "I63.9", note: "Cerebral infarction (Stroke)" },
  { term: "stroke", code: "I63.9", note: "Cerebral infarction (Stroke)" },
  { term: "brain attack", code: "I63.9", note: "Cerebral infarction (Stroke)" },
  { term: "falij", code: "I63.9", note: "Cerebral infarction (Stroke)" },
  { term: "tia", code: "G45.9", note: "Transient cerebral ischemic attack, unspecified" },
  { term: "mini stroke", code: "G45.9", note: "Transient cerebral ischemic attack, unspecified" },

  // Respiratory
  { term: "cap", code: "J18.9", note: "Community acquired pneumonia" },
  { term: "pneumonia", code: "J18.9", note: "Pneumonia, unspecified organism" },
  { term: "lungs infection", code: "J18.9", note: "Pneumonia, unspecified organism" },
  { term: "fefr me infection", code: "J18.9", note: "Pneumonia, unspecified" },
  { term: "copd", code: "J44.9", note: "Chronic obstructive pulmonary disease, unspecified" },
  { term: "asthma", code: "J45.9", note: "Asthma, unspecified [WHO ICD-10]" },
  { term: "dama", code: "J45.9", note: "Asthma, unspecified (Dama)" },
  { term: "saans phoolna", code: "J45.9", note: "Asthma, unspecified (Saans phoolna)" },
  { term: "pleural effusion", code: "J90", note: "Pleural effusion, not elsewhere classified" },
  { term: "fefr me pani", code: "J90", note: "Pleural effusion, not elsewhere classified" },
  { term: "bronchitis", code: "J40", note: "Bronchitis, unspecified" },
  { term: "urti", code: "J06.9", note: "Acute upper respiratory infection, unspecified" },
  { term: "sardi khansi", code: "J06.9", note: "Acute upper respiratory infection, unspecified" },
  { term: "tb", code: "A15.3", note: "Tuberculosis of lung, confirmed by unspecified means [WHO ICD-10]" },
  { term: "tuberculosis", code: "A15.3", note: "Tuberculosis of lung, confirmed by unspecified means" },
  { term: "tapedik", code: "A15.3", note: "Tuberculosis of lung (Tapedik)" },

  // Diabetes & Endocrine
  { term: "dm", code: "E11.9", note: "Type 2 diabetes mellitus without complications" },
  { term: "sugar", code: "E11.9", note: "Type 2 diabetes mellitus (Sugar)" },
  { term: "diabetes", code: "E11.9", note: "Type 2 diabetes mellitus" },
  { term: "madhumeh", code: "E11.9", note: "Type 2 diabetes mellitus" },
  { term: "dka", code: "E11.1", note: "Type 2 diabetes mellitus with ketoacidosis [WHO ICD-10]" },
  { term: "low sugar", code: "E16.2", note: "Hypoglycemia, unspecified" },
  { term: "hypoglycemia", code: "E16.2", note: "Hypoglycemia, unspecified" },
  { term: "thyroid", code: "E03.9", note: "Hypothyroidism, unspecified" },

  // Renal & Urinary
  { term: "aki", code: "N17.9", note: "Acute kidney injury" },
  { term: "kidney failure", code: "N17.9", note: "Acute kidney injury" },
  { term: "gurde ka kam na karna", code: "N17.9", note: "Acute kidney injury" },
  { term: "ckd", code: "N18.9", note: "Chronic kidney disease, unspecified" },
  { term: "uti", code: "N39.0", note: "Urinary tract infection, site not specified" },
  { term: "urine infection", code: "N39.0", note: "Urinary tract infection" },
  { term: "peshab me jalan", code: "N39.0", note: "Urinary tract infection" },
  { term: "kidney stone", code: "N20.0", note: "Calculus of kidney" },
  { term: "pathri", code: "N20.0", note: "Calculus of kidney (Pathri)" },

  // Gastrointestinal
  { term: "diarrhea", code: "A09.9", note: "Gastroenteritis and colitis of unspecified origin" },
  { term: "loose motions", code: "A09.9", note: "Gastroenteritis and colitis (Loose motions)" },
  { term: "dast", code: "A09.9", note: "Gastroenteritis and colitis (Dast)" },
  { term: "pet kharab", code: "A09.9", note: "Gastroenteritis and colitis" },
  { term: "jaundice", code: "R17", note: "Unspecified jaundice" },
  { term: "peeliya", code: "R17", note: "Unspecified jaundice" },
  { term: "acidity", code: "K30", note: "Dyspepsia (Acidity)" },
  { term: "apd", code: "K30", note: "Acid peptic disease" },
  { term: "gas", code: "K30", note: "Dyspepsia" },
  { term: "appendicitis", code: "K37", note: "Unspecified appendicitis" },
  { term: "gallstone", code: "K80.2", note: "Calculus of gallbladder without cholecystitis [WHO ICD-10]" },
  { term: "pitta patthar", code: "K80.2", note: "Calculus of gallbladder without cholecystitis (Pitta patthar)" },
  { term: "gerd", code: "K21.9", note: "Gastro-esophageal reflux disease" },

  // Infections & General
  { term: "dengue", code: "A90", note: "Dengue fever [classical dengue]" },
  { term: "malaria", code: "B54", note: "Unspecified malaria" },
  { term: "thand lagna", code: "B54", note: "Unspecified malaria (Thand lagna)" },
  { term: "typhoid", code: "A01.0", note: "Typhoid fever [WHO ICD-10]" },
  { term: "enteric fever", code: "A01.0", note: "Typhoid / Enteric fever" },
  { term: "miyadi bukhar", code: "A01.0", note: "Typhoid fever (Miyadi bukhar)" },
  { term: "viral fever", code: "A99", note: "Unspecified viral illness" },
  { term: "bukhar", code: "R50.9", note: "Fever, unspecified" },
  { term: "fever", code: "R50.9", note: "Fever, unspecified" },
  { term: "sepsis", code: "A41.9", note: "Sepsis, unspecified organism" },
  { term: "cellulitis", code: "L03.9", note: "Cellulitis, unspecified [WHO ICD-10]" },
  { term: "anemia", code: "D64.9", note: "Anemia, unspecified" },
  { term: "khoon ki kami", code: "D64.9", note: "Anemia, unspecified" },
  { term: "ulti", code: "R11", note: "Nausea with vomiting [WHO ICD-10] (Ulti)" },
  { term: "vomiting", code: "R11", note: "Nausea with vomiting [WHO ICD-10]" },
  { term: "constipation", code: "K59.0", note: "Constipation [WHO ICD-10]" },
  { term: "kabz", code: "K59.0", note: "Constipation (Kabz)" },

  // Injuries
  { term: "fracture", code: "T14.8", note: "Fracture/injury unspecified Body region" },
  { term: "haddi tootna", code: "T14.8", note: "Fracture" },
  { term: "head injury", code: "S09.9", note: "Unspecified injury of head [WHO ICD-10]" },
  { term: "sir me chot", code: "S09.9", note: "Unspecified injury of head (Sir me chot)" },

  // Orthopedics / Osteoarthritis
  { term: "osteoarthritis knee", code: "M17.9", note: "Gonarthrosis, unspecified" },
  { term: "bilateral knee osteoarthritis", code: "M17.0", note: "Primary gonarthrosis, bilateral" },
  { term: "bilateral osteoarthritis knee", code: "M17.0", note: "Primary gonarthrosis, bilateral" },
  { term: "knee osteoarthritis", code: "M17.9", note: "Gonarthrosis, unspecified" },
  { term: "osteoarthritis of knee", code: "M17.9", note: "Gonarthrosis, unspecified" },
  { term: "bilateral primary osteoarthritis knee", code: "M17.0", note: "Primary gonarthrosis, bilateral" },
  { term: "osteoarthritis", code: "M19.9", note: "Osteoarthritis, unspecified" },

  // Maternity, LSCS & Delivery
  { term: "lscs", code: "O82.9", note: "Delivery by Caesarean section, unspecified" },
  { term: "emergency lscs", code: "O82.1", note: "Delivery by emergency Caesarean section" },
  { term: "elective lscs", code: "O82.0", note: "Delivery by elective Caesarean section" },
  { term: "repeat lscs", code: "O82.1", note: "Delivery by emergency Caesarean section (often emergency/previous scar)" },
  { term: "caesarean section", code: "O82.9", note: "Delivery by Caesarean section, unspecified" },
  { term: "cesarean section", code: "O82.9", note: "Delivery by Caesarean section, unspecified" },
  { term: "caesarean", code: "O82.9", note: "Delivery by Caesarean section, unspecified" },
  { term: "cesarean", code: "O82.9", note: "Delivery by Caesarean section, unspecified" },
  { term: "delivery", code: "O80.9", note: "Single spontaneous delivery, unspecified" },
  { term: "maternity", code: "O80.9", note: "Single spontaneous delivery, unspecified" },

  // Gynecology / Fibroids
  { term: "uterine fibroids", code: "D25.9", note: "Leiomyoma of uterus, unspecified" },
  { term: "uterine fibroid", code: "D25.9", note: "Leiomyoma of uterus, unspecified" },
  { term: "fibroid uterus", code: "D25.9", note: "Leiomyoma of uterus, unspecified" },
  { term: "hysterectomy", code: "N85.9", note: "Noninflammatory disorder of uterus, unspecified (Hysterectomy target)" }
];
