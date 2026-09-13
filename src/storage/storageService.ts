import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface StorageResult {
  storagePath: string;
  fileSize: number;
  mimeType: string;
}

export interface IStorageProvider {
  save(buffer: Buffer, originalName: string, mimeType: string): Promise<StorageResult>;
  get(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png'
];

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Local Disk Storage Provider
 */
export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor(baseDir: string = env.LOCAL_STORAGE_DIR) {
    this.baseDir = path.resolve(baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async save(buffer: Buffer, originalName: string, mimeType: string): Promise<StorageResult> {
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${sanitizedName}`;
    const targetPath = path.join(this.baseDir, filename);

    await fs.promises.writeFile(targetPath, buffer);
    logger.info({ targetPath, size: buffer.length }, 'File saved to local storage.');

    return {
      storagePath: targetPath,
      fileSize: buffer.length,
      mimeType
    };
  }

  public async get(storagePath: string): Promise<Buffer> {
    return fs.promises.readFile(storagePath);
  }

  public async delete(storagePath: string): Promise<void> {
    if (fs.existsSync(storagePath)) {
      await fs.promises.unlink(storagePath);
      logger.info({ storagePath }, 'File deleted from local storage.');
    }
  }
}

/**
 * Storage Service Factory and Validator
 */
export class StorageService {
  private provider: IStorageProvider;

  constructor(provider?: IStorageProvider) {
    this.provider = provider || new LocalStorageProvider();
  }

  public validateFile(buffer: Buffer, mimeType: string): { valid: boolean; error?: string } {
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size exceeds the 15 MB limit (received ${(buffer.length / (1024 * 1024)).toFixed(1)} MB).`
      };
    }

    const normalizedMime = mimeType.toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
      return {
        valid: false,
        error: `Unsupported file type "${mimeType}". Allowed formats: PDF, JPG, JPEG, PNG.`
      };
    }

    return { valid: true };
  }

  public async storeFile(buffer: Buffer, originalName: string, mimeType: string): Promise<StorageResult> {
    const validation = this.validateFile(buffer, mimeType);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return this.provider.save(buffer, originalName, mimeType);
  }

  public async deleteFile(storagePath: string): Promise<void> {
    return this.provider.delete(storagePath);
  }
}

export const storageService = new StorageService();
