import { Relationship } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';

export interface CreateUserInput {
  telegramId: number | bigint | string;
  displayName?: string;
  username?: string;
  preferredLanguage?: string;
}

export interface FamilyProfileInput {
  name: string;
  relationship: Relationship;
  dateOfBirth?: Date;
  gender?: string;
  bloodGroup?: string;
  allergies?: string[];
  knownConditions?: string[];
  notes?: string;
}

// In-memory fallback map for offline / test environments without PostgreSQL running
interface MemoryUser {
  id: string;
  telegramId: string;
  displayName?: string;
  username?: string;
  preferredLanguage: string;
  activeProfileId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
  familyProfiles: MemoryProfile[];
}

interface MemoryProfile {
  id: string;
  userId: string;
  name: string;
  relationship: Relationship;
  dateOfBirth?: Date;
  gender?: string;
  bloodGroup?: string;
  allergies: string[];
  knownConditions: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserService {
  private static memoryUsers = new Map<string, MemoryUser>();

  /**
   * Get or create a persistent user by Telegram ID
   */
  public static async getOrCreateUser(input: CreateUserInput) {
    const telegramIdBigInt = BigInt(input.telegramId);

    try {
      let user = await prisma.user.findUnique({
        where: { telegramId: telegramIdBigInt },
        include: { familyProfiles: true }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId: telegramIdBigInt,
            displayName: input.displayName,
            username: input.username,
            preferredLanguage: input.preferredLanguage || 'en',
            familyProfiles: {
              create: {
                name: input.displayName || 'Self',
                relationship: Relationship.SELF
              }
            }
          },
          include: { familyProfiles: true }
        });

        // Set active profile to default self
        if (user.familyProfiles[0]) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { activeProfileId: user.familyProfiles[0].id },
            include: { familyProfiles: true }
          });
        }
      } else {
        // Update lastActiveAt
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            lastActiveAt: new Date(),
            displayName: input.displayName || user.displayName,
            username: input.username || user.username
          },
          include: { familyProfiles: true }
        });
      }

      return user;
    } catch (err) {
      logger.warn({ err }, 'Prisma error in getOrCreateUser; falling back to in-memory store.');
      return this.getOrCreateInMemory(input);
    }
  }

  /**
   * Switch active family profile
   */
  public static async switchActiveProfile(telegramId: number | bigint | string, profileId: string) {
    const tgId = BigInt(telegramId);
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: tgId },
        include: { familyProfiles: true }
      });

      if (!user) throw new Error('User not found');

      const targetProfile = user.familyProfiles.find((p) => p.id === profileId);
      if (!targetProfile) throw new Error('Profile does not belong to this user');

      return await prisma.user.update({
        where: { id: user.id },
        data: { activeProfileId: profileId },
        include: { familyProfiles: true }
      });
    } catch (err) {
      logger.warn({ err }, 'Prisma error in switchActiveProfile; using in-memory store.');
      const memUser = this.memoryUsers.get(tgId.toString());
      if (memUser) {
        memUser.activeProfileId = profileId;
        return memUser;
      }
      throw err;
    }
  }

  /**
   * Add a family member profile
   */
  public static async addFamilyProfile(telegramId: number | bigint | string, input: FamilyProfileInput) {
    const tgId = BigInt(telegramId);
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: tgId }
      });

      if (!user) throw new Error('User not found');

      return await prisma.familyProfile.create({
        data: {
          userId: user.id,
          name: input.name,
          relationship: input.relationship,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          bloodGroup: input.bloodGroup,
          allergies: input.allergies || [],
          knownConditions: input.knownConditions || [],
          notes: input.notes
        }
      });
    } catch (err) {
      logger.warn({ err }, 'Prisma error in addFamilyProfile; using in-memory store.');
      const memUser = this.memoryUsers.get(tgId.toString());
      if (memUser) {
        const newProf: MemoryProfile = {
          id: `profile-${Date.now()}`,
          userId: memUser.id,
          name: input.name,
          relationship: input.relationship,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          bloodGroup: input.bloodGroup,
          allergies: input.allergies || [],
          knownConditions: input.knownConditions || [],
          notes: input.notes,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        memUser.familyProfiles.push(newProf);
        return newProf;
      }
      throw err;
    }
  }

  /**
   * Record user consent
   */
  public static async recordConsent(telegramId: number | bigint | string, consentType: string) {
    const tgId = BigInt(telegramId);
    try {
      const user = await prisma.user.findUnique({ where: { telegramId: tgId } });
      if (user) {
        await prisma.consent.create({
          data: {
            userId: user.id,
            consentType,
            granted: true
          }
        });
      }
    } catch (err) {
      logger.warn({ err }, 'Prisma error in recordConsent; handled gracefully.');
    }
  }

  /**
   * Delete all user data (Privacy / GDPR / Reset)
   */
  public static async deleteUserData(telegramId: number | bigint | string) {
    const tgId = BigInt(telegramId);
    try {
      const user = await prisma.user.findUnique({ where: { telegramId: tgId } });
      if (user) {
        await prisma.user.delete({ where: { id: user.id } });
      }
    } catch (err) {
      logger.warn({ err }, 'Prisma error in deleteUserData; clearing memory store.');
    }
    this.memoryUsers.delete(tgId.toString());
  }

  // --- In-Memory Fallback Implementation ---
  private static getOrCreateInMemory(input: CreateUserInput) {
    const key = BigInt(input.telegramId).toString();
    let mem = this.memoryUsers.get(key);
    if (!mem) {
      const defaultProfileId = `prof-${Date.now()}`;
      const defaultProfile: MemoryProfile = {
        id: defaultProfileId,
        userId: `user-${Date.now()}`,
        name: input.displayName || 'Self',
        relationship: Relationship.SELF,
        allergies: [],
        knownConditions: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mem = {
        id: defaultProfile.userId,
        telegramId: key,
        displayName: input.displayName,
        username: input.username,
        preferredLanguage: input.preferredLanguage || 'en',
        activeProfileId: defaultProfileId,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActiveAt: new Date(),
        familyProfiles: [defaultProfile]
      };
      this.memoryUsers.set(key, mem);
    } else {
      mem.lastActiveAt = new Date();
    }
    return mem;
  }
}
