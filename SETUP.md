# Cognitus Talent Gateway Setup Guide

## 1. Install project dependencies

From the repo root:

```bash
npm install
cd functions
npm install
cd ..
```

## 2. Connect Firebase

Make sure the Firebase CLI is installed and authenticated:

```bash
npm install -g firebase-tools
firebase login
firebase use cognitus-car
```

If Firebase has not been connected locally yet, run:

```bash
firebase use --add
```

Select the `cognitus-car` project.

## 3. Configure owner bootstrap secret

Create this file locally:

```text
functions/.env
```

Add:

```bash
OWNER_SETUP_KEY=make-this-a-long-private-secret
```

Do not commit this file.

## 4. Deploy

```bash
npm run build
firebase deploy
```

This deploys:

- Hosting
- Firestore rules
- Firestore indexes
- Cloud Functions

## 5. Create the first owner account

After deployment, open the hosted portal and go to:

```text
#/bootstrap
```

Enter:

- Owner setup key
- Your Discord username
- Your Discord user ID
- Optional Roblox username
- Owner password

The system will create the first owner only if no owner exists.

## 6. Normal use flow

1. Owner signs in.
2. Owner goes to Executive Controls.
3. Owner creates an application form.
4. Owner opens the application.
5. Applicants create accounts and apply.
6. Reviewers review applications.
7. Executives or owners make final decisions.

## 7. One-application-per-form rule

Application documents use this ID format:

```text
{applicantUid}_{formId}
```

That prevents duplicate applications for the same form while still allowing applicants to apply to different open positions.
