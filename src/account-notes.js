import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';

let profile = null;
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

onAuthStateChanged(auth, async user => {
  profile = user ? await getProfile(user.uid) : null;
  setTimeout(enhanceOwnerAccounts, 400);
});
window.addEventListener('hashchange', () => setTimeout(enhanceOwnerAccounts, 500));

document.addEventListener('click', event => {
  const btn = event.target.closest?.('[data-account-notes]');
  if (!btn || profile?.role !== 'owner') return;
  event.preventDefault();
  openNotes(btn.dataset.accountNotes, btn.dataset.accountName || 'Account');
});

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function enhanceOwnerAccounts() {
  const [path] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'owner' || profile?.role !== 'owner') return;
  document.querySelectorAll('#ownerAccountsTable tbody tr').forEach(row => {
    const saveButton = row.querySelector('[data-save-role]');
    if (!saveButton || row.querySelector('[data-account-notes]')) return;
    const uid = saveButton.dataset.saveRole;
    const accountName = row.querySelector('strong')?.textContent || 'Account';
    const button = document.createElement('button');
    button.className = 'button small secondary';
    button.type = 'button';
    button.textContent = 'Notes';
    button.setAttribute('data-account-notes', uid);
    button.setAttribute('data-account-name', accountName);
    saveButton.parentElement.appendChild(button);
  });
}

async function openNotes(uid, accountName) {
  document.querySelector('#accountNotesModal')?.remove();
  const notesSnap = await getDocs(query(collection(db, 'account_notes'), where('targetUid', '==', uid)));
  const notes = notesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const noteHtml = notes.map(note => `<div class="note"><p>${esc(note.note || '')}</p><span>${esc(note.createdByUsername || '')}</span></div>`).join('') || '<p class="muted">No account notes yet.</p>';
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="accountNotesModal"><div class="modal-card"><div class="row"><div><p class="eyebrow">Owner Notes</p><h2>${esc(accountName)}</h2></div><button class="button small quiet" id="closeAccountNotes">Close</button></div><div id="accountNotesList">${noteHtml}</div><form id="accountNoteForm" class="form"><label>New Internal Note<textarea name="note" rows="4" required placeholder="Add a private owner note about this account."></textarea></label><button class="button">Add Note</button></form><div id="accountNoteMsg"></div></div></div>`);
  document.querySelector('#closeAccountNotes').onclick = () => document.querySelector('#accountNotesModal')?.remove();
  document.querySelector('#accountNoteForm').onsubmit = async event => {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get('note') || '').trim();
    if (!note) return;
    const msg = document.querySelector('#accountNoteMsg');
    msg.innerHTML = '<p class="muted">Saving note...</p>';
    try {
      await addDoc(collection(db, 'account_notes'), { targetUid: uid, note, createdBy: profile.uid, createdByUsername: profile.discordUsername, createdAt: serverTimestamp() });
      openNotes(uid, accountName);
    } catch (error) {
      msg.innerHTML = `<p class="error">Could not save note: ${esc(error.message)}</p>`;
    }
  };
}
