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
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(label(v))}</span>`;
const label = v => ({ pendingFinalDecision: 'Awaiting Final Decision', underReview: 'Under Review', seniorReviewer: 'Senior Reviewer', hiringLead: 'Hiring Lead' }[v] || v || 'Unknown');
const go = path => { location.hash = path; };
const timeValue = value => value?.toMillis ? value.toMillis() : 0;
const dateText = value => value?.toDate ? value.toDate().toLocaleString() : 'Unknown';

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
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a><a href="#/review">Review</a><a href="#/executive">Executive</a><a href="#/owner">Owner</a>${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · OwnerAdmin v5</footer>`;
}

async function handleOwnerRoute() {
  const [path, action] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'owner') return;
  if (!ready) return shell('<section class="panel"><h1>Loading owner console...</h1></section>');
  if (!user || !profile) return go('#/signin');
  if (profile.role !== 'owner') return shell('<section class="panel"><h1>Access denied</h1><p class="muted">Only owners can manage accounts.</p></section>');
  if (action === 'audit') return auditLogPage();
  return ownerConsole();
}

async function getAllData() {
  const [usersSnap, appsSnap, formsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'applications')),
    getDocs(collection(db, 'application_forms'))
  ]);
  return {
    users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    applications: appsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    forms: formsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
}

function countWhere(items, fn) { return items.filter(fn).length; }
function statCard(labelText, value) { return `<div class="card"><h3>${esc(value)}</h3><p class="muted">${esc(labelText)}</p></div>`; }

