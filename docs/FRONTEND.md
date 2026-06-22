# Frontend Architecture

> Deep-dive reference for the Next.js 14 App Router frontend. For a high-level overview, see the [root README](../README.md). For backend specifics, see [BACKEND.md](./BACKEND.md).

---

## 1. Route Structure

The app uses the Next.js 14 **App Router** (file-system routing under `src/app/`). Every route folder contains a `page.tsx`. The full route map:

| Route | File | Rendered as | Auth required |
|---|---|---|---|
| `/` | `app/page.tsx` | Client Component | No |
| `/login` | `app/login/page.tsx` | Client Component | No (redirects to `/dashboard` if already authenticated) |
| `/register` | `app/register/page.tsx` | Client Component | No |
| `/dashboard` | `app/dashboard/page.tsx` | Client Component (wrapped in `ProtectedRoute`) | Yes |
| `/trips/new` | `app/trips/new/page.tsx` | Client Component (wrapped in `ProtectedRoute`) | Yes |
| `/trips/[id]` | `app/trips/[id]/page.tsx` | Client Component (wrapped in `ProtectedRoute`) | Yes |

### What each route does

**`/` — Landing page**  
Marketing page only — no data fetching. Renders the staggered Framer Motion hero section, the WebGL globe (`next/dynamic` with `ssr: false`), and the three feature cards. The globe fallback (a shimmer skeleton `div`) shows during WebGL load. All animations respect `prefers-reduced-motion` via Framer Motion's `useReducedMotion()` hook.

**`/login` and `/register`**  
Form pages that call `useAuthStore().login()` / `useAuthStore().register()`. On success the store sets `user` and the page imperatively navigates to the `returnTo` query param or `/dashboard`. On failure the form displays the error message surfaced from the `ApiError` thrown by the store.

**`/dashboard`**  
The main trip list view. Wrapped in `ProtectedRoute`. Fetches `GET /api/trips` on mount via the `api` client with `credentials: 'include'`. Renders a card grid of trip summaries. Each card shows destination, duration, budget tier, status badge, and a mini `ScoreRing` if the trip has a confidence score. Clicking a card navigates to `/trips/[id]`.

**`/trips/new`**  
Trip creation form. Collects destination, duration, budget tier, interests, and optional start date. On submit calls `POST /api/trips` (which triggers Gemini generation server-side). Shows a loading state while generation runs (typically 8–15 seconds).

**`/trips/[id]`**  
The main trip detail view. Shows the full itinerary, hotel recommendations, budget breakdown (Recharts `BarChart`), and the Risk Co-Pilot panel (full-size `ScoreRing` + `FlagChips` + per-flag "Fix this" buttons). Supports per-day regeneration and per-activity add/remove. The `[id]` segment is a dynamic route segment — Next.js passes it as `params.id`.

---

## 2. State Management

### The Zustand store: `auth.store.ts`

Auth state lives in a single Zustand store at `src/store/auth.store.ts`. The shape:

```typescript
interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean; // true once the initial /me check completes

  setUser: (user: User | null) => void;
  init: () => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}
```

`isInitialized` is the critical field. It starts `false` and is set to `true` exactly once — after `init()` resolves (whether the `/me` check returns a user or a 401). This lets `ProtectedRoute` distinguish "still checking" from "definitely unauthenticated."

`isLoading` guards against double-submissions during async operations (login, register).

No trip state lives in Zustand — trip data is fetched locally in each page component. This was intentional: trips are server-owned data, and caching them client-side would require invalidation logic that adds complexity with no user-visible payoff at this scale.

### `AuthProvider` — session restoration on load

```tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const init = useAuthStore((state) => state.init);
  useEffect(() => { init(); }, [init]);
  return <>{children}</>;
}
```

`AuthProvider` is placed in the root layout (`app/layout.tsx`), wrapping all children. It fires `init()` exactly once on mount — hitting `GET /api/auth/me` with the httpOnly cookie to restore session without any token in JavaScript's hands.

