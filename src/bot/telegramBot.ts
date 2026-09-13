import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageOptions {
  chat_id: number | string;
  text: string;
  parse_mode?: 'Markdown' | 'HTML';
  reply_markup?: InlineKeyboardMarkup;
}

export interface SendPhotoOptions {
  chat_id: number | string;
  photo: string;
  caption?: string;
  parse_mode?: 'Markdown' | 'HTML';
  reply_markup?: InlineKeyboardMarkup;
}

export class TelegramBotClient {
  private http: AxiosInstance;
  private token: string;

  constructor(token: string = env.TELEGRAM_BOT_TOKEN) {
    this.token = token;
    this.http = axios.create({
      baseURL: `https://api.telegram.org/bot${token}`,
      timeout: 25000
    });
  }

  private get isSimulated(): boolean {
    return this.token.includes('dummy') || this.token.includes('test') || process.env.NODE_ENV === 'test';
  }

  /**
   * Send a text message to a Telegram chat with automatic retry and markdown fallback
   */
  public async sendMessage(options: SendMessageOptions): Promise<boolean> {
    // Never attempt to send an empty or whitespace-only message
    const trimmed = options.text?.trim();
    const safeText = trimmed && trimmed.length > 0
      ? options.text
      : '⚠️ I processed your request, but cannot display an empty message. Please try asking your question again.';

    if (this.isSimulated) {
      logger.info({ options: { ...options, text: safeText } }, 'Telegram dummy client: message sent (simulated).');
      return true;
    }

    const payload = {
      chat_id: options.chat_id,
      text: safeText,
      parse_mode: options.parse_mode ?? 'Markdown',
      reply_markup: options.reply_markup
    };

    // Attempt 1: Try with preferred parse_mode
    try {
      await this.http.post('/sendMessage', payload);
      return true;
    } catch (err: any) {
      const errMsg = err.response?.data?.description || err.message;
      logger.warn(
        { err: errMsg, chatId: options.chat_id },
        'Telegram sendMessage attempt 1 failed; retrying without parse_mode.'
      );

      // Attempt 2: Retry without parse_mode (handles Markdown syntax parsing errors)
      try {
        await this.http.post('/sendMessage', {
          ...payload,
          parse_mode: undefined
        });
        return true;
      } catch (retryErr: any) {
        const retryErrMsg = retryErr.response?.data?.description || retryErr.message;
        logger.error(
          { err: retryErrMsg, chatId: options.chat_id },
          'Telegram sendMessage attempt 2 failed.'
        );
        return false;
      }
    }
  }

  /**
   * Send a text message and return the Telegram message_id (useful for temporary status messages)
   */
  public async sendMessageWithId(options: SendMessageOptions): Promise<number | null> {
    const trimmed = options.text?.trim();
    const safeText = trimmed && trimmed.length > 0
      ? options.text
      : '🧠 Jeeva AI is thinking...';

    if (this.isSimulated) {
      logger.info({ options: { ...options, text: safeText } }, 'Telegram dummy client: message sent with simulated ID.');
      return Math.floor(Math.random() * 900000) + 100000;
    }

    const payload = {
      chat_id: options.chat_id,
      text: safeText,
      parse_mode: options.parse_mode ?? 'Markdown',
      reply_markup: options.reply_markup
    };

    try {
      const res = await this.http.post('/sendMessage', payload);
      return res.data?.result?.message_id ?? null;
    } catch (err: any) {
      const errMsg = err.response?.data?.description || err.message;
      logger.warn(
        { err: errMsg, chatId: options.chat_id },
        'Failed to send Telegram message with ID on attempt 1; retrying without parse_mode.'
      );
      try {
        const res = await this.http.post('/sendMessage', {
          ...payload,
          parse_mode: undefined
        });
        return res.data?.result?.message_id ?? null;
      } catch (retryErr: any) {
        logger.error(
          { err: retryErr.response?.data?.description || retryErr.message, chatId: options.chat_id },
          'Failed to send Telegram message with ID on attempt 2.'
        );
        return null;
      }
    }
  }

