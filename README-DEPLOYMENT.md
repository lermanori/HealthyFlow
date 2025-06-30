# HealthyFlow Deployment Guide

## Frontend (Already Deployed)
✅ **Deployed to Netlify**: https://keen-monstera-82e39e.netlify.app

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

Once your backend is deployed, update the frontend:

1. **Update API Base URL** in `src/services/api.ts`:
   ```typescript
   const API_BASE_URL = 'https://your-backend-url.com/api'
   ```

2. **Redeploy Frontend** to Netlify with the new backend URL

## Database Considerations

- **SQLite**: Works for development but consider upgrading to PostgreSQL for production
- **Railway**: Offers PostgreSQL databases
- **Render**: Offers PostgreSQL databases
- **Supabase**: Great alternative for PostgreSQL + real-time features

## Environment Variables Needed

```env
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-here
NODE_ENV=production
DATABASE_URL=your-database-url (if using PostgreSQL)
```

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

1. **Backend Health Check**: `GET https://your-backend-url.com/api/health`
2. **Frontend**: Should now work with real backend data
3. **Login**: Use demo credentials: `demo@healthyflow.com` / `demo123`

## Troubleshooting

- **CORS Issues**: Make sure backend allows your frontend domain
- **Database**: Check if SQLite file is being created properly
- **Environment Variables**: Verify all required env vars are set
- **Build Errors**: Check logs in your deployment platform