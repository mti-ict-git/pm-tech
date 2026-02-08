<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1CobEZxXeyTrGD39Ld8JWefZlN7_wdzx_

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Features

- Assets lookup with a sidebar switcher for Assets and Facilities
- Facilities list with search and location filters
- View checklist evidence attachments from PM history tasks
- Supervisors can run PM Now from Asset Detail
- Scan QR (asset tag) to open the Asset Detail

## Android (Capacitor)

Quick start:
`npm run build:android`

1. Install dependencies:
   `npm install`
2. Build web bundle:
   `npm run build`
3. Add Android platform (first time only):
   `npx cap add android`
4. Sync changes to Android:
   `npx cap sync android`
5. Open Android Studio:
   `npx cap open android`

## Biometric Login

- Sign in once with username/password to save a refresh token securely on device.
- Tap Biometric on the login screen to unlock and sign in.
