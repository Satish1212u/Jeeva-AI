export type SupportedLanguage = 'en' | 'hi' | 'hinglish';

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

const HINGLISH_STRONG_KEYWORDS = new Set([
  'mera', 'meri', 'mere', 'mujhe', 'humko', 'kya', 'hai', 'hain', 'ho', 'hoon',
  'karo', 'karu', 'karein', 'karna', 'karke', 'kiya', 'chahiye', 'samjhao', 'samjha',
  'samjhado', 'samajh', 'batao', 'bataiye', 'dikhao', 'dikhaun', 'dikhaye', 'dikhaiye',
  'ye', 'yeh', 'wo', 'woh', 'kaise', 'kaisa', 'kaisi', 'kyu', 'kyun', 'kab', 'kahan',
  'kidhar', 'kitna', 'kitni', 'kitne', 'dard', 'khansi', 'bukhar', 'pet', 'sar',
  'seene', 'seena', 'gale', 'gala', 'dawa', 'dawai', 'dawakhana', 'ilaj', 'kripya',
  'namaste', 'shukriya', 'theek', 'thik', 'kam', 'jyada', 'zyada', 'bahut', 'bohot',
  'khoon', 'saans', 'chhati', 'haan', 'nahi', 'nahin', 'matlab', 'iska', 'iski',
  'iske', 'usko', 'unko', 'apne', 'apna', 'apni', 'hota', 'hoti', 'hote', 'raha',
  'rahi', 'rahe', 'gaya', 'gayi', 'gaye', 'lag', 'laga', 'lagi', 'lagta', 'lagti',
  'bhi', 'kisi', 'accha', 'achha', 'acchi', 'achhi', 'ko'
]);

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  isConfident: boolean;
}

/**
 * Detect language with confidence score:
 * - 'hi': Devanagari script
 * - 'hinglish': Roman script with strong Hindi lexical signals
 * - 'en': Standard English or Latin script without Hindi markers
 */
export function detectLanguageWithConfidence(text: string): LanguageDetectionResult {
  if (!text || typeof text !== 'string') {
    return { language: 'en', isConfident: false };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { language: 'en', isConfident: false };
  }

  // 1. Devanagari script detection -> Hindi
  if (DEVANAGARI_REGEX.test(trimmed)) {
    return { language: 'hi', isConfident: true };
  }

  // 2. Tokenize Latin words (alphabetic only)
  const words = trimmed.toLowerCase().match(/[a-z]+/g) || [];
  if (words.length === 0) {
    return { language: 'en', isConfident: false };
  }

  let hinglishHits = 0;
  for (const word of words) {
    if (HINGLISH_STRONG_KEYWORDS.has(word)) {
      hinglishHits++;
    }
  }

  // Short message (<= 3 words): 1 strong Hinglish word is sufficient
  if (words.length <= 3 && hinglishHits >= 1) {
    return { language: 'hinglish', isConfident: true };
  }

  // Longer message (> 3 words): at least 2 keywords or >= 15% lexical density
  if (hinglishHits >= 2 || (words.length > 0 && (hinglishHits / words.length) >= 0.15)) {
    return { language: 'hinglish', isConfident: true };
  }

  // Normal Latin-script message
  return { language: 'en', isConfident: true };
}

/**
 * Detect language: 'hi' (Devanagari script), 'hinglish' (Latin characters with Hindi words), or 'en'.
 */
export function detectLanguage(text: string): SupportedLanguage {
  return detectLanguageWithConfidence(text).language;
}

/**
 * Medical emergency messages per language
 */
export const EMERGENCY_MESSAGES: Record<SupportedLanguage, string> = {
  en: `🚨 *URGENT MEDICAL ALERT* 🚨\n\nThe symptoms you described may indicate a potentially serious medical emergency that requires immediate evaluation.\n\n⚠️ *Do not wait for an AI response.*\n• Call emergency services immediately (e.g. *112* in India, *911* in US, or your local emergency number).\n• Go to the nearest Hospital Emergency Department.\n• If you are alone, inform a family member, neighbor, or friend right away.`,
  hi: `🚨 *आपातकालीन चिकित्सा चेतावनी* 🚨\n\nआपके द्वारा बताए गए लक्षण किसी गंभीर आपातकालीन स्थिति का संकेत हो सकते हैं, जिसके लिए तत्काल डॉक्टर या अस्पताल की आवश्यकता है।\n\n⚠️ *कृपया AI के उत्तर की प्रतीक्षा न करें।*\n• तुरंत आपातकालीन नंबर डायल करें (जैसे भारत में *112* या स्थानीय एम्बुलेंस)।\n• निकटतम अस्पताल के इमरजेंसी विभाग में जाएं।\n• अपने परिवार या पड़ोसियों को तुरंत सूचित करें।`,
  hinglish: `🚨 *URGENT MEDICAL ALERT* 🚨\n\nAapke bataye hue symptoms kisi serious medical emergency ki taraf ishara kar sakte hain jisme turant doctor ki zaroorat hoti hai.\n\n⚠️ *AI ke response ka wait bilkul na karein.*\n• Turant emergency services ko call karein (India me *112* ya local ambulance).\n• Nearest hospital ke emergency room me jayein.\n• Apne kisi family member ya dost ko turant inform karein.`
};

/**
 * Standard safety disclaimers per language
 */
export const DISCLAIMERS: Record<SupportedLanguage, string> = {
  en: '\n\n⚠️ _MedAI is an AI educational assistant and does not replace professional medical evaluation, diagnosis, or treatment. Always consult a qualified physician._',
  hi: '\n\n⚠️ _MedAI एक AI स्वास्थ्य सूचना सहायक है और यह डॉक्टर की सलाह, जांच या उपचार का विकल्प नहीं है। किसी भी स्वास्थ्य निर्णय के लिए योग्य चिकित्सक से परामर्श करें।_',
  hinglish: '\n\n⚠️ _MedAI ek AI health assistant hai aur ye certified doctor ki advice, diagnosis ya treatment ka replacement nahi hai. Hamesha kisi qualified doctor se consult karein._'
};
