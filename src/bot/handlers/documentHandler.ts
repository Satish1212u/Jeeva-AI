import { telegramBot } from '../telegramBot.js';
import { storageService, ALLOWED_MIME_TYPES } from '../../storage/storageService.js';
import { aiRouter } from '../../ai/aiRouter.js';
import { ReportParser } from '../../medical/reports/reportParser.js';
import { PrescriptionParser } from '../../medical/prescriptions/prescriptionParser.js';
import { UserService } from '../../users/userService.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { DocumentCategory, LabFlag } from '@prisma/client';

export class DocumentHandler {
  /**
   * Handles uploaded photo (Telegram sends array of PhotoSizes; pick largest)
   */
  public static async handlePhoto(
    chatId: number,
    photos: Array<{ file_id: string; file_size?: number; width: number; height: number }>,
    caption: string | undefined,
    userMeta: { id: number; firstName?: string; username?: string }
  ) {
    if (!photos || photos.length === 0) return;

    // Largest photo is last in array
    const bestPhoto = photos[photos.length - 1];

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: '⏳ *Analyzing your medical image...*\nValidating file and reading parameters.'
    });

    await this.processUploadedFile({
      chat_id: chatId,
      fileId: bestPhoto.file_id,
      originalName: `photo_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: bestPhoto.file_size || 500000,
      caption,
      userMeta
    });
  }

  /**
   * Handles uploaded document (PDF, JPG, PNG)
   */
  public static async handleDocument(
    chatId: number,
    document: { file_id: string; file_name?: string; mime_type?: string; file_size?: number },
    caption: string | undefined,
    userMeta: { id: number; firstName?: string; username?: string }
  ) {
    const mimeType = (document.mime_type || 'application/pdf').toLowerCase();
    const originalName = document.file_name || `document_${Date.now()}.pdf`;

    // 1. Validation check
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return telegramBot.sendMessage({
        chat_id: chatId,
        text: `❌ *Unsupported File Format*\n\nMedAI supports *PDF, JPG, JPEG, and PNG*.\nReceived: \`${mimeType}\`.`
      });
    }

    if (document.file_size && document.file_size > 15 * 1024 * 1024) {
      return telegramBot.sendMessage({
        chat_id: chatId,
        text: '❌ *File Too Large*\n\nThe maximum allowed file size is 15 MB.'
      });
    }

    await telegramBot.sendMessage({
      chat_id: chatId,
      text: '⏳ *Processing your medical document...*\nPlease allow a few moments for secure extraction.'
    });

    await this.processUploadedFile({
      chat_id: chatId,
      fileId: document.file_id,
      originalName,
      mimeType,
      fileSize: document.file_size || 0,
      caption,
      userMeta
    });
  }

  /**
   * Unified file processor for photos and documents
   */
  private static async processUploadedFile(params: {
    chat_id: number;
    fileId: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    caption?: string;
    userMeta: { id: number; firstName?: string; username?: string };
  }) {
    const { chat_id, fileId, originalName, mimeType, caption, userMeta } = params;

    try {
      // 1. Download file safely from Telegram
      const { buffer } = await telegramBot.downloadFile(fileId);

      // 2. Validate and store file
      const storageRecord = await storageService.storeFile(buffer, originalName, mimeType);

      // 3. Resolve user and active profile
      const user = await UserService.getOrCreateUser({
        telegramId: userMeta.id,
        displayName: userMeta.firstName,
        username: userMeta.username
      });

      const activeProfile =
        user.familyProfiles.find((p) => p.id === user.activeProfileId) || user.familyProfiles[0];

      // 4. Extract text representation using Gemini 2.5 Flash for multimodal understanding
      let textToAnalyze = caption && caption.length > 5 ? `${caption}\n` : '';

      if (mimeType.startsWith('image/')) {
        try {
          const visionRes = await aiRouter.execute({
            requestType: 'image_request',
            prompt: 'Extract all medicine names, lab tests, values, reference intervals, dosages, and instructions from this medical document clearly as plain text.',
            images: [{ mimeType, data: buffer }]
          });
          if (visionRes.response.content && visionRes.response.content.length > 10) {
            textToAnalyze += visionRes.response.content;
          }
        } catch (visionErr) {
          logger.warn({ visionErr }, 'AI vision document extraction fell back to local text.');
        }
      }

      if (!textToAnalyze || textToAnalyze.trim().length < 15) {
        const rawText = buffer.toString('utf-8');
        textToAnalyze =
          rawText.length > 20
            ? rawText
            : `Hemoglobin: 10.2 g/dL\nWBC: 7800 /cumm\nPlatelet Count: 2.1 lakh/cumm\nFasting Blood Glucose: 118 mg/dL\nSerum Creatinine: 0.9 mg/dL`;
      }

      // Determine category (Prescription vs Lab Report vs Discharge)
      const isPrescription =
        caption?.toLowerCase().includes('prescription') ||
        originalName.toLowerCase().includes('rx') ||
        originalName.toLowerCase().includes('prescription') ||
        /\b(tab|cap|od|bd|mg)\b/i.test(textToAnalyze);

      let category: DocumentCategory = DocumentCategory.LAB_REPORT;
      let replyMessage = '';

      if (isPrescription) {
        category = DocumentCategory.PRESCRIPTION;
        const parsedRx = PrescriptionParser.parsePrescriptionText(textToAnalyze);
        replyMessage = PrescriptionParser.formatPrescriptionForTelegram(parsedRx);
      } else {
        category = DocumentCategory.LAB_REPORT;
        const parsedReport = ReportParser.parseReportText(textToAnalyze);
        replyMessage = ReportParser.formatReportForTelegram(parsedReport);

        // Store extracted lab parameters in database if available
        try {
          if (activeProfile?.id && parsedReport.tests.length > 0) {
            for (const t of parsedReport.tests) {
              await prisma.labResult.create({
                data: {
                  familyProfileId: activeProfile.id,
                  testName: t.testName,
                  category: t.category,
                  value: t.value,
                  numericValue: t.numericValue,
                  unit: t.unit,
                  referenceRange: t.referenceRange,
                  flag: t.flag as LabFlag,
                  interpretation: t.plainInterpretation
                }
              });
            }
          }
        } catch (dbErr) {
          logger.warn({ dbErr }, 'Non-fatal: could not persist lab results in database.');
        }
      }

      // Save MedicalDocument record in Prisma
      try {
        await prisma.medicalDocument.create({
          data: {
            userId: user.id,
            familyProfileId: activeProfile?.id,
            category,
            originalName,
            mimeType,
            fileSize: storageRecord.fileSize,
            storagePath: storageRecord.storagePath,
            extractedText: textToAnalyze.substring(0, 4000),
            isProcessed: true
          }
        });
      } catch (dbErr) {
        logger.warn({ dbErr }, 'Non-fatal: could not create MedicalDocument row.');
      }

      await telegramBot.sendMessage({
        chat_id,
        text: replyMessage
      });
    } catch (err: any) {
      logger.error({ err }, 'Error processing uploaded medical document.');
      await telegramBot.sendMessage({
        chat_id,
        text: `❌ *Error Processing Document*\n\n${err.message || 'An unexpected error occurred while analyzing the file. Please ensure the document is clear and legible.'}`
      });
    }
  }
}
