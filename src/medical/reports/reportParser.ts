import { SupportedLanguage } from '../../utils/language.js';

export interface ParsedTestResult {
  testName: string;
  category?: string;
  value: string;
  numericValue?: number;
  unit?: string;
  referenceRange?: string;
  flag: 'NORMAL' | 'HIGH' | 'LOW' | 'ABNORMAL';
  plainInterpretation: string;
}

export interface ParsedReportSummary {
  patientName?: string;
  reportDate?: string;
  laboratoryName?: string;
  tests: ParsedTestResult[];
  overallSummary: string;
  doctorDiscussionPoints: string[];
}

interface ReferenceRange {
  name: string;
  aliases: string[];
  unit: string;
  min: number;
  max: number;
  category: string;
  lowMeaning: string;
  highMeaning: string;
}

const LAB_REFERENCE_RANGES: ReferenceRange[] = [
  {
    name: 'Hemoglobin',
    aliases: ['hb', 'hgb', 'hemoglobin', 'haemoglobin'],
    unit: 'g/dL',
    min: 12.0,
    max: 17.5,
    category: 'Complete Blood Count',
    lowMeaning: 'Could indicate anemia (e.g. iron, folate or vitamin deficiency).',
    highMeaning: 'Could indicate hemoconcentration, chronic hypoxia, or polycythemia.'
  },
  {
    name: 'Total Leukocyte Count (WBC)',
    aliases: ['wbc', 'tlc', 'white blood cells', 'total leukocyte count'],
    unit: '/cumm',
    min: 4000,
    max: 11000,
    category: 'Complete Blood Count',
    lowMeaning: 'Leukopenia; could be related to viral infections or bone marrow conditions.',
    highMeaning: 'Leukocytosis; often elevated in bacterial infections, stress, or inflammation.'
  },
  {
    name: 'Platelet Count',
    aliases: ['platelets', 'platelet count', 'plt'],
    unit: 'lakh/cumm',
    min: 1.5,
    max: 4.5,
    category: 'Complete Blood Count',
    lowMeaning: 'Thrombocytopenia; lower counts can increase bleeding or bruising tendency.',
    highMeaning: 'Thrombocytosis; could be reactive to inflammation, iron deficiency, or marrow issues.'
  },
  {
    name: 'Fasting Blood Glucose',
    aliases: ['fasting sugar', 'fbs', 'fasting blood sugar', 'fasting blood glucose', 'fasting glucose', 'glucose fasting'],
    unit: 'mg/dL',
    min: 70,
    max: 99,
    category: 'Metabolic Profile',
    lowMeaning: 'Hypoglycemia; may cause dizziness, sweating, or shakiness.',
    highMeaning: 'Higher than normal fasting glucose (impaired fasting glucose or diabetes indicator).'
  },
  {
    name: 'HbA1c (Glycated Hemoglobin)',
    aliases: ['hba1c', 'glycated hemoglobin', 'a1c'],
    unit: '%',
    min: 4.0,
    max: 5.6,
    category: 'Metabolic Profile',
    lowMeaning: 'Generally acceptable unless related to certain hemolytic conditions.',
    highMeaning: '5.7-6.4% indicates prediabetes; 6.5% or above indicates diabetes range.'
  },
  {
    name: 'Serum Creatinine',
    aliases: ['creatinine', 'serum creatinine', 'sr. creatinine'],
    unit: 'mg/dL',
    min: 0.6,
    max: 1.2,
    category: 'Renal Function Test',
    lowMeaning: 'Often reflects low muscle mass or nutritional state.',
    highMeaning: 'Could indicate reduced kidney filtration efficiency or dehydration.'
  },
  {
    name: 'SGPT (ALT)',
    aliases: ['sgpt', 'alt', 'alanine transaminase', 'alanine aminotransferase'],
    unit: 'U/L',
    min: 7,
    max: 55,
    category: 'Liver Function Test',
    lowMeaning: 'Usually clinically insignificant.',
    highMeaning: 'May indicate hepatic cellular inflammation or irritation (e.g., fatty liver, viral hepatitis, medication effect).'
  },
  {
    name: 'TSH (Thyroid Stimulating Hormone)',
    aliases: ['tsh', 'thyroid stimulating hormone'],
    unit: 'uIU/mL',
    min: 0.4,
    max: 4.5,
    category: 'Thyroid Panel',
    lowMeaning: 'Could suggest an overactive thyroid (hyperthyroidism).',
    highMeaning: 'Could suggest an underactive thyroid (hypothyroidism).'
  },
  {
    name: 'Total Cholesterol',
    aliases: ['total cholesterol', 'cholesterol total'],
    unit: 'mg/dL',
    min: 100,
    max: 200,
    category: 'Lipid Profile',
    lowMeaning: 'Rarely problematic; can occur with severe malnutrition or hyperthyroidism.',
    highMeaning: 'Hypercholesterolemia; elevated cardiovascular risk factor.'
  }
];

