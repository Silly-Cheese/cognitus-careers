import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';

let profile = null;
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const staff = () => profile && staffRoles.includes(profile.role);
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

onAuthStateChanged(auth, async user => {
  profile = user ? await getProfile(user.uid) : null;
});

document.addEventListener('click', async event => {
  const button = event.target.closest?.('#requestInterview');
  if (!button || !staff()) return;

  const [path, appId] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'review' || !appId) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const msg = document.querySelector('#suiteReviewMsg');
  if (msg) msg.innerHTML = '<p class="muted">Saving interview request...</p>';

  try {
    const appSnap = await getDoc(doc(db, 'applications', appId));
    if (!appSnap.exists()) throw new Error('Application not found.');
    const app = { id: appSnap.id, ...appSnap.data() };

    const interviewTime = document.querySelector('#interviewTime')?.value.trim() || '';
    const interviewMethod = document.querySelector('#interviewMethod')?.value.trim() || '';
    const interviewerName = document.querySelector('#interviewerName')?.value.trim() || profile.discordUsername || '';
    const interviewInstructions = document.querySelector('#interviewInstructions')?.value.trim() || '';

    const payload = {
      status: 'interviewRequested',
      interviewTime,
      interviewMethod,
      interviewerName,
      interviewInstructions,
      interviewRequestedAt: serverTimestamp(),
      interviewRequestedBy: profile.uid,
      interviewRequestedByUsername: profile.discordUsername,
      updatedAt: serverTimestamp()
    };

    await updateDoc(doc(db, 'applications', appId), payload);
    await addDoc(collection(db, 'interviews'), {
      applicationId: appId,
      applicantUid: app.applicantUid,
      formTitle: app.formTitle || '',
      ...payload
    });

    const notificationMessage = [
      `An interview has been requested for ${app.formTitle || 'your application'}.`,
      interviewTime ? `Time: ${interviewTime}` : '',
      interviewMethod ? `Method: ${interviewMethod}` : '',
      interviewerName ? `Interviewer: ${interviewerName}` : '',
      interviewInstructions ? `Instructions: ${interviewInstructions}` : ''
    ].filter(Boolean).join('\n');

    if (app.applicantUid) {
      await addDoc(collection(db, 'notifications'), {
        recipientUid: app.applicantUid,
        title: 'Interview Requested',
        message: notificationMessage,
        type: 'interview',
        read: false,
        createdAt: serverTimestamp(),
        createdBy: profile.uid,
        createdByUsername: profile.discordUsername
      });
    }

    await addDoc(collection(db, 'audit_logs'), {
      action: 'INTERVIEW_REQUESTED',
      applicationId: appId,
      targetUid: app.applicantUid || '',
      details: `${interviewTime}${interviewInstructions ? ' · ' + interviewInstructions : ''}`,
      performedBy: profile.uid,
      performedByUsername: profile.discordUsername,
      timestamp: serverTimestamp()
    });

    if (msg) msg.innerHTML = '<p class="notice"><strong>Saved.</strong> Interview request and instructions were sent.</p>';
  } catch (error) {
    if (msg) msg.innerHTML = `<p class="error">Could not save interview request: ${esc(error.message)}</p>`;
  }
}, true);

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}
