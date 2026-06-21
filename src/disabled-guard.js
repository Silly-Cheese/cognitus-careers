import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';

onAuthStateChanged(auth, async user => {
  if (!user) return removeDisabledModal();
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return;
    const profile = snap.data();
    if (profile.accountStatus === 'disabled') showDisabledModal();
    else removeDisabledModal();
  } catch (error) {
    console.warn('Disabled account check failed.', error);
  }
});

function showDisabledModal() {
  if (document.querySelector('#disabledAccountModal')) return;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop disabled-account-backdrop';
  modal.id = 'disabledAccountModal';
  modal.innerHTML = `
    <div class="confirm-card disabled-account-card" role="dialog" aria-modal="true">
      <div class="confirm-icon danger">!</div>
      <div>
        <p class="eyebrow">Account Access</p>
        <h2 class="disabled-title">YOUR ACCOUNT HAS BEEN DISABLED</h2>
        <p class="confirm-message">This Cognitus Talent Gateway account no longer has access to the portal.</p>
        <div class="confirm-details">Contact Cognitus leadership if you believe this was a mistake.</div>
        <div class="actions confirm-actions">
          <button class="button danger-button" type="button" id="disabledSignOut">Sign Out</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.querySelector('#disabledSignOut').onclick = async () => {
    await signOut(auth);
    window.location.hash = '#/';
    removeDisabledModal();
  };
}

function removeDisabledModal() {
  document.querySelector('#disabledAccountModal')?.remove();
}
