import { IMedicalImagingService, ImagingAnalysisResult, ImagingModality } from './types.js';

/**
 * Ultrasound Analysis Service Stub (Future Architecture)
 * Point-of-care and diagnostic ultrasound interpretation.
 */
export class UltrasoundAnalysisService implements IMedicalImagingService {
  public readonly modality: ImagingModality = 'ULTRASOUND';

  public async analyzeStudy(
    _imageBuffer: Buffer,
    _metadata?: Record<string, unknown>
  ): Promise<ImagingAnalysisResult> {
    throw new Error(
      'UltrasoundAnalysisService: Ultrasound interpretation is operator-dependent and requires specialized sonographic AI models under regulatory review. Consult a sonologist or physician.'
    );
  }
}
