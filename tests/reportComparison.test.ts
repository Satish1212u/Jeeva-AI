import { describe, it, expect } from 'vitest';
import { ReportComparisonService } from '../src/medical/comparisons/reportComparisonService.js';
import { ParsedTestResult } from '../src/medical/reports/reportParser.js';

describe('ReportComparisonService', () => {
  it('should detect improved, newly abnormal, and stable parameters between two reports', () => {
    const oldTests: ParsedTestResult[] = [
      {
        testName: 'Hemoglobin',
        value: '10.2',
        numericValue: 10.2,
        unit: 'g/dL',
        flag: 'LOW',
        plainInterpretation: 'Mild anemia'
      },
      {
        testName: 'Fasting Blood Glucose',
        value: '95',
        numericValue: 95,
        unit: 'mg/dL',
        flag: 'NORMAL',
        plainInterpretation: 'Normal'
      },
      {
        testName: 'Serum Creatinine',
        value: '0.9',
        numericValue: 0.9,
        unit: 'mg/dL',
        flag: 'NORMAL',
        plainInterpretation: 'Normal'
      }
    ];

    const newTests: ParsedTestResult[] = [
      {
        testName: 'Hemoglobin',
        value: '13.5', // normalized!
        numericValue: 13.5,
        unit: 'g/dL',
        flag: 'NORMAL',
        plainInterpretation: 'Normal'
      },
      {
        testName: 'Fasting Blood Glucose',
        value: '138', // newly abnormal!
        numericValue: 138,
        unit: 'mg/dL',
        flag: 'HIGH',
        plainInterpretation: 'High'
      },
      {
        testName: 'Serum Creatinine',
        value: '0.92', // stable normal
        numericValue: 0.92,
        unit: 'mg/dL',
        flag: 'NORMAL',
        plainInterpretation: 'Normal'
      }
    ];

    const comparison = ReportComparisonService.compareReports(oldTests, newTests);

    expect(comparison.deltas.length).toBe(3);
    expect(comparison.improvedCount).toBe(1);
    expect(comparison.newlyAbnormalCount).toBe(1);
    expect(comparison.unchangedCount).toBe(1);

    const hbDelta = comparison.deltas.find((d) => d.testName === 'Hemoglobin');
    expect(hbDelta?.clinicalStatus).toBe('IMPROVED');
    expect(hbDelta?.changeType).toBe('INCREASED');

    const sugarDelta = comparison.deltas.find((d) => d.testName === 'Fasting Blood Glucose');
    expect(sugarDelta?.clinicalStatus).toBe('NEWLY_ABNORMAL');
    expect(sugarDelta?.changeType).toBe('INCREASED');

    const creatinineDelta = comparison.deltas.find((d) => d.testName === 'Serum Creatinine');
    expect(creatinineDelta?.clinicalStatus).toBe('STABLE_NORMAL');

    expect(comparison.overallInterpretation).toContain('Compared 3 corresponding test(s)');
    expect(comparison.doctorQuestions.length).toBeGreaterThan(0);
  });

  it('should format comparison for Telegram with trend arrows and clinical notice', () => {
    const oldTests: ParsedTestResult[] = [
      {
        testName: 'Total Cholesterol',
        value: '235',
        numericValue: 235,
        unit: 'mg/dL',
        flag: 'HIGH',
        plainInterpretation: 'High'
      }
    ];

    const newTests: ParsedTestResult[] = [
      {
        testName: 'Total Cholesterol',
        value: '185',
        numericValue: 185,
        unit: 'mg/dL',
        flag: 'NORMAL',
        plainInterpretation: 'Normal'
      }
    ];

    const result = ReportComparisonService.compareReports(oldTests, newTests);
    const msg = ReportComparisonService.formatComparisonForTelegram(result);

    expect(msg).toContain('Medical Report Comparison');
    expect(msg).toContain('Total Cholesterol');
    expect(msg).toContain('IMPROVED');
    expect(msg).toContain('Clinical Safety Note');
  });
});
