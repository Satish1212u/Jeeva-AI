import { IMedicalImagingService, ImagingAnalysisResult, ImagingModality } from './types.js';

/**
 * ECG Analysis Service Stub (Future Architecture)
 * DO NOT fake results with generic text models.
 * Awaits integration with rhythm, interval (QTc, PR, QRS) and ST-elevation cardiac classifiers.
 */
export class EcgAnalysisService implements IMedicalImagingService {
  public readonly modality: ImagingModality = 'ECG';

  public async analyzeStudy(
    _imageBuffer: Buffer,
    _metadata?: Record<string, unknown>
  ): Promise<ImagingAnalysisResult> {
    throw new Error(
      'EcgAnalysisService: 12-lead ECG interpretation requires specialized electrophysiologic classification algorithms. Please share your ECG with an attending physician or cardiologist.'
    );
  }
}
