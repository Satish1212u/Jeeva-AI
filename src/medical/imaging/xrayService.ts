import { IMedicalImagingService, ImagingAnalysisResult, ImagingModality } from './types.js';

/**
 * X-ray Analysis Service Stub (Future Architecture)
 * DO NOT fake results with generic text models.
 * Awaits integration with clinically validated chest/skeletal radiography models (e.g., CheXNet, FDA-cleared AI).
 */
export class XrayAnalysisService implements IMedicalImagingService {
  public readonly modality: ImagingModality = 'XRAY';

  public async analyzeStudy(
    _imageBuffer: Buffer,
    _metadata?: Record<string, unknown>
  ): Promise<ImagingAnalysisResult> {
    throw new Error(
      'XrayAnalysisService: Automated X-ray interpretation requires specialized validated radiologic vision models and is currently under clinical validation. Please have your X-ray evaluated by a licensed radiologist.'
    );
  }
}
