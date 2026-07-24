import { useState, useCallback, useRef } from 'react';
import { suggestICD, getConditionByCode, ICDSuggestion, ICDCondition } from '../config/icd10Database';

export interface ICDSuggestionState {
    query: string;
    suggestions: ICDSuggestion[];
    selectedCondition: ICDCondition | null;
    isSearching: boolean;
}

export function useICDSuggestion() {
    const [state, setState] = useState<ICDSuggestionState>({
        query: '',
        suggestions: [],
        selectedCondition: null,
        isSearching: false,
    });

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = useCallback((query: string) => {
        setState(s => ({ ...s, query, isSearching: true }));

        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!query || query.length < 2) {
            setState(s => ({ ...s, suggestions: [], isSearching: false }));
            return;
        }

        debounceRef.current = setTimeout(() => {
            const results = suggestICD(query, 8);
            setState(s => ({ ...s, suggestions: results, isSearching: false }));
        }, 200);
    }, []);

    const selectCondition = useCallback((condition: ICDCondition) => {
        setState(s => ({ ...s, selectedCondition: condition, suggestions: [], query: condition.condition_name }));
    }, []);

    const selectByCode = useCallback((code: string) => {
        const condition = getConditionByCode(code);
        if (condition) setState(s => ({ ...s, selectedCondition: condition, query: condition.condition_name }));
    }, []);

    const clear = useCallback(() => {
        setState({ query: '', suggestions: [], selectedCondition: null, isSearching: false });
    }, []);

    return { ...state, search, selectCondition, selectByCode, clear };
}
