import { PatientCaseRecord, mapCaseToPreAuth } from './masterPatientRecord';
import { computeReadiness } from '../utils/readinessScore';
import { checkMandatoryGaps } from '../config/mandatoryItems';
import { getRequiredDocuments } from '../utils/documentRequirements';
import { getInsurerPolicyRules } from './policyConfigService';

export interface SimulatedDecision {
  outcome: 'approved' | 'partial_approved' | 'query' | 'denied';
  approvedAmount?: number;
  deductionReason?: string;
  queryDetails?: string;
  denialReason?: string;
}

export function simulateInsurerDecision(
  record: PatientCaseRecord,
  requestType: 'initial' | 'enhancement',
  requestedAmount: number
): SimulatedDecision {
  const preAuth = mapCaseToPreAuth(record);
  
  // 1. Mandatory Document & Administrative Gaps Check
  const readiness = computeReadiness(preAuth, preAuth.tpaEvidenceReview ?? null);
  const adminGaps = checkMandatoryGaps(preAuth);
  
  // Collect all distinct missing requirements
  const missingItemsList: string[] = [];
  
  // Check readiness missing documents
  if (readiness.missingItems && readiness.missingItems.length > 0) {
    readiness.missingItems.forEach(item => {
      if (item.text.toLowerCase().includes('missing file') || item.text.toLowerCase().includes('required')) {
        missingItemsList.push(item.text);
      }
    });
  }
  
  // Check admin gaps
  if (adminGaps && adminGaps.length > 0) {
    adminGaps.forEach(gap => {
      missingItemsList.push(gap);
    });
  }

  // If any critical documents or signatures/seals are missing, raise a TPA query
  if (missingItemsList.length > 0) {
    return {
      outcome: 'query',
      queryDetails: `Claim Query raised: Mandatory document/information missing: ${missingItemsList[0]}. Please upload the requested file or provide details to proceed.`
    };
  }

  // 2. Room Rent Capping Rules
  const sumInsured = record.insuranceDetails.sumInsured || 500000;
  const insurerName = record.insuranceDetails.insurer || '';
  
  // Resolve rule from config
  const policyRules = getInsurerPolicyRules();
  const matchedRule = policyRules.find(r => insurerName.toLowerCase().includes(r.insurerName.toLowerCase())) || 
                      { wardCapPercent: 0.01, icuCapPercent: 0.02 };
                      
  const normalCap = sumInsured * matchedRule.wardCapPercent;
  const icuCap = sumInsured * matchedRule.icuCapPercent;
  
  // Get room category
  const wardType = record.encounters[0]?.wardType || preAuth.admission?.roomCategory || 'General Ward';
  const capPerDay = ['icu', 'iccu', 'nicu', 'hdu'].some(w => wardType.toLowerCase().includes(w)) ? icuCap : normalCap;
  
  // Check actual rent rate. If missing in cost estimate, deduce from room category defaults
  let actualRent = preAuth.costEstimate?.roomRentPerDay || 0;
  if (actualRent === 0) {
    if (wardType.toLowerCase().includes('deluxe') || wardType.toLowerCase().includes('private')) {
      actualRent = sumInsured * 0.02; // e.g. 10,000 for 5L policy, exceeding 1% cap
    } else {
      actualRent = capPerDay;
    }
  }

  // Package treatments like LSCS or Cataract are exempt from room rent caps
  const dxText = (record.encounters[0]?.diagnosis || '').toLowerCase();
  const isPackageExempt = dxText.includes('lscs') || dxText.includes('delivery') || dxText.includes('cataract') || dxText.includes('phaco');

  if (actualRent > capPerDay && !isPackageExempt) {
    const stayDays = preAuth.admission?.expectedLengthOfStay || record.encounters[0]?.icuDays || 3;
    const roomRentDeduction = (actualRent - capPerDay) * stayDays;
    
    // Proportional deduction applied to associated charges (doctor, nursing, investigations)
    const implantCost = preAuth.costEstimate?.totalImplantsCost || 0;
    const medicineCost = preAuth.costEstimate?.medicinesEstimate || 0;
    const totalRentCharged = actualRent * stayDays;
    
    const nonAssociatedCharges = totalRentCharged + implantCost + medicineCost;
    const associatedCharges = Math.max(0, requestedAmount - nonAssociatedCharges);
    const proportionalDeduction = Math.round(associatedCharges * (1 - capPerDay / actualRent));
    
    const totalDeduction = roomRentDeduction + proportionalDeduction;
    const approvedAmount = Math.max(0, requestedAmount - totalDeduction);

    // Downgrade rules for Enhancement
    if (requestType === 'enhancement') {
      // In enhancement, if rent capping is violated and requested amount > 50% of original approved
      const originalApproved = record.authorizations[0]?.approvedAmount || 0;
      if (requestedAmount > originalApproved * 0.5) {
        return {
          outcome: 'query',
          queryDetails: `Clinical Audit Query: Stay extension room rate exceeds eligible cap and requested amount is above 50% threshold. Submit peer-to-peer justification sheet.`
        };
      }
    }

    return {
      outcome: 'partial_approved',
      approvedAmount,
      deductionReason: `Room Rent Cap Exceeded: Billed room rent of ₹${actualRent}/day exceeds standard cap of ₹${capPerDay}/day (1% of Sum Insured). Proportional deduction of ₹${proportionalDeduction} applied across associated medical charges.`
    };
  }

  // 3. Enhancement Scrutiny Check
  if (requestType === 'enhancement') {
    const originalApproved = record.authorizations[0]?.approvedAmount || 0;
    if (requestedAmount > originalApproved * 0.5) {
      // Downgrade: approved -> partial_approved
      const approvedAmount = Math.round(requestedAmount * 0.75); // Approved at 75% limit
      return {
        outcome: 'partial_approved',
        approvedAmount,
        deductionReason: `Enhancement Request Scrutiny: Additional request amount ₹${requestedAmount} exceeds 50% threshold of original approval (₹${originalApproved}). Clinical justification for extension is under audit, capped at 75%.`
      };
    }
  }

  // 4. Default Clean Approval
  return {
    outcome: 'approved',
    approvedAmount: requestedAmount
  };
}