async function ownerConsole() {
  shell('<section class="panel"><h1>Loading owner console...</h1><p class="muted">Fetching portal accounts.</p></section>');
  try {
    const { users, applications, forms } = await getAllData();
    const stats = [
      statCard('Total Users', users.length),
      statCard('Active Users', countWhere(users, u => (u.accountStatus || 'active') === 'active')),
      statCard('Disabled Users', countWhere(users, u => u.accountStatus === 'disabled')),
      statCard('Open Forms', countWhere(forms, f => f.status === 'open')),
      statCard('Under Review', countWhere(applications, a => a.status === 'underReview')),
      statCard('Awaiting Final Decision', countWhere(applications, a => a.status === 'pendingFinalDecision')),
      statCard('Accepted', countWhere(applications, a => a.status === 'accepted')),
      statCard('Denied', countWhere(applications, a => a.status === 'denied'))
    ].join('');

    const rows = users.map(account => accountRow(account)).join('') || '<tr><td colspan="6">No users found.</td></tr>';
    shell(`<section class="page-head"><div><p class="eyebrow">Owner Console</p><h1>Account Management</h1><p class="muted">Dashboard stats, user controls, role permissions, and audit tools.</p></div><div class="actions"><a class="button secondary" href="#/owner/audit">View Audit Log</a></div></section><section class="grid cards">${stats}</section><section class="panel"><h2>Account Directory</h2><div id="ownerMessage"></div><div class="form split"><label>Search<input id="ownerSearch" placeholder="Discord username, Roblox username, Discord ID"></label><label>Filter Role<select id="ownerRoleFilter"><option value="">All Roles</option>${roles.map(role => `<option value="${role}">${esc(label(role))}</option>`).join('')}</select></label><label>Filter Status<select id="ownerStatusFilter"><option value="">All Statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label></div><table id="ownerAccountsTable"><thead><tr><th>User</th><th>Discord ID</th><th>Role</th><th>Status</th><th>New Role</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table><div class="notice"><strong>Role permissions:</strong><br>Applicant — apply and view status.<br>Reviewer/Senior Reviewer/Hiring Lead — review and submit recommendations.<br>Executive — manage forms and submit recommendations.<br>Owner — full portal control, final decisions, account management, and audit access.</div><div class="notice"><strong>Note:</strong> Disable blocks portal usage. Enable restores accountStatus to active. Delete removes the Firestore portal profile and Discord ID mapping, not the Firebase Authentication login.</div></section>`);
    wireAccountButtons();
    ['ownerSearch', 'ownerRoleFilter', 'ownerStatusFilter'].forEach(id => document.querySelector(`#${id}`).addEventListener('input', filterOwnerAccounts));
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load owner console</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

function accountRow(account) {
  const isSelf = account.id === profile.uid;
  const status = account.accountStatus || 'active';
  const searchText = `${account.discordUsername || ''} ${account.robloxUsername || ''} ${account.discordId || ''}`.toLowerCase();
  const enableOrDisable = status === 'disabled'
    ? `<button class="button small" data-enable-account="${account.id}" data-account-name="${esc(account.discordUsername || 'this account')}" ${isSelf ? 'disabled' : ''}>Enable</button>`
    : `<button class="button small secondary" data-disable-account="${account.id}" data-account-name="${esc(account.discordUsername || 'this account')}" ${isSelf ? 'disabled' : ''}>Disable</button>`;
  return `<tr data-role="${esc(account.role || '')}" data-status="${esc(status)}" data-search="${esc(searchText)}"><td><strong>${esc(account.discordUsername)}</strong><br><span class="muted">${esc(account.robloxUsername || 'No Roblox username')}</span></td><td>${esc(account.discordId || '')}</td><td>${badge(account.role)}</td><td>${badge(status)}</td><td><select data-role-select="${account.id}">${roles.map(role => `<option value="${role}" ${role === account.role ? 'selected' : ''}>${esc(label(role))}</option>`).join('')}</select></td><td><div class="actions"><button class="button small" data-save-role="${account.id}">Save Role</button>${enableOrDisable}<button class="button small quiet" data-delete-account="${account.id}" data-discord-id="${esc(account.discordId || '')}" data-account-name="${esc(account.discordUsername || 'this account')}" ${isSelf ? 'disabled' : ''}>Delete</button></div></td></tr>`;
}

function wireAccountButtons() {
  document.querySelectorAll('[data-save-role]').forEach(btn => btn.onclick = () => saveRole(btn.dataset.saveRole));
  document.querySelectorAll('[data-disable-account]').forEach(btn => btn.onclick = () => disableAccount(btn.dataset.disableAccount, btn.dataset.accountName));
  document.querySelectorAll('[data-enable-account]').forEach(btn => btn.onclick = () => enableAccount(btn.dataset.enableAccount, btn.dataset.accountName));
  document.querySelectorAll('[data-delete-account]').forEach(btn => btn.onclick = () => deleteAccount(btn.dataset.deleteAccount, btn.dataset.discordId, btn.dataset.accountName));
}

function filterOwnerAccounts() {
  const search = document.querySelector('#ownerSearch').value.toLowerCase().trim();
  const role = document.querySelector('#ownerRoleFilter').value;
  const status = document.querySelector('#ownerStatusFilter').value;
  document.querySelectorAll('#ownerAccountsTable tbody tr').forEach(row => {
    const okSearch = !search || row.dataset.search.includes(search);
    const okRole = !role || row.dataset.role === role;
    const okStatus = !status || row.dataset.status === status;
    row.style.display = okSearch && okRole && okStatus ? '' : 'none';
  });
}

async function auditLogPage() {
  shell('<section class="panel"><h1>Loading audit log...</h1><p class="muted">Fetching recent activity.</p></section>');
  try {
    const snap = await getDocs(collection(db, 'audit_logs'));
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.timestamp || b.createdAt) - timeValue(a.timestamp || a.createdAt)).slice(0, 100);
    const rows = logs.map(log => `<tr><td><strong>${esc(log.action || 'ACTION')}</strong><br><span class="muted">${esc(log.performedByUsername || log.createdByUsername || log.performedBy || '')}</span></td><td>${esc(log.targetUid || log.targetId || log.applicationId || log.formId || '')}</td><td>${esc(log.details || log.targetDiscordId || '')}</td><td>${esc(dateText(log.timestamp || log.createdAt))}</td></tr>`).join('') || '<tr><td colspan="4">No audit logs recorded yet.</td></tr>';
    shell(`<section class="page-head"><div><p class="eyebrow">Owner Console</p><h1>Audit Log</h1><p class="muted">Recent high-value portal actions.</p></div><a class="button secondary" href="#/owner">Back to Owner Console</a></section><section class="panel"><table><thead><tr><th>Action</th><th>Target</th><th>Details</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table></section>`);
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load audit log</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

async function audit(action, data = {}) {
  try {
    await setDoc(doc(collection(db, 'audit_logs')), { action, performedBy: profile.uid, performedByUsername: profile.discordUsername, timestamp: serverTimestamp(), ...data });
  } catch (error) {
    console.warn('Audit log failed.', error);
  }
}

async function saveRole(uid) {
  const msg = document.querySelector('#ownerMessage');
  const role = document.querySelector(`[data-role-select="${uid}"]`).value;
  msg.innerHTML = '<p class="muted">Saving role...</p>';
  try {
    await updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername });
    await audit('OWNER_CHANGED_ROLE', { targetUid: uid, details: `Role changed to ${role}` });
    if (uid === profile.uid) profile = await getProfile(uid);
    ownerConsole();
  } catch (error) {
    msg.innerHTML = `<p class="error">Could not save role: ${esc(error.message)}</p>`;
  }
}

