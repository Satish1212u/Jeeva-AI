import { describe, it, expect } from 'vitest';
import { SafetyEngine } from '../src/ai/safetyEngine.js';

describe('SafetyEngine - Medical Guardrails & Emergency Detection', () => {
  it('should detect cardiac red flags and return emergency response', () => {
    const result = SafetyEngine.evaluateInput('I am having sudden crushing chest pain radiating to my left arm');
    expect(result.isEmergency).toBe(true);
    expect(result.flaggedKeywords).toContain('CARDIAC');
    expect(result.emergencyResponse).toContain('URGENT MEDICAL ALERT');
    expect(result.emergencyResponse).toContain('112');
  });

  it('should detect respiratory red flags', () => {
    const result = SafetyEngine.evaluateInput('I cannot breathe and my lips are turning blue');
    expect(result.isEmergency).toBe(true);
    expect(result.flaggedKeywords).toContain('RESPIRATORY');
  });

  it('should detect stroke FAST symptoms', () => {
    const result = SafetyEngine.evaluateInput('My mother has slurred speech and her face is drooping suddenly');
    expect(result.isEmergency).toBe(true);
    expect(result.flaggedKeywords).toContain('STROKE_NEURO');
  });

  it('should detect psychiatric crisis and provide crisis hotline', () => {
    const result = SafetyEngine.evaluateInput('I feel hopeless and want to end my life');
    expect(result.isEmergency).toBe(true);
    expect(result.emergencyType).toBe('PSYCHIATRIC_CRISIS');
    expect(result.emergencyResponse).toContain('1800-599-0019');
    expect(result.emergencyResponse).toContain('988');
  });

  it('should detect Hinglish emergency symptoms', () => {
    const result = SafetyEngine.evaluateInput('Chhati me bahut tez dard ho raha hai aur saans nahi aa rahi');
    expect(result.isEmergency).toBe(true);
    expect(result.emergencyResponse).toContain('URGENT MEDICAL ALERT');
  });

  it('should detect Hindi emergency symptoms', () => {
    const result = SafetyEngine.evaluateInput('सीने में भयानक दर्द और खून की उल्टी हो रही है', 'hi');
    expect(result.isEmergency).toBe(true);
    expect(result.emergencyResponse).toContain('आपातकालीन चिकित्सा चेतावनी');
  });

  it('should pass non-emergency general health queries without flag', () => {
    const result = SafetyEngine.evaluateInput('What foods are rich in iron for mild fatigue?');
    expect(result.isEmergency).toBe(false);
    expect(result.emergencyResponse).toBeUndefined();
  });

  it('postProcessResponse should filter out doctor impersonation', () => {
    const input = 'As your doctor, I recommend taking warm water.';
    const processed = SafetyEngine.postProcessResponse(input, 'en');
    expect(processed.hasAlterations).toBe(true);
    expect(processed.sanitizedText).not.toContain('As your doctor');
    expect(processed.sanitizedText).toContain('As an AI health assistant');
  });

  it('postProcessResponse should soften definitive diagnostic statements', () => {
    const input = 'You definitely have diabetes based on this single test.';
    const processed = SafetyEngine.postProcessResponse(input, 'en');
    expect(processed.hasAlterations).toBe(true);
    expect(processed.sanitizedText).not.toContain('You definitely have');
    expect(processed.sanitizedText).toContain('could be associated with');
  });

  it('postProcessResponse should block unverified dose alteration recommendations', () => {
    const input = 'You should increase your dose to 1000mg or stop taking your medication.';
    const processed = SafetyEngine.postProcessResponse(input, 'en');
    expect(processed.hasAlterations).toBe(true);
    expect(processed.sanitizedText).toContain('prescribing doctor');
  });

  it('postProcessResponse should append educational disclaimer if absent', () => {
    const input = 'Vitamin D is synthesized when skin is exposed to sunlight.';
    const processed = SafetyEngine.postProcessResponse(input, 'en');
    expect(processed.sanitizedText).toContain('Jeeva AI is an AI health assistant');
  });
});
