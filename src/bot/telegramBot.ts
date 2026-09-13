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

  /**
   * Send a text message to a Telegram chat
   */
  public async sendMessage(options: SendMessageOptions): Promise<boolean> {
    try {
      // In dev/test with dummy token, log and succeed without failing
      if (this.token.includes('dummy') || this.token.includes('test')) {
        logger.info({ options }, 'Telegram dummy client: message sent (simulated).');
        return true;
      }

      await this.http.post('/sendMessage', {
        chat_id: options.chat_id,
        text: options.text,
        parse_mode: options.parse_mode ?? 'Markdown',
        reply_markup: options.reply_markup
      });
      return true;
    } catch (err: any) {
      logger.error(
        { err: err.response?.data || err.message, chatId: options.chat_id },
        'Failed to send Telegram message.'
      );
      // Fallback without parse_mode if markdown parsing failed
      if (options.parse_mode) {
        try {
          await this.http.post('/sendMessage', {
            chat_id: options.chat_id,
            text: options.text,
            reply_markup: options.reply_markup
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  /**
   * Send a photo by URL or file_id with optional caption
   */
  public async sendPhoto(options: SendPhotoOptions): Promise<boolean> {
    try {
      if (this.token.includes('dummy') || this.token.includes('test')) {
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
      if (this.token.includes('dummy') || this.token.includes('test')) {
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
      if (this.token.includes('dummy') || this.token.includes('test')) {
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
