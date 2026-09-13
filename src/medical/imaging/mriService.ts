import { IMedicalImagingService, ImagingAnalysisResult, ImagingModality } from './types.js';

/**
 * MRI Analysis Service Stub (Future Architecture)
 * Multi-sequence MRI (T1, T2, FLAIR, DWI) analysis requires specialized volumetric neural networks.
 */
export class MriAnalysisService implements IMedicalImagingService {
  public readonly modality: ImagingModality = 'MRI';

  public async analyzeStudy(
    _imageBuffer: Buffer,
    _metadata?: Record<string, unknown>
  ): Promise<ImagingAnalysisResult> {
    throw new Error(
      'MriAnalysisService: Multi-parametric MRI interpretation requires specialized neuro/musculoskeletal DICOM models. Consult a board-certified radiologist.'
    );
  }
}
