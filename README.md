# GradQuest

Expo app for students comparing CS-related master's programs. Sign in, save preferences, and review ranked matches from 25 verified programs. The Spring API in GradQuest-Back-End does matching, reminders, and statement drafts. This repo is the client.

## What it does

- **Sign in.** Locally, use Dev login (below). GitHub OAuth works when the API has GitHub credentials. The sign-in screen still shows Discord; Discord login is not set up.
- **Profile intake** on first sign-in, or whenever preferences have not been saved. Apply years are 2027, 2028, and 2029. Location states are CA, AZ, NV, and Other.
- **Dashboard** loads `GET /api/schools/top5`. That route returns up to 10 ranked programs.
- **Saved** is the schools you asked to be reminded about. Saving a school creates its deadline reminder.
- **Reminders** lists those deadlines.
- **Statement**, opened from a match or a saved school, drafts one opening paragraph (or an optional motivation paragraph). It is an outline to edit, not an essay to submit.

## Stack

React Native with Expo (SDK 52), TypeScript and JavaScript. `AuthContext` and `SavedAppsContext` hold session and saved schools. `src/lib/api.js` calls the API with the session cookie.

## Local setup

Node.js, and the API on `http://localhost:8082` started with `./gradlew bootRun` (the Spring `dev` profile).

```bash
git clone https://github.com/AchsahJojo/GradQuest-Front-End.git
cd GradQuest-Front-End
npm install
```

In a gitignored `.env` in this folder, set `EXPO_PUBLIC_DEV_LOGIN=true`. The API base defaults to `http://localhost:8082`. Set `EXPO_PUBLIC_API_BASE_URL` only if the app must reach the API at another host (for example a phone on your LAN).

```bash
npm start
```

Web: `npm run web`. Expo serves it at `http://localhost:8081`, which is the origin the dev API expects.

On the sign-in screen, choose **Dev login (local only)**. The button is hidden unless `EXPO_PUBLIC_DEV_LOGIN` is `true`, and `POST /dev/login` exists only on the Spring dev profile. A new account with no preferences goes to Profile Intake; after a successful save the app opens the dashboard.

## Tests

```bash
npm test
```
