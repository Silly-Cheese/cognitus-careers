# Cognitus Talent Gateway

A no-email career application portal for Cognitus Solutions.

## What this portal does

- Applicants create accounts with Discord username, Discord ID, optional Roblox username, and password.
- Applicants can submit multiple applications across Cognitus, but only one per application form.
- Applicants can sign in later and view application status.
- Reviewers can review assigned/submitted applications and add internal notes.
- Executives and owners can create, open, close, and archive application forms.
- Owners can manage roles and bootstrap the first owner account.

## Architecture

This project uses:

- Firebase Hosting for the frontend
- Firebase Firestore for data
- Firebase Functions for secure no-email authentication
- Firebase custom tokens so Firestore rules can still protect the portal

Firebase's normal email/password login is intentionally not used because Cognitus does not want to collect emails.

## Local setup

```bash
npm install
cd functions && npm install && cd ..
npm run dev
```

## Firebase setup

1. Install Firebase CLI.
2. Log in with `firebase login`.
3. Select or create the Firebase project `cognitus-car`.
4. Copy `.env.example` to `.env` for frontend variables if needed.
5. Copy `functions/.env.example` to `functions/.env`.
6. Set `OWNER_SETUP_KEY` and keep it private.
7. Deploy:

```bash
firebase deploy
```

## Owner bootstrap

Open the app and go to:

```text
#/bootstrap
```

Enter the setup key and your Discord account details. The bootstrap function will only create the first owner if no owner already exists.

## Important security notes

- Do not place the owner setup key in frontend code.
- Do not commit `functions/.env`.
- Passwords are hashed with bcrypt in Firebase Functions.
- Firestore rules rely on Firebase custom auth claims.

## Default roles

- applicant
- reviewer
- seniorReviewer
- hiringLead
- executive
- owner
