import { SupportedLanguage } from '../../utils/language.js';

export interface DoctorSummaryInput {
  patientName: string;
  relationship: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  mainConcerns: string[];
  recentSymptoms: string[];
  relevantMedicalHistory: string[];
  currentMedications: string[];
  recentAbnormalLabValues: Array<{
    testName: string;
    value: string;
    unit?: string;
    flag?: string;
    date?: string;
  }>;
  importantReports: string[];
  suggestedQuestionsToDiscuss: string[];
}

export class DoctorSummaryService {
  /**
   * Generates a clean, structured doctor-ready clinical briefing.
   */
  public static generateSummary(input: DoctorSummaryInput, _lang: SupportedLanguage = 'en'): string {
    const header = `🩺 *JEEVA AI CLINICAL VISIT BRIEFING*\n_Doctor-Ready Consultation Summary_`;
    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const demoBlock = `*1. Patient Demographics & Profile:*
• Name: ${input.patientName} (${input.relationship})
• Age / Biological Sex: ${input.age ? `${input.age} yrs` : 'Not stated'}, ${input.gender || 'Not stated'}
• Blood Group: ${input.bloodGroup || 'Not recorded'}
• Date Generated: ${dateStr}`;

    const concernsBlock = `*2. Primary Reason For Consultation / Concerns:*
${input.mainConcerns.length > 0 ? input.mainConcerns.map((c) => `• ${c}`).join('\n') : '• General health review and symptom evaluation.'}`;

    const symptomsBlock = `*3. Recent Reported Symptoms & Timeline:*
${input.recentSymptoms.length > 0 ? input.recentSymptoms.map((s) => `• ${s}`).join('\n') : '• None currently reported.'}`;

    const historyBlock = `*4. Known Medical History & Diagnoses:*
${input.relevantMedicalHistory.length > 0 ? input.relevantMedicalHistory.map((h) => `• ${h}`).join('\n') : '• No chronic conditions logged.'}`;

    const medsBlock = `*5. Current Active Medications & Supplements:*
${input.currentMedications.length > 0 ? input.currentMedications.map((m) => `• ${m}`).join('\n') : '• None documented.'}`;

    const labsBlock = `*6. Recent Notable / Abnormal Lab Findings:*
${input.recentAbnormalLabValues.length > 0
  ? input.recentAbnormalLabValues
      .map(
        (l) =>
          `• ${l.testName}: *${l.value} ${l.unit || ''}* [${l.flag || 'ABNORMAL'}]${l.date ? ` (${l.date})` : ''}`
      )
      .join('\n')
  : '• No abnormal lab results recorded.'}`;

    const reportsBlock = `*7. Attached / Referenced Documents:*
${input.importantReports.length > 0 ? input.importantReports.map((r) => `• ${r}`).join('\n') : '• None logged.'}`;

    const questionsBlock = `*8. Suggested Questions To Discuss With Physician:*
${input.suggestedQuestionsToDiscuss.length > 0
  ? input.suggestedQuestionsToDiscuss.map((q) => `• ${q}`).join('\n')
  : '• What is the suspected clinical cause of these symptoms?\n• Are any confirmatory laboratory or imaging studies indicated?\n• Are there any lifestyle, dietary, or medication adjustments advised?'}`;

    const disclaimer = `\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ *Clinical Notice for Doctor & Patient*: This summary was compiled with AI assistance from patient-provided logs and records to facilitate clinical dialogue. It does NOT constitute medical advice, diagnosis, or clinical certification.`;

    return `${header}

${demoBlock}

${concernsBlock}

${symptomsBlock}

${historyBlock}

${medsBlock}

${labsBlock}

${reportsBlock}

${questionsBlock}
${disclaimer}`;
  }
}
