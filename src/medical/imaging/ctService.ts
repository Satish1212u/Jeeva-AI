import { IMedicalImagingService, ImagingAnalysisResult, ImagingModality } from './types.js';

/**
 * CT Analysis Service Stub (Future Architecture)
 * High-resolution axial CT interpretation requires dedicated slice-based volumetric pipelines.
 */
export class CtAnalysisService implements IMedicalImagingService {
  public readonly modality: ImagingModality = 'CT';

  public async analyzeStudy(
    _imageBuffer: Buffer,
    _metadata?: Record<string, unknown>
  ): Promise<ImagingAnalysisResult> {
    throw new Error(
      'CtAnalysisService: Computed Tomography interpretation requires specialized volumetric DICOM models and is currently under clinical validation. Consult a radiologist.'
    );
  }
}
