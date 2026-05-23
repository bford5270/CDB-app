'use client';

import { useState, useEffect } from 'react';
import { Sparkles, BookOpen, Award, Calendar, ExternalLink, Mail, Phone, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Target, TrendingUp, CheckCircle } from 'lucide-react';
import type { ParsedOfficerData } from './VerifyParsedData';
import { loadNotionDocuments } from '../utils/notionClient';

const NAVY = '#1B365D';
const GOLD = '#FFC72C';

interface PersonalizedActionPlanProps {
  officerData: ParsedOfficerData;
}

interface CourseRecommendation {
  id: string;
  name: string;
  category: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  nextDates: Array<{ start: string; end: string; location: string; virtual?: boolean }>;
  registration: string;
  link?: string;
  poc?: { name?: string; email?: string; phone?: string };
  prerequisites?: string[];
  notes?: string;
}

interface AQDRecommendation {
  code: string;
  name: string;
  reason: string;
  requirements: string[];
  contributingCourses: string[];
}

interface CareerInsight {
  type: 'strength' | 'gap' | 'opportunity';
  title: string;
  description: string;
}

interface AIRecommendations {
  summary: string;
  careerInsights: CareerInsight[];
  courseRecommendations: CourseRecommendation[];
  aqdRecommendations: AQDRecommendation[];
  nextSteps: string[];
}

async function loadCourseCatalog() {
  try {
    const response = await fetch('/fy26-courses.json');
    if (!response.ok) throw new Error('Failed to load course catalog');
    return await response.json();
  } catch (error) {
    console.error('Error loading course catalog:', error);
    return null;
  }
}

const loadReferenceDocuments = loadNotionDocuments;

