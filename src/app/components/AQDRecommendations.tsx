import { Award, Anchor, GraduationCap, Stethoscope, Shield, Users } from 'lucide-react';
import type { OfficerData } from './OfficerDataForm';

interface AQDRecommendationsProps {
  officerData: OfficerData;
  selectedAQDs: string[];
}

interface AQD {
  code: string;
  name: string;
  category: string;
  description: string;
  priority: 'critical' | 'highly-recommended' | 'recommended';
  eligibility: string;
  careerImpact: string;
  icon: any;
}

export function AQDRecommendations({ officerData, selectedAQDs }: AQDRecommendationsProps) {
  const currentRank = officerData.rankHistoryData?.currentRank || '';
  const boardEligibility = officerData.rankHistoryData?.boardEligibility || 'not-eligible';

  const getAllAQDs = (): AQD[] => {
    const aqdList: AQD[] = [];

    // Academic AQDs
    aqdList.push({
      code: '2P3',
      name: 'Assistant Professor',
      category: 'Academic/Teaching',
      description: 'Teaching assignment at medical school, residency program, or professional military education institution.',
      priority: currentRank >= 'LCDR' ? 'highly-recommended' : 'recommended',
      eligibility: 'Teaching assignment at accredited institution',
      careerImpact: 'Demonstrates academic leadership and professional development. Highly valued for senior positions and medical education leadership roles.',
      icon: GraduationCap,
    });

    aqdList.push({
      code: '2P4',
      name: 'Associate Professor',
      category: 'Academic/Teaching',
      description: 'Advanced teaching position with demonstrated academic excellence and publication record.',
      priority: currentRank >= 'CDR' ? 'highly-recommended' : 'recommended',
      eligibility: 'Promotion to Associate Professor rank',
      careerImpact: 'Strong indicator of academic expertise. Enhances credibility for senior medical leadership and GME program director positions.',
      icon: GraduationCap,
    });

    aqdList.push({
      code: '2P5',
      name: 'Professor',
      category: 'Academic/Teaching',
      description: 'Senior faculty position with significant academic contributions and leadership.',
      priority: currentRank === 'CAPT' ? 'highly-recommended' : 'recommended',
      eligibility: 'Promotion to Professor rank',
      careerImpact: 'Prestigious designation for senior Medical Corps officers. Important for flag officer consideration in medical education roles.',
      icon: GraduationCap,
    });

    // Warfare AQDs
    aqdList.push({
      code: 'SW5',
      name: 'Surface Warfare Medical Department Officer (SWMDO)',
      category: 'Warfare Qualification',
      description: 'Warfare qualification for medical officers serving aboard surface ships. Demonstrates operational proficiency.',
      priority: officerData.deployments > 0 || currentRank >= 'LCDR' ? 'highly-recommended' : 'recommended',
      eligibility: 'Complete PQS while assigned to surface ship',
      careerImpact: 'Critical for officers with sea duty. Shows operational competence and commitment to fleet medicine. Highly regarded for career progression.',
      icon: Anchor,
    });

    aqdList.push({
      code: 'AW5',
      name: 'Aviation Warfare Medical Department Officer',
      category: 'Warfare Qualification',
      description: 'Warfare qualification for medical officers in aviation communities.',
      priority: 'recommended',
      eligibility: 'Aviation squadron or carrier assignment',
      careerImpact: 'Demonstrates aviation medicine expertise. Important for flight surgeon career path.',
      icon: Shield,
    });

    aqdList.push({
      code: 'IW5',
      name: 'Information Warfare Medical Department Officer',
      category: 'Warfare Qualification',
      description: 'Specialized qualification for information warfare community medical support.',
      priority: 'recommended',
      eligibility: 'Assignment supporting IW community',
      careerImpact: 'Emerging importance as cyber and information operations expand.',
      icon: Shield,
    });

    // Flight Surgeon AQDs
    aqdList.push({
      code: 'D7A',
      name: 'Flight Surgeon (Basic)',
      category: 'Special Qualifications',
      description: 'Completion of Naval Aerospace Medical Institute (NAMI) Flight Surgeon training.',
      priority: 'recommended',
      eligibility: 'Competitive selection, must pass flight physical',
      careerImpact: 'Opens aviation medicine career path. Highly competitive and valued specialty. Leads to unique operational opportunities.',
      icon: Shield,
    });

    aqdList.push({
      code: 'D7B',
      name: 'Senior Flight Surgeon',
      category: 'Special Qualifications',
      description: 'Advanced flight surgeon with significant aviation medicine experience.',
      priority: 'recommended',
      eligibility: 'Flight Surgeon with extensive aviation experience',
      careerImpact: 'Advanced aviation medicine designation. Important for senior aviation medical leadership.',
      icon: Shield,
    });

    // Dive/Undersea Medicine
    aqdList.push({
      code: 'D6A',
      name: 'Undersea Medical Officer (UMO)',
      category: 'Special Qualifications',
      description: 'Submarine medicine specialist trained at Naval Undersea Medical Institute.',
      priority: 'recommended',
      eligibility: 'Competitive selection, submarine duty assignment',
      careerImpact: 'Unique operational medicine specialty. Opens submarine force medical opportunities.',
      icon: Anchor,
    });

    aqdList.push({
      code: 'D6B',
      name: 'Dive Medical Officer (DMO)',
      category: 'Special Qualifications',
      description: 'Diving and hyperbaric medicine specialist.',
      priority: 'recommended',
      eligibility: 'Completion of Dive Medical Officer training',
      careerImpact: 'Specialized operational medicine. Supports special operations and diving communities.',
      icon: Anchor,
    });

    // Research AQDs
    aqdList.push({
      code: '6XP',
      name: 'Principal Investigator',
      category: 'Research',
      description: 'Lead researcher on funded research projects or clinical trials.',
      priority: currentRank >= 'LCDR' ? 'highly-recommended' : 'recommended',
      eligibility: 'Primary investigator on approved research',
      careerImpact: 'Demonstrates research capability and scientific leadership. Important for academic medicine and medical research leadership.',
      icon: GraduationCap,
    });

    aqdList.push({
      code: '6XR',
      name: 'Researcher',
      category: 'Research',
      description: 'Active involvement in clinical or basic science research.',
      priority: 'recommended',
      eligibility: 'Documented research participation',
      careerImpact: 'Shows commitment to advancing medical knowledge. Valued for research-focused positions.',
      icon: GraduationCap,
    });

    // Operational Medicine
    aqdList.push({
      code: 'BM1',
      name: 'Operational Medicine',
      category: 'Operational',
      description: 'Specialized training and experience in operational/expeditionary medicine.',
      priority: officerData.deployments > 0 ? 'highly-recommended' : 'recommended',
      eligibility: 'Operational medicine assignments and training',
      careerImpact: 'Critical for expeditionary medicine career path. Shows readiness for operational deployments.',
      icon: Shield,
    });

    aqdList.push({
      code: 'BM2',
      name: 'Combat Casualty Care',
      category: 'Operational',
      description: 'Advanced training in trauma and combat casualty care.',
      priority: 'recommended',
      eligibility: 'TCCC, ATLS, and operational assignments',
      careerImpact: 'Essential for forward-deployed and combat support roles.',
      icon: Shield,
    });

    // Leadership/Command AQDs
    aqdList.push({
      code: '2D1',
      name: 'Medical Department Head',
      category: 'Leadership',
      description: 'Department head at naval medical treatment facility.',
      priority: currentRank >= 'LCDR' ? 'critical' : 'highly-recommended',
      eligibility: 'O-4 and above in department head billet',
      careerImpact: 'Critical for CDR and CAPT selection. Demonstrates proven leadership and management capability.',
      icon: Users,
    });

    aqdList.push({
      code: '2D2',
      name: 'Medical Officer in Charge (OIC)',
      category: 'Leadership',
      description: 'Officer in Charge of medical clinic or branch facility.',
      priority: currentRank >= 'LT' ? 'highly-recommended' : 'recommended',
      eligibility: 'Assignment as medical OIC',
      careerImpact: 'Leadership experience managing independent medical facility. Important for command preparation.',
      icon: Users,
    });

    // GME Program Director
    aqdList.push({
      code: 'G1A',
      name: 'GME Program Director',
      category: 'Academic/Teaching',
      description: 'Director of Graduate Medical Education (residency/fellowship) program.',
      priority: currentRank >= 'CDR' ? 'highly-recommended' : 'recommended',
      eligibility: 'Board certified, appointed as program director',
      careerImpact: 'Senior academic leadership position. Important for medical education and training command roles.',
      icon: GraduationCap,
    });

    // Special Programs
    aqdList.push({
      code: 'JP1',
      name: 'Joint Qualified Officer (JQO)',
      category: 'Joint Professional',
      description: 'Joint qualification through JPME and joint duty assignment.',
      priority: currentRank >= 'LCDR' ? 'critical' : 'highly-recommended',
      eligibility: 'JPME completion + joint duty assignment',
      careerImpact: 'Increasingly required for O-5 and above. Critical for flag officer consideration and senior joint billets.',
      icon: Shield,
    });

    aqdList.push({
      code: 'JP2',
      name: 'Joint Specialty Officer (JSO)',
      category: 'Joint Professional',
      description: 'Advanced joint qualification with extensive joint experience.',
      priority: currentRank >= 'CDR' ? 'highly-recommended' : 'recommended',
      eligibility: 'JQO + additional joint duty tours',
      careerImpact: 'Highest level of joint qualification. Essential for senior joint leadership positions.',
      icon: Shield,
    });

    // Public Health
    aqdList.push({
      code: 'PH1',
      name: 'Public Health Officer',
      category: 'Specialty',
      description: 'Preventive medicine and public health specialty designation.',
      priority: 'recommended',
      eligibility: 'MPH or preventive medicine residency',
      careerImpact: 'Important for public health and preventive medicine leadership roles.',
      icon: Stethoscope,
    });

    // Clinical Specialty Board Certification
    aqdList.push({
      code: 'BC1',
      name: 'Board Certified in Medical Specialty',
      category: 'Clinical Excellence',
      description: 'Board certification by American Board of Medical Specialties (ABMS) member board.',
      priority: currentRank >= 'LT' ? 'critical' : 'highly-recommended',
      eligibility: 'Complete residency and pass board examination',
      careerImpact: 'Expected for career Medical Corps officers. Critical for clinical credibility and career advancement.',
      icon: Award,
    });

    return aqdList;
  };

  const getRecommendedAQDs = (): AQD[] => {
    const allAQDs = getAllAQDs();
    return allAQDs.filter((aqd) => !selectedAQDs.includes(aqd.code));
  };

  const getCurrentAQDs = (): AQD[] => {
    const allAQDs = getAllAQDs();
    return allAQDs.filter((aqd) => selectedAQDs.includes(aqd.code));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'highly-recommended':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'recommended':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const recommendedAQDs = getRecommendedAQDs();
  const currentAQDs = getCurrentAQDs();
  const aqdsByCategory = recommendedAQDs.reduce((acc, aqd) => {
    if (!acc[aqd.category]) {
      acc[aqd.category] = [];
    }
    acc[aqd.category].push(aqd);
    return acc;
  }, {} as Record<string, AQD[]>);

  // Sort categories by priority
  const categoryOrder = [
    'Leadership',
    'Warfare Qualification',
    'Joint Professional',
    'Clinical Excellence',
    'Academic/Teaching',
    'Special Qualifications',
    'Operational',
    'Research',
    'Specialty',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Additional Qualification Designators (AQDs)
        </h3>
        <p className="text-gray-600">
          AQDs document special skills, qualifications, and assignments that enhance your
          competitiveness for promotion and selection to key billets.
        </p>
      </div>

      {/* Current AQDs */}
      {currentAQDs.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-5">
          <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <Award className="w-5 h-5" />
            Your Current AQDs ({currentAQDs.length})
          </h4>
          <div className="grid md:grid-cols-2 gap-3">
            {currentAQDs.map((aqd, index) => {
              const Icon = aqd.icon;
              return (
                <div key={index} className="bg-white rounded-md p-3 border border-green-200">
                  <div className="flex items-start gap-2">
                    <Icon className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-sm text-green-900">
                        {aqd.code} - {aqd.name}
                      </div>
                      <div className="text-xs text-green-700">{aqd.category}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommended AQDs by Category */}
      <div className="space-y-5">
        {categoryOrder.map((category) => {
          const categoryAQDs = aqdsByCategory[category];
          if (!categoryAQDs || categoryAQDs.length === 0) return null;

          return (
            <div key={category}>
              <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <div className="w-1 h-6 bg-blue-600 rounded"></div>
                {category}
              </h4>
              <div className="space-y-3">
                {categoryAQDs.map((aqd, index) => {
                  const Icon = aqd.icon;
                  return (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <h5 className="font-semibold text-gray-900">
                                {aqd.code} - {aqd.name}
                              </h5>
                            </div>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium uppercase whitespace-nowrap border ${getPriorityColor(
                                aqd.priority
                              )}`}
                            >
                              {aqd.priority}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-3">{aqd.description}</p>
                          <div className="grid md:grid-cols-2 gap-3 text-xs">
                            <div className="bg-blue-50 rounded p-2 border border-blue-100">
                              <span className="font-medium text-blue-900">Eligibility: </span>
                              <span className="text-blue-800">{aqd.eligibility}</span>
                            </div>
                            <div className="bg-purple-50 rounded p-2 border border-purple-100">
                              <span className="font-medium text-purple-900">Career Impact: </span>
                              <span className="text-purple-800">{aqd.careerImpact}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h4 className="font-semibold text-gray-900 mb-3">About AQDs</h4>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Documentation:</strong> AQDs are officially recorded in your service record
              (OMPF). Ensure all qualifications are properly documented through your command.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Selection Boards:</strong> AQDs are visible to promotion and selection boards.
              They demonstrate breadth of experience and special expertise.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Career Timing:</strong> Pursue AQDs strategically throughout your career.
              Some are prerequisites for advanced assignments.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Verification:</strong> Check your Official Military Personnel File (OMPF) via
              MyNavy Portal to verify all AQDs are correctly recorded.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
