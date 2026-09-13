import { describe, it, expect } from 'vitest';
import { StorageService, LocalStorageProvider } from '../src/storage/storageService.js';
import path from 'path';
import fs from 'fs';

describe('StorageService & File Validation', () => {
  const testStorageDir = path.resolve('./test_uploads');
  const storage = new StorageService(new LocalStorageProvider(testStorageDir));

  it('should accept valid PDF, JPG, PNG files under size limit', () => {
    const validPdfBuffer = Buffer.from('%PDF-1.4 test content');
    const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    expect(storage.validateFile(validPdfBuffer, 'application/pdf').valid).toBe(true);
    expect(storage.validateFile(validJpgBuffer, 'image/jpeg').valid).toBe(true);
    expect(storage.validateFile(validJpgBuffer, 'image/png').valid).toBe(true);
  });

  it('should reject invalid file types', () => {
    const txtBuffer = Buffer.from('hello world');
    const exeBuffer = Buffer.from('MZ binary');

    const txtValidation = storage.validateFile(txtBuffer, 'text/plain');
    expect(txtValidation.valid).toBe(false);
    expect(txtValidation.error).toContain('Unsupported file type');

    const exeValidation = storage.validateFile(exeBuffer, 'application/x-msdownload');
    expect(exeValidation.valid).toBe(false);
  });

  it('should reject files exceeding 15MB limit', () => {
    // 16 MB buffer
    const largeBuffer = Buffer.alloc(16 * 1024 * 1024);
    const validation = storage.validateFile(largeBuffer, 'application/pdf');

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('exceeds the 15 MB limit');
  });

  it('should save and delete files through the storage provider', async () => {
    const sampleBuffer = Buffer.from('medical report test content');
    const stored = await storage.storeFile(sampleBuffer, 'lab_test.pdf', 'application/pdf');

    expect(stored.storagePath).toBeDefined();
    expect(fs.existsSync(stored.storagePath)).toBe(true);

    // Clean up
    await storage.deleteFile(stored.storagePath);
    expect(fs.existsSync(stored.storagePath)).toBe(false);

    // Clean test dir if empty
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });
});
