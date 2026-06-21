import { onAuthStateChanged } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { confirmAction } from './confirm-modal.js';

const root = document.querySelector('#app');
let user = auth.currentUser;
let profile = null;
let ready = false;

const roles = ['applicant', 'reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(v || 'Unknown')}</span>`;
const go = path => { location.hash = path; };

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  handleOwnerRoute();
});
window.addEventListener('hashchange', () => setTimeout(handleOwnerRoute, 0));

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a><a href="#/review">Review</a><a href="#/executive">Executive</a><a href="#/owner">Owner</a>${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · OwnerAdmin v2</footer>`;
}

async function handleOwnerRoute() {
  const [path] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'owner') return;
  if (!ready) return shell('<section class="panel"><h1>Loading owner console...</h1></section>');
  if (!user || !profile) return go('#/signin');
  if (profile.role !== 'owner') return shell('<section class="panel"><h1>Access denied</h1><p class="muted">Only owners can manage accounts.</p></section>');
  return ownerConsole();
}

async function ownerConsole() {
  shell('<section class="panel"><h1>Loading owner console...</h1><p class="muted">Fetching portal accounts.</p></section>');
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rows = users.map(account => {
      const isSelf = account.id === profile.uid;
      return `<tr><td><strong>${esc(account.discordUsername)}</strong><br><span class="muted">${esc(account.robloxUsername || 'No Roblox username')}</span></td><td>${esc(account.discordId || '')}</td><td>${badge(account.role)}</td><td><select data-role-select="${account.id}">${roles.map(role => `<option value="${role}" ${role === account.role ? 'selected' : ''}>${role}</option>`).join('')}</select></td><td><div class="actions"><button class="button small" data-save-role="${account.id}">Save Role</button><button class="button small secondary" data-disable-account="${account.id}" data-account-name="${esc(account.discordUsername || 'this account')}" ${isSelf ? 'disabled' : ''}>Disable</button><button class="button small quiet" data-delete-account="${account.id}" data-discord-id="${esc(account.discordId || '')}" data-account-name="${esc(account.discordUsername || 'this account')}" ${isSelf ? 'disabled' : ''}>Delete</button></div></td></tr>`;
    }).join('') || '<tr><td colspan="5">No users found.</td></tr>';
    shell(`<section class="page-head"><div><p class="eyebrow">Owner Console</p><h1>Account Management</h1><p class="muted">Change roles, disable portal access, or delete portal account records.</p></div></section><section class="panel"><div id="ownerMessage"></div><table><thead><tr><th>User</th><th>Discord ID</th><th>Current Role</th><th>New Role</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table><div class="notice"><strong>Note:</strong> Delete removes the Firestore portal profile and Discord ID mapping. It does not remove the Firebase Authentication login account. To fully delete the login, remove the user from Firebase Console → Authentication.</div></section>`);
    document.querySelectorAll('[data-save-role]').forEach(btn => btn.onclick = () => saveRole(btn.dataset.saveRole));
    document.querySelectorAll('[data-disable-account]').forEach(btn => btn.onclick = () => disableAccount(btn.dataset.disableAccount, btn.dataset.accountName));
    document.querySelectorAll('[data-delete-account]').forEach(btn => btn.onclick = () => deleteAccount(btn.dataset.deleteAccount, btn.dataset.discordId, btn.dataset.accountName));
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load owner console</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

async function saveRole(uid) {
  const msg = document.querySelector('#ownerMessage');
  const role = document.querySelector(`[data-role-select="${uid}"]`).value;
  msg.innerHTML = '<p class="muted">Saving role...</p>';
  try {
    await updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername });
    if (uid === profile.uid) profile = await getProfile(uid);
    ownerConsole();
  } catch (error) {
    msg.innerHTML = `<p class="error">Could not save role: ${esc(error.message)}</p>`;
  }
}

async function disableAccount(uid, accountName = 'this account') {
  const msg = document.querySelector('#ownerMessage');
  if (uid === profile.uid) return;
  const confirmed = await confirmAction({
    title: 'Disable Portal Account?',
    message: `Disable ${accountName}?`,
    details: 'The account profile will remain, but accountStatus will be set to disabled.',
    confirmText: 'Disable Account',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;
  msg.innerHTML = '<p class="muted">Disabling account...</p>';
  try {
    await updateDoc(doc(db, 'users', uid), { accountStatus: 'disabled', updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername });
    ownerConsole();
  } catch (error) {
    msg.innerHTML = `<p class="error">Could not disable account: ${esc(error.message)}</p>`;
  }
}

async function deleteAccount(uid, discordId, accountName = 'this account') {
  const msg = document.querySelector('#ownerMessage');
  if (uid === profile.uid) return;
  const confirmed = await confirmAction({
    title: 'Delete Portal Account?',
    message: `Delete ${accountName}?`,
    details: 'This removes the Firestore user profile and Discord ID mapping. It does not remove the Firebase Authentication login. This action cannot be undone from the portal.',
    confirmText: 'Delete Account Record',
    cancelText: 'Keep Account',
    danger: true
  });
  if (!confirmed) return;
  msg.innerHTML = '<p class="muted">Deleting account record...</p>';
  try {
    await setDoc(doc(collection(db, 'audit_logs')), { action: 'OWNER_DELETED_PORTAL_ACCOUNT', performedBy: profile.uid, performedByUsername: profile.discordUsername, targetUid: uid, targetDiscordId: discordId || '', timestamp: serverTimestamp() });
    if (discordId) await deleteDoc(doc(db, 'discord_ids', discordId));
    await deleteDoc(doc(db, 'users', uid));
    ownerConsole();
  } catch (error) {
    msg.innerHTML = `<p class="error">Could not delete account: ${esc(error.message)}</p>`;
  }
}
