'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Target, Trophy, AlertTriangle, GitBranch, RotateCcw } from 'lucide-react';

// WOOP (Oettingen) — Wish, Outcome, Obstacle, Plan. Mental contrasting plus an
// if-then implementation intention. The form is intentionally blank: the officer
// writes their own goals, and the worksheet prints them beside the record data.
//
// Note: WOOP is not part of the Medical Corps CDB brief. It is a general
// goal-setting framework applied here to the CDB conversation.

export const WOOP_GOAL_COUNT = 3;

export interface WoopGoal {
  wish: string;
  outcome: string;
  obstacle: string;
  plan: string;
  horizon: string;
}

export type WoopField = keyof WoopGoal;

const STORAGE_KEY = 'cdb-woop-goals-v1';

export function emptyGoal(): WoopGoal {
  return { wish: '', outcome: '', obstacle: '', plan: '', horizon: '' };
}

export function emptyGoals(): WoopGoal[] {
  return Array.from({ length: WOOP_GOAL_COUNT }, emptyGoal);
}

export function isGoalStarted(g: WoopGoal): boolean {
  return Boolean(g.wish.trim() || g.outcome.trim() || g.obstacle.trim() || g.plan.trim());
}

export function isGoalComplete(g: WoopGoal): boolean {
  return Boolean(g.wish.trim() && g.outcome.trim() && g.obstacle.trim() && g.plan.trim());
}

// Normalize anything read back from storage into exactly WOOP_GOAL_COUNT goals.
function coerceGoals(raw: unknown): WoopGoal[] {
  const base = emptyGoals();
  if (!Array.isArray(raw)) return base;
  for (let i = 0; i < WOOP_GOAL_COUNT; i++) {
    const r = raw[i];
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    base[i] = {
      wish: typeof o.wish === 'string' ? o.wish : '',
      outcome: typeof o.outcome === 'string' ? o.outcome : '',
      obstacle: typeof o.obstacle === 'string' ? o.obstacle : '',
      plan: typeof o.plan === 'string' ? o.plan : '',
      horizon: typeof o.horizon === 'string' ? o.horizon : '',
    };
  }
  return base;
}

/**
 * Goal state persisted to this browser only. Every access is guarded: storage
 * can be unavailable or throw in a private window or with site data blocked,
 * and the form must still work.
 */
export function useWoopGoals() {
  const [goals, setGoals] = useState<WoopGoal[]>(emptyGoals);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setGoals(coerceGoals(JSON.parse(saved)));
    } catch {
      // No persisted draft available — start blank.
    }
  }, []);

  const persist = useCallback((next: WoopGoal[]) => {
    setGoals(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Draft stays in memory for this session.
    }
  }, []);

  const updateGoal = useCallback((index: number, field: WoopField, value: string) => {
    setGoals(prev => {
      const next = prev.map((g, i) => (i === index ? { ...g, [field]: value } : g));
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Draft stays in memory for this session.
      }
      return next;
    });
  }, []);

  const resetGoals = useCallback(() => persist(emptyGoals()), [persist]);

  return { goals, updateGoal, resetGoals };
}

const STEPS: Array<{
  field: WoopField;
  letter: string;
  label: string;
  help: string;
  placeholder: string;
  icon: typeof Target;
  rows: number;
}> = [
  {
    field: 'wish',
    letter: 'W',
    label: 'Wish',
    help: 'One career goal that matters to you and is challenging but feasible. Be concrete — a billet, a qualification, a course, a degree.',
    placeholder: 'e.g. Complete JPME I before my next selection board',
    icon: Target,
    rows: 2,
  },
  {
    field: 'outcome',
    letter: 'O',
    label: 'Outcome',
    help: 'The single best thing about achieving it. Picture it — what changes for you and your career?',
    placeholder: 'e.g. JS7 on my record, and I stop being the candidate without joint education',
    icon: Trophy,
    rows: 2,
  },
  {
    field: 'obstacle',
    letter: 'O',
    label: 'Obstacle',
    help: 'The main obstacle inside you — the habit, hesitation or competing pull that actually gets in the way. Not an external excuse.',
    placeholder: 'e.g. I tell myself the clinical schedule is too full to start an application',
    icon: AlertTriangle,
    rows: 2,
  },
  {
    field: 'plan',
    letter: 'P',
    label: 'Plan (if–then)',
    help: 'An if–then plan that fires when the obstacle shows up: "If [obstacle], then I will [specific action]."',
    placeholder: 'e.g. If I catch myself deferring the application, then I will block 30 minutes the next admin day and submit it',
    icon: GitBranch,
    rows: 3,
  },
];

interface WOOPGoalsProps {
  goals: WoopGoal[];
  onChange: (index: number, field: WoopField, value: string) => void;
  onReset: () => void;
  className?: string;
}

export function WOOPGoals({ goals, onChange, onReset, className = '' }: WOOPGoalsProps) {
  const started = goals.filter(isGoalStarted).length;
  const complete = goals.filter(isGoalComplete).length;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Set three WOOP goals</h2>
            <p className="text-sm text-gray-600 mt-1 max-w-3xl">
              WOOP pairs a goal with the obstacle that actually blocks it, then commits you to an
              if–then response. Write three goals to bring to your Career Development Board — they
              print on your worksheet next to your record analysis and recommendations.
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-semibold text-blue-600">{complete}<span className="text-gray-400 text-lg">/{WOOP_GOAL_COUNT}</span></p>
            <p className="text-xs text-gray-500">complete</p>
          </div>
        </div>
        {started > 0 && (
          <button
            onClick={onReset}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 underline"
          >
            <RotateCcw className="w-3 h-3" /> Clear all goals
          </button>
        )}
        <p className="text-xs text-gray-400 mt-3">
          Saved in this browser only — not uploaded anywhere. Clearing site data clears your drafts.
        </p>
      </div>

      {goals.map((goal, i) => {
        const done = isGoalComplete(goal);
        return (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className={`px-5 py-3 border-b flex items-center justify-between ${
              done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className="font-semibold text-gray-900">Goal {i + 1}</h3>
              <span className={`text-xs font-medium ${done ? 'text-green-700' : 'text-gray-500'}`}>
                {done ? '✓ Complete' : isGoalStarted(goal) ? 'In progress' : 'Not started'}
              </span>
            </div>

            <div className="p-5 space-y-4">
              {STEPS.map(step => {
                const Icon = step.icon;
                const id = `woop-${i}-${step.field}`;
                return (
                  <div key={step.field}>
                    <label htmlFor={id} className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {step.letter}
                      </span>
                      <Icon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-sm font-semibold text-gray-900">{step.label}</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-1.5 ml-8">{step.help}</p>
                    <textarea
                      id={id}
                      rows={step.rows}
                      value={goal[step.field]}
                      onChange={e => onChange(i, step.field, e.target.value)}
                      placeholder={step.placeholder}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    />
                  </div>
                );
              })}

              <div>
                <label htmlFor={`woop-${i}-horizon`} className="text-sm font-semibold text-gray-900">
                  Target timeframe <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <input
                  id={`woop-${i}-horizon`}
                  type="text"
                  value={goal.horizon}
                  onChange={e => onChange(i, 'horizon', e.target.value)}
                  placeholder="e.g. before the FY28 board / next 12 months"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default WOOPGoals;
