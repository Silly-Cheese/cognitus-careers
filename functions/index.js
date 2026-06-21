import { onCall, HttpsError } from 'firebase-functions/v2/https';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const allowedRoles = ['applicant', 'reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];

function cleanDiscordId(discordId) {
  const value = String(discordId || '').trim();
  if (!/^\d{10,25}$/.test(value)) throw new HttpsError('invalid-argument', 'Enter a valid numeric Discord user ID.');
  return value;
}

function uidFromDiscordId(discordId) {
  return `discord_${cleanDiscordId(discordId)}`;
}

function cleanUsername(username) {
  const value = String(username || '').trim();
  if (value.length < 2 || value.length > 64) throw new HttpsError('invalid-argument', 'Enter a valid Discord username.');
  return value;
}

function cleanPassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw new HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  return value;
}

async function ownerExists() {
  const snap = await db.collection('users').where('role', '==', 'owner').limit(1).get();
  return !snap.empty;
}

async function createOrUpdateAuthUser(uid, displayName, role) {
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { displayName });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid, displayName, disabled: false });
  }
  await auth.setCustomUserClaims(uid, { role });
}

async function issueToken(uid, role) {
  return auth.createCustomToken(uid, { role });
}

export const bootstrapOwner = onCall(async (request) => {
  const setupKey = String(request.data?.setupKey || '');
  if (!process.env.OWNER_SETUP_KEY) throw new HttpsError('failed-precondition', 'OWNER_SETUP_KEY is not configured in Firebase Functions.');
  if (setupKey !== process.env.OWNER_SETUP_KEY) throw new HttpsError('permission-denied', 'Invalid owner setup key.');
  if (await ownerExists()) throw new HttpsError('already-exists', 'An owner already exists. Bootstrap is locked.');

  const discordId = cleanDiscordId(request.data?.discordId);
  const uid = uidFromDiscordId(discordId);
  const discordUsername = cleanUsername(request.data?.discordUsername);
  const robloxUsername = String(request.data?.robloxUsername || '').trim();
  const password = cleanPassword(request.data?.password);
  const passwordHash = await bcrypt.hash(password, 12);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await createOrUpdateAuthUser(uid, discordUsername, 'owner');
  await db.doc(`users/${uid}`).set({
    uid,
    discordUsername,
    discordId,
    robloxUsername,
    role: 'owner',
    accountStatus: 'active',
    permissions: ['*'],
    bootstrapOwner: true,
    createdAt: now,
    updatedAt: now
  }, { merge: true });
  await db.doc(`credentials/${uid}`).set({ uid, discordId, passwordHash, updatedAt: now });
  await db.collection('audit_logs').add({ action: 'OWNER_BOOTSTRAPPED', performedBy: uid, targetId: uid, timestamp: now });

  return { token: await issueToken(uid, 'owner') };
});

export const registerApplicant = onCall(async (request) => {
  const discordId = cleanDiscordId(request.data?.discordId);
  const uid = uidFromDiscordId(discordId);
  const discordUsername = cleanUsername(request.data?.discordUsername);
  const robloxUsername = String(request.data?.robloxUsername || '').trim();
  const password = cleanPassword(request.data?.password);
  const userDoc = await db.doc(`users/${uid}`).get();
  if (userDoc.exists) throw new HttpsError('already-exists', 'An account already exists for that Discord ID. Please sign in.');

  const passwordHash = await bcrypt.hash(password, 12);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await createOrUpdateAuthUser(uid, discordUsername, 'applicant');
  await db.doc(`users/${uid}`).set({
    uid,
    discordUsername,
    discordId,
    robloxUsername,
    role: 'applicant',
    accountStatus: 'active',
    createdAt: now,
    updatedAt: now
  });
  await db.doc(`credentials/${uid}`).set({ uid, discordId, passwordHash, updatedAt: now });
  await db.collection('audit_logs').add({ action: 'APPLICANT_REGISTERED', performedBy: uid, targetId: uid, timestamp: now });

  return { token: await issueToken(uid, 'applicant') };
});

export const loginWithDiscord = onCall(async (request) => {
  const discordId = cleanDiscordId(request.data?.discordId);
  const uid = uidFromDiscordId(discordId);
  const password = String(request.data?.password || '');
  const credentialSnap = await db.doc(`credentials/${uid}`).get();
  if (!credentialSnap.exists) throw new HttpsError('not-found', 'No account exists for that Discord ID.');
  const profileSnap = await db.doc(`users/${uid}`).get();
  if (!profileSnap.exists) throw new HttpsError('not-found', 'Profile missing. Contact an owner.');
  const profile = profileSnap.data();
  if (profile.accountStatus && profile.accountStatus !== 'active') throw new HttpsError('permission-denied', 'This account is not active.');
  const ok = await bcrypt.compare(password, credentialSnap.data().passwordHash);
  if (!ok) throw new HttpsError('permission-denied', 'Incorrect Discord ID or password.');
  await auth.setCustomUserClaims(uid, { role: profile.role || 'applicant' });
  await db.doc(`users/${uid}`).set({ lastLoginAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { token: await issueToken(uid, profile.role || 'applicant') };
});

export const setUserRole = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await db.doc(`users/${request.auth.uid}`).get();
  if (!caller.exists || caller.data().role !== 'owner') throw new HttpsError('permission-denied', 'Only owners can change roles.');
  const uid = String(request.data?.uid || '').trim();
  const role = String(request.data?.role || '').trim();
  if (!uid || !allowedRoles.includes(role)) throw new HttpsError('invalid-argument', 'Invalid user or role.');
  const target = await db.doc(`users/${uid}`).get();
  if (!target.exists) throw new HttpsError('not-found', 'User not found.');
  await auth.setCustomUserClaims(uid, { role });
  await db.doc(`users/${uid}`).set({ role, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('audit_logs').add({
    action: 'ROLE_CHANGED',
    performedBy: request.auth.uid,
    targetId: uid,
    details: `Role changed to ${role}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true };
});
