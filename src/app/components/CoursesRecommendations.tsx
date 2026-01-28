import { BookOpen, GraduationCap, Award, Shield } from 'lucide-react';
import type { OfficerData } from './OfficerDataForm';

interface CoursesRecommendationsProps {
  officerData: OfficerData;
}

interface Course {
  name: string;
  priority: 'required' | 'highly-recommended' | 'recommended';
  category: string;
  description: string;
  eligibility: string;
  icon: any;
  completed?: boolean;
}

export function CoursesRecommendations({ officerData }: CoursesRecommendationsProps) {
  const currentRank = officerData.rankHistoryData?.currentRank || '';
  const boardEligibility = officerData.rankHistoryData?.boardEligibility || 'not-eligible';

  const getRecommendedCourses = (): Course[] => {
    const courses: Course[] = [];

    // JPME - Critical for O-4 and above
    if (currentRank >= 'LCDR') {
      courses.push({
        name: 'Joint Professional Military Education (JPME) Phase I',
        priority: currentRank >= 'CDR' ? 'required' : 'highly-recommended',
        category: 'Joint Education',
        description: 'Essential for joint duty credit and senior leadership positions. Can be completed via in-residence or distance learning through Joint Forces Staff College (JFSC).',
        eligibility: 'O-3 and above',
        icon: GraduationCap,
      });
    }

    if (currentRank >= 'CDR') {
      courses.push({
        name: 'Joint Professional Military Education (JPME) Phase II',
        priority: 'highly-recommended',
        category: 'Joint Education',
        description: 'Required for joint duty at O-6 level. Completed at Joint Forces Staff College or equivalent senior service college.',
        eligibility: 'O-5 and above, JPME I complete',
        icon: GraduationCap,
      });
    }

    // Senior Officer Courses
    if (currentRank === 'LCDR' || currentRank === 'CDR') {
      courses.push({
        name: 'Naval War College (NWC) - College of Naval Command and Staff',
        priority: 'highly-recommended',
        category: 'Senior Education',
        description: 'Intermediate-level joint professional military education. Available in-residence (Newport, RI) or via distance learning.',
        eligibility: 'O-4 and above',
        icon: Shield,
      });

      courses.push({
        name: 'Naval Postgraduate School (NPS) Programs',
        priority: 'recommended',
        category: 'Graduate Education',
        description: 'Advanced degree programs in healthcare administration, operations research, systems engineering, and other relevant fields.',
        eligibility: 'O-3 and above',
        icon: BookOpen,
      });
    }

    if (currentRank >= 'CDR') {
      courses.push({
        name: 'Naval War College - Senior Officer Course',
        priority: 'highly-recommended',
        category: 'Senior Education',
        description: 'Senior-level strategic leadership education. Highly valued for O-6 and flag officer candidates.',
        eligibility: 'O-5 and above',
        icon: Shield,
      });

      courses.push({
        name: 'Capstone Course',
        priority: 'required',
        category: 'Flag Officer Preparation',
        description: 'Required for new flag officer selectees. Focuses on strategic leadership and joint operations.',
        eligibility: 'Flag officer selectees',
        icon: Award,
      });
    }

    // Medical Corps Specific Courses
    courses.push({
      name: 'Navy Medicine Professional Development Center (NMPDC) Courses',
      priority: 'highly-recommended',
      category: 'Medical Leadership',
      description: 'Medical leadership courses including Medical Department Head Course, Executive Medicine Course, and specialty-specific training.',
      eligibility: 'All Medical Corps officers',
      icon: BookOpen,
    });

    if (currentRank >= 'LT') {
      courses.push({
        name: 'Medical Service Corps In-Service Procurement (MSC-IPP) or Medical Department Head Course',
        priority: 'highly-recommended',
        category: 'Medical Leadership',
        description: 'Prepares officers for department head and leadership positions in Navy Medicine. Essential for those seeking command or senior medical leadership roles.',
        eligibility: 'O-3 and above',
        icon: BookOpen,
      });
    }

    // Operational Medicine
    if (officerData.deployments < 1 || currentRank <= 'LCDR') {
      courses.push({
        name: 'Operational Medicine Course',
        priority: 'highly-recommended',
        category: 'Operational Medicine',
        description: 'Training in expeditionary and operational medical support. Essential for deployment and operational assignments.',
        eligibility: 'All Medical Corps officers',
        icon: Shield,
      });

      courses.push({
        name: 'Field Medical Service School (FMSS)',
        priority: 'recommended',
        category: 'Operational Medicine',
        description: 'Training with Marine Corps on field medicine, tactical operations, and combat casualty care.',
        eligibility: 'Officers assigned to Marine Corps units',
        icon: Shield,
      });
    }

    // Special Qualifications
    courses.push({
      name: 'Advanced Trauma Life Support (ATLS)',
      priority: 'highly-recommended',
      category: 'Clinical Certification',
      description: 'Standard trauma care certification. Highly valued for operational and emergency medicine assignments.',
      eligibility: 'Physicians',
      icon: Award,
    });

    courses.push({
      name: 'Advanced Cardiac Life Support (ACLS)',
      priority: 'highly-recommended',
      category: 'Clinical Certification',
      description: 'Essential cardiac emergency certification for medical officers.',
      eligibility: 'Physicians',
      icon: Award,
    });

    courses.push({
      name: 'Pediatric Advanced Life Support (PALS)',
      priority: 'recommended',
      category: 'Clinical Certification',
      description: 'Pediatric emergency care certification, valuable for family practice and pediatric assignments.',
      eligibility: 'Physicians',
      icon: Award,
    });

    // Specialty Programs
    if (!officerData.postGradEducation) {
      courses.push({
        name: 'Graduate Medical Education (GME) - Residency Programs',
        priority: 'highly-recommended',
        category: 'Medical Specialty Training',
        description: 'Navy residency programs in various specialties. Specialty training enhances career progression and clinical expertise.',
        eligibility: 'Medical school graduates',
        icon: GraduationCap,
      });

      courses.push({
        name: 'Master of Public Health (MPH) Programs',
        priority: 'recommended',
        category: 'Graduate Education',
        description: 'Advanced degree in public health, epidemiology, or health policy. Valuable for preventive medicine and senior leadership.',
        eligibility: 'O-3 and above',
        icon: BookOpen,
      });

      courses.push({
        name: 'Master of Business Administration (MBA) or Healthcare Administration',
        priority: 'recommended',
        category: 'Graduate Education',
        description: 'Business and management education for medical leaders. Particularly valuable for medical center and command positions.',
        eligibility: 'O-3 and above',
        icon: BookOpen,
      });
    }

    // Subspecialty Programs
    courses.push({
      name: 'Flight Surgeon Training',
      priority: 'recommended',
      category: 'Special Qualifications',
      description: 'Aviation medicine specialty. Opens opportunities for carrier and aviation squadron assignments.',
      eligibility: 'Physicians, competitive selection',
      icon: Shield,
    });

    courses.push({
      name: 'Undersea Medical Officer (UMO) / Dive Medical Officer (DMO)',
      priority: 'recommended',
      category: 'Special Qualifications',
      description: 'Submarine and diving medicine specialty. Unique operational medicine opportunities.',
      eligibility: 'Physicians, competitive selection',
      icon: Shield,
    });

    courses.push({
      name: 'Aerospace Medicine Residency',
      priority: 'recommended',
      category: 'Medical Specialty Training',
      description: 'Specialty training in aerospace and operational medicine.',
      eligibility: 'Flight Surgeons',
      icon: GraduationCap,
    });

    // Leadership and Management
    if (currentRank >= 'LCDR') {
      courses.push({
        name: 'Navy Senior Officer Leadership Course',
        priority: 'recommended',
        category: 'Leadership Development',
        description: 'Executive leadership development for senior officers. Focuses on strategic thinking and organizational leadership.',
        eligibility: 'O-4 and above',
        icon: Award,
      });

      courses.push({
        name: 'Healthcare Administrator Course (HAC)',
        priority: 'recommended',
        category: 'Medical Leadership',
        description: 'Management and administration training for medical treatment facility leaders.',
        eligibility: 'O-4 and above in leadership roles',
        icon: BookOpen,
      });
    }

    // Tactical and Operational
    if (currentRank <= 'LCDR') {
      courses.push({
        name: 'Tactical Combat Casualty Care (TCCC)',
        priority: 'recommended',
        category: 'Operational Medicine',
        description: 'Prehospital trauma care in tactical environments. Essential for expeditionary medicine.',
        eligibility: 'All medical personnel',
        icon: Shield,
      });
    }

    return courses;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'required':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'highly-recommended':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'recommended':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const courses = getRecommendedCourses();
  const coursesByCategory = courses.reduce((acc, course) => {
    if (!acc[course.category]) {
      acc[course.category] = [];
    }
    acc[course.category].push(course);
    return acc;
  }, {} as Record<string, Course[]>);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Recommended Courses & Professional Development
        </h3>
        <p className="text-gray-600">
          Navy and joint courses tailored to your rank and career progression goals
        </p>
      </div>

      {Object.entries(coursesByCategory).map(([category, categoryCourses]) => (
        <div key={category}>
          <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <div className="w-1 h-6 bg-blue-600 rounded"></div>
            {category}
          </h4>
          <div className="space-y-3">
            {categoryCourses.map((course, index) => {
              const Icon = course.icon;
              return (
                <div
                  key={index}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h5 className="font-semibold text-gray-900">{course.name}</h5>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium uppercase whitespace-nowrap border ${getPriorityColor(
                            course.priority
                          )}`}
                        >
                          {course.priority}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{course.description}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium">Eligibility:</span>
                        <span>{course.eligibility}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Additional Resources */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h4 className="font-semibold text-gray-900 mb-3">Course Information Resources</h4>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Navy Medicine Professional Development Center (NMPDC):</strong> Central hub
              for Navy Medicine education and training programs
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Joint Forces Staff College (JFSC):</strong> JPME Phase I and II programs
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Naval War College:</strong> In-residence and distance learning programs for
              intermediate and senior professional military education
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Naval Postgraduate School (NPS):</strong> Graduate degree programs and
              continuing education
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>BUMED Career Development:</strong> Contact your detailer for course
              availability, timing, and career alignment
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
