import { telegramBot } from './telegramBot.js';
import { logger } from '../utils/logger.js';

export type ProcessingType =
  | 'text'
  | 'report'
  | 'prescription'
  | 'medicine'
  | 'image'
  | 'generic'
  // Backward-compatible aliases
  | 'health_question'
  | 'lab_report'
  | 'general';

export const STATUS_PRESETS: Record<ProcessingType, string[]> = {
  text: ['🧠 Jeeva AI is thinking...'],
  report: [
    '📄 Reading your report...',
    '🔎 Checking the reported values...',
    '🧠 Preparing a clear explanation...'
  ],
  prescription: [
    '💊 Reading the prescription...',
    '🔎 Identifying readable medicines...'
  ],
  medicine: ['💊 Checking medicine information...'],
  image: ['🖼️ Analyzing the image...'],
  generic: ['🧠 Jeeva AI is processing your request...'],
  // Aliases for compatibility
  health_question: ['🧠 Jeeva AI is thinking...'],
  lab_report: [
    '📄 Reading your report...',
    '🔎 Checking the reported values...',
    '🧠 Preparing a clear explanation...'
  ],
  general: ['🧠 Jeeva AI is processing your request...']
};

interface ProcessingSession {
  chatId: number | string;
  type: ProcessingType;
  messageId: number | null;
  typingTimer: NodeJS.Timeout | null;
  currentStatus: string;
}

export class ProcessingIndicatorService {
  private sessions = new Map<string, ProcessingSession>();
  private readonly typingIntervalMs: number = 4000;

  private sessionKey(chatId: number | string): string {
    return String(chatId);
  }

  /**
   * Starts the typing indicator and sends an initial temporary status message.
   */
  public async startProcessing(
    chatId: number | string,
    type: ProcessingType = 'generic',
    initialStatus?: string
  ): Promise<number | null> {
    const key = this.sessionKey(chatId);

    // Idempotent cleanup: if an existing session is running for this chat, clean it up first
    if (this.sessions.has(key)) {
      await this.stopProcessing(chatId);
    }

    const defaultInitial = STATUS_PRESETS[type]?.[0] || '🧠 Jeeva AI is thinking...';
    const statusText = initialStatus || defaultInitial;

    logger.info(
      { lifecycle: 'processing_started', chatId: String(chatId), request_type: type },
      'processing_started: Starting typing indicator and temporary status message.'
    );

    // 1. Immediately send Telegram typing action
    await telegramBot.sendChatAction(chatId, 'typing');

    // 2. Set up periodic typing refresher (every 4s)
    const timer = setInterval(() => {
      telegramBot.sendChatAction(chatId, 'typing').catch((err) => {
        logger.debug({ err: err.message, chatId }, 'Periodic typing indicator refresh failed.');
      });
    }, this.typingIntervalMs);

    // Keep node process from hanging if timer is active
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }

    // 3. Send temporary status message
    let messageId: number | null = null;
    try {
      messageId = await telegramBot.sendMessageWithId({
        chat_id: chatId,
        text: statusText
      });
    } catch (err: any) {
      logger.warn({ err: err.message, chatId }, 'Failed to send temporary processing message.');
    }

    this.sessions.set(key, {
      chatId,
      type,
      messageId,
      typingTimer: timer,
      currentStatus: statusText
    });

    return messageId;
  }

  /**
   * Updates the text of the existing temporary status message.
   */
  public async updateProcessing(chatId: number | string, status: string): Promise<boolean> {
    const key = this.sessionKey(chatId);
    const session = this.sessions.get(key);

    if (!session) {
      logger.debug({ chatId }, 'updateProcessing called for nonexistent session.');
      return false;
    }

    if (session.currentStatus === status) {
      return true;
    }

    session.currentStatus = status;

    if (session.messageId !== null) {
      return telegramBot.editMessageText(chatId, session.messageId, status);
    }

    return false;
  }

  /**
   * Stops the typing indicator, cleans up the timer, and deletes the temporary status message.
   * Guaranteed to be idempotent and never throws if deletion fails.
   */
  public async stopProcessing(chatId: number | string): Promise<boolean> {
    const key = this.sessionKey(chatId);
    const session = this.sessions.get(key);

    if (!session) {
      return false;
    }

    // Clear timer
    if (session.typingTimer) {
      clearInterval(session.typingTimer);
      session.typingTimer = null;
    }

    // Delete temporary message safely (never throw)
    if (session.messageId !== null) {
      try {
        await telegramBot.deleteMessage(chatId, session.messageId);
      } catch (err: any) {
        logger.debug(
          { err: err.message, chatId, messageId: session.messageId },
          'Failed to delete temporary status message (suppressed).'
        );
      }
    }

    this.sessions.delete(key);

    logger.info(
      { lifecycle: 'processing_stopped', chatId: String(chatId) },
      'processing_stopped: Cleared typing indicator and removed temporary status.'
    );

    return true;
  }

  /**
   * Safe execution wrapper: starts processing, provides update function,
   * and guarantees stopProcessing cleanup in finally.
   */
  public async withProcessing<T>(
    chatId: number | string,
    type: ProcessingType,
    task: (update: (status: string) => Promise<boolean>) => Promise<T>
  ): Promise<T> {
    await this.startProcessing(chatId, type);
    try {
      return await task((status: string) => this.updateProcessing(chatId, status));
    } finally {
      await this.stopProcessing(chatId);
    }
  }

  /**
   * Returns whether a processing session is currently active for chatId
   */
  public isProcessing(chatId: number | string): boolean {
    return this.sessions.has(this.sessionKey(chatId));
  }

  /**
   * Get current session info (for testing / inspection)
   */
  public getSession(chatId: number | string) {
    return this.sessions.get(this.sessionKey(chatId));
  }
}

export const processingIndicator = new ProcessingIndicatorService();

// Standalone export functions matching suggested API
export const startProcessing = (
  chatId: number | string,
  type: ProcessingType = 'generic',
  initialStatus?: string
) => processingIndicator.startProcessing(chatId, type, initialStatus);

export const updateProcessing = (chatId: number | string, status: string) =>
  processingIndicator.updateProcessing(chatId, status);

export const stopProcessing = (chatId: number | string) =>
  processingIndicator.stopProcessing(chatId);
