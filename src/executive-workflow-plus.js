import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';
import { confirmAction } from './confirm-modal.js';

let profile = null;
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const executiveRoles = ['executive', 'owner'];
const canExecutive = () => profile && executiveRoles.includes(profile.role);
const isOwner = () => profile?.role === 'owner';

onAuthStateChanged(auth, async user => {
  profile = user ? await getProfile(user.uid) : null;
  setTimeout(enhanceExecutivePage, 300);
});

window.addEventListener('hashchange', () => setTimeout(enhanceExecutivePage, 450));
document.addEventListener('click', handleExecutiveClick, true);

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

async function enhanceExecutivePage() {
  const [path] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'executive' || !canExecutive()) return;

  document.querySelectorAll('[data-edit]').forEach(button => {
    const card = button.closest('.mini-card');
    if (!card || card.querySelector('[data-preview-form]')) return;
    const preview = document.createElement('button');
    preview.className = 'button small secondary';
    preview.type = 'button';
    preview.textContent = 'Preview';
    preview.setAttribute('data-preview-form', button.dataset.edit);
    button.parentElement?.insertBefore(preview, button.nextSibling);
  });

  if (isOwner() && !document.querySelector('#softDeletedTools')) {
    const panel = document.querySelector('main .panel');
    if (panel) {
      const block = document.createElement('div');
      block.className = 'notice';
      block.id = 'softDeletedTools';
      block.innerHTML = '<strong>Owner Recovery Tools</strong><p class="muted">Soft-deleted application responses can be reviewed and restored here.</p><button class="button secondary" id="viewDeletedResponses">View Deleted Responses</button>';
      panel.appendChild(block);
      document.querySelector('#viewDeletedResponses').onclick = showDeletedResponses;
    }
  }
}

async function handleExecutiveClick(event) {
  const statusButton = event.target.closest?.('[data-status]');
  const previewButton = event.target.closest?.('[data-preview-form]');

  if (previewButton && canExecutive()) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return previewForm(previewButton.dataset.previewForm);
  }

  if (!statusButton || !canExecutive()) return;
  const nextStatus = statusButton.dataset.status;
  if (!['closed', 'archived'].includes(nextStatus)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const reason = promptReason(nextStatus);
  if (!reason) return;

  const confirmed = await confirmAction({
    title: `${capitalize(nextStatus)} Application Form?`,
    message: `This will mark the application form as ${nextStatus}.`,
    details: `Reason: ${reason}`,
    confirmText: `${capitalize(nextStatus)} Form`,
    cancelText: 'Cancel',
    danger: nextStatus === 'archived'
  });
  if (!confirmed) return;

  await updateDoc(doc(db, 'application_forms', statusButton.dataset.form), {
    status: nextStatus,
    statusReason: reason,
    updatedAt: serverTimestamp(),
    updatedBy: profile.uid,
    updatedByUsername: profile.discordUsername
  });
  await audit(`FORM_${nextStatus.toUpperCase()}`, { formId: statusButton.dataset.form, details: reason });
  location.hash = '#/executive';
  setTimeout(() => location.reload(), 250);
}

function promptReason(status) {
  const reason = window.prompt(`Why is this application being ${status}?`);
  return String(reason || '').trim();
}

async function previewForm(formId) {
  const snap = await getDoc(doc(db, 'application_forms', formId));
  if (!snap.exists()) return;
  const form = { id: snap.id, ...snap.data() };
  document.querySelector('#previewApplicationModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="previewApplicationModal"><div class="modal-card"><div class="row"><div><p class="eyebrow">Applicant Preview</p><h2>${esc(form.title || 'Application')}</h2></div><button class="button small quiet" id="closePreviewForm">Close</button></div><p class="muted">${esc(form.department || 'General')} · Status: ${esc(form.status || 'draft')}</p><p>${esc(form.description || '')}</p>${Array.isArray(form.requirements) && form.requirements.length ? `<h3>Requirements</h3><ul>${form.requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}<h3>Questions</h3>${(form.questions || []).map((q, i) => `<label>${esc(q.question || `Question ${i + 1}`)}<textarea rows="4" disabled placeholder="Applicant response field"></textarea></label>`).join('') || '<p class="muted">No questions added.</p>'}<label>Conflict of Interest Disclosure<textarea rows="4" disabled placeholder="Applicant disclosure field"></textarea></label></div></div>`);
  document.querySelector('#closePreviewForm').onclick = () => document.querySelector('#previewApplicationModal')?.remove();
}

async function showDeletedResponses() {
  const snap = await getDocs(collection(db, 'applications'));
  const deleted = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(app => app.deleted === true || app.status === 'deleted');
  document.querySelector('#deletedResponsesModal')?.remove();
  const rows = deleted.map(app => `<div class="mini-card"><div><strong>${esc(app.formTitle || 'Application')}</strong><p>${esc(app.applicantDiscordUsername || '')} · ${esc(app.deleteReason || 'No reason provided')}</p></div><button class="button small" data-restore-response="${esc(app.id)}">Restore</button></div>`).join('') || '<p class="muted">No soft-deleted responses found.</p>';
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="deletedResponsesModal"><div class="modal-card"><div class="row"><div><p class="eyebrow">Owner Recovery</p><h2>Deleted Responses</h2></div><button class="button small quiet" id="closeDeletedResponses">Close</button></div>${rows}</div></div>`);
  document.querySelector('#closeDeletedResponses').onclick = () => document.querySelector('#deletedResponsesModal')?.remove();
  document.querySelectorAll('[data-restore-response]').forEach(btn => btn.onclick = () => restoreResponse(btn.dataset.restoreResponse));
}

async function restoreResponse(appId) {
  const confirmed = await confirmAction({ title: 'Restore Response?', message: 'This will restore the deleted application response to archived status.', confirmText: 'Restore', cancelText: 'Cancel' });
  if (!confirmed) return;
  await updateDoc(doc(db, 'applications', appId), {
    deleted: false,
    status: 'archived',
    restoredAt: serverTimestamp(),
    restoredBy: profile.uid,
    restoredByUsername: profile.discordUsername,
    updatedAt: serverTimestamp()
  });
  await audit('OWNER_RESTORED_APPLICATION_RESPONSE', { applicationId: appId });
  document.querySelector('#deletedResponsesModal')?.remove();
  showDeletedResponses();
}

async function audit(action, data = {}) {
  try {
    await setDoc(doc(collection(db, 'audit_logs')), { action, performedBy: profile.uid, performedByUsername: profile.discordUsername, timestamp: serverTimestamp(), ...data });
  } catch (error) {
    console.warn('Audit failed.', error);
  }
}

function capitalize(value) {
  return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
}
