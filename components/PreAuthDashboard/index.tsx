/**
 * PreAuthDashboard/index.tsx
 *
 * Top-level shell that owns navigation between:
 *   - CaseList:      prioritised queue of all cases
 *   - CaseWorkspace: composed evidence + billing + readiness view for a single case
 *
 * The wizard flow (onNewPreAuth, onOpenPreAuth from App.tsx) is preserved unchanged.
 */

import React, { useState } from 'react';
import { PreAuthRecord } from '../PreAuthWizard/types';
import { CaseList } from './CaseList';
import { CaseWorkspace } from './CaseWorkspace';

interface PreAuthDashboardProps {
    onNewPreAuth: () => void;
    /** Called when the user wants to re-open the wizard for an existing record */
    onOpenPreAuth: (record: PreAuthRecord) => void;
    onSettings: () => void;
}

type DashView = { kind: 'list' } | { kind: 'workspace'; record: PreAuthRecord };

export const PreAuthDashboard: React.FC<PreAuthDashboardProps> = ({
    onNewPreAuth,
    onOpenPreAuth,
    onSettings,
}) => {
    const [view, setView] = useState<DashView>({ kind: 'list' });

    const openWorkspace = (record: PreAuthRecord) => {
        setView({ kind: 'workspace', record });
    };

    const backToList = () => {
        setView({ kind: 'list' });
    };

    if (view.kind === 'workspace') {
        return (
            <CaseWorkspace
                record={view.record}
                onBack={backToList}
            />
        );
    }

    return (
        <CaseList
            onNewPreAuth={onNewPreAuth}
            onOpenCase={openWorkspace}
            onSettings={onSettings}
        />
    );
};
