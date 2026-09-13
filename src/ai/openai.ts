import OpenAI from 'openai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { SafetyEngine } from './safetyEngine.js';
import { buildSystemPrompt, UserContext } from './prompts/systemPrompts.js';
import { SupportedLanguage } from '../utils/language.js';

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenAIService {
  private client: OpenAI | null = null;

  constructor() {
    if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0) {
      this.client = new OpenAI({
        apiKey: env.OPENAI_API_KEY
      });
    } else {
      logger.info('OpenAI API key not supplied; running OpenAIService in simulated medical mode.');
    }
  }

  /**
   * Completes a conversation turn with medical context and safety post-processing.
   */
  public async generateChatResponse(
    userMessage: string,
    history: ChatMessageParam[] = [],
    language: SupportedLanguage = 'en',
    userContext?: UserContext
  ): Promise<{ content: string; tokensUsed?: number; flagged?: boolean }> {
    // 1. Check for immediate safety red flags
    const safetyCheck = SafetyEngine.evaluateInput(userMessage, language);
    if (safetyCheck.isEmergency && safetyCheck.emergencyResponse) {
      return {
        content: safetyCheck.emergencyResponse,
        flagged: true
      };
    }

    // 2. Prepare system prompt
    const systemPrompt = buildSystemPrompt(language, userContext);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage }
    ];

    let rawResponse = '';
    let tokensUsed: number | undefined;

    // 3. Call OpenAI or safe mock fallback
    if (this.client) {
      try {
        const completion = await this.client.chat.completions.create({
          model: env.OPENAI_MODEL,
          messages,
          temperature: 0.2, // Low temperature for factual medical accuracy
          max_tokens: 800
        });

        rawResponse = completion.choices[0]?.message?.content || '';
        tokensUsed = completion.usage?.total_tokens;
      } catch (error) {
        logger.error({ err: error }, 'OpenAI Chat Completion API call failed.');
        rawResponse = this.generateFallbackResponse(userMessage, language);
      }
    } else {
      rawResponse = this.generateFallbackResponse(userMessage, language);
    }

    // 4. Run safety post-processing
    const postProcessed = SafetyEngine.postProcessResponse(rawResponse, language);

    return {
      content: postProcessed.sanitizedText,
      tokensUsed,
      flagged: postProcessed.hasAlterations
    };
  }

  /**
   * Deterministic educational fallback when OpenAI is not configured
   */
  private generateFallbackResponse(userInput: string, lang: SupportedLanguage): string {
    const clean = userInput.toLowerCase();

    if (lang === 'hi') {
      if (clean.includes('hb') || clean.includes('hemoglobin') || clean.includes('खून')) {
        return `हीमोग्लोबिन (Hb) के स्तर के बारे में:\n\n• सामान्य श्रेणी आमतौर पर पुरुषों के लिए 13.5–17.5 g/dL और महिलाओं के लिए 12.0–15.5 g/dL होती है।\n• कम मान एनीमिया (आयरन या विटामिन की कमी) का संकेत दे सकता है।\n• सटीक व्याख्या आपकी उम्र, लिंग और वर्तमान लक्षणों पर निर्भर करती है।\n\nकृपया अपने डॉक्टर से मिलकर उचित रक्त जांच और सलाह लें।`;
      }
      return `नमस्ते! आपके प्रश्न "${userInput}" को ध्यान में रखते हुए, सामान्य स्वास्थ्य जानकारी के आधार पर यह महत्वपूर्ण है कि आप अपने लक्षणों की अवधि और गंभीरता पर नजर रखें। यदि लक्षण बने रहते हैं या बढ़ते हैं, तो योग्य चिकित्सक से परामर्श करें।`;
    }

    if (lang === 'hinglish') {
      if (clean.includes('hb') || clean.includes('hemoglobin')) {
        return `Aapke Hb level ke baare me:\n\n• Normal reference range generally adult males me 13.5-17.5 g/dL aur females me 12.0-15.5 g/dL hoti hai.\n• Agar reading isse kam hai to ye mild anemia (jaise iron ya B12 deficiency) ki taraf point kar sakta hai.\n• Exact interpretation aapki age, gender aur physical symptoms par depend karti hai.\n\nDoctor se consult karein taaki sahi guidance aur jarurat padne par dietary changes mil sakein.`;
      }
      return `Aapke query "${userInput}" ke baare me: Kisi bhi health symptom ko samajhne ke liye overall physical condition aur timeline dekhna zaroori hota hai. Agar aapko koi discomfort ho raha hai to doctor se checkup karwayein.`;
    }

    // Default English
    if (clean.includes('hb') || clean.includes('hemoglobin')) {
      return `Understanding Hemoglobin (Hb) levels:\n\n• General adult reference ranges are typically 13.5–17.5 g/dL for men and 12.0–15.5 g/dL for women.\n• A lower reading can indicate mild to moderate anemia (such as nutritional iron or vitamin deficiency).\n• A clinical evaluation is necessary because normal cutoffs vary by laboratory, age, altitude, and medical history.\n\nPlease share this report with your physician for contextual advice.`;
    }

    return `Thank you for sharing your health query: "${userInput}".\n\nWhen evaluating symptoms or lab queries, healthcare professionals consider clinical history, physical examination, and related biomarkers. If you are experiencing persistent discomfort, we recommend scheduling an appointment with your healthcare provider.`;
  }
}

export const openAIService = new OpenAIService();
