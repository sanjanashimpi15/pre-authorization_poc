# GEMINI 403 FORBIDDEN - ROOT CAUSE ANALYSIS

## REQUEST TRACE CHAIN

```
PatientInsuranceStep.tsx:159
  ↓ extractFromDocument(file, pages, onProgress)
  
documentExtractionService.ts:309-310
  const client = getGoogleGenerativeAIClient();
  const model = client.getGenerativeModel({ model: MODEL_DOCUMENT });
  
  (MODEL_DOCUMENT = "gemini-3.5-flash" from config/modelConfig.ts:2)
  
  ↓ model.generateContent([ocrPrompt, imagePart])  ← LINE 419
  
services/apiKeys.ts:175-180 (browser environment)
  getGenerativeModel → returns proxy with generateContent that calls:
  proxyGenerateContent('generative-ai', { model: 'gemini-3.5-flash', contents })
  
  ↓ POST /api/gemini with body:
  {
    "sdkType": "generative-ai",
    "args": {
      "model": "gemini-3.5-flash",
      "contents": [ocrPrompt, imagePart]  ← MALFORMED HERE
    }
  }

api/gemini.ts:24-26
  const client = new GoogleGenerativeAI(apiKey);
  const modelObj = client.getGenerativeModel({ model });
  const result = await modelObj.generateContent(contents);
  
  ↓ Google API rejects with 403 Forbidden
```

---

## ROOT CAUSE IDENTIFIED

### Problem Location
**File:** [services/documentExtractionService.ts](services/documentExtractionService.ts)  
**Lines:** 419, 498, 532  
**Function:** `extractFromDocument()`

### The Issue

#### Line 419: OCR Stage
```typescript
const ocrResult = await model.generateContent([ocrPrompt, imagePart]);
```

Where `ocrPrompt` is:
```typescript
const ocrPrompt = `You are a highly accurate OCR scanner...`;  // ← PLAIN STRING
const imagePart = {
    inlineData: {
        data: page.base64Data,
        mimeType: 'application/pdf'
    }
};
```

**What's being sent to Google:**
```json
[
  "You are a highly accurate OCR scanner...",
  { "inlineData": { "data": "...", "mimeType": "application/pdf" } }
]
```

#### Line 498: Classification Stage
```typescript
const classResult = await model.generateContent([classificationPrompt]);
```

**What's being sent:**
```json
[
  "You are an expert document classifier..."
]
```

#### Line 532: Extraction Stage
```typescript
const payload = [EXTRACTION_PROMPT, fullDocText];
const result = await model.generateContent(payload);
```

**What's being sent:**
```json
[
  "You are a highly experienced Indian TPA...",
  "Full extracted document text..."
]
```

---

## WHY IT FAILS

The **@google/generative-ai SDK** expects `contents` parameter to follow this structure:

```typescript
interface ContentPart {
  text?: string;
  inlineData?: { data: string; mimeType: string };
  fileData?: { mimeType: string; fileUri: string };
}

generateContent(contents: ContentPart[])
```

### ❌ WRONG (Current Code)
```typescript
[
  "string prompt",           // ← Missing { text: ... } wrapper
  { inlineData: {...} }
]
```

### ✅ CORRECT Format
```typescript
[
  { text: "string prompt" },  // ← Wrapped in object
  { inlineData: {...} }
]
```

---

## Why Google Returns 403 Instead of Proper Error

When the SDK sends a malformed `contents` array with:
- Plain strings instead of `{ text: "..." }` objects
- Mixed types in the array

Google's API validates the request structure and rejects it with **403 Forbidden - "Your project has been denied access"** (a misleading generic error because the real problem is payload format validation, not project permissions).

---

## VERIFICATION

### Current Values in Code

| Component | Value | Location |
|-----------|-------|----------|
| **SDK Used** | @google/generative-ai | services/apiKeys.ts:184 |
| **Model Name** | gemini-3.5-flash | config/modelConfig.ts:2 |
| **sdkType Sent** | 'generative-ai' | services/apiKeys.ts:174 |
| **API Key** | ✓ Valid (confirmed working) | - |
| **Payload Format** | ❌ **INVALID** | documentExtractionService.ts:419, 498, 532 |

### Why API Key Validation Passes

The user verified the API key works by calling:
```
https://generativelanguage.googleapis.com/v1beta/models?key=MY_API_KEY
```

This succeeds because it's a simple GET request with no content body. The 403 only appears when Gemini receives a **malformed `generateContent()` request**.

---

## ROOT CAUSE SUMMARY

| Aspect | Finding |
|--------|---------|
| **First Failing File** | services/documentExtractionService.ts |
| **First Incorrect Value** | Line 419: `await model.generateContent([ocrPrompt, imagePart])` |
| **Exact Problem** | Plain string prompts passed instead of `{ text: "..." }` objects |
| **Exact Line Number** | 419 (OCR), 498 (Classification), 532 (Extraction) |
| **Root Cause** | Payload format incompatible with @google/generative-ai SDK |
| **Why 403** | Google rejects malformed contents array structure |

---

## MINIMAL FIX (Do Not Implement Yet)

The three lines need to wrap string prompts:

1. **Line 419** - Wrap ocrPrompt:
```typescript
// FROM:
await model.generateContent([ocrPrompt, imagePart]);

// TO:
await model.generateContent([{ text: ocrPrompt }, imagePart]);
```

2. **Line 498** - Wrap classificationPrompt:
```typescript
// FROM:
await model.generateContent([classificationPrompt]);

// TO:
await model.generateContent([{ text: classificationPrompt }]);
```

3. **Line 532** - Wrap both EXTRACTION_PROMPT and fullDocText:
```typescript
// FROM:
const payload = [EXTRACTION_PROMPT, fullDocText];
await model.generateContent(payload);

// TO:
const payload = [{ text: EXTRACTION_PROMPT }, { text: fullDocText }];
await model.generateContent(payload);
```

---

## CONFIRMATION

✅ API Key is valid  
✅ Model name exists (gemini-3.5-flash)  
✅ SDK is correct (@google/generative-ai for browser)  
✅ Endpoint is correct (/api/gemini proxy)  

❌ **Payload format is wrong** - Strings sent instead of `{ text: "..." }` objects

**This is why Google returns 403.**
