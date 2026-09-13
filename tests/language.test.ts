import { describe, it, expect } from 'vitest';
import { detectLanguage, EMERGENCY_MESSAGES, DISCLAIMERS } from '../src/utils/language.js';

describe('Language Utilities', () => {
  it('should detect English queries', () => {
    expect(detectLanguage('What are the symptoms of seasonal allergies?')).toBe('en');
    expect(detectLanguage('Can you explain my lipid profile?')).toBe('en');
  });

  it('should detect Hindi (Devanagari script)', () => {
    expect(detectLanguage('मेरा हीमोग्लोबिन १०.२ है, क्या यह कम है?')).toBe('hi');
    expect(detectLanguage('नमस्ते डॉक्टर')).toBe('hi');
  });

  it('should detect Hinglish queries', () => {
    expect(detectLanguage('Mera Hb 10.2 hai iska kya matlab hai?')).toBe('hinglish');
    expect(detectLanguage('Mujhe pet me dard ho raha hai aur bukhar bhi hai')).toBe('hinglish');
    expect(detectLanguage('Dawa kab leni chahiye khane se pehle ya baad me?')).toBe('hinglish');
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