export function PersonalizedActionPlan({ officerData }: PersonalizedActionPlanProps) {
  const [recommendations, setRecommendations] = useState<AIRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [courseCatalog, setCourseCatalog] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    generateRecommendations();
  }, []);

  const generateRecommendations = async () => {
    setLoading(true);
    setError(null);

    try {
      const [catalog, refDocs] = await Promise.all([loadCourseCatalog(), loadReferenceDocuments()]);
      setCourseCatalog(catalog);

      if (!catalog) throw new Error('Could not load course catalog');

      const officerSummary = buildOfficerSummary(officerData);
      const catalogSummary = buildCatalogSummary(catalog);

      const systemPrompt = `You are a Navy Medical Corps career advisor helping officers prepare for Career Development Boards (CDBs).

Your role is to provide personalized, actionable recommendations based on the officer's current record and career stage. Use a supportive, mentoring tone with phrases like "Consider...", "You might explore...", "This could strengthen your record by..."

IMPORTANT GUIDELINES:
- Be specific about course dates, registration processes, and POCs from the catalog
- Tailor recommendations to the officer's current rank and career stage
- Identify gaps tactfully and suggest concrete ways to address them
- Highlight strengths in their record
- Reference specific courses from the FY26 catalog with actual dates
- For senior officers (O5+), emphasize executive-level courses and AQDs
- For junior officers, focus on foundational training and warfare qualifications

FY26 COURSE CATALOG DATA:
${catalogSummary}

${refDocs ? `ADDITIONAL REFERENCE MATERIAL:\n${refDocs.substring(0, 8000)}` : ''}`;

      const userPrompt = `Generate personalized career development recommendations for this officer:

${officerSummary}

Please provide your response as a JSON object with this exact structure:
{
  "summary": "A 2-3 sentence personalized overview of their career status and main focus areas",
  "careerInsights": [
    {"type": "strength|gap|opportunity", "title": "Brief title", "description": "Explanation"}
  ],
  "courseRecommendations": [
    {
      "id": "course id from catalog",
      "name": "Full course name",
      "category": "Category",
      "reason": "Why this course is recommended for this specific officer",
      "priority": "high|medium|low",
      "nextDates": [{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "location": "Location", "virtual": true/false}],
      "registration": "How to register",
      "link": "URL if available",
      "poc": {"name": "POC name", "email": "email", "phone": "phone"},
      "prerequisites": ["Any prerequisites"],
      "notes": "Any special notes"
    }
  ],
  "aqdRecommendations": [
    {
      "code": "AQD code",
      "name": "AQD name",
      "reason": "Why pursue this AQD",
      "requirements": ["List of requirements"],
      "contributingCourses": ["Course IDs that help achieve this"]
    }
  ],
  "nextSteps": ["Prioritized list of 3-5 immediate actions to take"]
}

Limit to 3-5 course recommendations and 1-2 AQD recommendations, prioritized by impact.`;

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userPrompt, context: systemPrompt, isActionPlan: true }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate recommendations');
      }

      const data = await response.json();
      let parsed: AIRecommendations;
      try {
        const jsonMatch = data.answer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch {
        parsed = generateFallbackRecommendations(officerData, catalog);
      }

      setRecommendations(parsed);
    } catch (err) {
      console.error('Error generating recommendations:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate recommendations');
      if (courseCatalog) setRecommendations(generateFallbackRecommendations(officerData, courseCatalog));
    } finally {
      setLoading(false);
    }
  };

  const toggleCourse = (id: string) => {
    setExpandedCourses(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative">
          <Sparkles className="w-12 h-12 animate-pulse" style={{ color: NAVY }} />
          <RefreshCw className="w-6 h-6 absolute -bottom-1 -right-1 animate-spin" style={{ color: NAVY, opacity: 0.5 }} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">Generating Your Personalized Action Plan</h3>
        <p className="mt-2 text-gray-600">Analyzing your record and matching with FY26 course offerings…</p>
      </div>
    );
  }

  if (error && !recommendations) {
    return (
      <div className="rounded-lg p-6" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6" style={{ color: '#DC2626' }} />
          <div>
            <h3 className="font-semibold" style={{ color: '#991B1B' }}>Unable to Generate AI Recommendations</h3>
            <p className="mt-1" style={{ color: '#B91C1C' }}>{error}</p>
            <button
              onClick={generateRecommendations}
              className="mt-4 px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2"
              style={{ background: NAVY }}
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!recommendations) return null;

  const insightStyle = (type: string): React.CSSProperties => {
    if (type === 'strength') return { background: '#F0FDF4', border: '1px solid #BBF7D0' };
    if (type === 'gap') return { background: `rgba(255,199,44,0.08)`, border: `1px solid rgba(255,199,44,0.35)` };
    return { background: 'rgba(27,54,93,0.05)', border: '1px solid rgba(27,54,93,0.12)' };
  };

  const insightIconColor = (type: string) =>
    type === 'strength' ? '#16A34A' : type === 'gap' ? '#D97706' : NAVY;

  const insightTextColor = (type: string) =>
    type === 'strength' ? '#166534' : type === 'gap' ? '#92620A' : NAVY;

  const priorityBadgeStyle = (p: string): React.CSSProperties => {
    if (p === 'high')   return { background: '#FEE2E2', color: '#991B1B' };
    if (p === 'medium') return { background: `rgba(255,199,44,0.2)`, color: '#92620A' };
    return { background: '#F1F5F9', color: '#64748B' };
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-6 h-6" style={{ color: NAVY }} />
          <h2 className="text-2xl font-bold text-gray-900">Your Personalized Action Plan</h2>
        </div>
        <p className="text-gray-600">AI-generated recommendations based on your record and FY26 course offerings</p>
      </div>

      {/* Summary */}
      <div className="rounded-xl p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
        <p className="text-gray-800 leading-relaxed">{recommendations.summary}</p>
      </div>

      {/* Career Insights */}
      {recommendations.careerInsights.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5" style={{ color: NAVY }} />
            Career Insights
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {recommendations.careerInsights.map((insight, i) => (
              <div key={i} className="p-4 rounded-lg" style={insightStyle(insight.type)}>
                <div className="flex items-center gap-2 mb-2">
                  {insight.type === 'strength' && <CheckCircle className="w-4 h-4" style={{ color: insightIconColor(insight.type) }} />}
                  {insight.type === 'gap' && <AlertTriangle className="w-4 h-4" style={{ color: insightIconColor(insight.type) }} />}
                  {insight.type === 'opportunity' && <TrendingUp className="w-4 h-4" style={{ color: insightIconColor(insight.type) }} />}
                  <span className="text-sm font-medium" style={{ color: insightTextColor(insight.type) }}>
                    {insight.type === 'strength' ? 'Strength' : insight.type === 'gap' ? 'Area to Address' : 'Opportunity'}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900">{insight.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Course Recommendations */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5" style={{ color: NAVY }} />
          Recommended Courses
        </h3>
        <div className="space-y-3">
          {recommendations.courseRecommendations.map((course) => (
            <div key={course.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCourse(course.id)}
                className="w-full p-4 bg-white hover:bg-gray-50 transition-colors flex items-start justify-between text-left"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-medium rounded" style={priorityBadgeStyle(course.priority)}>
                      {course.priority === 'high' ? 'High Priority' : course.priority === 'medium' ? 'Recommended' : 'Consider'}
                    </span>
                    <span className="text-xs text-gray-500">{course.category}</span>
                  </div>
                  <h4 className="font-semibold text-gray-900 mt-1">{course.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{course.reason}</p>
                </div>
                {expandedCourses[course.id]
                  ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
              </button>

              {expandedCourses[course.id] && (
                <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                  {course.nextDates && course.nextDates.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                        <Calendar className="w-4 h-4" /> Upcoming Sessions
                      </h5>
                      <div className="mt-2 space-y-1">
                        {course.nextDates.slice(0, 3).map((date, i) => (
                          <div key={i} className="text-sm flex items-center gap-2">
                            <span className="text-gray-900">
                              {new Date(date.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                              {new Date(date.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <span className="text-gray-500">·</span>
                            <span className="text-gray-600">{date.location}</span>
                            {date.virtual && (
                              <span className="px-1.5 py-0.5 text-xs rounded"
                                style={{ background: 'rgba(27,54,93,0.08)', color: NAVY }}>Virtual</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3">
                    <h5 className="text-sm font-medium text-gray-700">How to Register</h5>
                    <p className="text-sm text-gray-600 mt-1">{course.registration}</p>
                  </div>

                  {course.prerequisites && course.prerequisites.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-gray-700">Prerequisites</h5>
                      <ul className="mt-1 text-sm text-gray-600 list-disc list-inside">
                        {course.prerequisites.map((prereq, i) => <li key={i}>{prereq}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3">
                    {course.link && (
                      <a href={course.link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium"
                        style={{ color: NAVY }}>
                        <ExternalLink className="w-4 h-4" /> Course Info
                      </a>
                    )}
                    {course.poc?.email && (
                      <a href={`mailto:${course.poc.email}`}
                        className="inline-flex items-center gap-1 text-sm font-medium"
                        style={{ color: NAVY }}>
                        <Mail className="w-4 h-4" /> {course.poc.name || 'Contact POC'}
                      </a>
                    )}
                    {course.poc?.phone && (
                      <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                        <Phone className="w-4 h-4" /> {course.poc.phone}
                      </span>
                    )}
                  </div>

                  {course.notes && (
                    <div className="mt-3 p-2 rounded text-sm"
                      style={{ background: 'rgba(27,54,93,0.05)', border: '1px solid rgba(27,54,93,0.12)', color: NAVY }}>
                      <strong>Note:</strong> {course.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* AQD Recommendations */}
      {recommendations.aqdRecommendations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Award className="w-5 h-5" style={{ color: NAVY }} />
            AQD Recommendations
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {recommendations.aqdRecommendations.map((aqd) => (
              <div key={aqd.code} className="rounded-lg p-4"
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 text-sm font-bold rounded text-white"
                    style={{ background: NAVY }}>{aqd.code}</span>
                  <span className="font-semibold text-gray-900">{aqd.name}</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">{aqd.reason}</p>
                {aqd.requirements.length > 0 && (
                  <div className="mt-3">
                    <h5 className="text-xs font-medium text-gray-500 uppercase">Requirements</h5>
                    <ul className="mt-1 text-sm text-gray-700 space-y-1">
                      {aqd.requirements.map((req, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span style={{ color: NAVY, marginTop: 2 }}>•</span>
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Steps */}
      {recommendations.nextSteps.length > 0 && (
        <div className="rounded-xl p-6 text-white" style={{ background: NAVY }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" style={{ color: GOLD }} />
            Your Next Steps
          </h3>
          <ol className="mt-4 space-y-3">
            {recommendations.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: GOLD, color: NAVY }}>
                  {i + 1}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Regenerate */}
      <div className="flex justify-center pt-4">
        <button
          onClick={generateRecommendations}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate Recommendations
        </button>
      </div>

      <div className="text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
        <p>These recommendations are AI-generated based on your record and FY26 course offerings.
          Always verify dates and requirements with official sources before registering.</p>
      </div>
    </div>
  );
}

function buildOfficerSummary(data: ParsedOfficerData): string {
  const parts = [
    `Current Rank: ${data.currentRank || 'Unknown'}`,
    `Designator: ${data.designator || 'Unknown'}`,
    `Security Clearance: ${data.clearanceLevel || 'Not specified'}`,
    `Board Certification: ${data.boardCertified === true ? 'Yes (K Code)' : data.boardCertified === false ? 'No (J Code - Board Eligible)' : 'Unknown'}`,
    `Current AQDs: ${data.aqds.length > 0 ? data.aqds.join(', ') : 'None'}`,
    `FITREP Trait Average: ${data.fitrepAverage || 'Unknown'}`,
    `Total FITREPs: ${data.fitrepCount || 'Unknown'}`,
    `Early Promotes: ${data.earlyPromotes || 0}`,
    `Must Promotes: ${data.mustPromotes || 0}`,
    `Current Billet: ${data.currentBillet || 'Not specified'}`,
    `Deployments: ${data.deployments || 0}`,
    `Operational Tours: ${data.operationalTours || 0}`,
    `JPME Complete: ${data.jpmeComplete ? 'Yes' : 'No'}`,
    `Joint Duty: ${data.jointDuty ? 'Yes' : 'No'}`,
    `Command Tour: ${data.commandTour ? 'Yes' : 'No'}`,
  ];

  if (data.rankHistory.length > 0) {
    const sortedHistory = [...data.rankHistory].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const commissionDate = sortedHistory[0]?.date;
    if (commissionDate) {
      const yearsCommissioned = Math.floor(
        (new Date().getTime() - new Date(commissionDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      parts.push(`Years Commissioned: ~${yearsCommissioned}`);
    }
  }

  return parts.join('\n');
}

function buildCatalogSummary(catalog: Record<string, unknown>): string {
  const courses = catalog.courses as Array<Record<string, unknown>>;
  const aqds = catalog.aqds as Record<string, Record<string, unknown>>;
  const milestones = catalog.careerMilestones as Record<string, Record<string, unknown>>;

  let summary = `COURSES AVAILABLE (FY26):\n`;

  courses.forEach((course: Record<string, unknown>) => {
    summary += `\n[${course.id}] ${course.name}\n`;
    summary += `  Category: ${course.category}\n`;
    summary += `  Target Rank: ${Array.isArray(course.targetRank) ? course.targetRank.join(', ') : course.targetRank || 'All'}\n`;
    if (course.requirement) summary += `  Requirement: ${course.requirement}\n`;
    if (course.duration) summary += `  Duration: ${course.duration}\n`;
    if (course.format) summary += `  Format: ${course.format}\n`;

    const sessions = course.sessions as Array<Record<string, unknown>> | undefined;
    if (sessions && sessions.length > 0) {
      sessions.forEach((session: Record<string, unknown>) => {
        const dates = session.dates as Array<Record<string, unknown>> | undefined;
        if (dates && dates.length > 0) {
          summary += `  Location: ${session.location}\n`;
          summary += `  Dates: ${dates.slice(0, 3).map((d: Record<string, unknown>) =>
            `${d.start} to ${d.end}${d.virtual ? ' (Virtual)' : ''}`
          ).join('; ')}\n`;
        }
        if (session.registration) summary += `  Registration: ${session.registration}\n`;
        if (session.link) summary += `  Link: ${session.link}\n`;
        if (session.poc) summary += `  POC: ${session.poc}\n`;
      });
    }

    if (course.prerequisites && (course.prerequisites as string[]).length > 0) {
      summary += `  Prerequisites: ${(course.prerequisites as string[]).join(', ')}\n`;
    }
  });

  summary += `\nAQDs:\n`;
  Object.entries(aqds).forEach(([code, info]) => {
    summary += `\n[${code}] ${info.name}\n  ${info.description}\n`;
    const requirements = info.requirements as Record<string, unknown> | undefined;
    if (requirements) {
      Object.entries(requirements).forEach(([key, value]) => { summary += `  ${key}: ${value}\n`; });
    }
  });

  summary += `\nCAREER MILESTONES BY RANK:\n`;
  Object.entries(milestones).forEach(([rank, info]) => {
    summary += `\n${rank} (Years: ${info.typicalYears}):\n`;
    summary += `  Focus: ${(info.focus as string[]).join(', ')}\n`;
    summary += `  Recommended Courses: ${(info.recommendedCourses as string[]).join(', ')}\n`;
  });

  return summary;
}

function generateFallbackRecommendations(data: ParsedOfficerData, catalog: Record<string, unknown>): AIRecommendations {
  const courses = catalog.courses as Array<Record<string, unknown>>;
  const milestones = catalog.careerMilestones as Record<string, Record<string, unknown>>;

  const rank = data.currentRank || 'LT';
  const rankMilestones = milestones[rank] || milestones['O3'];
  const recommendedCourseIds = (rankMilestones?.recommendedCourses as string[]) || [];

  const courseRecommendations: CourseRecommendation[] = [];
  const careerInsights: CareerInsight[] = [];

  if (data.fitrepAverage >= 4.5) {
    careerInsights.push({ type: 'strength', title: 'Strong Performance Record', description: `Your trait average of ${data.fitrepAverage.toFixed(2)} indicates consistent high performance.` });
  }

  if (data.aqds.some(a => ['FMF', 'SW', 'AW', 'SS', 'EXW'].includes(a))) {
    careerInsights.push({ type: 'strength', title: 'Warfare Qualification', description: 'Your warfare qualification demonstrates operational credibility and commitment.' });
  }

  if (!data.jpmeComplete && ['LCDR', 'CDR', 'CAPT'].includes(rank)) {
    careerInsights.push({ type: 'gap', title: 'JPME Not Complete', description: 'JPME I is increasingly important for senior positions and certain AQDs like 67B.' });
  }

  if (data.operationalTours === 0 && ['LCDR', 'CDR'].includes(rank)) {
    careerInsights.push({ type: 'gap', title: 'Limited Operational Experience', description: 'Consider pursuing an operational tour to strengthen your record for promotion boards.' });
  }

  recommendedCourseIds.forEach(courseId => {
    const course = courses.find((c: Record<string, unknown>) => c.id === courseId);
    if (course) {
      const sessions = course.sessions as Array<Record<string, unknown>> | undefined;
      const firstSession = sessions?.[0];
      const dates = firstSession?.dates as Array<Record<string, unknown>> | undefined;

      courseRecommendations.push({
        id: course.id as string,
        name: course.name as string,
        category: course.category as string,
        reason: `Recommended for ${rank} officers per career milestone guidance.`,
        priority: courseRecommendations.length === 0 ? 'high' : 'medium',
        nextDates: dates ? dates.slice(0, 3).map((d: Record<string, unknown>) => ({
          start: d.start as string,
          end: d.end as string,
          location: firstSession?.location as string || 'TBD',
          virtual: d.virtual as boolean | undefined,
        })) : [],
        registration: firstSession?.registration as string || course.registration as string || 'Contact SEAT officer',
        link: firstSession?.link as string || course.link as string,
        poc: firstSession?.poc as { name?: string; email?: string; phone?: string } || undefined,
        prerequisites: course.prerequisites as string[] || [],
        notes: course.notes as string || undefined,
      });
    }
  });

  if (!data.jpmeComplete && ['LCDR', 'CDR', 'CAPT'].includes(rank)) {
    const jpmeCourse = courses.find((c: Record<string, unknown>) => c.id === 'jpmei-fsp');
    if (jpmeCourse) {
      courseRecommendations.unshift({
        id: 'jpmei-fsp',
        name: 'JPME I - Fleet Seminar Program',
        category: 'Joint Professional Military Education',
        reason: 'JPME I is critical for senior leadership positions and required for 67B AQD.',
        priority: 'high',
        nextDates: [],
        registration: 'Apply April 1 - May 31 via Naval War College website',
        link: 'https://usnwc.edu/college-of-distance-education/Fleet-Seminar-Program/Enrollment.html',
        poc: { email: 'fsp@usnwc.edu', phone: '(401) 856-5530' },
        prerequisites: ['Baccalaureate Degree'],
        notes: 'Reference NAVADMIN 070/25 for Academic Year application details',
      });
    }
  }

  const aqdRecommendations: AQDRecommendation[] = [];

  if (['CDR', 'CAPT'].includes(rank) && !data.aqds.includes('67A')) {
    aqdRecommendations.push({
      code: '67A', name: 'Executive Medicine',
      reason: 'Required for Command Qualification Program and senior executive positions.',
      requirements: ["Master's degree or higher", 'O4 and above', '2-year Department/Division Head tour', 'JMESI Intermediate Executive Skills Course'],
      contributingCourses: ['iesc', 'capstone', 'hcm'],
    });
  }

  if (data.aqds.some(a => ['FMF', 'SW', 'AW', 'SS', 'EXW'].includes(a)) && !data.aqds.includes('67B') && data.jpmeComplete) {
    aqdRecommendations.push({
      code: '67B', name: 'Expeditionary Medicine',
      reason: 'Your warfare qualification and JPME make you eligible. Strengthens operational credibility.',
      requirements: ['Warfare Designator', 'JPME I required', '7 Core and 7 Additional JMESP courses'],
      contributingCourses: ['broc', 'aroc'],
    });
  }

  return {
    summary: `As a ${rank} with ${data.operationalTours || 0} operational tour(s) and a trait average of ${data.fitrepAverage?.toFixed(2) || 'unknown'}, your focus should be on ${rankMilestones?.focus ? (rankMilestones.focus as string[]).slice(0, 2).join(' and ').toLowerCase() : 'professional development'}. ${courseRecommendations.length > 0 ? `Consider prioritizing ${courseRecommendations[0].name} in the near term.` : ''}`,
    careerInsights,
    courseRecommendations: courseRecommendations.slice(0, 5),
    aqdRecommendations,
    nextSteps: [
      courseRecommendations[0] ? `Register for ${courseRecommendations[0].name} through your SEAT officer` : 'Review course catalog for applicable training',
      'Schedule CDB with your mentor to discuss career trajectory',
      'Review your OSR/ODC for accuracy before next promotion board',
      !data.jpmeComplete && ['LCDR', 'CDR'].includes(rank) ? 'Apply for JPME I Fleet Seminar Program (Apr 1 - May 31)' : 'Continue building operational experience',
      'Update your professional biography and prepare board-ready record',
    ].filter(Boolean),
  };
}
