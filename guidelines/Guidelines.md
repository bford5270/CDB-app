# System Guidelines

Rules for the AI to follow when working on this app. These were reverse-engineered
from the existing Claude-generated UI so future changes stay visually consistent.
Keep additions short and high-signal.

# General guidelines

* Stack: React + TypeScript, Vite, Tailwind CSS v4. UI primitives live in
  `src/app/components/ui/*` (Radix-based) — reuse them instead of hand-rolling.
  Icons: `lucide-react` for structural UI; emoji only as small inline markers
  (tabs, file types, status ticks).
* Use responsive, well-structured layouts with flexbox/grid. Only use absolute
  positioning when genuinely necessary.
* Keep files small. Put helper functions and sub-components in their own files
  (e.g. data access in `src/app/utils/*`, serverless logic in `api/*`).
* Refactor as you go to keep code clean. No secrets in client code — anything
  requiring a secret token goes through an `api/*` serverless function.

# Design system guidelines

## Color
* Primary brand color is **blue**. Primary actions and active states use
  `bg-blue-600`, hover `bg-blue-700`. Accent text `text-blue-600` / `text-blue-900`.
* Page background: `bg-gradient-to-br from-slate-50 to-blue-50`. App header bar:
  `bg-gradient-to-r from-blue-900 to-blue-800` with white text.
* Neutrals: headings `text-gray-900`, body/secondary `text-gray-700`/`text-gray-500`,
  borders `border-gray-200`/`border-gray-300`, subtle fills `bg-gray-50`/`bg-gray-100`.
* Semantic blocks (always `*-50` bg + `*-200` border + readable `*-700/800` text):
  errors → red, info/tips → blue, disclaimers/warnings → yellow. Success is shown
  with a green check (✓), not a filled block.

## Surfaces
* Cards/panels: white background, `rounded-xl`, `border border-gray-200`,
  `shadow-sm` (or `shadow-lg` for the primary content card).
* Inner controls, inputs, and callout boxes: `rounded-lg`.
* Standard page width is `max-w-7xl mx-auto px-6`; section padding `py-4`–`py-8`;
  stacks use `space-y-2`/`space-y-4`, related items `gap-2`/`gap-3`.

## Typography
* Base text is small. Body = `text-sm`, meta/captions = `text-xs`,
  section headings = `font-medium text-gray-900`, larger headings =
  `font-semibold`, page title = `text-3xl font-bold`.

## Buttons
One primary action per section.

* **Primary** — main action: `px-6 py-3 bg-blue-600 text-white rounded-lg
  font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
  transition-colors`. Compact variant: `px-4 py-2 ... text-sm font-medium`.
* **Secondary** — supporting/back action: `px-6 py-3 border border-gray-300
  text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors`.
* Directional/affordance buttons may carry a trailing `lucide-react` icon
  sized `w-5 h-5`.

## Feedback & motion
* Loading state is a ring spinner:
  `animate-spin h-N w-N border-2 border-blue-600 border-t-transparent rounded-full`.
* Interactive elements get `transition-colors` (or `transition-all` for
  multi-property changes). No abrupt state flips.
