import { ParsedTestResult } from '../reports/reportParser.js';
import { SupportedLanguage } from '../../utils/language.js';

export interface ComparisonDelta {
  testName: string;
  oldValue: string;
  newValue: string;
  unit?: string;
  changeType: 'INCREASED' | 'DECREASED' | 'UNCHANGED';
  oldFlag: string;
  newFlag: string;
  clinicalStatus: 'IMPROVED' | 'NEWLY_ABNORMAL' | 'PERSISTENTLY_ABNORMAL' | 'STABLE_NORMAL';
  plainExplanation: string;
}

export interface ReportComparisonResult {
  deltas: ComparisonDelta[];
  newlyAbnormalCount: number;
  improvedCount: number;
  unchangedCount: number;
  overallInterpretation: string;
  doctorQuestions: string[];
}

export class ReportComparisonService {
  /**
   * Compares an older report against a newer report
   */
  public static compareReports(
    oldTests: ParsedTestResult[],
    newTests: ParsedTestResult[],
    _lang: SupportedLanguage = 'en'
  ): ReportComparisonResult {
    const deltas: ComparisonDelta[] = [];
    let newlyAbnormalCount = 0;
    let improvedCount = 0;
    let unchangedCount = 0;

    for (const newTest of newTests) {
      const oldMatch = oldTests.find(
        (o) => o.testName.toLowerCase() === newTest.testName.toLowerCase()
      );

      if (oldMatch) {
        const oldNum = oldMatch.numericValue ?? parseFloat(oldMatch.value);
        const newNum = newTest.numericValue ?? parseFloat(newTest.value);

        let changeType: 'INCREASED' | 'DECREASED' | 'UNCHANGED' = 'UNCHANGED';
        if (!isNaN(oldNum) && !isNaN(newNum)) {
          if (newNum > oldNum) changeType = 'INCREASED';
          else if (newNum < oldNum) changeType = 'DECREASED';
        }

        let clinicalStatus: 'IMPROVED' | 'NEWLY_ABNORMAL' | 'PERSISTENTLY_ABNORMAL' | 'STABLE_NORMAL' = 'STABLE_NORMAL';
        let plainExplanation = '';

        if (oldMatch.flag !== 'NORMAL' && newTest.flag === 'NORMAL') {
          clinicalStatus = 'IMPROVED';
          improvedCount++;
          plainExplanation = `Value has normalized compared to the previous test.`;
        } else if (oldMatch.flag === 'NORMAL' && newTest.flag !== 'NORMAL') {
          clinicalStatus = 'NEWLY_ABNORMAL';
          newlyAbnormalCount++;
          plainExplanation = `Value was previously normal and is now flagged as ${newTest.flag}.`;
        } else if (newTest.flag !== 'NORMAL') {
          clinicalStatus = 'PERSISTENTLY_ABNORMAL';
          plainExplanation = `Remains outside typical range (${newTest.flag}). Previous was ${oldMatch.value}.`;
        } else {
          clinicalStatus = 'STABLE_NORMAL';
          unchangedCount++;
          plainExplanation = `Remains steady within normal limits.`;
        }

        deltas.push({
          testName: newTest.testName,
          oldValue: oldMatch.value,
          newValue: newTest.value,
          unit: newTest.unit,
          changeType,
          oldFlag: oldMatch.flag,
          newFlag: newTest.flag,
          clinicalStatus,
          plainExplanation
        });
      }
    }

    const doctorQuestions: string[] = [];
    if (newlyAbnormalCount > 0) {
      doctorQuestions.push('What could explain the newly abnormal test results since my last checkup?');
      doctorQuestions.push('Are there dietary, lifestyle, or medication factors influencing these shifts?');
    }
    if (improvedCount > 0) {
      doctorQuestions.push('Is the current treatment regimen showing expected positive results?');
    }

    const overallInterpretation =
      `Compared ${deltas.length} corresponding test(s): ` +
      `${improvedCount} normalized/improved, ${newlyAbnormalCount} newly flagged as abnormal, and ` +
      `${unchangedCount} remained within stable limits. A change in numbers alone does not confirm a diagnosis.`;

    return {
      deltas,
      newlyAbnormalCount,
      improvedCount,
      unchangedCount,
      overallInterpretation,
      doctorQuestions
    };
  }

  /**
   * Formats report comparison into a clear Telegram message
   */
  public static formatComparisonForTelegram(result: ReportComparisonResult, _lang: SupportedLanguage = 'en'): string {
    const header = `📊 *Medical Report Comparison (Old vs. New)*\n`;

    if (result.deltas.length === 0) {
      return `${header}\nNo overlapping lab parameters were found between the two documents to compare directly.`;
    }

    const deltaLines = result.deltas
      .map((d) => {
        let statusIcon = '🔹';
        if (d.clinicalStatus === 'IMPROVED') statusIcon = '🟢';
        else if (d.clinicalStatus === 'NEWLY_ABNORMAL') statusIcon = '🔴';
        else if (d.clinicalStatus === 'PERSISTENTLY_ABNORMAL') statusIcon = '🟡';

        const arrow = d.changeType === 'INCREASED' ? '⬆️' : d.changeType === 'DECREASED' ? '⬇️' : '➡️';
        return `${statusIcon} *${d.testName}* ${arrow}\n   • Previous: ${d.oldValue} ${d.unit || ''} (${d.oldFlag})\n   • Current: ${d.newValue} ${d.unit || ''} (${d.newFlag})\n   • Status: ${d.clinicalStatus} — _${d.plainExplanation}_`;
      })
      .join('\n\n');

    let questionsBlock = '';
    if (result.doctorQuestions.length > 0) {
      questionsBlock = `\n\n*Recommended Questions For Your Physician:*\n` + result.doctorQuestions.map((q) => `• ${q}`).join('\n');
    }

    const disclaimer = `\n\n⚠️ *Clinical Safety Note*: Variations in lab values can occur due to hydration, timing, physical activity, and test calibration. Never alter treatments based solely on these numbers without physician guidance.`;

    return `${header}\n*Summary:*\n${result.overallInterpretation}\n\n*Parameter Trends:*\n${deltaLines}${questionsBlock}${disclaimer}`;
  }
}
