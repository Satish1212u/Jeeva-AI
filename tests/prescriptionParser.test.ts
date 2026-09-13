import { describe, it, expect } from 'vitest';
import { PrescriptionParser } from '../src/medical/prescriptions/prescriptionParser.js';

describe('PrescriptionParser', () => {
  it('should extract clearly written medicine name, strength, frequency, and duration', () => {
    const rxText = `
      Rx
      Tab Pantoprazole 40mg 1-0-0 x 14 days
      Tab Amoxicillin 500mg TDS x 5 days
    `;

    const parsed = PrescriptionParser.parsePrescriptionText(rxText);
    expect(parsed.medicines.length).toBe(2);

    const panto = parsed.medicines[0];
    expect(panto.strength).toBe('40mg');
    expect(panto.frequency).toBe('1-0-0');
    expect(panto.duration).toBe('14 days');
    expect(panto.confidence).toBe('HIGH');

    const amox = parsed.medicines[1];
    expect(amox.strength).toBe('500mg');
    expect(amox.frequency).toBe('TDS');
    expect(amox.confidence).toBe('HIGH');
  });

  it('should explicitly mark ambiguous / unclear handwritten lines and warn the user', () => {
    const rxText = `
      Rx
      Tab Paracetamol 650mg 1-0-1 x 3 days
      Tab ??? illegible scribble 500mg
    `;

    const parsed = PrescriptionParser.parsePrescriptionText(rxText);
    expect(parsed.unclearSegmentsFound).toBe(true);

    const unclearMed = parsed.medicines.find((m) => m.confidence === 'UNCLEAR');
    expect(unclearMed).toBeDefined();
    expect(unclearMed?.uncertaintyWarning).toContain('Handwriting was ambiguous');
    expect(parsed.userVerificationPrompt).toContain('CRITICAL VERIFICATION');
  });

  it('should format prescription for Telegram with pharmacist verification instructions', () => {
    const rxText = `Tab Dolo 650mg 1-0-1 x 3 days`;
    const parsed = PrescriptionParser.parsePrescriptionText(rxText);
    const tgMsg = PrescriptionParser.formatPrescriptionForTelegram(parsed);

    expect(tgMsg).toContain('Prescription Analysis');
    expect(tgMsg).toContain('Dolo');
    expect(tgMsg).toContain('CRITICAL VERIFICATION');
  });
});