### `ProtectedRoute` — gating routes

```tsx
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isInitialized } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isInitialized) return; // still checking — wait
    if (!user) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [user, isInitialized, router, pathname]);

  if (!isInitialized) return <LoadingSpinner />;
  if (!user) return null;
  return <>{children}</>;
}
```

The three-state guard (`!isInitialized` → spinner, `isInitialized && !user` → null + redirect, `isInitialized && user` → render) eliminates both the flash-of-protected-content and the premature redirect to `/login` that would happen if navigation ran before the `/me` check completed.

---

## 3. The "Editorial Indigo" Design System

The design system is implemented entirely as CSS custom properties in `src/app/globals.css`, with no external design-token library. Two full token sets are defined on `[data-theme="dark"]` (the default) and `[data-theme="light"]`.

### Dark mode tokens (`[data-theme="dark"]`)

| Token | Value | Purpose |
|---|---|---|
| `--color-void` | `#09090f` | Page background |
| `--color-surface` | `#12121c` | Card backgrounds |
| `--color-surface-2` | `#1c1c2e` | Input fields, nested surfaces |
| `--color-surface-3` | `#252538` | Tertiary surfaces, tooltips |
| `--color-border` | `#2a2a3f` | Dividers, card outlines |
| `--color-accent` | `#6366f1` | Primary brand colour (Editorial Indigo) |
| `--color-accent-hover` | `#818cf8` | Hover state for accent |
| `--color-risk-high` | `#ef4444` | High-severity risk flags |
| `--color-risk-medium` | `#f59e0b` | Medium-severity risk flags |
| `--color-risk-low` | `#22c55e` | Low-severity / confidence high |
| `--color-text-primary` | `#f8f8ff` | Body text |
| `--color-text-secondary` | `#a0a0b8` | Supporting copy |
| `--color-text-muted` | `#6b6b88` | Placeholders, timestamps |
| `--glass-bg` | `rgba(28,28,46,0.75)` | Glassmorphism card background |

### Light mode tokens (`[data-theme="light"]`)

The light mode flips to a warm ivory base (`--color-void: #faf8f3`) rather than a stark white, which reduces eye strain and differentiates the palette from generic light modes. The accent colour stays `#6366f1` — brand identity is preserved across modes.

The risk severity colours are re-tuned for WCAG AA on the `#faf8f3` background. The dark-mode values (`#ef4444`, `#f59e0b`, `#22c55e`) all fail contrast at 4.5:1 against light backgrounds, so the light-mode palette uses darker variants:

| Token | Dark value | Light value | Light contrast on #faf8f3 |
|---|---|---|---|
| `--color-risk-high` | `#ef4444` | `#b91c1c` | ~5.8:1 ✓ |
| `--color-risk-medium` | `#f59e0b` | `#92400e` | ~5.1:1 ✓ |
| `--color-risk-low` | `#22c55e` | `#15803d` | ~5.4:1 ✓ |

### Theme wiring: custom `ThemeProvider` (not `next-themes`)

The project implements its own `ThemeProvider` at `src/components/theme/ThemeProvider.tsx` rather than using the `next-themes` package. The decision: `next-themes` adds ~3 KB for functionality that's fully expressible in ~100 lines of React.

Theme resolution order: explicit user choice stored in `localStorage` under key `"atp-theme"` → OS `prefers-color-scheme` → dark.

To eliminate the Flash of Unstyled Wrong Theme (FOUWT), the root layout (`app/layout.tsx`) injects a synchronous blocking script via `<Script strategy="beforeInteractive">`:

```js
(function() {
  try {
    var stored = localStorage.getItem('atp-theme');
    var theme = stored === 'light' ? 'light'
              : stored === 'dark'  ? 'dark'
              : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch(e) {}
})();
```

This script runs before any CSS paint, so `data-theme` is set on `<html>` before the browser renders a single pixel. The `ThemeProvider` then re-reads the same stored value on mount and takes over.

---

## 4. Animated Components

