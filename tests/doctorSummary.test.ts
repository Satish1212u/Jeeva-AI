import { describe, it, expect } from 'vitest';
import { DoctorSummaryService } from '../src/medical/summaries/doctorSummaryService.js';

describe('DoctorSummaryService', () => {
  it('should compile a structured doctor-ready summary', () => {
    const summary = DoctorSummaryService.generateSummary({
      patientName: 'Ramesh Sharma',
      relationship: 'Father',
      age: 58,
      gender: 'Male',
      bloodGroup: 'B+',
      mainConcerns: ['Fasting blood sugar remains above target', 'Occasional morning leg cramps'],
      recentSymptoms: ['Mild polyuria', 'Dry mouth at night'],
      relevantMedicalHistory: ['Type 2 Diabetes (diagnosed 2018)', 'Mild Hypertension'],
      currentMedications: ['Metformin 500mg (1-0-1)', 'Telmisartan 40mg (1-0-0)'],
      recentAbnormalLabValues: [
        { testName: 'HbA1c', value: '7.8', unit: '%', flag: 'HIGH', date: '2026-08-15' },
        { testName: 'Fasting Blood Glucose', value: '142', unit: 'mg/dL', flag: 'HIGH' }
      ],
      importantReports: ['CBC and Metabolic Panel from Metropolis Labs'],
      suggestedQuestionsToDiscuss: [
        'Is intensification of glycemic therapy indicated given HbA1c 7.8%?',
        'Should an annual diabetic microalbuminuria check be scheduled?'
      ]
    });

    expect(summary).toContain('MEDAI CLINICAL VISIT BRIEFING');
    expect(summary).toContain('Ramesh Sharma');
    expect(summary).toContain('Type 2 Diabetes');
    expect(summary).toContain('Metformin 500mg');
    expect(summary).toContain('HbA1c');
    expect(summary).toContain('Suggested Questions To Discuss');
    expect(summary).toContain('Clinical Notice for Doctor & Patient');
  });
});