async function disableAccount(uid, accountName = 'this account') {
  const msg = document.querySelector('#ownerMessage');
  if (uid === profile.uid) return;
  const confirmed = await confirmAction({ title: 'Disable Portal Account?', message: `Disable ${accountName}?`, details: 'The account will immediately be blocked from the portal with a red disabled-account message.', confirmText: 'Disable Account', cancelText: 'Cancel', danger: true });
  if (!confirmed) return;
  msg.innerHTML = '<p class="muted">Disabling account...</p>';
  try {
    await updateDoc(doc(db, 'users', uid), { accountStatus: 'disabled', updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername });
    await audit('OWNER_DISABLED_ACCOUNT', { targetUid: uid, details: accountName });
    ownerConsole();
  } catch (error) {
    msg.innerHTML = `<p class="error">Could not disable account: ${esc(error.message)}</p>`;
  }
}

async function enableAccount(uid, accountName = 'this account') {
  const msg = document.querySelector('#ownerMessage');
  if (uid === profile.uid) return;
  const confirmed = await confirmAction({ title: 'Enable Portal Account?', message: `Enable ${accountName}?`, details: 'The account will regain access to the Cognitus Talent Gateway.', confirmText: 'Enable Account', cancelText: 'Cancel', danger: false });
  if (!confirmed) return;
  msg.innerHTML = '<p class="muted">Enabling account...</p>';
  try {
    await updateDoc(doc(db, 'users', uid), { accountStatus: 'active', updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername });
    await audit('OWNER_ENABLED_ACCOUNT', { targetUid: uid, details: accountName });
    ownerConsole();
  } catch (error) {
    msg.innerHTML = `<p class="error">Could not enable account: ${esc(error.message)}</p>`;
  }
}

async function deleteAccount(uid, discordId, accountName = 'this account') {
  const msg = document.querySelector('#ownerMessage');
  if (uid === profile.uid) return;
  const confirmed = await confirmAction({ title: 'Delete Portal Account?', message: `Delete ${accountName}?`, details: 'This removes the Firestore user profile and Discord ID mapping. It does not remove the Firebase Authentication login. This action cannot be undone from the portal.', confirmText: 'Delete Account Record', cancelText: 'Keep Account', danger: true });
  if (!confirmed) return;
  msg.innerHTML = '<p class="muted">Deleting account record...</p>';
  try {
    await audit('OWNER_DELETED_PORTAL_ACCOUNT', { targetUid: uid, targetDiscordId: discordId || '', details: accountName });
    if (discordId) await deleteDoc(doc(db, 'discord_ids', discordId));
    await deleteDoc(doc(db, 'users', uid));
    ownerConsole();
  } catch (error) {
    msg.innerHTML = `<p class="error">Could not delete account: ${esc(error.message)}</p>`;
  }
}