### Framer Motion — page/section transitions and hero animations

**Why Framer Motion:** React's built-in transitions handle simple opacity/transform, but orchestrating staggered children, spring physics, and `whileInView` scroll triggers without Framer requires either CSS `animation-delay` hacks (brittle) or a custom intersection observer setup. Framer solves all three declaratively.

**Landing page hero stagger (`app/page.tsx`):**

```typescript
const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 24 },
  show:  { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
};
```

Each headline, subheadline, CTA, and social-proof line is a `motion.div` with `variants={heroItem}`, child of the container `motion.div`. The stagger fires automatically. When `prefers-reduced-motion` is detected via `useReducedMotion()`, both variants collapse to a plain 200ms opacity fade — no Y movement, no spring physics.

**Feature cards scroll reveal:** `whileInView={{ opacity: 1, y: 0 }}` with `viewport={{ once: true, margin: '-60px' }}`. Cards stagger by `delay: i * 0.08` so each slides in 80ms after the previous.

**Activity diff flash (`app/trips/[id]/page.tsx`):** When a day is regenerated, new activities receive the `.animate-pulse-once` CSS class (a one-shot green glow keyframe) for 1.4 seconds, then the class is removed.

### `react-three-fiber` / `three` — the 3D globe (`GlobeScene.tsx`)

**Why three.js for a hero element:** A 2D SVG world map would be flat and static. A CSS-animated div can't give you a procedurally lit sphere with an atmosphere halo. `react-three-fiber` (R3F) wraps Three.js in React's rendering model, so the globe can read `resolvedTheme` from context and re-build its `CanvasTexture` when the theme changes — without any imperative Three.js scene management code.

**What's rendered:**  
- A `SphereGeometry` (64×64 segments) with a `CanvasTexture` map painted in-browser: ocean fill → lat/lon grid lines → 6 simplified continental ellipses (North America, Europe, Africa, Asia, Australia, South America).  
- An atmosphere shell: a slightly larger sphere (`r=1.06`) with `meshPhongMaterial` and `side: THREE.BackSide` so it glows from behind the globe surface.  
- Three lights: ambient (intensity tuned per theme), directional key light (`#c7d2fe` in dark, `#fef3c7` in light), and a left-side rim light for depth.

Globe rotation: `useFrame((_, delta) => { mesh.rotation.y += delta * 0.08 })` — frame-rate independent via the delta accumulator.

The globe is loaded with `next/dynamic({ ssr: false })` because Three.js's `document` and `window` references would crash server-side rendering. The `loading` prop renders a shimmer skeleton until the WebGL context is ready.

### Recharts — budget breakdown chart (`/trips/[id]`)

**Why Recharts:** The `estimatedBudget` object from the API has four numeric categories (`transport`, `accommodation`, `food`, `activities`). Recharts' `BarChart` with a `ResponsiveContainer` renders this in ~20 lines with automatic axis scaling, tooltips, and no canvas setup. The bar colors use CSS variable values (`var(--color-accent)`, `var(--color-accent-warm)`) passed directly as `fill` props so they theme-switch correctly.

The chart is a client component (requires `window` for resize detection). It does not use SSR data fetching — the data arrives from the trip detail API call on mount.

---

## 5. Risk Co-Pilot UI Components

Both components live in `src/components/risk/RiskComponents.tsx`.

### `ScoreRing` — animated confidence score

`ScoreRing` takes a `score: number` (0–100), an optional `fromScore: number` (the previous score for transition), `size`, and `strokeWidth`.

**Animation mechanics:**  
The ring is an SVG with two `<circle>` elements: a static track circle and a progress circle. The progress circle uses `stroke-dasharray` = circumference and `stroke-dashoffset` to control fill percentage. The CSS transition on `stroke-dashoffset` is `0.9s cubic-bezier(0.4, 0, 0.2, 1)`, giving a smooth sweep.

The numeric counter (inside the ring) runs a `setInterval` count-up from `fromScore ?? 0` to `score` over 40 steps × 20ms = 800ms — synchronized to finish at the same time as the stroke animation.

