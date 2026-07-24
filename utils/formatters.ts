export const formatCurrency = (amount: number): string =>
    `₹${amount.toLocaleString('en-IN')}`;

export const formatDate = (isoOrLocale: string): string => {
    if (!isoOrLocale) return '';
    try {
        return new Date(isoOrLocale).toLocaleDateString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    } catch { return isoOrLocale; }
};

export const formatDateTime = (isoString: string): string => {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return isoString; }
};

export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const calculateAge = (dob: string): number => {
    if (!dob) return 0;
    const born = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - born.getFullYear();
    const m = today.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
    return age;
};

export const isPolicyActive = (endDate: string): boolean => {
    if (!endDate) return false;
    return new Date(endDate) >= new Date();
};

export const isPolicyExpiringSoon = (endDate: string, days = 7): boolean => {
    if (!endDate) return false;
    const end = new Date(endDate);
    const soon = new Date();
    soon.setDate(soon.getDate() + days);
    return end >= new Date() && end <= soon;
};

export const todayISO = (): string => new Date().toISOString().split('T')[0];

export const nowTimeString = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};
