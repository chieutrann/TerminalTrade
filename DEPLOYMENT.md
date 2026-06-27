# Backend Deployment

Set these environment variables in production:

- `APP_ENV=production`
- `PORT` from the host platform
- `FRONTEND_ORIGINS=https://your-frontend-domain.com`
- Optional: `ALLOWED_HOSTS=api.example.com`

Python start command:

```bash
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT --proxy-headers
```

Node-oriented hosts can use:

```bash
npm start
```

Do not commit a real `.env`; use `.env.example` as the template.
