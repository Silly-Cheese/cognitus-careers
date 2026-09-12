const root = document.querySelector('#app');

if (root) {
  const applyFixes = () => {
    if (!(location.hash || '').startsWith('#/apply/')) return;
    const draftButton = root.querySelector('#applicationForm button[name="intent"][value="draft"]');
    if (draftButton) {
      draftButton.formNoValidate = true;
      draftButton.setAttribute('formnovalidate', '');
      draftButton.title = 'Save your progress without completing every required field.';
    }
  };

  const observer = new MutationObserver(() => requestAnimationFrame(applyFixes));
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => requestAnimationFrame(applyFixes));
  requestAnimationFrame(applyFixes);
}
