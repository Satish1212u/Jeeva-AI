import { MessageRole } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { ChatMessageParam } from '../ai/openai.js';

export const MAX_HISTORY_MESSAGES = 10; // Sliding window history limit

interface MemoryMessage {
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export class ConversationService {
  private static memoryConversations = new Map<string, MemoryMessage[]>();

  /**
   * Retrieves or creates active conversation for user
   */
  public static async getOrCreateActiveConversation(userId: string, familyProfileId?: string) {
    try {
      let conv = await prisma.conversation.findFirst({
        where: {
          userId,
          ...(familyProfileId ? { familyProfileId } : {})
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (!conv) {
        conv = await prisma.conversation.create({
          data: {
            userId,
            familyProfileId,
            title: 'Medical Assistant Consultation'
          }
        });
      }

      return conv;
    } catch (err) {
      logger.warn({ err }, 'Prisma error in getOrCreateActiveConversation; using memory conv.');
      return { id: `conv-${userId}`, userId, familyProfileId };
    }
  }

  /**
   * Appends message to conversation
   */
  public static async appendMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>
  ) {
    try {
      await prisma.message.create({
        data: {
          conversationId,
          role,
          content,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined
        }
      });

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });
    } catch (err) {
      logger.warn({ err }, 'Prisma error in appendMessage; storing in memory.');
      let list = this.memoryConversations.get(conversationId);
      if (!list) {
        list = [];
        this.memoryConversations.set(conversationId, list);
      }
      list.push({ role, content, createdAt: new Date() });
    }
  }

  /**
   * Retrieves conversation history bounded by MAX_HISTORY_MESSAGES
   */
  public static async getBoundedHistory(conversationId: string): Promise<ChatMessageParam[]> {
    try {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: MAX_HISTORY_MESSAGES
      });

      if (messages.length === 0) {
        const memList = this.memoryConversations.get(conversationId);
        if (memList && memList.length > 0) {
          const sliced = memList.slice(-MAX_HISTORY_MESSAGES);
          return sliced.map((m) => ({
            role: m.role.toLowerCase() as 'system' | 'user' | 'assistant',
            content: m.content
          }));
        }
      }

      // Reverse so messages are chronological (oldest to newest)
      return messages.reverse().map((m) => ({
        role: m.role.toLowerCase() as 'system' | 'user' | 'assistant',
        content: m.content
      }));
    } catch (err) {
      logger.warn({ err }, 'Prisma error in getBoundedHistory; reading from memory.');
      const list = this.memoryConversations.get(conversationId) || [];
      const sliced = list.slice(-MAX_HISTORY_MESSAGES);
      return sliced.map((m) => ({
        role: m.role.toLowerCase() as 'system' | 'user' | 'assistant',
        content: m.content
      }));
    }
  }
}
