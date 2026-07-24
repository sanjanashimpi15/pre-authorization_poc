/**
 * Detects if the conversation transcript indicates an admission decision
 */
export const detectAdmissionIntent = (transcript: string): {
    detected: boolean;
    confidence: 'high' | 'medium' | 'low';
    triggerPhrase?: string;
} => {
    const lowerTranscript = transcript.toLowerCase();

    // High confidence triggers
    const highConfidencePhrases = [
        'admit the patient',
        'need to admit',
        'admission required',
        'will need admission',
        'admitting to',
        'admitting for',
        'needs hospitalization',
        'requires hospitalization',
        'admit kar do',       // Hindi
        'admit karna hoga',   // Hindi
        'bharthi karo',       // Hindi
    ];

    for (const phrase of highConfidencePhrases) {
        if (lowerTranscript.includes(phrase)) {
            return { detected: true, confidence: 'high', triggerPhrase: phrase };
        }
    }

    // Medium confidence triggers
    const mediumConfidencePhrases = [
        'need to keep you',
        'stay in hospital',
        'observation required',
        'cannot go home',
        'needs monitoring',
        'icu admission',
        'ward admission',
    ];

    for (const phrase of mediumConfidencePhrases) {
        if (lowerTranscript.includes(phrase)) {
            return { detected: true, confidence: 'medium', triggerPhrase: phrase };
        }
    }

    return { detected: false, confidence: 'low' };
};

/**
 * Extracts test result mentions from transcript for voice-captured findings
 */
export const extractTestMentions = (transcript: string): Array<{
    testName: string;
    rawMention: string;
    possibleResult?: string;
}> => {
    const tests = [
        { pattern: /x-?ray|chest\s+x-?ray|cxr/gi, name: 'Chest X-Ray' },
        { pattern: /cbc|complete\s+blood\s+count|blood\s+count/gi, name: 'CBC' },
        { pattern: /abg|arterial\s+blood\s+gas/gi, name: 'ABG' },
        { pattern: /ecg|ekg|electrocardiogram/gi, name: 'ECG' },
        { pattern: /hemoglobin|hb\s+is|haemoglobin/gi, name: 'Hemoglobin' },
        { pattern: /creatinine/gi, name: 'Creatinine' },
        { pattern: /ct\s+scan|ct-scan/gi, name: 'CT Scan' },
        { pattern: /ultrasound|usg|sonography/gi, name: 'Ultrasound' },
        { pattern: /covid|rtpcr|rapid\s+antigen/gi, name: 'COVID-19 Test' },
    ];

    const results: Array<{ testName: string; rawMention: string; possibleResult?: string }> = [];

    for (const test of tests) {
        const matches = transcript.match(test.pattern);
        if (matches) {
            // Try to extract surrounding context (30 chars before and after)
            const index = transcript.toLowerCase().search(test.pattern);
            const start = Math.max(0, index - 30);
            const end = Math.min(transcript.length, index + 50);
            const context = transcript.substring(start, end);

            results.push({
                testName: test.name,
                rawMention: context,
                possibleResult: undefined, // Would need NLP to extract actual result
            });
        }
    }

    return results;
};
