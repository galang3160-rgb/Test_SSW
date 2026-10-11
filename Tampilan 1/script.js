document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('moduleGrid');
  const countText = document.getElementById('moduleCountText');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const body = document.body;

  if (!grid) return;

  // Konfigurasi target file JSON dan tema per kategori
  const CATEGORIES = {
    blue: {
      themeClass: 'theme-blue',
      totalBab: 25,
      folder: 'main',
      prefix: 'main',
      label: 'Kaigo Biru'
    },
    pink: {
      themeClass: 'theme-pink',
      totalBab: 25,
      folder: 'mimin',
      prefix: 'mimin',
      label: 'Kaigo Pink'
    }
  };

  let currentCategory = 'blue';

  // Fungsi generate elemen modul secara dinamis
  function renderModules(type) {
    const config = CATEGORIES[type];
    let html = '';

    for (let i = 1; i <= config.totalBab; i++) {
      // Menghasilkan path file: main/main1.json atau mimin/mimin1.json
      const jsonPath = `${config.folder}/${config.prefix}${i}.json`;
      
      html += `
        <div class="module-card">
          <div>
            <span class="module-number">MODUL ${i}</span>
            <div class="module-name">${config.label} Bab ${i}</div>
          </div>
          <a href="Bab/flashcard/index.html?type=${type}&bab=${i}&file=${encodeURIComponent(jsonPath)}" class="module-action-btn">
            <span>Buka Flashcard</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </a>
        </div>
      `;
    }

    grid.innerHTML = html;
    if (countText) {
      countText.textContent = `${config.totalBab} Modul ${config.label} Tersedia`;
    }
  }

  // Fungsi update tema dan state tab
  function setCategory(type) {
    currentCategory = type;

    // Ganti class warna di body
    body.classList.remove('theme-blue', 'theme-pink');
    body.classList.add(CATEGORIES[type].themeClass);

    // Update state tombol tab
    tabBtns.forEach(btn => {
      const isActive = btn.dataset.type === type;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Render ulang kartu modul
    renderModules(type);
  }

  // Event listener tombol tab switcher
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedType = btn.dataset.type;
      if (selectedType !== currentCategory) {
        setCategory(selectedType);
      }
    });
  });

  // Render awal default ke Kaigo Biru
  setCategory('blue');
});