  /**
   * Send chat action (e.g. 'typing', 'upload_photo', 'upload_document')
   */
  public async sendChatAction(
    chatId: number | string,
    action: 'typing' | 'upload_photo' | 'upload_document' = 'typing'
  ): Promise<boolean> {
    try {
      if (this.isSimulated) {
        return true;
      }

      await this.http.post('/sendChatAction', {
        chat_id: chatId,
        action
      });
      return true;
    } catch (err: any) {
      logger.warn({ err: err.response?.data || err.message, chatId, action }, 'Failed to send chat action.');
      return false;
    }
  }

  /**
   * Edit text of an existing message
   */
  public async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    parseMode?: 'Markdown' | 'HTML'
  ): Promise<boolean> {
    try {
      if (this.isSimulated) {
        logger.info({ chatId, messageId, text }, 'Telegram dummy client: message edited (simulated).');
        return true;
      }

      await this.http.post('/editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: parseMode ?? 'Markdown'
      });
      return true;
    } catch (err: any) {
      logger.warn({ err: err.response?.data || err.message, chatId, messageId }, 'Failed to edit message text.');
      return false;
    }
  }

  /**
   * Delete a message by message_id
   */
  public async deleteMessage(chatId: number | string, messageId: number): Promise<boolean> {
    try {
      if (this.isSimulated) {
        logger.info({ chatId, messageId }, 'Telegram dummy client: message deleted (simulated).');
        return true;
      }

      await this.http.post('/deleteMessage', {
        chat_id: chatId,
        message_id: messageId
      });
      return true;
    } catch (err: any) {
      logger.warn({ err: err.response?.data || err.message, chatId, messageId }, 'Failed to delete message.');
      return false;
    }
  }

  /**
   * Send a photo by URL or file_id with optional caption
   */
  public async sendPhoto(options: SendPhotoOptions): Promise<boolean> {
    try {
      if (this.isSimulated) {
        logger.info({ options }, 'Telegram dummy client: photo sent (simulated).');
        return true;
      }

      await this.http.post('/sendPhoto', {
        chat_id: options.chat_id,
        photo: options.photo,
        caption: options.caption,
        parse_mode: options.parse_mode ?? 'Markdown',
        reply_markup: options.reply_markup
      });
      return true;
    } catch (err: any) {
      logger.error(
        { err: err.response?.data || err.message, chatId: options.chat_id },
        'Failed to send Telegram photo.'
      );
      return false;
    }
  }

  /**
   * Answer an inline callback query
   */
  public async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    try {
      if (this.isSimulated) {
        return true;
      }

      await this.http.post('/answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text
      });
      return true;
    } catch (err: any) {
      logger.warn({ err: err.response?.data || err.message }, 'Failed to answer callback query.');
      return false;
    }
  }

  /**
   * Download a file from Telegram using file_id
   */
  public async downloadFile(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
    try {
      if (this.isSimulated) {
        return {
          buffer: Buffer.from('Simulated file content for testing.'),
          filePath: 'documents/dummy_test_report.pdf'
        };
      }

      const getFileRes = await this.http.post('/getFile', { file_id: fileId });
      const filePath = getFileRes.data.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;

      const fileStreamRes = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
      return {
        buffer: Buffer.from(fileStreamRes.data),
        filePath
      };
    } catch (err: any) {
      logger.error({ err: err.response?.data || err.message, fileId }, 'Failed to download Telegram file.');
      throw new Error(`Could not download file from Telegram: ${err.message}`);
    }
  }

  /**
   * Sets up webhook URL with secret token on Telegram
   */
  public async setWebhook(webhookUrl: string, secretToken: string): Promise<boolean> {
    try {
      const res = await this.http.post('/setWebhook', {
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message', 'callback_query']
      });
      logger.info({ result: res.data }, 'Telegram webhook registered successfully.');
      return true;
    } catch (err: any) {
      logger.error({ err: err.response?.data || err.message }, 'Failed to set Telegram webhook.');
      return false;
    }
  }
}

export const telegramBot = new TelegramBotClient();
