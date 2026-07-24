import React from 'react';
import { PreAuthWizard } from './PreAuthWizard';

export const PreAuthShell: React.FC = () => {
    // Thin wrapper rendering PreAuthWizard directly
    return (
        <div className="w-full h-full bg-opd-bg">
            <PreAuthWizard onClose={() => console.log('POC Shell Close')} />
        </div>
    );
};

export default PreAuthShell;
