import { useState } from 'react';
import { User, Award, GraduationCap, MapPin } from 'lucide-react';
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

interface OfficerDataFormProps {
  onDataChange: (data: OfficerData) => void;
  rankHistoryData: RankHistoryData | null;
}

export function OfficerDataForm({ onDataChange, rankHistoryData }: OfficerDataFormProps) {
  const [data, setData] = useState<OfficerData>({
    rankHistoryData: null,
    designator: '2300',
    currentBillet: '',
    educationLevel: 'MD',
    postGradEducation: '',
    deployments: 0,
    jointDuty: false,
    commandTour: false,
    specialQualifications: [],
    selectedAQDs: [],
    fitnessReportAverage: 0,
  });

  const handleChange = (field: keyof OfficerData, value: any) => {
    const updated = { ...data, rankHistoryData, [field]: value };
    setData(updated);
    onDataChange(updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Officer Information</h2>
        <p className="text-gray-600">
          Enter or verify officer data extracted from uploaded documents
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Basic Information */}
        <div className="border-b pb-4">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Basic Information</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Designator (Medical Corps)
              </label>
              <select
                value={data.designator}
                onChange={(e) => handleChange('designator', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="2300">2300 - General Medical Officer</option>
                <option value="2100">2100 - Medical Corps (General)</option>
                <option value="2200">2200 - Dental Corps</option>
                <option value="2900">2900 - Medical Service Corps</option>
              </select>
            </div>
          </div>
        </div>

        {/* Education */}
        <div className="border-b pb-4">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Education & Training</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Medical Degree
              </label>
              <input
                type="text"
                value={data.educationLevel}
                onChange={(e) => handleChange('educationLevel', e.target.value)}
                placeholder="e.g., MD, DO"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Post-Graduate Education
              </label>
              <input
                type="text"
                value={data.postGradEducation}
                onChange={(e) => handleChange('postGradEducation', e.target.value)}
                placeholder="e.g., MPH, MBA, Residency"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Experience */}
        <div className="border-b pb-4">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Experience & Assignments</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Billet
              </label>
              <input
                type="text"
                value={data.currentBillet}
                onChange={(e) => handleChange('currentBillet', e.target.value)}
                placeholder="e.g., Department Head, NMCSD"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Deployments
              </label>
              <input
                type="number"
                value={data.deployments}
                onChange={(e) => handleChange('deployments', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="jointDuty"
                checked={data.jointDuty}
                onChange={(e) => handleChange('jointDuty', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="jointDuty" className="text-sm font-medium text-gray-700">
                Joint Duty Assignment Completed
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="commandTour"
                checked={data.commandTour}
                onChange={(e) => handleChange('commandTour', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="commandTour" className="text-sm font-medium text-gray-700">
                Command Tour Completed
              </label>
            </div>
          </div>
        </div>

        {/* Performance */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Performance</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fitness Report Average (1-5 scale)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="5"
                value={data.fitnessReportAverage}
                onChange={(e) => handleChange('fitnessReportAverage', parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Special Qualifications
              </label>
              <input
                type="text"
                placeholder="e.g., ATLS, ACLS, Board Certified"
                onChange={(e) => {
                  const quals = e.target.value.split(',').map((q) => q.trim()).filter(Boolean);
                  handleChange('specialQualifications', quals);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Separate multiple with commas</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}