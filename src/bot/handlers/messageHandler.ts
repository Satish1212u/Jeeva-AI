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
import { startProcessing, stopProcessing } from '../processingIndicator.js';
import { logger } from '../../utils/logger.js';

export function getLocalizedErrorMessage(lang: SupportedLanguage = 'en'): string {
  switch (lang) {
    case 'hi':
      return '⚠️ Jeeva AI अभी इस request को पूरा नहीं कर पाया।\nकृपया थोड़ी देर बाद दोबारा प्रयास करें।';
    case 'hinglish':
      return '⚠️ Jeeva AI abhi request process nahi kar paaya.\nThodi der baad dobara try karein.';
    case 'en':
    default:
      return "⚠️ Jeeva AI couldn't complete that request right now.\nPlease try again in a moment.";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMsg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMsg));
    }, timeoutMs);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export class MessageHandler {
  public static async handleTextMessage(
    chatId: number,
    text: string,
    userMeta: { id: number; firstName?: string; username?: string }
  ): Promise<void> {
    const startTime = Date.now();
    let currentLang: SupportedLanguage = 'en';

    try {
      logger.info(
        { lifecycle: 'request_received', chatId, userId: userMeta.id },
        'request_received: Processing incoming text message.'
      );

      const trimmed = text.trim();

      // 1. Handle Slash Commands
      if (trimmed.startsWith('/')) {
        const cmd = trimmed.split(' ')[0].toLowerCase();
        switch (cmd) {
          case '/start':
            await CommandHandler.handleStart(chatId, userMeta);
            break;
          case '/help':
            await CommandHandler.handleHelp(chatId);
            break;
          case '/privacy':
            await CommandHandler.handlePrivacy(chatId);
            break;
          case '/profile':
            await CommandHandler.handleProfile(chatId, userMeta.id);
            break;
          case '/reset':
            await CommandHandler.handleReset(chatId, userMeta.id);
            break;
          case '/summary':
            await CommandHandler.handleSummary(chatId, userMeta.id);
            break;
          case '/compare':
            await CommandHandler.handleCompare(chatId);
            break;
          default:
            await telegramBot.sendMessage({
              chat_id: chatId,
              text: `Unrecognized command "${cmd}". Send /help to see all available commands.`
            });
            break;
        }
        logger.info({ lifecycle: 'request_completed', chatId, latencyMs: Date.now() - startTime }, 'request_completed');
        return;
      }

      // 2. Fetch or create persistent user profile with safe degraded fallback
      let user: any;
      try {
        user = await UserService.getOrCreateUser({
          telegramId: userMeta.id,
          displayName: userMeta.firstName,
          username: userMeta.username
        });
      } catch (dbErr: any) {
        logger.warn(
          { lifecycle: 'db_persist_failed', err: dbErr.message, userId: userMeta.id },
          'UserService DB error; operating in degraded in-memory mode.'
        );
        user = {
          id: `guest-${userMeta.id}`,
          telegramId: String(userMeta.id),
          displayName: userMeta.firstName || 'User',
          preferredLanguage: 'en',
          familyProfiles: [{ id: `prof-${userMeta.id}`, name: 'Self', relationship: 'SELF' }]
        };
      }

      // Detect language or use user's saved preference
      const detectedLang = detectLanguage(trimmed);
      currentLang = (user?.preferredLanguage as SupportedLanguage) || detectedLang;

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

        await telegramBot.sendMessage({
          chat_id: chatId,
          text: `✅ Successfully created profile for *${newProfile.name}* (${newProfile.relationship}).\n\nUse /profile to switch active patient records.`
        });
        logger.info({ lifecycle: 'request_completed', chatId, latencyMs: Date.now() - startTime }, 'request_completed');
        return;
      }

      // 4. Intent classification & Safety Check
      const route = IntentRouter.route(trimmed, currentLang);
      logger.info(
        { lifecycle: 'request_routed', chatId, intent: route.intent, isEmergency: route.isEmergency },
        'request_routed: Intent determined.'
      );

      // Emergency red-flag response takes absolute priority
      if (route.isEmergency && route.emergencyResponse) {
        await telegramBot.sendMessage({
          chat_id: chatId,
          text: route.emergencyResponse
        });
        logger.info({ lifecycle: 'request_completed', chatId, latencyMs: Date.now() - startTime }, 'request_completed');
        return;
      }

      // 5. Medicine Lookup Intent
      if (route.intent === 'MEDICINE_LOOKUP') {
        const medQuery = trimmed
          .replace(/\b(what is|tell me about|info for|side effects of|uses of|dawa|tablet|capsule|syrup)\b/gi, '')
          .trim();

        if (medQuery.length >= 2) {
          await startProcessing(chatId, 'medicine');
          try {
            const medResult = await medicineService.lookup(medQuery, currentLang);
            if (medResult) {
              await stopProcessing(chatId);
              logger.info({ lifecycle: 'telegram_send_started', chatId, type: 'medicine_info' }, 'telegram_send_started');
              if (medResult.verifiedProductImage && medResult.verifiedProductImage.startsWith('http')) {
                await telegramBot.sendPhoto({
                  chat_id: chatId,
                  photo: medResult.verifiedProductImage,
                  caption: medResult.formattedTelegramText
                });
              } else {
                await telegramBot.sendMessage({
                  chat_id: chatId,
                  text: medResult.formattedTelegramText
                });
              }
              logger.info({ lifecycle: 'telegram_send_completed', chatId }, 'telegram_send_completed');
              logger.info({ lifecycle: 'request_completed', chatId, latencyMs: Date.now() - startTime }, 'request_completed');
              return;
            } else {
              await stopProcessing(chatId);
            }
          } catch (medErr: any) {
            await stopProcessing(chatId);
            logger.error({ lifecycle: 'request_failed', err: medErr.message, chatId }, 'Error in medicine lookup.');
            await telegramBot.sendMessage({
              chat_id: chatId,
              text: 'I could not retrieve the requested medicine information right now. Please verify the name or consult a licensed pharmacist.'
            });
            return;
          }
        }
      }

      // 6. Doctor Summary Intent via natural text
      if (route.intent === 'DOCTOR_SUMMARY') {
        await CommandHandler.handleSummary(chatId, userMeta.id);
        logger.info({ lifecycle: 'request_completed', chatId, latencyMs: Date.now() - startTime }, 'request_completed');
        return;
      }

      // 7. General AI Consultation & Symptom Q&A
      await startProcessing(chatId, 'health_question');

      const activeProfile =
        user?.familyProfiles?.find((p: any) => p.id === user.activeProfileId) || user?.familyProfiles?.[0];

      let conversationId = `conv-${user?.id || userMeta.id}`;
      let history: any[] = [];

      try {
        const conversation = await ConversationService.getOrCreateActiveConversation(
          user?.id || `guest-${userMeta.id}`,
          activeProfile?.id
        );
        conversationId = conversation.id;
        history = await ConversationService.getBoundedHistory(conversation.id);
      } catch (convErr: any) {
        logger.warn(
          { lifecycle: 'db_persist_failed', err: convErr.message, chatId },
          'Failed to load conversation history; continuing with empty history.'
        );
      }

      // Context for LLM
      const userContext = {
        displayName: user?.displayName || userMeta.firstName || 'User',
        activeProfileName: activeProfile?.name || 'Self',
        relationship: activeProfile?.relationship || 'Self',
        gender: activeProfile?.gender || undefined,
        bloodGroup: activeProfile?.bloodGroup || undefined,
        allergies: activeProfile?.allergies,
        knownConditions: activeProfile?.knownConditions
      };

      // Append user message safely (DB failure should not block AI generation)
      try {
        logger.info({ lifecycle: 'db_persist_started', type: 'user_message', conversationId }, 'db_persist_started');
        await ConversationService.appendMessage(conversationId, 'USER', trimmed);
      } catch (userMsgErr: any) {
        logger.error(
          { lifecycle: 'db_persist_failed', type: 'user_message', err: userMsgErr.message, conversationId },
          'db_persist_failed: Could not persist user message to history.'
        );
      }

      // Build medical system prompt with patient context
      const systemInstruction = buildSystemPrompt(currentLang, userContext);
      const requestType = aiRouter.determineRequestType(trimmed);

      // Execute via AIRouter with bounded request timeout (35s)
      logger.info({ lifecycle: 'ai_started', chatId, requestType }, 'ai_started');
      const routeResult = await withTimeout(
        aiRouter.execute(
          {
            requestType,
            prompt: trimmed,
            systemInstruction,
            history: history.map((h) => ({ role: h.role, content: h.content }))
          },
          currentLang
        ),
        35000,
        'AI request timed out after 35 seconds.'
      );
      logger.info(
        {
          lifecycle: 'ai_completed',
          chatId,
          provider: routeResult.providerUsed,
          fallbackUsed: routeResult.fallbackUsed
        },
        'ai_completed'
      );

      // Append assistant message safely AFTER AI generation:
      // Failure to persist must NOT fail sending the AI response to the user!
      try {
        logger.info({ lifecycle: 'db_persist_started', type: 'assistant_message', conversationId }, 'db_persist_started');
        await ConversationService.appendMessage(
          conversationId,
          'ASSISTANT',
          routeResult.guardResult.content,
          {
            provider: routeResult.providerUsed,
            fallbackUsed: routeResult.fallbackUsed,
            tokensUsed: routeResult.response.tokensUsed?.totalTokens,
            sanitized: routeResult.guardResult.isSanitized
          }
        );
      } catch (persistErr: any) {
        logger.error(
          { lifecycle: 'db_persist_failed', type: 'assistant_message', err: persistErr.message, conversationId },
          'db_persist_failed: Failed to persist assistant message to history. Delivering AI response anyway.'
        );
      }

      // Stop processing and remove temporary status indicator before sending final response
      await stopProcessing(chatId);

      // Send answer back to Telegram user
      logger.info({ lifecycle: 'telegram_send_started', chatId }, 'telegram_send_started');
      await telegramBot.sendMessage({
        chat_id: chatId,
        text: routeResult.guardResult.content
      });
      logger.info({ lifecycle: 'telegram_send_completed', chatId }, 'telegram_send_completed');

      logger.info({ lifecycle: 'request_completed', chatId, latencyMs: Date.now() - startTime }, 'request_completed');
    } catch (unexpectedError: any) {
      // Top-level error boundary: catch ANY unexpected error, clean up, and send user-facing fallback
      logger.error(
        {
          lifecycle: 'request_failed',
          chatId,
          errorCategory: unexpectedError?.name || 'UNEXPECTED_ERROR',
          errorMessage: unexpectedError?.message
        },
        'request_failed: Unhandled exception in MessageHandler.handleTextMessage.'
      );

      // Guaranteed cleanup of processing indicator
      try {
        await stopProcessing(chatId);
      } catch {
        // Ignore secondary stop error
      }

      // Deliver localized, empathetic fallback message without internal details
      const fallbackText = getLocalizedErrorMessage(currentLang);
      try {
        await telegramBot.sendMessage({
          chat_id: chatId,
          text: fallbackText
        });
      } catch (sendErr: any) {
        logger.error({ err: sendErr.message, chatId }, 'Critical: Failed to send fallback message to Telegram user.');
      }
    } finally {
      // Guaranteed cleanup on success, error, or early return
      await stopProcessing(chatId);
    }
  }
}
