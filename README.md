# Cognitus Talent Gateway

A no-email career application portal for Cognitus Solutions.

## What this portal does

- Applicants create accounts with Discord username, Discord ID, optional Roblox username, and password.
- Applicants can submit multiple applications across Cognitus, but only one per application form.
- Applicants can sign in later and view application status.
- Reviewers can review submitted applications and add internal notes.
- Executives and owners can create, open, close, and archive application forms.
- Owners can manage roles and bootstrap the first owner account.

## Free-plan architecture

This version uses only:

- GitHub Pages for hosting
- Firebase Firestore for data
- Browser-side login logic

It does **not** use Firebase Functions, Firebase custom tokens, or Firebase email/password auth. This keeps the project compatible with the Firebase free plan and avoids collecting emails.

## Important security note

Because there is no server backend on the free-plan version, Firestore rules are open enough for the static website to work. This is acceptable for a low-risk Roblox/Discord-style application portal, but it should not be used for sensitive real-world hiring records, legal identities, medical data, private documents, or financial information.

For stronger security later, upgrade Firebase to Blaze and switch back to a Functions-backed login system.

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

The bootstrap page only creates an owner if no owner exists yet.

## Default roles

- applicant
- reviewer
- seniorReviewer
- hiringLead
- executive
- owner
