import { describe, it, expect } from 'vitest';
import { IntentRouter } from '../src/ai/router.js';

describe('IntentRouter', () => {
  it('should route emergency symptoms immediately', () => {
    const res = IntentRouter.route('Severe crushing chest pain radiating to back');
    expect(res.intent).toBe('EMERGENCY');
    expect(res.isEmergency).toBe(true);
    expect(res.emergencyResponse).toBeDefined();
  });

  it('should route commands', () => {
    const res = IntentRouter.route('/start');
    expect(res.intent).toBe('COMMAND');
  });

  it('should route medicine lookup queries', () => {
    const res = IntentRouter.route('tell me about paracetamol dosage');
    expect(res.intent).toBe('MEDICINE_LOOKUP');
  });

  it('should route lab report analysis queries', () => {
    const res = IntentRouter.route('Mera hb test report 9.5 aaya hai');
    expect(res.intent).toBe('REPORT_ANALYSIS');
    expect(res.language).toBe('hinglish');
  });

  it('should route symptom queries', () => {
    const res = IntentRouter.route('I have had high fever and mild cough for 3 days');
    expect(res.intent).toBe('SYMPTOM_QUERY');
  });

  it('should route doctor summary queries', () => {
    const res = IntentRouter.route('Please prepare my doctor summary for tomorrow visit');
    expect(res.intent).toBe('DOCTOR_SUMMARY');
  });
});