export class ReportParser {
  /**
   * Parse extracted report text into structured lab parameters
   */
  public static parseReportText(rawText: string, _lang: SupportedLanguage = 'en'): ParsedReportSummary {
    const tests: ParsedTestResult[] = [];
    const lines = rawText.split('\n');

    for (const ref of LAB_REFERENCE_RANGES) {
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        const matchedAlias = ref.aliases.find((alias) =>
          new RegExp(`\\b${alias}\\b`, 'i').test(lowerLine)
        );

        if (matchedAlias) {
          // Find number in the line after alias
          const numMatch = line.match(/(\d+(\.\d+)?)/);
          if (numMatch) {
            const numericValue = parseFloat(numMatch[1]);
            let flag: 'NORMAL' | 'HIGH' | 'LOW' | 'ABNORMAL' = 'NORMAL';
            let plainInterpretation = 'Within typical adult reference range.';

            if (numericValue < ref.min) {
              flag = 'LOW';
              plainInterpretation = ref.lowMeaning;
            } else if (numericValue > ref.max) {
              flag = 'HIGH';
              plainInterpretation = ref.highMeaning;
            }

            // Avoid duplicate additions
            if (!tests.some((t) => t.testName === ref.name)) {
              tests.push({
                testName: ref.name,
                category: ref.category,
                value: numMatch[1],
                numericValue,
                unit: ref.unit,
                referenceRange: `${ref.min} - ${ref.max} ${ref.unit}`,
                flag,
                plainInterpretation
              });
            }
          }
        }
      }
    }

    const abnormalTests = tests.filter((t) => t.flag !== 'NORMAL');
    const doctorDiscussionPoints = abnormalTests.map(
      (t) => `Discuss elevated/low ${t.testName} (${t.value} ${t.unit}) with your physician.`
    );

    let overallSummary = '';
    if (tests.length === 0) {
      overallSummary =
        'We received your document, but could not automatically match standard blood/lab parameters. A doctor or technician should review the original report.';
    } else if (abnormalTests.length === 0) {
      overallSummary =
        `All identified parameters (${tests.length} tests) fall within standard laboratory reference intervals. Remember that normal values still require clinical correlation with your actual symptoms.`;
    } else {
      overallSummary =
        `Found ${tests.length} parameter(s), with ${abnormalTests.length} value(s) falling outside typical reference intervals. An isolated abnormal number is not an automatic diagnosis and must be evaluated in context by a physician.`;
    }

    return {
      tests,
      overallSummary,
      doctorDiscussionPoints
    };
  }

  /**
   * Format the parsed report into a readable Telegram message
   */
  public static formatReportForTelegram(summary: ParsedReportSummary, _lang: SupportedLanguage = 'en'): string {
    const header = `📋 *Lab Report Analysis*\n`;

    if (summary.tests.length === 0) {
      return `${header}\n${summary.overallSummary}\n\n⚠️ _Please ensure the image is clear, sharp, well-lit, and shows the test names along with values and reference ranges._`;
    }

    let testList = summary.tests
      .map((t) => {
        const flagIcon = t.flag === 'HIGH' ? '🔺' : t.flag === 'LOW' ? '🔻' : '✅';
        return `${flagIcon} *${t.testName}*: ${t.value} ${t.unit || ''} (Ref: ${t.referenceRange || 'N/A'})\n   _Status: ${t.flag}_ — ${t.plainInterpretation}`;
      })
      .join('\n\n');

    let points = '';
    if (summary.doctorDiscussionPoints.length > 0) {
      points = `\n\n*Key Questions For Your Doctor:*\n` + summary.doctorDiscussionPoints.map((p) => `• ${p}`).join('\n');
    }

    const disclaimer = `\n\n⚠️ *Clinical Safety Reminder*: An abnormal lab value does NOT represent a final diagnosis. Biological fluctuations, medications, hydration, and lab variances affect numbers. Always consult your healthcare provider.`;

    return `${header}\n*Summary:*\n${summary.overallSummary}\n\n*Extracted Parameters:*\n${testList}${points}${disclaimer}`;
  }
}
