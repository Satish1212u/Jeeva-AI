import { describe, it, expect } from 'vitest';
import { medicineService } from '../src/medical/medicines/medicineService.js';

describe('MedicineService', () => {
  it('should look up medicine by brand name (Dolo 650)', async () => {
    const result = await medicineService.lookup('Dolo 650');
    expect(result).not.toBeNull();
    expect(result?.medicine).toBe('Paracetamol 650');
    expect(result?.strength).toBe('650 mg');
    expect(result?.composition).toContain('Paracetamol');
    expect(result?.manufacturer).toContain('Micro Labs');
    expect(result?.verifiedProductImage).toBeDefined();
    expect(result?.source).toBeDefined();
    expect(result?.importantVerificationNote).toBeDefined();
    expect(result?.formattedTelegramText).toContain('Paracetamol 650');
    expect(result?.formattedTelegramText).toContain('Common Uses:');
  });

  it('should look up medicine by generic name (Metformin)', async () => {
    const result = await medicineService.lookup('metformin');
    expect(result).not.toBeNull();
    expect(result?.strength).toBe('500 mg');
    expect(result?.commonUses).toContain('Type 2 Diabetes Mellitus management');
  });

  it('should include interaction warnings and precautions', async () => {
    const result = await medicineService.lookup('Pantoprazole');
    expect(result).not.toBeNull();
    expect(result?.precautions.length).toBeGreaterThan(0);
    expect(result?.interactionWarnings.length).toBeGreaterThan(0);
  });

  it('should search multiple medicines by partial string', async () => {
    const results = await medicineService.search('500');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('should return null for non-existent medicine safely', async () => {
    const result = await medicineService.lookup('NonExistentDrug123');
    expect(result).toBeNull();
  });
});
