'use client';

import { useState, useEffect } from 'react';
import { Sparkles, BookOpen, Award, Calendar, ExternalLink, Mail, Phone, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Target, TrendingUp, CheckCircle, Briefcase } from 'lucide-react';
import type { ParsedOfficerData } from './VerifyParsedData';
import { supabase } from '../utils/supabaseClient';

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

interface AWERecommendation {
  id: string;
  name: string;
  aweType: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  eligibleRanks: string[];
  typicalDuration: string;
  benefits: string[];
  howToApply: string;
  contact?: { organization?: string; email?: string; website?: string; note?: string };
}

interface AIRecommendations {
  summary: string;
  careerInsights: CareerInsight[];
  courseRecommendations: CourseRecommendation[];
  aqdRecommendations: AQDRecommendation[];
  aweRecommendations: AWERecommendation[];
  nextSteps: string[];
}

// Load course catalog
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

// Load reference documents from Supabase
async function loadReferenceDocuments(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('name, extracted_text, created_at, file_path')
      .order('created_at', { ascending: false });

    if (error || !data) return '';

    // Sort most-recent-year first (same logic as ResourcesQA)
    const sorted = [...data].sort((a, b) => {
      const yearOf = (d: { name: string; file_path: string }) => {
        const text = `${d.name} ${d.file_path}`.toUpperCase();
        const m2 = text.match(/FY(\d{2})\b/);
        if (m2) return 2000 + parseInt(m2[1]);
        const m4 = text.match(/FY(20\d{2})\b/);
        if (m4) return parseInt(m4[1]);
        const my = text.match(/\b(202[4-9]|203\d)\b/);
        if (my) return parseInt(my[1]);
        return new Date(d.created_at).getFullYear();
      };
      return yearOf(b) - yearOf(a);
    });

    return sorted
      .filter(d => d.extracted_text)
      .map(d => `--- ${d.name} ---\n${d.extracted_text}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

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
      // Load course catalog and reference documents
      const [catalog, refDocs] = await Promise.all([
        loadCourseCatalog(),
        loadReferenceDocuments()
      ]);
      
      setCourseCatalog(catalog);

      if (!catalog) {
        throw new Error('Could not load course catalog');
      }

      // Build the prompt with officer data
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
- AWE (Additional Work Experiences) are broadening assignments beyond clinical duty — recommend 1-2 that best fit this officer's rank and gaps

FY26 COURSE & AWE CATALOG DATA:
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
  "aweRecommendations": [
    {
      "id": "awe id from catalog",
      "name": "AWE billet/program name",
      "aweType": "Academic|Research|Policy|Education|Operational|Joint",
      "reason": "Why this AWE fits this officer's record and career stage specifically",
      "priority": "high|medium|low",
      "eligibleRanks": ["O4", "O5"],
      "typicalDuration": "2-3 years",
      "benefits": ["Career benefit 1", "Career benefit 2"],
      "howToApply": "How to pursue this opportunity",
      "contact": {"organization": "Org name", "note": "Any important note"}
    }
  ],
  "nextSteps": ["Prioritized list of 3-5 immediate actions to take"]
}

Limit to 3-5 course recommendations, 1-2 AQD recommendations, and 1-2 AWE recommendations, prioritized by impact. For AWEs, choose those that directly address gaps in this officer's record (e.g., recommend researcher if no publications/research; recommend BUMED staff if near O5/O6 and no HQ experience; recommend operational tour if no deployment). Focus on the most impactful actions for their career stage.`;

      // Call Claude API
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userPrompt,
          context: systemPrompt,
          isActionPlan: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate recommendations');
      }

      const data = await response.json();
      
      // Parse the JSON response
      let parsed: AIRecommendations;
      try {
        // Try to extract JSON from the response
        const jsonMatch = data.answer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        // Fallback to rule-based recommendations
        parsed = generateFallbackRecommendations(officerData, catalog);
      }

      setRecommendations(parsed);
    } catch (err) {
      console.error('Error generating recommendations:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate recommendations');
      
      // Generate fallback recommendations
      if (courseCatalog) {
        setRecommendations(generateFallbackRecommendations(officerData, courseCatalog));
      }
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
          <Sparkles className="w-12 h-12 text-blue-600 animate-pulse" />
          <RefreshCw className="w-6 h-6 text-blue-400 absolute -bottom-1 -right-1 animate-spin" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">Generating Your Personalized Action Plan</h3>
        <p className="mt-2 text-gray-600">Analyzing your record and matching with FY26 course offerings...</p>
      </div>
    );
  }

  if (error && !recommendations) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-800">Unable to Generate AI Recommendations</h3>
            <p className="mt-1 text-red-700">{error}</p>
            <button
              onClick={generateRecommendations}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Your Personalized Action Plan</h2>
        </div>
        <p className="text-gray-600">AI-generated recommendations based on your record and FY26 course offerings</p>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <p className="text-gray-800 leading-relaxed">{recommendations.summary}</p>
      </div>

      {/* Career Insights */}
      {recommendations.careerInsights.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            Career Insights
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {recommendations.careerInsights.map((insight, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border ${
                  insight.type === 'strength' ? 'bg-green-50 border-green-200' :
                  insight.type === 'gap' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {insight.type === 'strength' && <CheckCircle className="w-4 h-4 text-green-600" />}
                  {insight.type === 'gap' && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                  {insight.type === 'opportunity' && <TrendingUp className="w-4 h-4 text-blue-600" />}
                  <span className={`text-sm font-medium ${
                    insight.type === 'strength' ? 'text-green-700' :
                    insight.type === 'gap' ? 'text-yellow-700' :
                    'text-blue-700'
                  }`}>
                    {insight.type === 'strength' ? 'Strength' :
                     insight.type === 'gap' ? 'Area to Address' : 'Opportunity'}
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
          <BookOpen className="w-5 h-5 text-blue-600" />
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
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      course.priority === 'high' ? 'bg-red-100 text-red-700' :
                      course.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {course.priority === 'high' ? 'High Priority' :
                       course.priority === 'medium' ? 'Recommended' : 'Consider'}
                    </span>
                    <span className="text-xs text-gray-500">{course.category}</span>
                  </div>
                  <h4 className="font-semibold text-gray-900 mt-1">{course.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{course.reason}</p>
                </div>
                {expandedCourses[course.id] ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
              </button>
              
              {expandedCourses[course.id] && (
                <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                  {/* Next Dates */}
                  {course.nextDates && course.nextDates.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Upcoming Sessions
                      </h5>
                      <div className="mt-2 space-y-1">
                        {course.nextDates.slice(0, 3).map((date, i) => (
                          <div key={i} className="text-sm flex items-center gap-2">
                            <span className="text-gray-900">
                              {new Date(date.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(date.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-600">{date.location}</span>
                            {date.virtual && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Virtual</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Registration */}
                  <div className="mt-3">
                    <h5 className="text-sm font-medium text-gray-700">How to Register</h5>
                    <p className="text-sm text-gray-600 mt-1">{course.registration}</p>
                  </div>

                  {/* Prerequisites */}
                  {course.prerequisites && course.prerequisites.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-gray-700">Prerequisites</h5>
                      <ul className="mt-1 text-sm text-gray-600 list-disc list-inside">
                        {course.prerequisites.map((prereq, i) => (
                          <li key={i}>{prereq}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Links and POC */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {course.link && (
                      <a
                        href={course.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Course Info
                      </a>
                    )}
                    {course.poc?.email && (
                      <a
                        href={`mailto:${course.poc.email}`}
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Mail className="w-4 h-4" />
                        {course.poc.name || 'Contact POC'}
                      </a>
                    )}
                    {course.poc?.phone && (
                      <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                        <Phone className="w-4 h-4" />
                        {course.poc.phone}
                      </span>
                    )}
                  </div>

                  {/* Notes */}
                  {course.notes && (
                    <div className="mt-3 p-2 bg-blue-50 rounded text-sm text-blue-800">
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
            <Award className="w-5 h-5 text-blue-600" />
            AQD Recommendations
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {recommendations.aqdRecommendations.map((aqd) => (
              <div key={aqd.code} className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-indigo-600 text-white text-sm font-bold rounded">{aqd.code}</span>
                  <span className="font-semibold text-gray-900">{aqd.name}</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">{aqd.reason}</p>
                {aqd.requirements.length > 0 && (
                  <div className="mt-3">
                    <h5 className="text-xs font-medium text-gray-500 uppercase">Requirements</h5>
                    <ul className="mt-1 text-sm text-gray-700 space-y-1">
                      {aqd.requirements.map((req, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-indigo-500 mt-1">•</span>
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

      {/* AWE Recommendations */}
      {recommendations.aweRecommendations && recommendations.aweRecommendations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            Additional Work Experience (AWE) Opportunities
          </h3>
          <p className="text-sm text-gray-500">
            Broadening assignments beyond clinical duty that strengthen your record for senior boards.
          </p>
          <div className="space-y-3">
            {recommendations.aweRecommendations.map((awe) => (
              <div key={awe.id} className="border border-indigo-200 rounded-lg overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          awe.priority === 'high' ? 'bg-red-100 text-red-700' :
                          awe.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {awe.priority === 'high' ? 'High Priority' :
                           awe.priority === 'medium' ? 'Recommended' : 'Consider'}
                        </span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-indigo-100 text-indigo-700">
                          {awe.aweType}
                        </span>
                        {awe.eligibleRanks && (
                          <span className="text-xs text-gray-500">
                            {awe.eligibleRanks.join(' / ')} • {awe.typicalDuration}
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900 mt-2">{awe.name}</h4>
                      <p className="text-sm text-gray-700 mt-1">{awe.reason}</p>
                    </div>
                  </div>

                  {/* Benefits */}
                  {awe.benefits && awe.benefits.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Why it matters</p>
                      <ul className="space-y-1">
                        {awe.benefits.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <CheckCircle className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* How to Apply */}
                  {awe.howToApply && (
                    <div className="mt-3 p-2 bg-white/70 rounded text-sm text-gray-700">
                      <span className="font-medium text-gray-800">How to pursue: </span>
                      {awe.howToApply}
                    </div>
                  )}

                  {/* Contact */}
                  {awe.contact && (awe.contact.organization || awe.contact.note) && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                      {awe.contact.organization && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5" />
                          {awe.contact.organization}
                        </span>
                      )}
                      {awe.contact.website && (
                        <a
                          href={awe.contact.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          More info
                        </a>
                      )}
                      {awe.contact.note && (
                        <span className="italic text-gray-500">{awe.contact.note}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Steps */}
      {recommendations.nextSteps.length > 0 && (
        <div className="bg-gray-900 text-white rounded-xl p-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Your Next Steps
          </h3>
          <ol className="mt-4 space-y-3">
            {recommendations.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </span>
                <span className="text-gray-200">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Regenerate Button */}
      <div className="flex justify-center pt-4">
        <button
          onClick={generateRecommendations}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate Recommendations
        </button>
      </div>

      {/* Disclaimer */}
      <div className="text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
        <p>
          These recommendations are AI-generated based on your record and FY26 course offerings.
          Always verify dates and requirements with official sources before registering.
        </p>
      </div>
    </div>
  );
}

// Helper function to build officer summary for the AI
function buildOfficerSummary(data: ParsedOfficerData): string {
  const parts = [
    `Current Rank: ${data.currentRank || 'Unknown'}`,
    `Designator: ${data.designator || 'Unknown'}`,
    `Security Clearance: ${data.clearanceLevel || 'Not specified'}`,
    `Board Certification: ${data.certificationCode === 'K' ? 'Yes - Board Certified (K Code)' : data.certificationCode === 'J' ? 'Board Eligible, not yet certified (J Code)' : data.certificationCode === 'T' ? 'In Training / Residency (T Code)' : 'Unknown'}`,
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

// Helper function to build a summary of the course catalog
function buildCatalogSummary(catalog: Record<string, unknown>): string {
  const courses = catalog.courses as Array<Record<string, unknown>>;
  const aqds = catalog.aqds as Record<string, Record<string, unknown>>;
  const milestones = catalog.careerMilestones as Record<string, Record<string, unknown>>;
  const awes = catalog.aweOpportunities as Array<Record<string, unknown>> | undefined;

  let summary = `COURSES AVAILABLE (FY26):\n`;

  courses.forEach((course: Record<string, unknown>) => {
    summary += `\n[${course.id}] ${course.name}\n`;
    summary += `  Category: ${course.category}\n`;
    summary += `  Target Rank: ${Array.isArray(course.targetRank) ? course.targetRank.join(', ') : course.targetRank || 'All'}\n`;
    if (course.requirement) summary += `  Requirement: ${course.requirement}\n`;
    if (course.duration) summary += `  Duration: ${course.duration}\n`;
    if (course.format) summary += `  Format: ${course.format}\n`;

    // Add session dates
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
    summary += `\n[${code}] ${info.name}\n`;
    summary += `  ${info.description}\n`;
    const requirements = info.requirements as Record<string, unknown> | undefined;
    if (requirements) {
      Object.entries(requirements).forEach(([key, value]) => {
        summary += `  ${key}: ${value}\n`;
      });
    }
  });

  if (awes && awes.length > 0) {
    summary += `\nADDITIONAL WORK EXPERIENCES (AWEs):\n`;
    awes.forEach((awe: Record<string, unknown>) => {
      summary += `\n[${awe.id}] ${awe.name} (${awe.aweType})\n`;
      summary += `  Eligible Ranks: ${Array.isArray(awe.eligibleRanks) ? (awe.eligibleRanks as string[]).join(', ') : 'All'}\n`;
      summary += `  Duration: ${awe.typicalDuration}\n`;
      summary += `  ${awe.description}\n`;
      if (Array.isArray(awe.benefits)) {
        summary += `  Benefits: ${(awe.benefits as string[]).slice(0, 2).join('; ')}\n`;
      }
      if (awe.howToApply) summary += `  How to apply: ${awe.howToApply}\n`;
    });
  }

  summary += `\nCAREER MILESTONES BY RANK:\n`;
  Object.entries(milestones).forEach(([rank, info]) => {
    summary += `\n${rank} (Years: ${info.typicalYears}):\n`;
    summary += `  Focus: ${(info.focus as string[]).join(', ')}\n`;
    summary += `  Recommended Courses: ${(info.recommendedCourses as string[]).join(', ')}\n`;
  });

  return summary;
}

// Fallback rule-based recommendations if AI fails
function generateFallbackRecommendations(data: ParsedOfficerData, catalog: Record<string, unknown>): AIRecommendations {
  const courses = catalog.courses as Array<Record<string, unknown>>;
  const milestones = catalog.careerMilestones as Record<string, Record<string, unknown>>;
  const awes = (catalog.aweOpportunities as Array<Record<string, unknown>>) || [];

  const rank = data.currentRank || 'LT';
  const rankMilestones = milestones[rank] || milestones['O3'];
  const recommendedCourseIds = (rankMilestones?.recommendedCourses as string[]) || [];

  const courseRecommendations: CourseRecommendation[] = [];
  const careerInsights: CareerInsight[] = [];

  // Add insights based on data
  if (data.fitrepAverage >= 4.5) {
    careerInsights.push({
      type: 'strength',
      title: 'Strong Performance Record',
      description: `Your trait average of ${data.fitrepAverage.toFixed(2)} indicates consistent high performance.`
    });
  }

  if (data.aqds.some(a => ['FMF', 'SW', 'AW', 'SS', 'EXW'].includes(a))) {
    careerInsights.push({
      type: 'strength',
      title: 'Warfare Qualification',
      description: 'Your warfare qualification demonstrates operational credibility and commitment.'
    });
  }

  if (!data.jpmeComplete && ['LCDR', 'CDR', 'CAPT'].includes(rank)) {
    careerInsights.push({
      type: 'gap',
      title: 'JPME Not Complete',
      description: 'JPME I is increasingly important for senior positions and certain AQDs like 67B.'
    });
  }

  if (data.operationalTours === 0 && ['LCDR', 'CDR'].includes(rank)) {
    careerInsights.push({
      type: 'gap',
      title: 'Limited Operational Experience',
      description: 'Consider pursuing an operational tour to strengthen your record for promotion boards.'
    });
  }

  // Match recommended courses from milestone data
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
          virtual: d.virtual as boolean | undefined
        })) : [],
        registration: firstSession?.registration as string || course.registration as string || 'Contact SEAT officer',
        link: firstSession?.link as string || course.link as string,
        poc: firstSession?.poc as { name?: string; email?: string; phone?: string } || undefined,
        prerequisites: course.prerequisites as string[] || [],
        notes: course.notes as string || undefined
      });
    }
  });

  // Add JPME if not complete and senior enough
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
        notes: 'Reference NAVADMIN 070/25 for Academic Year application details'
      });
    }
  }

  const aqdRecommendations: AQDRecommendation[] = [];
  
  // Recommend 67A for senior officers without it
  if (['CDR', 'CAPT'].includes(rank) && !data.aqds.includes('67A')) {
    aqdRecommendations.push({
      code: '67A',
      name: 'Executive Medicine',
      reason: 'Required for Command Qualification Program and senior executive positions.',
      requirements: [
        "Master's degree or higher",
        'O4 and above',
        '2-year Department/Division Head tour',
        'JMESI Intermediate Executive Skills Course'
      ],
      contributingCourses: ['iesc', 'capstone', 'hcm']
    });
  }

  // Recommend 67B for officers with warfare qual but no 67B
  if (data.aqds.some(a => ['FMF', 'SW', 'AW', 'SS', 'EXW'].includes(a)) && !data.aqds.includes('67B') && data.jpmeComplete) {
    aqdRecommendations.push({
      code: '67B',
      name: 'Expeditionary Medicine',
      reason: 'Your warfare qualification and JPME make you eligible. Strengthens operational credibility.',
      requirements: [
        'Warfare Designator',
        'JPME I required',
        '7 Core and 7 Additional JMESP courses'
      ],
      contributingCourses: ['broc', 'aroc']
    });
  }

  // AWE fallback recommendations
  const aweRecommendations: AWERecommendation[] = [];
  const rankToO: Record<string, string> = { LT: 'O3', LCDR: 'O4', CDR: 'O5', CAPT: 'O6' };
  const oRank = rankToO[rank] || 'O3';

  // Recommend researcher/CIP for junior/mid officers without publications context
  if (['O3', 'O4'].includes(oRank)) {
    const cip = awes.find(a => a.id === 'awe-cip');
    if (cip) {
      aweRecommendations.push({
        id: cip.id as string,
        name: cip.name as string,
        aweType: cip.aweType as string,
        reason: 'A research fellowship builds academic credentials, earns the 6OC AQD, and distinguishes your record for competitive promotion boards.',
        priority: 'medium',
        eligibleRanks: cip.eligibleRanks as string[],
        typicalDuration: cip.typicalDuration as string,
        benefits: cip.benefits as string[],
        howToApply: cip.howToApply as string,
        contact: cip.contact as AWERecommendation['contact'],
      });
    }
  }

  // Recommend BUMED/HQ staff for O5/O6
  if (['O5', 'O6'].includes(oRank)) {
    const bumed = awes.find(a => a.id === 'awe-bumed-staff');
    if (bumed) {
      aweRecommendations.push({
        id: bumed.id as string,
        name: bumed.name as string,
        aweType: bumed.aweType as string,
        reason: 'HQ staff experience is consistently weighted by CDR and CAPT selection boards and is essential for flag officer consideration.',
        priority: 'high',
        eligibleRanks: bumed.eligibleRanks as string[],
        typicalDuration: bumed.typicalDuration as string,
        benefits: bumed.benefits as string[],
        howToApply: bumed.howToApply as string,
        contact: bumed.contact as AWERecommendation['contact'],
      });
    }
  }

  // Recommend operational tour if no operational tours
  if ((data.operationalTours || 0) === 0) {
    const opTour = awes.find(a => a.id === 'awe-operational-oconus');
    if (opTour) {
      aweRecommendations.push({
        id: opTour.id as string,
        name: opTour.name as string,
        aweType: opTour.aweType as string,
        reason: 'No operational tours detected. Operational credibility is heavily weighted at LCDR and CDR boards.',
        priority: 'high',
        eligibleRanks: opTour.eligibleRanks as string[],
        typicalDuration: opTour.typicalDuration as string,
        benefits: opTour.benefits as string[],
        howToApply: opTour.howToApply as string,
        contact: opTour.contact as AWERecommendation['contact'],
      });
    }
  }

  return {
    summary: `As a ${rank} with ${data.operationalTours || 0} operational tour(s) and a trait average of ${data.fitrepAverage?.toFixed(2) || 'unknown'}, your focus should be on ${rankMilestones?.focus ? (rankMilestones.focus as string[]).slice(0, 2).join(' and ').toLowerCase() : 'professional development'}. ${courseRecommendations.length > 0 ? `Consider prioritizing ${courseRecommendations[0].name} in the near term.` : ''}`,
    careerInsights,
    courseRecommendations: courseRecommendations.slice(0, 5),
    aqdRecommendations,
    aweRecommendations: aweRecommendations.slice(0, 2),
    nextSteps: [
      courseRecommendations[0] ? `Register for ${courseRecommendations[0].name} through your SEAT officer` : 'Review course catalog for applicable training',
      aweRecommendations[0] ? `Explore AWE: ${aweRecommendations[0].name} — discuss with detailer at your 18-month window` : 'Discuss broadening assignment options with your detailer',
      'Schedule CDB with your mentor to discuss career trajectory',
      'Review your OSR/ODC for accuracy before next promotion board',
      !data.jpmeComplete && ['LCDR', 'CDR'].includes(rank) ? 'Apply for JPME I Fleet Seminar Program (Apr 1 - May 31)' : 'Continue building operational experience',
    ].filter(Boolean)
  };
}
