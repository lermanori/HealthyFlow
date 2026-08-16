# HealthyFlow Deployment Guide

## Frontend (Already Deployed)
✅ **Deployed to Netlify**: https://keen-monstera-82e39e.netlify.app

Production domain: https://healthyflow.app

## Google sign-in

HealthyFlow uses Supabase Auth for the Google identity and exchanges that
verified identity for the existing HealthyFlow JWT. No Google or Supabase secret
belongs in the frontend bundle.

### Google Auth Platform

Use the `healthyflow` Google Cloud project and its Web application OAuth client.

- Authorized JavaScript origins:
  - `http://localhost:5173`
  - `https://healthyflow.app`
- Authorized redirect URI for Supabase Auth:
  - `https://jvdcaxdtmieedhwztdip.supabase.co/auth/v1/callback`
- Data Access scopes:
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`

The Google client ID and client secret are copied into Supabase Dashboard →
Authentication → Sign In / Providers → Google. Do not put the client secret in
Netlify, Railway frontend variables, or a committed file.

### Supabase Auth

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://healthyflow.app/app`
- Redirect URLs:
  - `https://healthyflow.app/app?oauth=callback`
  - `http://localhost:5173/app?oauth=callback`

Enable the Google provider only after its Google Cloud redirect URI is saved.
Apply database migrations with:

```bash
npx supabase db push --linked
```

Rehearse the migration on the local Supabase stack first — see
[docs/local-database.md](docs/local-database.md). `db push --linked` writes
directly to production, so it should never be a migration's first run.

### Netlify public build variables

Set these for production, previews, branch deploys, and local Netlify dev:

```env
VITE_SUPABASE_URL=https://jvdcaxdtmieedhwztdip.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key or legacy anon key>
```

Both values are designed to be public browser configuration. The
`SUPABASE_SERVICE_ROLE_KEY` remains Railway-only and must never use a `VITE_`
prefix.

## Backend Deployment Options

### Option 1: Railway (Recommended - Free Tier Available)

1. **Sign up for Railway**: https://railway.app
2. **Create New Project** → **Deploy from GitHub repo**
3. **Connect your repository** (or upload the backend folder)
4. **Configure Environment Variables**:
   - `PORT`: 3001
   - `JWT_SECRET`: Generate a secure random string
   - `NODE_ENV`: production

5. **Deploy Settings**:
   - Root Directory: `/backend`
   - Build Command: `npm run build`
   - Start Command: `npm start`

6. **Update Frontend API URL**:
   - Get your Railway app URL (e.g., `https://your-app.railway.app`)
   - Update the frontend to use this URL instead of `localhost:3001`

> Options 2 and 3 below are **untested alternatives**, kept from the original
> scaffold. Production runs on Railway. Neither has been exercised against the
> current backend, which depends on Supabase and a substantial env-var set — treat
> them as starting points, not instructions.

### Option 2: Render (Free Tier)

1. **Sign up for Render**: https://render.com
2. **Create New Web Service**
3. **Connect GitHub repository**
4. **Configure**:
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment Variables: Same as Railway

### Option 3: Heroku

1. **Install Heroku CLI**
2. **Create new app**: `heroku create your-app-name`
3. **Set environment variables**:
   ```bash
   heroku config:set JWT_SECRET=your-secret-key
   heroku config:set NODE_ENV=production
   ```
4. **Deploy**: `git push heroku main`

## Update Frontend Configuration

The API base URL is **environment configuration, not a code edit**.
`src/services/api.ts` reads `VITE_API_URL` and falls back to
`http://localhost:3001/api`. Set it per environment (Netlify build variables,
`.env.production` for the iOS bundle) and redeploy. Do not hardcode a URL in
`api.ts`.

```env
VITE_API_URL=https://healthyflow-production.up.railway.app/api
```

## Database

**The database is Supabase (Postgres).** There is no other database.

`sqlite3` is still a dependency and `backend/src/db/database.ts` still exists,
but it is **dead code**: `initDatabase()` is commented out at
`backend/src/index.ts:132` and nothing reads from the SQLite handle. Note that
importing the module still opens a `healthyflow.db` file at import time as a
leftover side effect. Ignore any older instruction to "upgrade SQLite to
Postgres" — that migration already happened. Apply schema changes as migrations
under `supabase/migrations/`.

## Environment Variables Needed

Backend, at minimum:

```env
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-here
NODE_ENV=production
```

**This list is not exhaustive.** A working production backend also needs
Supabase credentials (including the Railway-only `SUPABASE_SERVICE_ROLE_KEY`),
the OpenAI key, Google Calendar OAuth credentials, the APNs block and the iOS
version-gate block. See `docs/ios.md` for the APNs and version-gate variables,
and **`backend/.env.example`** for the current full backend shape
(`.env.example` at the root covers the frontend). There is no `DATABASE_URL`;
nothing in `backend/src/` reads one.

## Quick Deploy Commands

```bash
# For Railway
npm install -g @railway/cli
railway login
railway init
railway up

# For Render - just connect GitHub repo via dashboard

# For Heroku
npm install -g heroku
heroku create your-app-name
git push heroku main
```

## Testing the Deployment

1. **Backend Health Check**: `GET https://<backend-url>/api/health`
2. **Frontend**: Should now work with real backend data
3. **Try it without an account**: open `/demo` and start a persona session.
   `POST /auth/demo-session` issues a real JWT against seeded persona data and
   creates nothing, so it is the safe smoke test while signup is gated.

Do not rely on the old `demo@healthyflow.com` / `demo123` pair. That account is
seeded only by the retired SQLite path and is treated as a legacy demo identity
in the code; the supported demo route is `/demo`.

## Troubleshooting

- **CORS Issues**: Make sure backend allows your frontend domain
- **Database**: Check Supabase connectivity and that migrations were applied
  (`npx supabase db push --linked`). A local `healthyflow.db` appearing is the
  dead SQLite import side effect, not a sign the app is using SQLite.
- **Environment Variables**: Verify all required env vars are set — see
  `backend/.env.example`
- **Signup appears broken**: the Create-account tab **fails closed**. If the
  signup-status call errors, or public slots are exhausted, the form is hidden
  and the waitlist shows instead. Check `public_slots_open` before debugging the
  form.
- **Build Errors**: Check logs in your deployment platform