**Reduced motion:** When `useReducedMotion()` returns `true`, both `useState` initial values jump directly to the target score (no animation), and the CSS transition is set to `'none'`.

**Color thresholds:**
- `score >= 80` → `var(--color-risk-low)` (green in dark, `#15803d` in light)
- `score >= 60` → `var(--color-risk-medium)` (amber)
- `score < 60` → `var(--color-risk-high)` (red)

**Accessibility:** The outer `<div>` carries `role="img"` and `aria-label="Confidence score: {score} out of 100 — {label}"` (where `label` is "Excellent", "Needs review", or "Action needed"). The inner numeric `<span>` is `aria-hidden="true"` — screen readers get the descriptive label, not just a number.

### `FlagChips` — risk flag summary pills

`FlagChips` receives the `flags` array from the API response. It first deduplicates by `type + severity` key (so two high-pacing flags on different days don't produce two identical chips — the per-flag messages in the list below handle the day-specific detail). Each unique combination renders as a small pill:

- Border and background use RGBA of the severity color at 40% and 10% opacity respectively — so the chip reads as tinted without blocking the card background.
- A `1.5×1.5 rem` filled dot sits left of the label as a colour-only redundant indicator (the text label `"Pace" | "Budget" | "Weather"` carries the semantic meaning for colour-blind users).

---

## 6. Accessibility Decisions (Phase 7)

**Reduced-motion handling:**  
`prefers-reduced-motion: reduce` is caught at two levels:
1. CSS: `globals.css` includes a `@media (prefers-reduced-motion: reduce)` block that overrides all animation durations to `0.01ms` and sets `scroll-behavior: auto`. This catches CSS keyframe animations (`shimmer`, `flight-path`, `pulseOnce`, `fadeIn`, `slideUp`).
2. JavaScript: Every Framer Motion component calls `useReducedMotion()` and falls back to a plain opacity fade. `ScoreRing` checks `useReducedMotion()` to suppress the count-up and SVG stroke animation.

**Focus styles:**  
`:focus-visible` is styled globally in `globals.css` with `outline: 2px solid var(--color-accent); outline-offset: 3px;`. This applies to keyboard navigation only (not mouse clicks) and is visible in both themes because `--color-accent` = `#6366f1` has a contrast ratio of ~4.6:1 on dark and ~3.4:1 on light (borderline on light but visually distinct due to the indigo hue against warm ivory).

**ARIA on `ScoreRing`:**  
The SVG container carries `role="img"` with a full descriptive `aria-label`. The visual SVG elements are `aria-hidden`. The inner numeric text is also `aria-hidden` — so a screen reader announces "Confidence score: 72 out of 100 — Needs review" rather than just "72."

**Contrast verification:**  
Light-mode risk severity colours were re-selected specifically to meet WCAG AA (4.5:1 minimum for normal text) on the `#faf8f3` background:
- High: `#b91c1c` → 5.8:1 ✓
- Medium: `#92400e` → 5.1:1 ✓
- Low: `#15803d` → 5.4:1 ✓

---

## 7. Known Frontend Limitations

- **No offline support.** There is no service worker or local cache. The app requires network connectivity for all data operations.
- **No SSR data fetching on protected routes.** The dashboard and trip detail pages are fully client-rendered — they fetch data in `useEffect` after mount. This means there is a brief loading state on every navigation to these pages, and the pages cannot be meaningfully crawled by search engines. The trade-off was acceptable because these pages are auth-gated by design.
- **No real-time updates.** The trip detail page does not subscribe to server-side events. If the backend's Gemini generation completes while the user is looking at another tab, they must manually refresh.
- **Globe is approximate.** The continent blobs in `GlobeScene.tsx` are hand-tuned ellipses on a canvas texture, not a real GeoJSON projection. They are decorative, not geographic reference material.
- **Theme toggle stores preference in `localStorage`.** If a user clears site data, their theme preference resets to system default on next load.
