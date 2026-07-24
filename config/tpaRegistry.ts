export interface TPAInfo {
    name: string;
    shortName: string;
    website?: string;
    portalUrl?: string;
    typicalResponseHoursEmergency: string;
    typicalResponseHoursPlanned: string;
}

export const TPA_REGISTRY: TPAInfo[] = [
    { name: 'MDIndia Health Insurance TPA', shortName: 'MDIndia', typicalResponseHoursEmergency: '2-4 hrs', typicalResponseHoursPlanned: '4-6 hrs' },
    { name: 'MediAssist India TPA', shortName: 'MediAssist', typicalResponseHoursEmergency: '2-4 hrs', typicalResponseHoursPlanned: '4-8 hrs' },
    { name: 'Raksha Health TPA', shortName: 'Raksha', typicalResponseHoursEmergency: '3-5 hrs', typicalResponseHoursPlanned: '6-12 hrs' },
    { name: 'HealthIndia TPA Services', shortName: 'HealthIndia', typicalResponseHoursEmergency: '2-4 hrs', typicalResponseHoursPlanned: '6-8 hrs' },
    { name: 'Paramount Health Services TPA', shortName: 'Paramount', typicalResponseHoursEmergency: '3-5 hrs', typicalResponseHoursPlanned: '4-6 hrs' },
    { name: 'Vidal Health TPA', shortName: 'Vidal', typicalResponseHoursEmergency: '2-4 hrs', typicalResponseHoursPlanned: '4-6 hrs' },
    { name: 'FHPL Faber Healthcare TPA', shortName: 'FHPL', typicalResponseHoursEmergency: '4-6 hrs', typicalResponseHoursPlanned: '8-12 hrs' },
    { name: 'Good Health TPA', shortName: 'GoodHealth', typicalResponseHoursEmergency: '4-6 hrs', typicalResponseHoursPlanned: '8-12 hrs' },
    { name: 'Heritage Health TPA', shortName: 'Heritage', typicalResponseHoursEmergency: '4-6 hrs', typicalResponseHoursPlanned: '8-12 hrs' },
    { name: 'Other / Direct Insurer', shortName: 'Other', typicalResponseHoursEmergency: 'Varies', typicalResponseHoursPlanned: 'Varies' },
];

export const TPA_NAMES = TPA_REGISTRY.map(t => t.shortName);

export const INSURER_LIST = [
    'Star Health and Allied Insurance',
    'HDFC ERGO Health Insurance',
    'Niva Bupa Health Insurance',
    'Care Health Insurance',
    'Bajaj Allianz General Insurance',
    'ICICI Lombard General Insurance',
    'Tata AIG General Insurance',
    'SBI General Insurance',
    'New India Assurance',
    'National Insurance Company',
    'Oriental Insurance Company',
    'United India Insurance',
    'Reliance General Insurance',
    'Aditya Birla Health Insurance',
    'Manipal Cigna Health Insurance',
    'ManipalCigna Health Insurance',
    'Other',
];

export const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
    'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
    'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh',
];
