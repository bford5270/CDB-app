import type { RankHistoryData } from './RankHistoryForm';

export interface OfficerData {
  rankHistoryData: RankHistoryData | null;
  designator: string;
  currentBillet: string;
  educationLevel: string;
  postGradEducation: string;
  deployments: number;
  jointDuty: boolean;
  commandTour: boolean;
  specialQualifications: string[];
  selectedAQDs: string[];
  fitnessReportAverage: number;
  boardCertified?: boolean | null;
  hasUndergrad?: boolean;
  hasMedicalSchool?: boolean;
}
