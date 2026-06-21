# AI Travel Planner

A premium AI-powered travel itinerary planner with real-time confidence scoring and risk analysis.

> **Full documentation coming progressively** — this README is updated at the end of each build phase.

## Quick Start

See `/backend/README.md` and `/frontend/README.md` for per-app setup instructions.

## Project Structure

```
/
├── backend/          # Node.js + Express + TypeScript API
├── frontend/         # Next.js 14 App Router + TypeScript + Tailwind
└── shared/           # Shared TypeScript types (both apps reference this)
```

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion, React Three Fiber
- **Backend:** Node.js, Express, TypeScript, Mongoose
- **Database:** MongoDB Atlas
- **AI:** Google Gemini 2.5 Flash
- **Auth:** JWT in httpOnly cookies (XSS-resistant)
- **Deployment:** Vercel (frontend) + Render (backend)

*(Full stack justification, architecture, and design decisions documented in final README.)*
