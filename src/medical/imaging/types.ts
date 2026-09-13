export type ImagingModality = 'XRAY' | 'ECG' | 'MRI' | 'CT' | 'ULTRASOUND';

export interface ImagingFinding {
  anatomicalRegion: string;
  observation: string;
  confidenceScore: number; // 0.0 - 1.0
  isUrgentOrCritical: boolean;
  clinicalSignificance: string;
}

export interface ImagingAnalysisResult {
  modality: ImagingModality;
  studyDate?: string;
  bodyPart?: string;
  qualityAssessment: 'ADEQUATE' | 'SUBOPTIMAL' | 'UNINTERPRETABLE';
  findings: ImagingFinding[];
  impression: string;
  limitations: string[];
  radiologistReviewRequired: true;
}

export interface IMedicalImagingService {
  readonly modality: ImagingModality;
  analyzeStudy(imageBuffer: Buffer, metadata?: Record<string, unknown>): Promise<ImagingAnalysisResult>;
}
