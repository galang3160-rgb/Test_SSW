document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const cards = document.querySelectorAll('.exercise-card');
  const noResults = document.getElementById('noResults');
  const totalBadge = document.getElementById('totalBadge');
  const toast = document.getElementById('toast');
  let toastTimer = null;

  // 1. Tangani Klik pada Kartu Terkunci
  const lockedCards = document.querySelectorAll('.exercise-card.locked .card-action');
  lockedCards.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      showToast('Paket latihan ini belum dibuka.');
    });
  });

  // 2. Notifikasi Toast
  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.remove('hidden');

    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2400);
  }

  // 3. Pencarian / Filter Real-time
  searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase().trim();
    let visibleCount = 0;

    cards.forEach((card) => {
      const dataTitle = (card.getAttribute('data-title') || '').toLowerCase();
      const subTextElem = card.querySelector('.subtext');
      const subText = subTextElem ? subTextElem.textContent.toLowerCase() : '';

      if (dataTitle.includes(keyword) || subText.includes(keyword)) {
        card.classList.remove('hidden');
        visibleCount++;
      } else {
        card.classList.add('hidden');
      }
    });

    totalBadge.textContent = `${visibleCount} Modul`;
    noResults.classList.toggle('hidden', visibleCount > 0);
  });
});