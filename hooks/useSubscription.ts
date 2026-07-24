import { useState, useEffect } from 'react';
import { subscriptionAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface Subscription {
    id: string;
    plan_name: string;
    display_name: string;
    price_inr: string;
    daily_case_limit: number | null;
    status: string;
}

interface UsageData {
    limit: number | null;
    used: number;
    remaining: number | null;
    isUnlimited: boolean;
}

export const useSubscription = () => {
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user, token } = useAuth();

    const fetchSubscription = async () => {
        // Only fetch if user is logged in
        if (!user || !token) {
            return;
        }

        try {
            const response = await subscriptionAPI.getCurrent();
            setSubscription(response.data.subscription);
        } catch (err: any) {
            console.error('Failed to fetch subscription:', err);
            setError(err.response?.data?.error || 'Failed to fetch subscription');
        }
    };

    const fetchUsage = async () => {
        // Only fetch if user is logged in
        if (!user || !token) {
            return;
        }

        try {
            const response = await subscriptionAPI.getUsage();
            setUsage(response.data);
        } catch (err: any) {
            console.error('Failed to fetch usage:', err);
            setError(err.response?.data?.error || 'Failed to fetch usage');
        }
    };

    const refreshData = async () => {
        // Only refresh if user is logged in
        if (!user || !token) {
            setLoading(false);
            return;
        }

        setLoading(true);
        await Promise.all([fetchSubscription(), fetchUsage()]);
        setLoading(false);
    };

    useEffect(() => {
        refreshData();
    }, [user, token]);

    const canCreateCase = () => {
        if (!usage) return true; // Allow if no usage data (not logged in)
        if (usage.isUnlimited) return true;
        if (usage.limit === null) return true;
        return (usage.remaining ?? 0) > 0;
    };

    const getLimitMessage = () => {
        if (!usage) return '';
        if (usage.isUnlimited) return 'Unlimited cases';
        return `${usage.used}/${usage.limit} cases used today`;
    };

    return {
        subscription,
        usage,
        loading,
        error,
        canCreateCase,
        getLimitMessage,
        refreshData
    };
};
