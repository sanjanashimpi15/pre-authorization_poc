export interface PolicyRuleConfig {
    insurerName: string;
    wardCapPercent: number; // e.g. 0.01 for 1%
    icuCapPercent: number;  // e.g. 0.02 for 2%
    coPayPercent: number;   // e.g. 0.1 for 10%
    waitingPeriodMonths: number; // e.g. 24 or 36
}

const DEFAULT_CONFIGS: PolicyRuleConfig[] = [
    { insurerName: 'Star Health and Allied Insurance Co Ltd', wardCapPercent: 0.01, icuCapPercent: 0.02, coPayPercent: 0, waitingPeriodMonths: 24 },
    { insurerName: 'Care Health Insurance', wardCapPercent: 0.01, icuCapPercent: 0.02, coPayPercent: 0.1, waitingPeriodMonths: 36 },
    { insurerName: 'HDFC ERGO General Insurance Co Ltd', wardCapPercent: 0.01, icuCapPercent: 0.02, coPayPercent: 0, waitingPeriodMonths: 24 },
    { insurerName: 'Niva Bupa Health Insurance', wardCapPercent: 0.01, icuCapPercent: 0.02, coPayPercent: 0, waitingPeriodMonths: 24 },
    { insurerName: 'Reliance General Insurance', wardCapPercent: 0.01, icuCapPercent: 0.02, coPayPercent: 0.2, waitingPeriodMonths: 48 },
];

export function getInsurerPolicyRules(): PolicyRuleConfig[] {
    try {
        const stored = localStorage.getItem('aivana_insurer_policies');
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Failed to parse insurer policies', e);
    }
    return DEFAULT_CONFIGS;
}

export function saveInsurerPolicyRules(rules: PolicyRuleConfig[]) {
    localStorage.setItem('aivana_insurer_policies', JSON.stringify(rules));
}
