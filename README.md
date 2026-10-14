# Flintzy Content Planner

A responsive social media scheduling dashboard built with Next.js, React, and TypeScript. It uses local mock data and browser state; no social accounts or publishing APIs are required.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- Queue of 30 mock posts grouped by local calendar day, with channel, time, status, media, and retry details.
- Search plus channel and status filters reflected in URL query parameters.
- Post composer with multiple channel selection, optional image URL, local date and time entry, and UTC storage.
- Per-channel live character counts and scheduling validation.
- Optimistic retry with a one second simulated request, a 20% failure chance, and rollback messaging.
- Responsive layout for desktop and mobile.

## Key decisions and assumptions

- `src/data/posts.json` is the source for the initial 30 sample posts. Changes made in the browser are in-memory and reset on refresh; persistence is outside the frontend-only scope.
- Sample scheduled times are seeded around October 14–28, 2026. The queue labels days and formats times in the viewer’s local timezone; the composer converts entered local time to an ISO UTC timestamp.
- Instagram, Facebook, X, and TikTok are the supported channels. Limits follow the assignment: 2,200, 5,000, 280, and 2,200 characters respectively.
- “Published” records are historical examples. The app does not actually publish content.
- A successful retry returns a failed post to the scheduled queue; a failed retry restores its failed state and displays an error.

## Deployment

Live application: [https://flintzy-social-media-scheduler-adna-six.vercel.app/](https://flintzy-social-media-scheduler-adna-six.vercel.app/)
