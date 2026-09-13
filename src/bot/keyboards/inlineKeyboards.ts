import { InlineKeyboardMarkup } from '../telegramBot.js';

export class InlineKeyboards {
  /**
   * Main Menu Keyboard with required buttons
   */
  public static mainMenu(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '💬 Ask Health Question', callback_data: 'action:ask_question' },
          { text: '📋 Upload Report', callback_data: 'action:upload_report' }
        ],
        [
          { text: '📝 Prescription', callback_data: 'action:prescription' },
          { text: '💊 Medicine', callback_data: 'action:medicine_info' }
        ],
        [
          { text: '👤 My Health', callback_data: 'action:my_health' },
          { text: '🩺 Doctor Summary', callback_data: 'action:doctor_summary' }
        ],
        [
          { text: '🌐 Change Language / भाषा', callback_data: 'action:change_language' }
        ]
      ]
    };
  }

  /**
   * Language Selector Keyboard
   */
  public static languageSelector(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: 'English 🇬🇧', callback_data: 'lang:en' },
          { text: 'हिंदी (Hindi) 🇮🇳', callback_data: 'lang:hi' },
          { text: 'Hinglish 💬', callback_data: 'lang:hinglish' }
        ],
        [{ text: '« Back to Menu', callback_data: 'action:back_to_menu' }]
      ]
    };
  }

  /**
   * Profile Switcher Keyboard
   */
  public static profileSwitcher(
    profiles: Array<{ id: string; name: string; relationship: string; isCurrent: boolean }>
  ): InlineKeyboardMarkup {
    const profileButtons = profiles.map((p) => [
      {
        text: `${p.isCurrent ? '✅ ' : ''}${p.name} (${p.relationship})`,
        callback_data: `profile:switch:${p.id}`
      }
    ]);

    profileButtons.push([
      { text: '➕ Add Family Member', callback_data: 'profile:add_member' },
      { text: '« Back', callback_data: 'action:back_to_menu' }
    ]);

    return {
      inline_keyboard: profileButtons
    };
  }

  /**
   * Document Category Selector after file upload
   */
  public static documentCategoryPicker(fileId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          { text: '🩸 Blood / Lab Report', callback_data: `doc:category:lab:${fileId}` },
          { text: '📝 Prescription', callback_data: `doc:category:rx:${fileId}` }
        ],
        [
          { text: '📑 Discharge Summary', callback_data: `doc:category:discharge:${fileId}` },
          { text: '📄 General Health Doc', callback_data: `doc:category:general:${fileId}` }
        ]
      ]
    };
  }
}
