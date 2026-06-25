# Deployment Notes

This app now uses MongoDB through the Express API in `server/index.js`.

## MongoDB Atlas

1. Create a MongoDB Atlas cluster.
2. Create a database user and allow network access from your hosting provider.
   For quick hackathon demos, Atlas can allow `0.0.0.0/0`, but restrict it after judging.
3. Copy the Atlas connection string into `MONGODB_URI`.
4. Set `MONGODB_DB` to `hospital_queue`.

## Required Hosting Environment Variables

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/hospital_queue?retryWrites=true&w=majority
MONGODB_DB=hospital_queue
HOSPITAL_NAME=City Care Hospital
ADMIN_EMAIL=admin@hospital.test
ADMIN_PASSWORD=ChangeMe@123
PUBLIC_APP_URL=https://your-demo-domain.example.com
```

The first server start seeds doctors plus the admin account. Use `ADMIN_EMAIL` and
`ADMIN_PASSWORD` to sign in at `/#/admin`, then create receptionist accounts.
`PUBLIC_APP_URL` is used inside WhatsApp approval messages and QR codes, so set it
to the final public demo URL.

## One-Service Demo Deployment

Use one Node service for the hackathon demo:

```bash
npm install
npm run build
npm start
```

The Express server serves `dist` and exposes API routes under `/api`, so judges only
need one public URL.
