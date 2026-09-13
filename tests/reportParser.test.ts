import { describe, it, expect } from 'vitest';
import { ReportParser } from '../src/medical/reports/reportParser.js';

describe('ReportParser', () => {
  it('should extract lab values, units, and flags from clinical report text', () => {
    const rawReport = `
      PATIENT INVESTIGATION REPORT
      Hemoglobin: 10.2 g/dL
      Total Leukocyte Count (WBC): 13500 /cumm
      Platelet Count: 2.8 lakh/cumm
      Fasting Blood Glucose: 145 mg/dL
      Serum Creatinine: 0.9 mg/dL
    `;

    const parsed = ReportParser.parseReportText(rawReport);
    expect(parsed.tests.length).toBe(5);

    const hb = parsed.tests.find((t) => t.testName === 'Hemoglobin');
    expect(hb).toBeDefined();
    expect(hb?.value).toBe('10.2');
    expect(hb?.flag).toBe('LOW'); // min is 12.0

    const wbc = parsed.tests.find((t) => t.testName === 'Total Leukocyte Count (WBC)');
    expect(wbc).toBeDefined();
    expect(wbc?.flag).toBe('HIGH'); // max is 11000

    const fbs = parsed.tests.find((t) => t.testName === 'Fasting Blood Glucose');
    expect(fbs).toBeDefined();
    expect(fbs?.flag).toBe('HIGH'); // max is 99

    const creatinine = parsed.tests.find((t) => t.testName === 'Serum Creatinine');
    expect(creatinine).toBeDefined();
    expect(creatinine?.flag).toBe('NORMAL');

    expect(parsed.doctorDiscussionPoints.length).toBeGreaterThan(0);
  });

  it('should format parsed report for Telegram with disclaimer and non-diagnostic wording', () => {
    const rawReport = `Hemoglobin: 11.0 g/dL`;
    const parsed = ReportParser.parseReportText(rawReport);
    const tgMessage = ReportParser.formatReportForTelegram(parsed);

    expect(tgMessage).toContain('Lab Report Analysis');
    expect(tgMessage).toContain('Hemoglobin');
    expect(tgMessage).toContain('Clinical Safety Reminder');
    expect(tgMessage).toContain('does NOT represent a final diagnosis');
  });

  it('should handle unrecognized report text gracefully without throwing', () => {
    const rawReport = `Random unstructured non-medical text without values`;
    const parsed = ReportParser.parseReportText(rawReport);

    expect(parsed.tests.length).toBe(0);
    expect(parsed.overallSummary).toContain('could not automatically match');
  });
});
