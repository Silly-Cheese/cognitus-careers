const root = document.querySelector('#app');

if (root) {
  let scheduled = false;

  const route = () => (location.hash || '#/').split('?')[0];
  const escText = (value = '') => String(value).replace(/[<>]/g, '');

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  }

  function enhance() {
    const main = root.querySelector('main');
    if (!main) return;

    main.classList.remove('tg-dashboard', 'tg-applications', 'tg-auth-page');
    decorateHeader();
    decorateFooter();

    const current = route();
    if (current === '#/' || current === '#') decorateHome(main);
    if (current === '#/dashboard') decorateDashboard(main);
    if (current === '#/applications') decorateApplications(main);
    if (['#/signin', '#/register', '#/bootstrap'].includes(current)) decorateAuth(main);

    decorateGeneric(main);
  }

  function decorateHeader() {
    const nav = root.querySelector('.topbar nav');
    if (!nav) return;
    const current = route();

    nav.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href');
      const active = href && (href === current || (current === '#/' && href === '#/'));
      link.classList.toggle('tg-active', Boolean(active));
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function decorateFooter() {
    const footer = root.querySelector('footer');
    if (!footer || footer.dataset.tgEnhanced === 'true') return;
    footer.dataset.tgEnhanced = 'true';
    footer.innerHTML = '© Cognitus Solutions <span aria-hidden="true">·</span> Talent Gateway <span aria-hidden="true">·</span> Clear applications. Structured review.';
  }

  function decorateHome(main) {
    const hero = main.querySelector('.hero');
    if (!hero || hero.dataset.tgEnhanced === 'true') return;

    hero.dataset.tgEnhanced = 'true';
    hero.classList.add('tg-home');
    hero.innerHTML = `
      <div class="tg-hero-shell">
        <div class="tg-hero-copy tg-animate">
          <div class="tg-kicker"><span class="tg-kicker-dot"></span>Cognitus Solutions / Talent Gateway</div>
          <h1>Build what comes next.</h1>
          <p class="lead">Your path into Cognitus starts here. Find an opening, submit your application, and follow the review process from one account.</p>
          <div class="tg-hero-actions">
            <a class="button" href="#/register">Create your account <span class="tg-arrow" aria-hidden="true">→</span></a>
            <a class="button secondary" href="#/signin">Sign in</a>
          </div>
          <div class="tg-trust-line" aria-label="Talent Gateway features">
            <span>One application hub</span>
            <span>Clear review status</span>
            <span>Cross-device access</span>
          </div>
        </div>

        <aside class="tg-command-card tg-animate tg-animate-delay-1" aria-label="Application journey preview">
          <div class="tg-command-top">
            <div class="tg-command-brand">
              <div class="tg-command-mark" aria-hidden="true"></div>
              <div><strong>Talent Gateway</strong><span>Cognitus Solutions</span></div>
            </div>
            <div class="tg-live-pill">Gateway online</div>
          </div>
          <div class="tg-command-body">
            <div class="tg-command-label">Application journey</div>
            <h2>One place. Every step.</h2>
            <div class="tg-journey">
              <div class="tg-journey-step">
                <div class="tg-journey-number">01</div>
                <div><strong>Create an account</strong><span>Set up secure access with your Discord ID.</span></div>
                <div class="tg-step-state"></div>
              </div>
              <div class="tg-journey-step">
                <div class="tg-journey-number">02</div>
                <div><strong>Choose an opening</strong><span>Review available roles and requirements.</span></div>
                <div class="tg-step-state"></div>
              </div>
              <div class="tg-journey-step">
                <div class="tg-journey-number">03</div>
                <div><strong>Complete review</strong><span>Your application moves through the hiring team.</span></div>
                <div class="tg-step-state"></div>
              </div>
              <div class="tg-journey-step">
                <div class="tg-journey-number">04</div>
                <div><strong>Receive a decision</strong><span>Return here for updates and next steps.</span></div>
                <div class="tg-step-state"></div>
              </div>
            </div>
          </div>
          <div class="tg-command-foot"><span>careers.cognitus-solutions.org</span><span>Applicant access</span></div>
        </aside>
      </div>

      <section class="tg-section tg-animate tg-animate-delay-1">
        <div class="tg-section-head">
          <div>
            <p class="eyebrow">How it works</p>
            <h2>A hiring process you can actually follow.</h2>
          </div>
          <p>No guessing where your application went. Talent Gateway keeps the application itself, its status, and the next step in the same place.</p>
        </div>
        <div class="tg-process-grid">
          <article class="tg-process-card"><span class="tg-process-number">01</span><h3>Set up your profile</h3><p>Create one account and use it for current and future Cognitus opportunities.</p></article>
          <article class="tg-process-card"><span class="tg-process-number">02</span><h3>Apply with context</h3><p>Each opening includes the role details and the questions the hiring team actually needs.</p></article>
          <article class="tg-process-card"><span class="tg-process-number">03</span><h3>Track the review</h3><p>Return to the gateway to see when your application advances through the process.</p></article>
          <article class="tg-process-card"><span class="tg-process-number">04</span><h3>Know what happens next</h3><p>Decisions and applicant-facing updates stay attached to the application you submitted.</p></article>
        </div>
      </section>

      <section class="tg-standard tg-animate tg-animate-delay-2">
        <div class="tg-standard-main">
          <div><p class="eyebrow">The Cognitus standard</p><h2>We are looking for people we can trust with real responsibility.</h2></div>
          <p>Roles differ, but the standard does not. Strong applicants communicate clearly, use good judgment, follow through, and understand that dependable work matters.</p>
        </div>
        <div class="tg-standard-side">
          <h3>What stands out</h3>
          <div class="tg-quality-list">
            <div class="tg-quality"><div class="tg-quality-icon">01</div><div><strong>Reliability</strong><span>You do what you said you would do, when you said you would do it.</span></div></div>
            <div class="tg-quality"><div class="tg-quality-icon">02</div><div><strong>Judgment</strong><span>You can think through a situation instead of waiting for every answer to be handed to you.</span></div></div>
            <div class="tg-quality"><div class="tg-quality-icon">03</div><div><strong>Communication</strong><span>You keep people informed and make complicated things easier to understand.</span></div></div>
            <div class="tg-quality"><div class="tg-quality-icon">04</div><div><strong>Initiative</strong><span>You notice what needs attention and are willing to take the first step.</span></div></div>
          </div>
        </div>
      </section>

      <section class="tg-final-cta tg-animate tg-animate-delay-3">
        <p class="eyebrow">Ready when you are</p>
        <h2>Your next opportunity could start here.</h2>
        <p>Create an account to view and manage Cognitus applications, or sign back in to continue where you left off.</p>
        <div class="actions">
          <a class="button" href="#/register">Create account</a>
          <a class="button secondary" href="#/signin">Sign in</a>
        </div>
      </section>
    `;
  }

  function decorateDashboard(main) {
    main.classList.add('tg-dashboard');
    if (main.dataset.tgDashboardEnhanced === 'true') return;

    const head = main.querySelector('.page-head');
    const cards = main.querySelector('.grid.cards');
    if (!head || !cards) return;

    main.dataset.tgDashboardEnhanced = 'true';
    const heading = head.querySelector('h1');
    const eyebrow = head.querySelector('.eyebrow');
    const muted = head.querySelector('.muted');
    const username = heading ? escText(heading.textContent.replace(/^Welcome,\s*/i, '')) : 'Applicant';
    const role = eyebrow ? escText(eyebrow.textContent.trim()) : 'Applicant';
    const idText = muted ? escText(muted.textContent.trim()) : '';

    if (eyebrow) {
      eyebrow.className = 'tg-role-chip';
      eyebrow.textContent = role;
    }

    const banner = document.createElement('section');
    banner.className = 'tg-dashboard-banner tg-animate';
    banner.innerHTML = `
      <div class="tg-dashboard-primary">
        <div>
          <p class="eyebrow">Your next move</p>
          <h2>Keep your applications moving.</h2>
          <p>Open the applications area to find current opportunities, continue a saved draft, or check the status of something you already submitted.</p>
        </div>
        <a class="button" href="#/applications">Open applications <span class="tg-arrow" aria-hidden="true">→</span></a>
      </div>
      <div class="tg-dashboard-account">
        <div>
          <div class="tg-account-mark" aria-hidden="true"></div>
          <h3>${username}</h3>
          <p>${idText || 'Cognitus Talent Gateway account'}</p>
        </div>
        <div class="tg-account-status"><span>${role}</span><span class="tg-status-online">Account active</span></div>
      </div>
    `;
    head.insertAdjacentElement('afterend', banner);

    cards.querySelectorAll('.card').forEach((card, index) => {
      const label = card.querySelector('h3')?.textContent.trim().toLowerCase() || '';
      if (label.includes('application')) card.dataset.tgCard = 'applications';
      else if (label.includes('review')) card.dataset.tgCard = 'review';
      else if (label.includes('executive')) card.dataset.tgCard = 'executive';
      else if (label.includes('owner')) card.dataset.tgCard = 'owner';
      card.classList.add('tg-animate');
      if (index < 3) card.style.animationDelay = `${.05 + index * .05}s`;
    });
  }

  function decorateApplications(main) {
    main.classList.add('tg-applications');
    if (main.dataset.tgApplicationsEnhanced === 'true') return;

    const head = main.querySelector('.page-head');
    const grid = main.querySelector('.grid.cards');
    if (!head || !grid) return;

    main.dataset.tgApplicationsEnhanced = 'true';
    head.classList.add('tg-animate');

    const cards = Array.from(grid.querySelectorAll('.card'));
    cards.forEach((card, index) => {
      card.classList.add('tg-animate');
      if (index < 5) card.style.animationDelay = `${.04 + index * .04}s`;
    });

    const tools = document.createElement('div');
    tools.className = 'tg-opportunity-tools tg-animate';
    tools.innerHTML = `
      <div class="tg-search-wrap"><input class="tg-opportunity-search" type="search" placeholder="Search opportunities by title or department" aria-label="Search opportunities" /></div>
      <div class="tg-result-count" aria-live="polite"></div>
    `;
    head.insertAdjacentElement('afterend', tools);

    const input = tools.querySelector('.tg-opportunity-search');
    const count = tools.querySelector('.tg-result-count');
    const noResults = document.createElement('div');
    noResults.className = 'tg-no-results';
    noResults.textContent = 'No opportunities match that search.';
    noResults.hidden = true;
    grid.appendChild(noResults);

    const update = () => {
      const needle = input.value.trim().toLowerCase();
      let visible = 0;
      cards.forEach(card => {
        const match = !needle || card.textContent.toLowerCase().includes(needle);
        card.classList.toggle('tg-hidden', !match);
        if (match) visible += 1;
      });
      count.textContent = `${visible} ${visible === 1 ? 'opportunity' : 'opportunities'}`;
      noResults.hidden = visible !== 0;
    };

    input.addEventListener('input', update);
    update();
  }

  function decorateAuth(main) {
    main.classList.add('tg-auth-page');
    const panel = main.querySelector('.panel.narrow');
    if (panel) panel.classList.add('tg-animate');
  }

  function decorateGeneric(main) {
    main.querySelectorAll('.panel:not(.tg-animate), .page-head:not(.tg-animate)').forEach((element, index) => {
      if (index < 2) element.classList.add('tg-animate');
    });
  }

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleEnhance);
  window.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  scheduleEnhance();
}
