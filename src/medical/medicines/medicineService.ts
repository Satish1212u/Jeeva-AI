import {
  CuratedMedicineDatabase,
  IMedicineDatabase,
  MedicineRecord
} from './medicineDatabase.js';
import { SupportedLanguage } from '../../utils/language.js';

export interface FormattedMedicineResponse {
  medicine: string;
  strength: string;
  composition: string;
  manufacturer: string;
  verifiedProductImage?: string;
  source: string;
  importantVerificationNote: string;
  commonUses: string[];
  commonSideEffects: string[];
  precautions: string[];
  interactionWarnings: string[];
  formattedTelegramText: string;
}

export class MedicineService {
  private db: IMedicineDatabase;

  constructor(database?: IMedicineDatabase) {
    this.db = database || new CuratedMedicineDatabase();
  }

  public async lookup(nameOrQuery: string, lang: SupportedLanguage = 'en'): Promise<FormattedMedicineResponse | null> {
    const record = await this.db.findByName(nameOrQuery);
    if (!record) {
      return null;
    }

    return this.formatRecord(record, lang);
  }

  public async search(query: string, lang: SupportedLanguage = 'en'): Promise<FormattedMedicineResponse[]> {
    const records = await this.db.search(query);
    return records.map((r) => this.formatRecord(r, lang));
  }

  private formatRecord(rec: MedicineRecord, lang: SupportedLanguage): FormattedMedicineResponse {
    let header = `💊 *Medicine Information*`;
    let disclaimerNote = `⚠️ *Important Verification Note*:\n${rec.verificationNote}\n\n_Never start, stop, or adjust prescription medicines without direct supervision from a qualified medical doctor._`;

    if (lang === 'hi') {
      header = `💊 *दवा की जानकारी (Medicine Information)*`;
      disclaimerNote = `⚠️ *महत्वपूर्ण सत्यापन नोट*:\n${rec.verificationNote}\n\n_डॉक्टर की सलाह के बिना कभी भी दवा की खुराक न बदलें और न ही दवा बंद करें।_`;
    } else if (lang === 'hinglish') {
      header = `💊 *Medicine Information*`;
      disclaimerNote = `⚠️ *Important Verification Note*:\n${rec.verificationNote}\n\n_Doctor ke prescription ke bina dosage badalna ya band karna dangerous ho sakta hai._`;
    }

    const brandList = rec.brandNames.join(', ');
    const usesList = rec.commonUses.map((u) => `• ${u}`).join('\n');
    const sideEffectsList = rec.commonSideEffects.map((s) => `• ${s}`).join('\n');
    const precautionsList = rec.precautions.map((p) => `• ${p}`).join('\n');
    const interactionsList = rec.interactions.map((i) => `• ${i}`).join('\n');

    const formattedTelegramText = `${header}

*Medicine:* ${rec.name} (${brandList})
*Strength:* ${rec.strength}
*Composition:* ${rec.composition}
*Manufacturer:* ${rec.manufacturer}

*Common Uses:*
${usesList}

*Common Side Effects:*
${sideEffectsList}

*Precautions:*
${precautionsList}

*Interaction Warnings:*
${interactionsList}

*Verified Product Image:* ${rec.verifiedImageUrl || 'No verified image available on official repository'}
*Source:* ${rec.imageSource || 'Official Pharmacopoeia / Licensed Registry'}

${disclaimerNote}`;

    return {
      medicine: rec.name,
      strength: rec.strength,
      composition: rec.composition,
      manufacturer: rec.manufacturer,
      verifiedProductImage: rec.verifiedImageUrl,
      source: rec.imageSource || 'Verified Pharmacopoeial Directory',
      importantVerificationNote: rec.verificationNote,
      commonUses: rec.commonUses,
      commonSideEffects: rec.commonSideEffects,
      precautions: rec.precautions,
      interactionWarnings: rec.interactions,
      formattedTelegramText
    };
  }
}

export const medicineService = new MedicineService();
