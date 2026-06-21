export function confirmAction({
  title = 'Confirm Action',
  message = 'Are you sure you want to continue?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  details = ''
} = {}) {
  return new Promise(resolve => {
    document.querySelector('#confirmActionModal')?.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop confirm-backdrop';
    backdrop.id = 'confirmActionModal';
    backdrop.innerHTML = `
      <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div class="confirm-icon ${danger ? 'danger' : ''}">${danger ? '!' : '?'}</div>
        <div>
          <p class="eyebrow">Cognitus Confirmation</p>
          <h2 id="confirmTitle">${escapeHtml(title)}</h2>
          <p class="confirm-message">${escapeHtml(message)}</p>
          ${details ? `<div class="confirm-details">${escapeHtml(details)}</div>` : ''}
          <div class="actions confirm-actions">
            <button class="button secondary" type="button" data-confirm-cancel>${escapeHtml(cancelText)}</button>
            <button class="button ${danger ? 'danger-button' : ''}" type="button" data-confirm-ok>${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(backdrop);

    const close = value => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.querySelector('[data-confirm-cancel]').onclick = () => close(false);
    backdrop.querySelector('[data-confirm-ok]').onclick = () => close(true);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close(false);
    });
    document.addEventListener('keydown', function escapeHandler(event) {
      if (event.key === 'Escape' && document.querySelector('#confirmActionModal')) {
        document.removeEventListener('keydown', escapeHandler);
        close(false);
      }
    });

    backdrop.querySelector('[data-confirm-cancel]').focus();
  });
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
