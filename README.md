# Cognitus Talent Gateway

A no-email career application portal for Cognitus Solutions.

## What this portal does

- Applicants create accounts with Discord username, Discord ID, and optional Roblox username.
- Applicants can submit multiple applications across Cognitus, but only one per application form.
- Applicants can return later from the same browser/device and view application status.
- Reviewers can review submitted applications and add internal notes.
- Executives and owners can create, open, close, and archive application forms.
- Owners can manage roles and bootstrap the first owner account.

## Free-plan architecture

This version uses only:

- GitHub Pages for hosting
- Firebase Anonymous Auth for identity
- Firebase Firestore for data and role-based security rules

It does **not** use Firebase Functions, Firebase custom tokens, Firebase email/password auth, or collected emails. This keeps the project compatible with the Firebase free plan.

## Required Firebase Console setting

In Firebase Console, enable Anonymous Auth:

```text
Build > Authentication > Sign-in method > Anonymous > Enable
```

## Security model

Firestore rules now enforce:

- Users can only create/read/update their own applicant profile.
- Applicants can only read/write their own applications.
- Staff roles can read/review applications.
- Executives and owners can create/open/close/archive application forms.
- Only owners can change roles.
- The first owner can only be created through the owner bootstrap lock.

Important limitation: because this uses Anonymous Auth, an account is tied to the browser/device unless you later add Discord OAuth or a Functions-backed username/password login. No email is collected.

## Local setup

```bash
npm install
npm run dev
```

## GitHub Pages deployment

The repo includes `.github/workflows/deploy-pages.yml`. Pushes to `main` automatically build the Vite app and deploy it to GitHub Pages.

## Firestore rules

Deploy rules with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Owner bootstrap

Open the app and go to:

```text
#/bootstrap
```

Use this bootstrap key:

```text
CognitusOwnerSetup2026
```

The bootstrap page only creates an owner if the `system/ownerBootstrap` lock document does not exist yet.

## Default roles

- applicant
- reviewer
- seniorReviewer
- hiringLead
- executive
- owner
