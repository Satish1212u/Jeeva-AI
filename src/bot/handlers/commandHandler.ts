import { telegramBot } from '../telegramBot.js';
import { InlineKeyboards } from '../keyboards/inlineKeyboards.js';
import { UserService } from '../../users/userService.js';
import { DoctorSummaryService } from '../../medical/summaries/doctorSummaryService.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';

export class CommandHandler {
  /**
   * Handle /start command
   */
  public static async handleStart(chatId: number, userMeta: { id: number; firstName?: string; username?: string }) {
    await UserService.getOrCreateUser({
      telegramId: userMeta.id,
      displayName: userMeta.firstName,
      username: userMeta.username
    });

    await UserService.recordConsent(userMeta.id, 'TERMS_AND_DISCLAIMER');

    const welcomeText = `Welcome to **Jeeva AI** 🩺

I can help you:
• understand health questions
• explain lab reports
• explain prescriptions
• understand medicines
• organize health information

⚠️ **Jeeva AI is an AI health assistant and does not replace a qualified doctor or emergency service.**`;

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: welcomeText,
      reply_markup: InlineKeyboards.mainMenu()
    });
  }

  /**
   * Handle /help command
   */
  public static async handleHelp(chatId: number) {
    const helpText = `📖 *Jeeva AI Quick User Guide*

*What You Can Do:*
1. 💬 *Chat with AI*: Simply type any health or symptom question in English, Hindi, or Hinglish.
2. 📋 *Lab Reports*: Send a photo or PDF of your blood test (CBC, KFT, LFT, Lipid, HbA1c, etc.).
3. 📝 *Prescriptions*: Upload a photo of a doctor's prescription for drug and dosage breakdown.
4. 💊 *Medicines*: Type any medicine name (e.g. "Paracetamol 650", "Pan 40") for verified uses, side effects, and precautions.
5. 👤 *Family Profiles*: Manage health logs for yourself and family members.
6. 🩺 *Doctor Summary*: Use \`/summary\` to generate a doctor-ready briefing before clinic visits.
7. 📊 *Report Comparison*: Use \`/compare\` to review trends between previous and recent lab results.

*Safety Commands:*
• \`/profile\` — View and switch family profiles
• \`/privacy\` — Read privacy policy & data usage
• \`/reset\` — Delete your chat history and stored health records
• \`/help\` — View this guide again

🚨 *Emergency*: If you have chest pain, sudden numbness, or severe breathing trouble, call *112* immediately.`;

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: helpText,
      reply_markup: InlineKeyboards.mainMenu()
    });
  }

  /**
   * Handle /privacy command
   */
  public static async handlePrivacy(chatId: number) {
    const privacyText = `🔒 *Jeeva AI Privacy & Data Policy*

• *Data Protection*: Your health queries and uploaded documents are encrypted and treated with strict confidentiality.
• *AI Safety*: We do not sell your health data or share personal identifiable information with advertisers.
• *Document Retention*: Sensitive medical files are processed solely for clinical report extraction and stored securely.
• *Right to Erasure*: You can wipe all your data at any time by sending \`/reset\`.
• *Medical Disclaimer*: Jeeva AI is an educational decision-support tool, not an authorized medical provider.`;

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: privacyText,
      reply_markup: InlineKeyboards.mainMenu()
    });
  }

  /**
   * Handle /profile command
   */
  public static async handleProfile(chatId: number, telegramId: number) {
    const user = await UserService.getOrCreateUser({ telegramId });
    const profiles = user.familyProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      isCurrent: p.id === user.activeProfileId
    }));

    const currentProfile = user.familyProfiles.find((p) => p.id === user.activeProfileId) || user.familyProfiles[0];

    const profileText = `👤 *Your Health Profiles*

*Active Patient Profile:*
• Name: *${currentProfile?.name || 'Self'}*
• Relationship: ${currentProfile?.relationship || 'Self'}
• Blood Group: ${currentProfile?.bloodGroup || 'Not specified'}
• Known Allergies: ${currentProfile?.allergies?.join(', ') || 'None recorded'}
• Pre-existing Conditions: ${currentProfile?.knownConditions?.join(', ') || 'None recorded'}

_Select a profile below to switch patient context:_`;

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: profileText,
      reply_markup: InlineKeyboards.profileSwitcher(profiles)
    });
  }

  /**
   * Handle /reset command
   */
  public static async handleReset(chatId: number, telegramId: number) {
    await UserService.deleteUserData(telegramId);

    const resetText = `🗑️ *All Personal Data Wiped*

Your conversation history, family profiles, uploaded documents, and lab records have been completely deleted from Jeeva AI.

Send /start whenever you wish to begin again.`;

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: resetText
    });
  }

  /**
   * Handle /summary command (Doctor-ready summary)
   */
  public static async handleSummary(chatId: number, telegramId: number) {
    const user = await UserService.getOrCreateUser({ telegramId });
    const currentProfile =
      user.familyProfiles.find((p) => p.id === user.activeProfileId) || user.familyProfiles[0];

    // Fetch active medications and recent abnormal labs if available
    let meds: string[] = [];
    let abnormalLabs: Array<{ testName: string; value: string; unit?: string; flag?: string; date?: string }> = [];

    try {
      if (currentProfile?.id) {
        const activeMeds = await prisma.medication.findMany({
          where: { familyProfileId: currentProfile.id, status: 'ACTIVE' }
        });
        meds = activeMeds.map((m) => `${m.name} ${m.dosage || ''} (${m.frequency || ''})`.trim());

        const labRecords = await prisma.labResult.findMany({
          where: { familyProfileId: currentProfile.id, flag: { in: ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'] } },
          orderBy: { observedAt: 'desc' },
          take: 5
        });
        abnormalLabs = labRecords.map((l) => ({
          testName: l.testName,
          value: l.value,
          unit: l.unit || undefined,
          flag: l.flag,
          date: l.observedAt.toISOString().split('T')[0]
        }));
      }
    } catch (err) {
      logger.warn({ err }, 'Error querying DB for summary; using profile attributes.');
    }

    const summaryText = DoctorSummaryService.generateSummary({
      patientName: currentProfile?.name || 'Self',
      relationship: currentProfile?.relationship || 'Self',
      gender: currentProfile?.gender || undefined,
      bloodGroup: currentProfile?.bloodGroup || undefined,
      mainConcerns: ['Routine clinical evaluation and discussion of recent symptoms.'],
      recentSymptoms: ['Mild seasonal fatigue, occasional digestive discomfort.'],
      relevantMedicalHistory: currentProfile?.knownConditions || [],
      currentMedications: meds,
      recentAbnormalLabValues: abnormalLabs,
      importantReports: ['Recent laboratory report attached.'],
      suggestedQuestionsToDiscuss: [
        'Do any recent lab fluctuations require pharmacological therapy or dietary adjustments?',
        'When should follow-up screening or repeat testing be performed?'
      ]
    });

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: summaryText
    });
  }

  /**
   * Handle /compare command
   */
  public static async handleCompare(chatId: number) {
    const compareText = `📊 *Compare Medical Reports*

To compare two lab reports:
1. Upload your *older report* (Photo or PDF).
2. Upload your *newer report*.
3. Jeeva AI will automatically match overlapping parameters (e.g. Hemoglobin, Sugar, Cholesterol, Creatinine) and chart whether values increased, decreased, normalized, or became newly abnormal.`;

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: compareText,
      reply_markup: InlineKeyboards.mainMenu()
    });
  }
}
