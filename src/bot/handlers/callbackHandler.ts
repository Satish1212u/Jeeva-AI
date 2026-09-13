import { telegramBot } from '../telegramBot.js';
import { InlineKeyboards } from '../keyboards/inlineKeyboards.js';
import { UserService } from '../../users/userService.js';
import { CommandHandler } from './commandHandler.js';
import { logger } from '../../utils/logger.js';
import { SupportedLanguage } from '../../utils/language.js';

export class CallbackHandler {
  public static async handleCallback(callbackQuery: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
  }) {
    const chatId = callbackQuery.message?.chat.id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    if (!chatId || !data) return;

    // Acknowledge the callback immediately
    await telegramBot.answerCallbackQuery(callbackQuery.id);

    try {
      // 1. Language switches
      if (data.startsWith('lang:')) {
        const selectedLang = data.replace('lang:', '') as SupportedLanguage;
        // Update user preference
        const user = await UserService.getOrCreateUser({
          telegramId: userId,
          preferredLanguage: selectedLang
        });
        user.preferredLanguage = selectedLang;

        const confirmationMsg =
          selectedLang === 'hi'
            ? '✅ भाषा बदलकर *हिंदी* कर दी गई है।'
            : selectedLang === 'hinglish'
            ? '✅ Language set to *Hinglish*.'
            : '✅ Language changed to *English*.';

        await telegramBot.sendMessage({
          chat_id: chatId,
          text: confirmationMsg,
          reply_markup: InlineKeyboards.mainMenu()
        });
        return;
      }

      // 2. Profile switcher
      if (data.startsWith('profile:switch:')) {
        const targetProfileId = data.replace('profile:switch:', '');
        const updatedUser = await UserService.switchActiveProfile(userId, targetProfileId);
        const activeProfile = updatedUser.familyProfiles.find((p) => p.id === updatedUser.activeProfileId);

        await telegramBot.sendMessage({
          chat_id: chatId,
          text: `✅ Switched active patient to: *${activeProfile?.name || 'Self'}* (${activeProfile?.relationship || 'Self'})\n\nAll subsequent questions, lab reports, and doctor summaries will apply to this profile.`,
          reply_markup: InlineKeyboards.mainMenu()
        });
        return;
      }

      // 3. Add family member
      if (data === 'profile:add_member') {
        await telegramBot.sendMessage({
          chat_id: chatId,
          text: `➕ *Add a Family Member*\n\nTo add a family member, send a message formatted like:\n\n\`Add Father: Ramesh, 58 yrs, B+, Diabetes\`\nor\n\`Add Child: Aarav, 6 yrs, Asthma\`\n\nJeeva AI will automatically create their isolated medical profile.`
        });
        return;
      }

      // 4. Menu action buttons
      switch (data) {
        case 'action:ask_question':
          await telegramBot.sendMessage({
            chat_id: chatId,
            text: `💬 *Ask Any Health Question*\n\nFeel free to describe what you or your family member are experiencing:\n• "Mera sugar level 140 fasting aaya hai, kya ye normal hai?"\n• "I have had a mild headache and dry cough for 2 days."\n• "What foods should I avoid with high uric acid?"\n\nJeeva AI provides clear, cautious explanations.`
          });
          break;

        case 'action:upload_report':
          await telegramBot.sendMessage({
            chat_id: chatId,
            text: `📋 *Upload Lab Report*\n\nPlease upload a photo (JPG/PNG) or document (PDF) of your laboratory report.\n\nJeeva AI will extract parameters (Hb, Sugar, Thyroid, LFT, KFT, Lipids) and explain what high or low markers mean in plain terms.`
          });
          break;

        case 'action:prescription':
          await telegramBot.sendMessage({
            chat_id: chatId,
            text: `📝 *Prescription Reader*\n\nPlease take a clear photo of your prescription and send it here.\n\nJeeva AI will detect medicine names, strengths, dosage frequencies, and duration, flagging any unclear handwriting for verification with your pharmacist.`
          });
          break;

        case 'action:medicine_info':
          await telegramBot.sendMessage({
            chat_id: chatId,
            text: `💊 *Medicine Information Lookup*\n\nType any brand or generic medicine name (e.g. *Dolo 650*, *Metformin 500*, *Pantocid 40*, *Azithral*).\n\nJeeva AI will return dosage strength, composition, verified package images, uses, side effects, precautions, and interaction warnings.`
          });
          break;

        case 'action:my_health':
          await CommandHandler.handleProfile(chatId, userId);
          break;

        case 'action:doctor_summary':
          await CommandHandler.handleSummary(chatId, userId);
          break;

        case 'action:change_language':
          await telegramBot.sendMessage({
            chat_id: chatId,
            text: `🌐 *Choose Your Preferred Language / अपनी भाषा चुनें:*`,
            reply_markup: InlineKeyboards.languageSelector()
          });
          break;

        case 'action:back_to_menu':
          await telegramBot.sendMessage({
            chat_id: chatId,
            text: `*Jeeva AI Main Menu* 🩺`,
            reply_markup: InlineKeyboards.mainMenu()
          });
          break;

        default:
          logger.info({ data }, 'Unknown callback action received.');
          break;
      }
    } catch (err) {
      logger.error({ err, data }, 'Error processing callback query.');
    }
  }
}
