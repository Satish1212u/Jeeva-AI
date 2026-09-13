import { telegramBot } from '../telegramBot.js';
import { CommandHandler } from './commandHandler.js';
import { UserService } from '../../users/userService.js';
import { ConversationService } from '../../conversations/conversationService.js';
import { aiRouter } from '../../ai/aiRouter.js';
import { buildSystemPrompt } from '../../ai/prompts/systemPrompts.js';
import { medicineService } from '../../medical/medicines/medicineService.js';
import { IntentRouter } from '../../ai/router.js';
import { detectLanguage, SupportedLanguage } from '../../utils/language.js';
import { Relationship } from '@prisma/client';

export class MessageHandler {
  public static async handleTextMessage(
    chatId: number,
    text: string,
    userMeta: { id: number; firstName?: string; username?: string }
  ) {
    const trimmed = text.trim();

    // 1. Handle Slash Commands
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.split(' ')[0].toLowerCase();
      switch (cmd) {
        case '/start':
          return CommandHandler.handleStart(chatId, userMeta);
        case '/help':
          return CommandHandler.handleHelp(chatId);
        case '/privacy':
          return CommandHandler.handlePrivacy(chatId);
        case '/profile':
          return CommandHandler.handleProfile(chatId, userMeta.id);
        case '/reset':
          return CommandHandler.handleReset(chatId, userMeta.id);
        case '/summary':
          return CommandHandler.handleSummary(chatId, userMeta.id);
        case '/compare':
          return CommandHandler.handleCompare(chatId);
        default:
          return telegramBot.sendMessage({
            chat_id: chatId,
            text: `Unrecognized command "${cmd}". Send /help to see all available commands.`
          });
      }
    }

    // 2. Fetch or create persistent user profile
    const user = await UserService.getOrCreateUser({
      telegramId: userMeta.id,
      displayName: userMeta.firstName,
      username: userMeta.username
    });

    // Detect language or use user's saved preference
    const detectedLang = detectLanguage(trimmed);
    const lang: SupportedLanguage = (user.preferredLanguage as SupportedLanguage) || detectedLang;

    // 3. Quick natural language check: Add family profile
    // Format: "Add Father: Ramesh, 58 yrs, B+"
    const addProfileMatch = trimmed.match(/^add\s+(father|mother|spouse|child|sibling|other)\s*:\s*([^,]+)(.*)$/i);
    if (addProfileMatch) {
      const relStr = addProfileMatch[1].toUpperCase() as Relationship;
      const name = addProfileMatch[2].trim();
      const extraDetails = addProfileMatch[3]?.trim() || '';

      const newProfile = await UserService.addFamilyProfile(userMeta.id, {
        name,
        relationship: relStr,
        notes: extraDetails
      });

      return telegramBot.sendMessage({
        chat_id: chatId,
        text: `✅ Successfully created profile for *${newProfile.name}* (${newProfile.relationship}).\n\nUse /profile to switch active patient records.`
      });
    }

    // 4. Intent classification & Safety Check
    const route = IntentRouter.route(trimmed, lang);

    // Emergency red-flag response takes absolute priority
    if (route.isEmergency && route.emergencyResponse) {
      return telegramBot.sendMessage({
        chat_id: chatId,
        text: route.emergencyResponse
      });
    }

    // 5. Medicine Lookup Intent
    if (route.intent === 'MEDICINE_LOOKUP') {
      const medQuery = trimmed
        .replace(/\b(what is|tell me about|info for|side effects of|uses of|dawa|tablet|capsule|syrup)\b/gi, '')
        .trim();

      if (medQuery.length >= 2) {
        const medResult = await medicineService.lookup(medQuery, lang);
        if (medResult) {
          if (medResult.verifiedProductImage && medResult.verifiedProductImage.startsWith('http')) {
            await telegramBot.sendPhoto({
              chat_id: chatId,
              photo: medResult.verifiedProductImage,
              caption: medResult.formattedTelegramText
            });
            return;
          } else {
            return telegramBot.sendMessage({
              chat_id: chatId,
              text: medResult.formattedTelegramText
            });
          }
        }
      }
    }

    // 6. Doctor Summary Intent via natural text
    if (route.intent === 'DOCTOR_SUMMARY') {
      return CommandHandler.handleSummary(chatId, userMeta.id);
    }

    // 7. General AI Consultation & Symptom Q&A
    const activeProfile =
      user.familyProfiles.find((p) => p.id === user.activeProfileId) || user.familyProfiles[0];

    const conversation = await ConversationService.getOrCreateActiveConversation(
      user.id,
      activeProfile?.id
    );

    // Fetch conversation history
    const history = await ConversationService.getBoundedHistory(conversation.id);

    // Context for LLM
    const userContext = {
      displayName: user.displayName || 'User',
      activeProfileName: activeProfile?.name || 'Self',
      relationship: activeProfile?.relationship || 'Self',
      gender: activeProfile?.gender || undefined,
      bloodGroup: activeProfile?.bloodGroup || undefined,
      allergies: activeProfile?.allergies,
      knownConditions: activeProfile?.knownConditions
    };

    // Append user message
    await ConversationService.appendMessage(conversation.id, 'USER', trimmed);

    // Build medical system prompt with patient context
    const systemInstruction = buildSystemPrompt(lang, userContext);
    const requestType = aiRouter.determineRequestType(trimmed);

    // Execute via AIRouter (Gemini Flash / Flash-Lite -> Grok -> OpenRouter)
    const routeResult = await aiRouter.execute(
      {
        requestType,
        prompt: trimmed,
        systemInstruction,
        history: history.map((h) => ({ role: h.role, content: h.content }))
      },
      lang
    );

    // Append assistant message
    await ConversationService.appendMessage(
      conversation.id,
      'ASSISTANT',
      routeResult.guardResult.content,
      {
        provider: routeResult.providerUsed,
        fallbackUsed: routeResult.fallbackUsed,
        tokensUsed: routeResult.response.tokensUsed?.totalTokens,
        sanitized: routeResult.guardResult.isSanitized
      }
    );

    // Send answer back to Telegram user
    await telegramBot.sendMessage({
      chat_id: chatId,
      text: routeResult.guardResult.content
    });
  }
}
