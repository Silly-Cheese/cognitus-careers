window.addEventListener('hashchange', () => setTimeout(enhanceReviewQueue, 300));
setTimeout(enhanceReviewQueue, 700);

function enhanceReviewQueue() {
  const [path] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'review') return;
  const table = document.querySelector('main table');
  if (!table || document.querySelector('#reviewQueueTools')) return;

  const tools = document.createElement('div');
  tools.id = 'reviewQueueTools';
  tools.className = 'form split';
  tools.innerHTML = `
    <label>Search Applications<input id="reviewSearch" placeholder="Applicant, Discord ID, application, recommendation"></label>
    <label>Status Filter<select id="reviewStatusFilter"><option value="">All Statuses</option><option value="submitted">Submitted</option><option value="under review">Under Review</option><option value="awaiting final decision">Awaiting Final Decision</option><option value="accepted">Accepted</option><option value="denied">Denied</option><option value="archived">Archived</option></select></label>
    <label>Recommendation Filter<select id="reviewRecommendationFilter"><option value="">All Recommendations</option><option value="approve">Approve</option><option value="deny">Deny</option><option value="interview">Interview</option><option value="executive review">Executive Review</option><option value="none">None</option></select></label>`;
  table.before(tools);

  [...table.querySelectorAll('tbody tr')].forEach(row => {
    row.dataset.search = row.innerText.toLowerCase();
  });

  ['reviewSearch', 'reviewStatusFilter', 'reviewRecommendationFilter'].forEach(id => {
    document.querySelector(`#${id}`).addEventListener('input', () => filterReviewTable(table));
  });
}

function filterReviewTable(table) {
  const search = document.querySelector('#reviewSearch')?.value.toLowerCase().trim() || '';
  const status = document.querySelector('#reviewStatusFilter')?.value.toLowerCase().trim() || '';
  const recommendation = document.querySelector('#reviewRecommendationFilter')?.value.toLowerCase().trim() || '';
  [...table.querySelectorAll('tbody tr')].forEach(row => {
    const text = row.dataset.search || row.innerText.toLowerCase();
    const okSearch = !search || text.includes(search);
    const okStatus = !status || text.includes(status);
    const okRecommendation = !recommendation || text.includes(recommendation);
    row.style.display = okSearch && okStatus && okRecommendation ? '' : 'none';
  });
}
