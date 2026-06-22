import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
let profile = null;
let ready = false;

const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const finalRoles = ['executive', 'owner'];
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const staff = () => profile && staffRoles.includes(profile.role);
const finalDecision = () => profile && finalRoles.includes(profile.role);
const owner = () => profile?.role === 'owner';
const dateText = value => value?.toDate ? value.toDate().toLocaleString() : 'Unknown';
const timeValue = value => value?.toMillis ? value.toMillis() : 0;

onAuthStateChanged(auth, async user => {
  profile = user ? await getProfile(user.uid) : null;
  ready = true;
  setTimeout(handleNotificationsRoute, 120);
  setTimeout(addNotificationsLink, 300);
});

window.addEventListener('hashchange', () => {
  setTimeout(handleNotificationsRoute, 120);
  setTimeout(addNotificationsLink, 300);
});

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a><a href="#/notifications">Notifications</a><a href="#/profile">Profile</a>${staff() ? '<a href="#/review">Review</a>' : ''}${finalDecision() ? '<a href="#/executive">Executive</a>' : ''}${owner() ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · NotificationsRouteFix v1</footer>`;
}

function addNotificationsLink() {
  if (!profile) return;
  const nav = document.querySelector('.topbar nav');
  if (!nav || nav.querySelector('a[href="#/notifications"]')) return;
  const applications = nav.querySelector('a[href="#/applications"]');
  const link = document.createElement('a');
  link.href = '#/notifications';
  link.textContent = 'Notifications';
  applications?.after(link);
}

async function handleNotificationsRoute() {
  const [path] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'notifications') return;
  if (!ready) return;
  if (!profile) {
    location.hash = '#/signin';
    return;
  }
  await renderNotifications();
}

async function renderNotifications() {
  shell('<section class="panel"><h1>Loading notifications...</h1><p class="muted">Checking your Cognitus updates.</p></section>');
  try {
    const snap = await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', profile.uid)));
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
    const cards = notes.map(n => `<div class="note"><strong>${esc(n.title || 'Notification')}</strong><p>${esc(n.message || '')}</p><span>${esc(dateText(n.createdAt))} · ${n.read ? 'Read' : 'Unread'}</span>${!n.read ? `<div class="actions"><button class="button small secondary" data-mark-read="${esc(n.id)}">Mark Read</button></div>` : ''}</div>`).join('') || '<p class="muted">No notifications yet.</p>';
    shell(`<section class="page-head"><div><p class="eyebrow">Notification Center</p><h1>Notifications</h1><p class="muted">Important application, review, interview, and account updates.</p></div></section><section class="panel">${cards}</section>`);
    document.querySelectorAll('[data-mark-read]').forEach(button => {
      button.onclick = async () => {
        await updateDoc(doc(db, 'notifications', button.dataset.markRead), { read: true, readAt: serverTimestamp() });
        renderNotifications();
      };
    });
  } catch (error) {
    shell(`<section class="page-head"><div><p class="eyebrow">Notification Center</p><h1>Notifications</h1><p class="muted">Important application, review, interview, and account updates.</p></div></section><section class="panel"><div class="error">${esc(error.message)}</div><div class="notice"><strong>Possible Firestore rules issue.</strong><br>Deploy the latest rules with <code>firebase deploy --only firestore:rules</code>, then refresh.</div></section>`);
  }
}
