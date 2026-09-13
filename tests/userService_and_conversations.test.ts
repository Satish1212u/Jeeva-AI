import { describe, it, expect } from 'vitest';
import { UserService } from '../src/users/userService.js';
import { ConversationService, MAX_HISTORY_MESSAGES } from '../src/conversations/conversationService.js';
import { Relationship } from '@prisma/client';

describe('UserService & ConversationService', () => {
  const testTelegramId = 888777;

  it('should create persistent user and default SELF family profile', async () => {
    const user = await UserService.getOrCreateUser({
      telegramId: testTelegramId,
      displayName: 'Priya',
      username: 'priya_health'
    });

    expect(user).toBeDefined();
    expect(user.displayName).toBe('Priya');
    expect(user.familyProfiles.length).toBeGreaterThanOrEqual(1);
    expect(user.activeProfileId).toBeDefined();
  });

  it('should add a family member profile and switch active profile', async () => {
    const newProfile = await UserService.addFamilyProfile(testTelegramId, {
      name: 'Ananya',
      relationship: Relationship.CHILD,
      allergies: ['Peanuts'],
      knownConditions: ['Mild Asthma']
    });

    expect(newProfile).toBeDefined();
    expect(newProfile.name).toBe('Ananya');
    expect(newProfile.relationship).toBe('CHILD');

    const updatedUser = await UserService.switchActiveProfile(testTelegramId, newProfile.id);
    expect(updatedUser.activeProfileId).toBe(newProfile.id);
  });

  it('should record consent without throwing', async () => {
    await expect(UserService.recordConsent(testTelegramId, 'TERMS_AND_DISCLAIMER')).resolves.not.toThrow();
  });

  it('should manage bounded conversation history within limits', async () => {
    const conv = await ConversationService.getOrCreateActiveConversation('user_123');
    expect(conv.id).toBeDefined();

    // Append 15 messages
    for (let i = 1; i <= 15; i++) {
      await ConversationService.appendMessage(
        conv.id,
        i % 2 === 0 ? 'ASSISTANT' : 'USER',
        `Test message ${i}`
      );
    }

    const history = await ConversationService.getBoundedHistory(conv.id);
    expect(history.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
    expect(history[history.length - 1].content).toBe('Test message 15');
  });

  it('should delete user data upon reset request', async () => {
    await UserService.deleteUserData(testTelegramId);
    // After deletion, getting user again creates fresh state
    const newUser = await UserService.getOrCreateUser({ telegramId: testTelegramId });
    expect(newUser).toBeDefined();
  });
});
