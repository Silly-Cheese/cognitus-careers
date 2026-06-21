import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase.js';

function renderSignOut(user) {
  const nav = document.querySelector('.topbar nav');
  if (!nav || !user) return;
  if (nav.querySelector('[data-signout-helper]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost signout-mobile-fix';
  button.textContent = 'Sign Out';
  button.setAttribute('data-signout-helper', 'true');
  button.addEventListener('click', async () => {
    await signOut(auth);
    window.location.hash = '#/';
  });
  nav.appendChild(button);
}

onAuthStateChanged(auth, user => {
  setInterval(() => renderSignOut(user), 500);
});
