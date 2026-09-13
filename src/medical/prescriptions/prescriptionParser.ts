import { SupportedLanguage } from '../../utils/language.js';

export interface PrescribedMedicine {
  medicineName: string;
  strength?: string;
  frequency?: string; // e.g. "1-0-1", "Once daily", "TDS"
  duration?: string;  // e.g. "5 days"
  instructions?: string; // e.g. "After food"
  confidence: 'HIGH' | 'MEDIUM' | 'UNCLEAR';
  uncertaintyWarning?: string;
}

export interface ParsedPrescription {
  doctorName?: string;
  clinicOrHospital?: string;
  date?: string;
  medicines: PrescribedMedicine[];
  unclearSegmentsFound: boolean;
  userVerificationPrompt: string;
}

export class PrescriptionParser {
  // Common frequency notations in Indian & global medical practice
  private static readonly FREQUENCY_PATTERNS = [
    /\b(1-0-1|1-1-1|1-0-0|0-0-1|0-1-0|od|bd|bid|tds|tid|qid|sos|prn|hs|stat)\b/i,
    /\b(once daily|twice daily|thrice a day|at bedtime|as needed)\b/i
  ];

  // Common duration patterns
  private static readonly DURATION_PATTERNS = [
    /\b(\d+)\s*(days?|weeks?|months?)\b/i,
    /\bx\s*(\d+)\s*(d|w|m)\b/i
  ];

  // Strength patterns
  private static readonly STRENGTH_PATTERNS = [
    /\b(\d+(\.\d+)?\s*(mg|mcg|g|ml|iu))\b/i
  ];

  /**
   * Parses raw prescription text (from OCR / vision model) and flags uncertain entries.
   */
  public static parsePrescriptionText(rawText: string, _lang: SupportedLanguage = 'en'): ParsedPrescription {
    const medicines: PrescribedMedicine[] = [];
    let unclearSegmentsFound = false;

    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    for (const line of lines) {
      // Check for illegible / uncertain markers produced by OCR or handwritten noise
      const hasUnclearMarker =
        /\?|illegible|unclear|fuzzy|scribble|\[\.\.\.\]/i.test(line) ||
        (line.length < 4 && !/\d/.test(line));

      // Check strength
      const strengthMatch = line.match(this.STRENGTH_PATTERNS[0]);
      const strength = strengthMatch ? strengthMatch[1] : undefined;

      // Check frequency
      let frequency: string | undefined;
      for (const fPattern of this.FREQUENCY_PATTERNS) {
        const fMatch = line.match(fPattern);
        if (fMatch) {
          frequency = fMatch[1].toUpperCase();
          break;
        }
      }

      // Check duration
      let duration: string | undefined;
      for (const dPattern of this.DURATION_PATTERNS) {
        const dMatch = line.match(dPattern);
        if (dMatch) {
          duration = dMatch[0];
          break;
        }
      }

      // Clean line for medicine name candidate
      const cleaned = line
        .replace(this.STRENGTH_PATTERNS[0], '')
        .replace(this.FREQUENCY_PATTERNS[0], '')
        .replace(this.DURATION_PATTERNS[0], '')
        .replace(/\b(tab|cap|syp|inj|ointment|gel|dr|rx)\b/gi, '')
        .trim();

      if (cleaned.length > 2) {
        const isPrescriptionLine =
          strength !== undefined ||
          frequency !== undefined ||
          duration !== undefined ||
          /\b(tab|cap|syp|mg|od|bd|tds)\b/i.test(line);

        if (isPrescriptionLine) {
          if (hasUnclearMarker || cleaned.includes('?')) {
            unclearSegmentsFound = true;
            medicines.push({
              medicineName: `[UNCLEAR: ${cleaned}]`,
              strength: strength || 'Unclear',
              frequency: frequency || 'Unclear',
              duration: duration || 'Unclear',
              confidence: 'UNCLEAR',
              uncertaintyWarning: 'Handwriting was ambiguous. DO NOT guess the name or dose.'
            });
          } else {
            medicines.push({
              medicineName: cleaned,
              strength,
              frequency,
              duration,
              instructions: /after food|pc/i.test(line) ? 'After food' : /empty stomach|ac/i.test(line) ? 'Before food' : undefined,
              confidence: 'HIGH'
            });
          }
        }
      }
    }

    const userVerificationPrompt =
      '⚠️ CRITICAL VERIFICATION: Handwritten prescriptions can easily be misread. Please review the extracted names against your original physical prescription and verify with your licensed pharmacist before purchasing or consuming any medicine.';

    return {
      medicines,
      unclearSegmentsFound,
      userVerificationPrompt
    };
  }

  /**
   * Format parsed prescription into clear Telegram text
   */
  public static formatPrescriptionForTelegram(parsed: ParsedPrescription, _lang: SupportedLanguage = 'en'): string {
    const header = `📝 *Prescription Analysis*\n`;

    if (parsed.medicines.length === 0) {
      return `${header}\nNo readable medications could be clearly recognized from this image.\n\n⚠️ *Please Note*: Handwritten prescriptions often contain complex abbreviations and doctor signatures. Please have your local pharmacist review the original physical prescription directly.`;
    }

    const medLines = parsed.medicines
      .map((m, idx) => {
        const icon = m.confidence === 'HIGH' ? '💊' : '⚠️';
        let detail = `${icon} *Item ${idx + 1}: ${m.medicineName}*`;
        if (m.strength) detail += `\n   • Strength: ${m.strength}`;
        if (m.frequency) detail += `\n   • Timing / Frequency: ${m.frequency}`;
        if (m.duration) detail += `\n   • Duration: ${m.duration}`;
        if (m.instructions) detail += `\n   • Note: ${m.instructions}`;
        if (m.confidence === 'UNCLEAR') {
          detail += `\n   🚨 *Warning*: ${m.uncertaintyWarning}`;
        }
        return detail;
      })
      .join('\n\n');

    return `${header}\n*Extracted Items:*\n${medLines}\n\n${parsed.userVerificationPrompt}`;
  }
}
