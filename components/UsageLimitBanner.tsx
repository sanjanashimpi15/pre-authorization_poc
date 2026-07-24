import React from 'react';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../contexts/AuthContext';

export const UsageLimitBanner: React.FC = () => {
    const { usage, subscription, canCreateCase } = useSubscription();
    const { user } = useAuth();

    // Don't show banner if user is not logged in
    if (!user || !usage || usage.isUnlimited) return null;

    const usagePercentage = usage.limit ? (usage.used / usage.limit) * 100 : 0;
    const isNearLimit = usagePercentage >= 80;
    const isAtLimit = !canCreateCase();

    if (isAtLimit) {
        return (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-red-800 mb-1">
                            Daily Limit Reached
                        </h3>
                        <p className="text-sm text-red-700 mb-2">
                            You've used all {usage.limit} free cases for today. Upgrade to continue without limits.
                        </p>
                        <button
                            onClick={() => window.location.href = 'https://aivanahealth.com#pricing'}
                            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                        >
                            <TrendingUp className="w-4 h-4" />
                            Upgrade to Clinic Plan
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isNearLimit) {
        return (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0" />
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-yellow-800 mb-1">
                            Approaching Daily Limit
                        </h3>
                        <p className="text-sm text-yellow-700">
                            {usage.used} of {usage.limit} free cases used today. {usage.remaining} remaining.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 mb-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                    <div className="text-sm text-blue-700">
                        <span className="font-semibold">{usage.used}/{usage.limit}</span> cases used today
                    </div>
                </div>
                <div className="w-32 bg-blue-200 rounded-full h-2">
                    <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${usagePercentage}%` }}
                    />
                </div>
            </div>
        </div>
    );
};
