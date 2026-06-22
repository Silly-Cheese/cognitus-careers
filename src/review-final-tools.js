import { collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';
import { confirmAction } from './confirm-modal.js';

let profile = null;
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const owner = () => profile?.role === 'owner';

const templates = {
  accepted: 'Congratulations. Your application has been accepted by Cognitus Solutions leadership. Please watch for follow-up instructions from the appropriate team.',
  denied: 'Thank you for applying. After review, Cognitus Solutions leadership has decided not to move forward with this application at this time.',
  reapplyLater: 'Thank you for applying. We are not moving forward at this time, but you may reapply when another opportunity opens.',
  interviewRequested: 'Cognitus Solutions leadership would like to schedule an interview before making a final decision.'
};

onAuthStateChanged(auth, async user => {
  profile = user ? await getProfile(user.uid) : null;
  setTimeout(enhanceReviewForm, 350);
});
window.addEventListener('hashchange', () => setTimeout(enhanceReviewForm, 500));
document.addEventListener('submit', interceptOwnerFinalDecision, true);

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function enhanceReviewForm() {
  if (!owner()) return;
  const [path, appId] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'review' || !appId) return;
  const form = document.querySelector('#reviewForm');
  if (!form || form.dataset.finalTools === 'true') return;
  form.dataset.finalTools = 'true';
  const publicMessage = form.querySelector('[name="publicMessage"]');
  if (!publicMessage) return;
  const box = document.createElement('label');
  box.className = 'full';
  box.innerHTML = `Decision Message Template<select id="decisionTemplate"><option value="">Choose a template</option><option value="accepted">Accepted — Welcome message</option><option value="denied">Denied — Basic message</option><option value="reapplyLater">Denied — Reapply later</option><option value="interviewRequested">Interview requested</option></select>`;
  publicMessage.closest('label')?.before(box);
  document.querySelector('#decisionTemplate').onchange = event => {
    if (templates[event.target.value]) publicMessage.value = templates[event.target.value];
  };
}

async function interceptOwnerFinalDecision(event) {
  if (!owner()) return;
  const form = event.target;
  if (form?.id !== 'reviewForm') return;
  const [path, appId] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'review' || !appId) return;
  const status = form.querySelector('[name="status"]')?.value;
  if (!['accepted', 'denied'].includes(status)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const publicMessage = form.querySelector('[name="publicMessage"]')?.value || '';
  const recommendation = form.querySelector('[name="recommendation"]')?.value || '';
  const confirmed = await confirmAction({
    title: status === 'accepted' ? 'Confirm Acceptance?' : 'Confirm Denial?',
    message: `This will mark the application as ${status}.`,
    details: publicMessage ? `Applicant message: ${publicMessage}` : 'No public applicant message has been entered.',
    confirmText: status === 'accepted' ? 'Accept Applicant' : 'Deny Applicant',
    cancelText: 'Cancel',
    danger: status === 'denied'
  });
  if (!confirmed) return;

  const msg = document.querySelector('#reviewMsg');
  if (msg) msg.innerHTML = '<p class="muted">Saving final decision...</p>';
  try {
    await updateDoc(doc(db, 'applications', appId), {
      status,
      decision: status,
      reviewerRecommendation: recommendation,
      publicMessage,
      finalizedAt: serverTimestamp(),
      finalizedBy: profile.uid,
      finalizedByUsername: profile.discordUsername,
      reviewedBy: profile.uid,
      reviewedByUsername: profile.discordUsername,
      updatedAt: serverTimestamp()
    });
    await audit('OWNER_FINAL_DECISION', { applicationId: appId, details: status });
    location.hash = '#/review';
  } catch (error) {
    if (msg) msg.innerHTML = `<p class="error">Could not save final decision: ${esc(error.message)}</p>`;
  }
}

async function audit(action, data = {}) {
  try {
    await setDoc(doc(collection(db, 'audit_logs')), { action, performedBy: profile.uid, performedByUsername: profile.discordUsername, timestamp: serverTimestamp(), ...data });
  } catch (error) {
    console.warn('Audit failed.', error);
  }
}
