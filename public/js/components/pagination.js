/**
 * Reusable Modern Pagination Component
 */

function renderPaginationControls({
  containerId,
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  limit = 10,
  onPageChangeName = 'goToPage',
  onLimitChangeName = null,
  limitOptions = [10, 25, 50],
  itemName = 'records'
}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (totalItems === 0 || totalPages <= 0) {
    container.innerHTML = '';
    return;
  }

  const startIdx = Math.min((currentPage - 1) * limit + 1, totalItems);
  const endIdx = Math.min(currentPage * limit, totalItems);

  // Generate page numbers with smart ellipsis (e.g. 1 ... 4 5 6 ... 10)
  let pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) pages.push(i);
    }

    if (currentPage < totalPages - 2) pages.push('...');
    if (!pages.includes(totalPages)) pages.push(totalPages);
  }

  const buttonsHtml = pages.map(p => {
    if (p === '...') {
      return `<span class="pagination-ellipsis">…</span>`;
    }
    const isActive = p === currentPage;
    return `
      <button type="button" class="pagination-btn ${isActive ? 'active' : ''}" 
        onclick="${onPageChangeName}(${p})" 
        ${isActive ? 'aria-current="page"' : ''}>
        ${p}
      </button>
    `;
  }).join('');

  let limitHtml = '';
  if (onLimitChangeName && limitOptions && limitOptions.length) {
    const opts = limitOptions.map(opt => `<option value="${opt}" ${opt === limit ? 'selected' : ''}>${opt}</option>`).join('');
    limitHtml = `
      <div class="pagination-limit-wrap">
        <span>Show</span>
        <select class="pagination-select" onchange="${onLimitChangeName}(Number(this.value))">
          ${opts}
        </select>
        <span>per page</span>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="pagination-bar">
      <div class="pagination-left">
        <span class="pagination-info">
          Showing <strong>${startIdx}–${endIdx}</strong> of <strong>${Number(totalItems).toLocaleString()}</strong> ${itemName}
        </span>
        ${limitHtml}
      </div>
      <div class="pagination-controls">
        <button type="button" class="pagination-btn" 
          ${currentPage <= 1 ? 'disabled' : ''} 
          onclick="${onPageChangeName}(${currentPage - 1})" title="Previous Page">
          &larr; Prev
        </button>
        ${buttonsHtml}
        <button type="button" class="pagination-btn" 
          ${currentPage >= totalPages ? 'disabled' : ''} 
          onclick="${onPageChangeName}(${currentPage + 1})" title="Next Page">
          Next &rarr;
        </button>
      </div>
    </div>
  `;
}

window.renderPaginationControls = renderPaginationControls;
