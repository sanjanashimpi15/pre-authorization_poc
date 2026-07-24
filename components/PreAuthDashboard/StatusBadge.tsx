import React from 'react';
import { PreAuthRecord, PreAuthStatus } from '../../components/PreAuthWizard/types';

interface StatusBadgeProps {
    status: PreAuthStatus;
    className?: string;
}

const STATUS_CONFIG: Record<PreAuthStatus, { label: string; color: string; icon: string }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: '📝' },
    pending_documents: { label: 'Pending Docs', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: '📎' },
    ready_to_submit: { label: 'Ready', color: 'bg-sky-50 text-sky-700 border-sky-200', icon: '✅' },
    submitted: { label: 'Submitted', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: '⏳' },
    query_raised: { label: 'Query Raised', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: '❓' },
    query_received: { label: 'Query Received', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: '📨' },
    approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '✅' },
    denied: { label: 'Denied', color: 'bg-red-50 text-red-700 border-red-200', icon: '❌' },
    appeal_drafted: { label: 'Appeal Drafted', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: '⚖️' },
    enhancement_requested: { label: 'Enhancement', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: '📈' },
    closed: { label: 'Closed', color: 'bg-gray-200 text-gray-700 border-gray-300', icon: '🔒' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color} ${className}`}>
            <span>{cfg.icon}</span>
            {cfg.label}
        </span>
    );
};

export { STATUS_CONFIG };
