import pmjayPackagesStatic from '../data/pmjayPackages.json';

export interface PMJAYPackage {
    icdPrefix: string;
    packageCode: string;
    packageName: string;
    rate: number;
}

export function getPMJAYPackagesList(): PMJAYPackage[] {
    try {
        const stored = localStorage.getItem('aivana_pmjay_packages');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && Array.isArray(parsed.packages)) {
                return parsed.packages;
            } else if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed to load pmjay packages from localStorage', e);
    }
    return pmjayPackagesStatic.packages;
}

export function savePMJAYPackagesList(packages: PMJAYPackage[]) {
    localStorage.setItem('aivana_pmjay_packages', JSON.stringify({ packages }));
}

export function isPMJAYBeneficiary(insurerName: string): boolean {
    if (!insurerName) return false;
    const lower = insurerName.toLowerCase();
    return lower.includes('pm-jay') || lower.includes('pmjay') || lower.includes('ayushman') || lower.includes('ab-pmjay');
}

export function getPMJAYPackageRate(icdCode: string): PMJAYPackage | null {
    if (!icdCode) return null;
    const cleanCode = icdCode.trim().toUpperCase();
    
    const packages = getPMJAYPackagesList();
    // Exact match or prefix match
    for (const pkg of packages) {
        if (cleanCode.startsWith(pkg.icdPrefix)) {
            return pkg;
        }
    }
    return null;
}
