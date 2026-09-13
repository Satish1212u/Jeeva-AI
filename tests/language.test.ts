import { describe, it, expect } from 'vitest';
import { detectLanguage, detectLanguageWithConfidence, EMERGENCY_MESSAGES, DISCLAIMERS } from '../src/utils/language.js';
import { ResponseGuard } from '../src/ai/responseGuard.js';

describe('Language Utilities', () => {
  it('should detect English queries', () => {
    expect(detectLanguage('What are the symptoms of seasonal allergies?')).toBe('en');
    expect(detectLanguage('Can you explain my lipid profile?')).toBe('en');
    expect(detectLanguage('I have fever')).toBe('en');
    expect(detectLanguage('What should I do?')).toBe('en');
    expect(detectLanguage('Tell me why my Hb is low?')).toBe('en');
    expect(detectLanguage('Can you explain this report?')).toBe('en');
    expect(detectLanguage('hi')).toBe('en');
    expect(detectLanguage('hello')).toBe('en');
    expect(detectLanguage('help')).toBe('en');
    expect(detectLanguage('ok')).toBe('en');
  });

  it('should detect Hindi (Devanagari script)', () => {
    expect(detectLanguage('मेरा हीमोग्लोबिन १०.२ है, क्या यह कम है?')).toBe('hi');
    expect(detectLanguage('नमस्ते डॉक्टर')).toBe('hi');
    expect(detectLanguage('मुझे बुखार है')).toBe('hi');
    expect(detectLanguage('मेरा Hb कम है इसका क्या मतलब है?')).toBe('hi');
  });

  it('should detect Hinglish queries including short messages', () => {
    expect(detectLanguage('Mera Hb 10.2 hai iska kya matlab hai?')).toBe('hinglish');
    expect(detectLanguage('Mujhe pet me dard ho raha hai aur bukhar bhi hai')).toBe('hinglish');
    expect(detectLanguage('Dawa kab leni chahiye khane se pehle ya baad me?')).toBe('hinglish');
    expect(detectLanguage('mujhe fever hai')).toBe('hinglish');
    expect(detectLanguage('kya karu')).toBe('hinglish');
    expect(detectLanguage('ye report samjhao')).toBe('hinglish');
    expect(detectLanguage('ye report samjha do')).toBe('hinglish');
    expect(detectLanguage('mere stomach me pain hai')).toBe('hinglish');
    expect(detectLanguage('doctor ko kab dikhaun')).toBe('hinglish');
    expect(detectLanguage('mujhe kya karna chahiye')).toBe('hinglish');
    expect(detectLanguage('mujhe bukhar hai')).toBe('hinglish');
    expect(detectLanguage('namaste')).toBe('hinglish');
    expect(detectLanguage('haan')).toBe('hinglish');
    expect(detectLanguage('thik hai')).toBe('hinglish');
  });

  it('should return confidence correctly', () => {
    expect(detectLanguageWithConfidence('What should I do?').isConfident).toBe(true);
    expect(detectLanguageWithConfidence('kya karu').isConfident).toBe(true);
    expect(detectLanguageWithConfidence('मुझे बुखार है').isConfident).toBe(true);
    expect(detectLanguageWithConfidence('12345').isConfident).toBe(false);
    expect(detectLanguageWithConfidence('???').isConfident).toBe(false);
    expect(detectLanguageWithConfidence('').isConfident).toBe(false);
  });

  it('should validate response language matches expected language', () => {
    // Expected Hindi
    expect(ResponseGuard.validateLanguageMatch('यह आपका हीमोग्लोबिन परिणाम है।', 'hi')).toBe(true);
    expect(ResponseGuard.validateLanguageMatch('This is an English medical explanation.', 'hi')).toBe(false);

    // Expected English
    expect(ResponseGuard.validateLanguageMatch('Your blood pressure is within normal range.', 'en')).toBe(true);
    expect(ResponseGuard.validateLanguageMatch('आपका रक्तचाप सामान्य सीमा के भीतर है।', 'en')).toBe(false);

    // Expected Hinglish (Roman script preferred, Devanagari rejected)
    expect(ResponseGuard.validateLanguageMatch('Aapka BP normal range me hai. Doctor se consult karein.', 'hinglish')).toBe(true);
    expect(ResponseGuard.validateLanguageMatch('आपका रक्तचाप सामान्य सीमा में है।', 'hinglish')).toBe(false);
  });

  it('should have emergency messages defined for all supported languages', () => {
    expect(EMERGENCY_MESSAGES.en).toContain('URGENT MEDICAL ALERT');
    expect(EMERGENCY_MESSAGES.hi).toContain('आपातकालीन चिकित्सा चेतावनी');
    expect(EMERGENCY_MESSAGES.hinglish).toContain('URGENT MEDICAL ALERT');
  });

  it('should have disclaimers defined for all supported languages', () => {
    expect(DISCLAIMERS.en).toContain('MedAI is an AI educational assistant');
    expect(DISCLAIMERS.hi).toContain('MedAI एक AI');
    expect(DISCLAIMERS.hinglish).toContain('MedAI ek AI');
  });
});
