document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Konfigurasi Kategori Kaigo (Biru & Pink)
  const CATEGORY_CONFIG = {
    blue: {
      label: 'Kaigo Biru',
      folder: 'main',
      prefix: 'main',
      totalBab: 17, // Mendukung hingga Bab 17 (atau 25 bila file ada)
      themeClass: 'theme-blue'
    },
    pink: {
      label: 'Kaigo Pink',
      folder: 'mimin',
      prefix: 'mimin',
      totalBab: 12,
      themeClass: 'theme-pink'
    }
  };

  const urlParams = new URLSearchParams(window.location.search);
  let currentCategory = urlParams.get('type') === 'pink' ? 'pink' : 'blue';
  let currentBab = parseInt(urlParams.get('bab'), 10) || 1;

  // State Flashcard & Belajar
  let rawVocab = [];
  let dokkaiData = null;
  let activeMode = 'flashcard';
  let cardOrientation = 'kanji-first'; // 'kanji-first' atau 'arti-first'
  let studyMode = 'normal';            // 'normal' atau 'no-kanji'
  let showFurigana = true;
  let currentIndex = 0;
  let dokkaiZoom = 1.0;
  let fontScaleBack = 1.0; // Mengontrol khusus font sisi belakang

  // State Kuis
  let quizPool = [];
  let quizIndex = 0;
  let quizScore = 0;
  let answered = false;
  let questionStatus = [];

  // ---------------- 1. STORAGE & PREFERENSI ----------------
  function initPreferences() {
    try {
      const savedScale = localStorage.getItem('kaigo_font_scale_back');
      if (savedScale) {
        fontScaleBack = parseFloat(savedScale);
        if (isNaN(fontScaleBack) || fontScaleBack < 0.7 || fontScaleBack > 1.6) fontScaleBack = 1.0;
      }

      const savedFurigana = localStorage.getItem('kaigo_show_furigana');
      if (savedFurigana !== null) {
        showFurigana = savedFurigana === 'true';
      }

      const savedStudyMode = localStorage.getItem('kaigo_study_mode');
      if (savedStudyMode === 'no-kanji' || savedStudyMode === 'normal') {
        studyMode = savedStudyMode;
      }
    } catch (e) {
      fontScaleBack = 1.0;
    }
    applyFontScaleBack();
    updateModeButtonsUI();
  }

  function setScaleBack(val) {
    fontScaleBack = Math.min(1.6, Math.max(0.7, parseFloat(val.toFixed(2))));
    try { localStorage.setItem('kaigo_font_scale_back', fontScaleBack); } catch (e) {}
    applyFontScaleBack();
  }

  function applyFontScaleBack() {
    document.documentElement.style.setProperty('--font-scale-back', fontScaleBack);
    const resetBtn = $('btnFontReset');
    if (resetBtn) resetBtn.textContent = `${Math.round(fontScaleBack * 100)}%`;
  }

  function showNotice(msg, autoHide = 3000) {
    const n = $('dataNotice');
    if (!n) return;
    n.textContent = msg;
    n.hidden = false;
    if (autoHide) {
      clearTimeout(n._timer);
      n._timer = setTimeout(() => { n.hidden = true; }, autoHide);
    }
  }

  // ---------------- 2. NAVBAR & PANEL BAB (INTERAKTIF & MODERN) ----------------
  const chapterDrawer = $('chapterDrawer');
  const chapterDrawerBackdrop = $('chapterDrawerBackdrop');
  const btnChapterTrigger = $('btnChapterTrigger');
  const btnCloseChapterDrawer = $('btnCloseChapterDrawer');
  const chapterGridContainer = $('chapterGridContainer');
  const drawerCategoryBadge = $('drawerCategoryBadge');
  const currentChapterLabel = $('currentChapterLabel');

  function openChapterDrawer() {
    if (!chapterDrawer) return;
    renderChapterGrid();
    chapterDrawer.hidden = false;
    if (btnChapterTrigger) btnChapterTrigger.setAttribute('aria-expanded', 'true');
  }

  function closeChapterDrawer() {
    if (!chapterDrawer) return;
    chapterDrawer.hidden = true;
    if (btnChapterTrigger) btnChapterTrigger.setAttribute('aria-expanded', 'false');
  }

  function renderChapterGrid() {
    if (!chapterGridContainer) return;
    const config = CATEGORY_CONFIG[currentCategory];
    if (drawerCategoryBadge) drawerCategoryBadge.textContent = config.label;

    let html = '';
    for (let i = 1; i <= config.totalBab; i++) {
      const isActive = i === currentBab;
      html += `
        <button type="button" class="chapter-card-item btn-press ${isActive ? 'active' : ''}" data-bab="${i}" title="${config.label} Bab ${i}">
          <span class="chapter-item-tag">MODUL</span>
          <span class="chapter-item-num">${i}</span>
          <span class="chapter-item-indicator">${isActive ? 'Aktif' : ''}</span>
        </button>
      `;
    }
    chapterGridContainer.innerHTML = html;

    chapterGridContainer.querySelectorAll('.chapter-card-item').forEach(card => {
      card.addEventListener('click', () => {
        const selected = parseInt(card.dataset.bab, 10);
        if (!isNaN(selected)) {
          currentBab = selected;
          updateNavbarBabLabel();
          updateUrl();
          closeChapterDrawer();
          loadData();
        }
      });
    });
  }

  function updateNavbarBabLabel() {
    if (currentChapterLabel) currentChapterLabel.textContent = currentBab;
  }

  function applyCategoryTheme(type) {
    currentCategory = type;
    document.body.classList.remove('theme-blue', 'theme-pink');
    document.body.classList.add(CATEGORY_CONFIG[type].themeClass);

    const btnBlue = $('tabCatBlue');
    const btnPink = $('tabCatPink');
    if (btnBlue) btnBlue.classList.toggle('active', type === 'blue');
    if (btnPink) btnPink.classList.toggle('active', type === 'pink');

    updateNavbarBabLabel();
  }

  const btnBlueTab = $('tabCatBlue');
  if (btnBlueTab) {
    btnBlueTab.addEventListener('click', () => {
      if (currentCategory !== 'blue') {
        currentBab = 1;
        applyCategoryTheme('blue');
        updateUrl();
        loadData();
      }
    });
  }

  const btnPinkTab = $('tabCatPink');
  if (btnPinkTab) {
    btnPinkTab.addEventListener('click', () => {
      if (currentCategory !== 'pink') {
        currentBab = 1;
        applyCategoryTheme('pink');
        updateUrl();
        loadData();
      }
    });
  }

  if (btnChapterTrigger) btnChapterTrigger.addEventListener('click', openChapterDrawer);
  if (btnCloseChapterDrawer) btnCloseChapterDrawer.addEventListener('click', closeChapterDrawer);
  if (chapterDrawerBackdrop) chapterDrawerBackdrop.addEventListener('click', closeChapterDrawer);

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && chapterDrawer && !chapterDrawer.hidden) {
      closeChapterDrawer();
    }
  });

  function updateUrl() {
    const newUrl = `${window.location.pathname}?type=${currentCategory}&bab=${currentBab}`;
    window.history.replaceState({}, '', newUrl);
  }

  // ---------------- 3. SWITCH STUDY MODE & FURIGANA ----------------
  function updateModeButtonsUI() {
    const btnNormal = $('btnModeNormal');
    const btnNoKanji = $('btnModeNoKanji');
    const btnFuri = $('btnToggleFurigana');

    if (btnNormal) btnNormal.classList.toggle('active', studyMode === 'normal');
    if (btnNoKanji) btnNoKanji.classList.toggle('active', studyMode === 'no-kanji');

    if (btnFuri) {
      btnFuri.classList.toggle('active', showFurigana);
      btnFuri.innerHTML = `<span>Furigana: ${showFurigana ? 'ON' : 'OFF'}</span>`;
    }

    const dokkaiBox = $('dokkaiContent');
    if (dokkaiBox) {
      dokkaiBox.classList.toggle('hide-furigana', !showFurigana);
    }
  }

  const btnNormalElem = $('btnModeNormal');
  if (btnNormalElem) {
    btnNormalElem.addEventListener('click', () => {
      studyMode = 'normal';
      try { localStorage.setItem('kaigo_study_mode', 'normal'); } catch (e) {}
      updateModeButtonsUI();
      renderFlashcard();
    });
  }

  const btnNoKanjiElem = $('btnModeNoKanji');
  if (btnNoKanjiElem) {
    btnNoKanjiElem.addEventListener('click', () => {
      studyMode = 'no-kanji';
      try { localStorage.setItem('kaigo_study_mode', 'no-kanji'); } catch (e) {}
      updateModeButtonsUI();
      renderFlashcard();
    });
  }

  const btnToggleFuriElem = $('btnToggleFurigana');
  if (btnToggleFuriElem) {
    btnToggleFuriElem.addEventListener('click', () => {
      showFurigana = !showFurigana;
      try { localStorage.setItem('kaigo_show_furigana', showFurigana); } catch (e) {}
      updateModeButtonsUI();
      renderFlashcard();
    });
  }

  const btnFontIncElem = $('btnFontInc');
  if (btnFontIncElem) btnFontIncElem.addEventListener('click', () => setScaleBack(fontScaleBack + 0.1));

  const btnFontDecElem = $('btnFontDec');
  if (btnFontDecElem) btnFontDecElem.addEventListener('click', () => setScaleBack(fontScaleBack - 0.1));

  const btnFontResetElem = $('btnFontReset');
  if (btnFontResetElem) btnFontResetElem.addEventListener('click', () => setScaleBack(1.0));

  // ---------------- 4. FLASHCARD ENGINE ----------------
  function renderFlashcard() {
    const card = $('flashcard');
    if (!card) return;
    card.classList.remove('is-flipped');

    if (!rawVocab.length) {
      if ($('frontText'))$('frontText').textContent = 'Kosakata Kosong';
      if ($('frontFurigana'))$('frontFurigana').textContent = '';
      if ($('cardCounter'))$('cardCounter').textContent = '0 / 0';
      if ($('backMainText'))$('backMainText').textContent = '-';
      return;
    }

    const item = rawVocab[currentIndex];
    if ($('cardCounter'))$('cardCounter').textContent = `${currentIndex + 1} / ${rawVocab.length}`;

    const frontFuri = $('frontFurigana');
    const frontText = $('frontText');
    const backFuri = $('backFurigana');
    const backMain = $('backMainText');

    if (cardOrientation === 'kanji-first') {
      // DEPAN: JEPANG, BELAKANG: ARTI BAHASA INDONESIA MURNI
      if ($('frontLabel'))$('frontLabel').textContent = studyMode === 'no-kanji' ? 'CARA BACA (KANA)' : 'KOSAKATA JEPANG';
      if ($('backLabel'))$('backLabel').textContent = 'ARTI BAHASA INDONESIA';

      if (studyMode === 'no-kanji') {
        if (frontFuri) {
          frontFuri.textContent = '';
          frontFuri.classList.remove('hidden-furigana');
        }
        if (frontText) frontText.textContent = item.furigana;
      } else {
        const hasDiff = item.furigana && item.furigana !== item.kanji;
        if (frontFuri) {
          frontFuri.textContent = hasDiff ? item.furigana : '';
          frontFuri.classList.toggle('hidden-furigana', !showFurigana);
        }
        if (frontText) frontText.textContent = item.kanji;
      }

      if (backFuri) backFuri.textContent = '';
      if (backMain) backMain.textContent = item.arti;
    } else {
      // DEPAN: ARTI, BELAKANG: JEPANG
      if ($('frontLabel'))$('frontLabel').textContent = 'ARTI BAHASA INDONESIA';
      if ($('backLabel'))$('backLabel').textContent = studyMode === 'no-kanji' ? 'CARA BACA (KANA)' : 'KOSAKATA JEPANG';

      if (frontFuri) {
        frontFuri.textContent = '';
        frontFuri.classList.remove('hidden-furigana');
      }
      if (frontText) frontText.textContent = item.arti;

      if (studyMode === 'no-kanji') {
        if (backFuri) backFuri.textContent = '';
        if (backMain) backMain.textContent = item.furigana;
      } else {
        const hasDiff = item.furigana && item.furigana !== item.kanji;
        if (backFuri) backFuri.textContent = showFurigana && hasDiff ? item.furigana : '';
        if (backMain) backMain.textContent = item.kanji;
      }
    }
  }

  function toggleFlip() {
    const card = $('flashcard');
    if (card) card.classList.toggle('is-flipped');
  }

  function nextCard() {
    if (!rawVocab.length) return;
    currentIndex = (currentIndex + 1) % rawVocab.length;
    renderFlashcard();
  }

  function prevCard() {
    if (!rawVocab.length) return;
    currentIndex = (currentIndex - 1 + rawVocab.length) % rawVocab.length;
    renderFlashcard();
  }

  function shuffleFlashcards() {
    if (rawVocab.length < 2) return;
    for (let i = rawVocab.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rawVocab[i], rawVocab[j]] = [rawVocab[j], rawVocab[i]];
    }
    currentIndex = 0;
    renderFlashcard();
    showNotice('Urutan kartu berhasil diacak!');
  }

  const fcElem = $('flashcard');
  if (fcElem) fcElem.addEventListener('click', toggleFlip);

  const btnNextElem = $('btnNext');
  if (btnNextElem) btnNextElem.addEventListener('click', nextCard);

  const btnPrevElem = $('btnPrev');
  if (btnPrevElem) btnPrevElem.addEventListener('click', prevCard);

  const btnShuffleElem = $('btnShuffle');
  if (btnShuffleElem) btnShuffleElem.addEventListener('click', shuffleFlashcards);

  const btnKanjiFirstElem = $('btnKanjiFirst');
  if (btnKanjiFirstElem) {
    btnKanjiFirstElem.addEventListener('click', () => {
      cardOrientation = 'kanji-first';
      btnKanjiFirstElem.classList.add('active');
      if ($('btnArtiFirst'))$('btnArtiFirst').classList.remove('active');
      renderFlashcard();
    });
  }

  const btnArtiFirstElem = $('btnArtiFirst');
  if (btnArtiFirstElem) {
    btnArtiFirstElem.addEventListener('click', () => {
      cardOrientation = 'arti-first';
      btnArtiFirstElem.classList.add('active');
      if ($('btnKanjiFirst'))$('btnKanjiFirst').classList.remove('active');
      renderFlashcard();
    });
  }

  // Navigasi Keyboard
  window.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (activeMode === 'flashcard') {
      if (e.code === 'Space') { e.preventDefault(); toggleFlip(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); nextCard(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); prevCard(); }
    }
  });

  // Swipe Geser pada HP
  let touchStartX = 0;
  if (fcElem) {
    fcElem.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    fcElem.addEventListener('touchend', e => {
      const touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) nextCard();
      if (touchEndX - touchStartX > 50) prevCard();
    }, { passive: true });
  }

  // ---------------- 5. PENCARIAN ----------------
  const searchModal = $('searchModal');
  const searchBackdrop = $('searchBackdrop');
  const btnSearchTrigger = $('btnSearchTrigger');
  const btnCloseSearch = $('btnCloseSearch');
  const searchInput = $('navbarSearchInput');
  const searchDropdown = $('searchDropdown');
  const btnClearSearch = $('btnClearSearch');

  function openSearch() {
    if (!searchModal) return;
    searchModal.hidden = false;
    if (searchInput) searchInput.value = '';
    if (searchDropdown) searchDropdown.innerHTML = '<div class="search-empty">Ketik untuk mulai mencari kosakata</div>';
    if (btnClearSearch) btnClearSearch.hidden = true;
    setTimeout(() => { if (searchInput) searchInput.focus(); }, 80);
  }

  function closeSearch() {
    if (!searchModal) return;
    searchModal.hidden = true;
    if (searchInput) searchInput.value = '';
    if (searchDropdown) searchDropdown.innerHTML = '';
    if (btnClearSearch) btnClearSearch.hidden = true;
  }

  if (btnSearchTrigger) btnSearchTrigger.addEventListener('click', openSearch);
  if (btnCloseSearch) btnCloseSearch.addEventListener('click', closeSearch);
  if (searchBackdrop) searchBackdrop.addEventListener('click', closeSearch);

  function renderSearchList() {
    if (!searchInput || !searchDropdown) return;
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      searchDropdown.innerHTML = '<div class="search-empty">Ketik untuk mulai mencari kosakata</div>';
      if (btnClearSearch) btnClearSearch.hidden = true;
      return;
    }

    if (btnClearSearch) btnClearSearch.hidden = false;
    const matches = rawVocab.filter(v =>
      (v.kanji && v.kanji.toLowerCase().includes(q)) ||
      (v.furigana && v.furigana.toLowerCase().includes(q)) ||
      (v.arti && v.arti.toLowerCase().includes(q))
    );

    if (matches.length === 0) {
      searchDropdown.innerHTML = '<div class="search-empty">Tidak ada kosakata yang cocok</div>';
    } else {
      searchDropdown.innerHTML = matches.slice(0, 15).map(item => {
        const itemIdx = rawVocab.findIndex(v => v.id === item.id);
        const displayWord = studyMode === 'no-kanji' ? item.furigana : item.kanji;
        const subReading = studyMode === 'normal' && item.furigana !== item.kanji ? item.furigana : '';
        return `
          <div class="search-item" data-index="${itemIdx}">
            <div class="search-item-left">
              <span class="search-item-kanji">${esc(displayWord)}</span>
              ${subReading ? `<span class="search-item-sub">${esc(subReading)}</span>` : ''}
            </div>
            <span class="search-item-arti">${esc(item.arti)}</span>
          </div>
        `;
      }).join('');

      searchDropdown.querySelectorAll('.search-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.index, 10);
          if (!isNaN(idx)) {
            currentIndex = idx;
            setMode('flashcard');
            renderFlashcard();
            closeSearch();
          }
        });
      });
    }
  }

  if (searchInput) searchInput.addEventListener('input', renderSearchList);
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      searchDropdown.innerHTML = '<div class="search-empty">Ketik untuk mulai mencari kosakata</div>';
      btnClearSearch.hidden = true;
      searchInput.focus();
    });
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && searchModal && !searchModal.hidden) closeSearch();
  });

  // ---------------- 6. KUIS ENGINE (MC & TYPING) ----------------
  function shuffle(arr) {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
  }

  function startQuiz(type) {
    if (rawVocab.length < 4) {
      showNotice('Minimal 4 kosakata untuk kuis.');
      setMode('flashcard');
      return;
    }

    quizPool = shuffle(rawVocab);
    quizIndex = 0;
    quizScore = 0;
    answered = false;
    questionStatus = new Array(quizPool.length).fill('pending');

    if (type === 'mc') runMC();
    else if (type === 'typing') runTyping();
  }

  function renderTracker(containerId) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = '';

    quizPool.forEach((_, i) => {
      const b = document.createElement('div');
      b.className = 'q-badge';
      b.textContent = i + 1;

      if (i === quizIndex) b.classList.add('current');
      else if (questionStatus[i] === 'correct') b.classList.add('correct');
      else if (questionStatus[i] === 'wrong') b.classList.add('wrong');

      container.appendChild(b);
    });

    const activeBadge = container.querySelector('.q-badge.current');
    if (activeBadge) {
      activeBadge.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  function showResult(score, total) {
    if ($('view-mc'))$('view-mc').classList.remove('active');
    if ($('view-typing'))$('view-typing').classList.remove('active');
    if ($('view-result'))$('view-result').classList.add('active');

    const pct = Math.round((score / total) * 100);
    if ($('resultScoreText'))$('resultScoreText').textContent = `Skor: ${score} / ${total}`;
    if ($('resultPercent'))$('resultPercent').textContent = `${pct}%`;
    if ($('resultRing'))$('resultRing').style.setProperty('--pct', pct);
  }

  // MC
  function runMC() {
    if (quizIndex >= quizPool.length) return showResult(quizScore, quizPool.length);

    renderTracker('mcTracker');
    if ($('mcCounter'))$('mcCounter').textContent = `Soal ${quizIndex + 1} / ${quizPool.length}`;
    if ($('mcScore'))$('mcScore').textContent = quizScore;
    if ($('mcFeedback'))$('mcFeedback').textContent = '';
    if ($('btnMcNext'))$('btnMcNext').disabled = true;
    answered = false;

    const q = quizPool[quizIndex];
    const displayQuestion = studyMode === 'no-kanji' ? q.furigana : q.kanji;
    const subQuestion = studyMode === 'normal' && showFurigana && q.furigana !== q.kanji ? q.furigana : '';

    if ($('mcQuestionText'))$('mcQuestionText').textContent = displayQuestion;
    if ($('mcQuestionSub'))$('mcQuestionSub').textContent = subQuestion;

    const wrongs = shuffle(rawVocab.filter(v => v.id !== q.id && v.arti !== q.arti)).slice(0, 3);
    const opts = shuffle([q, ...wrongs]);

    const box = $('mcOptions');
    if (!box) return;
    box.innerHTML = '';

    opts.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn-option btn-press';
      btn.dataset.key = ['A', 'B', 'C', 'D'][i];
      btn.textContent = item.arti;

      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;

        box.querySelectorAll('.btn-option').forEach(b => {
          b.disabled = true;
          if (b.textContent === q.arti) b.classList.add('correct');
        });

        if (item.id === q.id) {
          quizScore++;
          questionStatus[quizIndex] = 'correct';
          if ($('mcFeedback')) {
            $('mcFeedback').textContent = 'Benar!';$('mcFeedback').className = 'feedback-text correct';
          }
        } else {
          questionStatus[quizIndex] = 'wrong';
          btn.classList.add('wrong');
          if ($('mcFeedback')) {
            $('mcFeedback').textContent = 'Salah!';$('mcFeedback').className = 'feedback-text wrong';
          }
        }

        renderTracker('mcTracker');
        if ($('mcScore'))$('mcScore').textContent = quizScore;
        if ($('btnMcNext')) {$('btnMcNext').disabled = false;
          $('btnMcNext').focus();
        }
      });

      box.appendChild(btn);
    });
  }

  const btnMcNextElem = $('btnMcNext');
  if (btnMcNextElem) {
    btnMcNextElem.addEventListener('click', () => {
      quizIndex++;
      runMC();
    });
  }

  // Typing
  const normalize = s => s.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();

  function runTyping() {
    if (quizIndex >= quizPool.length) return showResult(quizScore, quizPool.length);

    renderTracker('typingTracker');
    if ($('typingCounter'))$('typingCounter').textContent = `Soal ${quizIndex + 1} / ${quizPool.length}`;
    if ($('typingScore'))$('typingScore').textContent = quizScore;
    if ($('typingFeedback'))$('typingFeedback').textContent = '';
    if ($('btnTypingNext'))$('btnTypingNext').disabled = true;
    answered = false;

    const q = quizPool[quizIndex];
    const displayQuestion = studyMode === 'no-kanji' ? q.furigana : q.kanji;
    const subQuestion = studyMode === 'normal' && showFurigana && q.furigana !== q.kanji ? q.furigana : '';

    if ($('typingQuestionText'))$('typingQuestionText').textContent = displayQuestion;
    if ($('typingQuestionSub'))$('typingQuestionSub').textContent = subQuestion;

    const inp = $('typingInput');
    if (inp) {
      inp.value = '';
      inp.disabled = false;
      inp.className = 'typing-field';
      setTimeout(() => inp.focus(), 60);
    }
  }

  function checkTyping() {
    if (answered) return;
    const inp = $('typingInput');
    if (!inp) return;
    const answer = normalize(inp.value);
    if (!answer) return;

    answered = true;
    inp.disabled = true;

    const q = quizPool[quizIndex];
    const targets = [normalize(q.arti), ...q.arti.split(/[\/,]/).map(normalize)].filter(Boolean);

    if (targets.includes(answer)) {
      quizScore++;
      questionStatus[quizIndex] = 'correct';
      inp.classList.add('correct');
      if ($('typingFeedback')) {
        $('typingFeedback').textContent = 'Benar!';$('typingFeedback').className = 'feedback-text correct';
      }
    } else {
      questionStatus[quizIndex] = 'wrong';
      inp.classList.add('wrong');
      if ($('typingFeedback')) {$('typingFeedback').textContent = `Jawaban: ${q.arti}`;
        $('typingFeedback').className = 'feedback-text wrong';
      }
    }

    renderTracker('typingTracker');
    if ($('typingScore'))$('typingScore').textContent = quizScore;
    if ($('btnTypingNext')) {$('btnTypingNext').disabled = false;
      $('btnTypingNext').focus();
    }
  }

  const btnTypingCheckElem = $('btnTypingCheck');
  if (btnTypingCheckElem) btnTypingCheckElem.addEventListener('click', checkTyping);

  const typingInputElem = $('typingInput');
  if (typingInputElem) {
    typingInputElem.addEventListener('keydown', e => {
      if (e.key === 'Enter') checkTyping();
    });
  }

  const btnTypingNextElem = $('btnTypingNext');
  if (btnTypingNextElem) {
    btnTypingNextElem.addEventListener('click', () => {
      quizIndex++;
      runTyping();
    });
  }

  const btnRetryElem = $('btnRetryQuiz');
  if (btnRetryElem) btnRetryElem.addEventListener('click', () => startQuiz(activeMode));

  const btnBackCardsElem = $('btnBackToCards');
  if (btnBackCardsElem) btnBackCardsElem.addEventListener('click', () => setMode('flashcard'));

  // ---------------- 7. DOKKAI ENGINE SESUAI JSON ----------------
  function renderDokkai() {
    const box = $('dokkaiContent');
    const title = $('dokkaiTitle');

    if (!dokkaiData || (!dokkaiData.text && !dokkaiData.content)) {
      if (title) title.textContent = '介護記録 · 読解';
      if (box) box.innerHTML = '<p style="color:var(--dim); text-align:center; padding:20px;">Dokkai belum tersedia untuk bab ini.</p>';
      return;
    }

    if (title) title.textContent = dokkaiData.title || `介護記録 · Dokkai Bab ${currentBab}`;

    if (box) {
      box.innerHTML = dokkaiData.text || dokkaiData.content || '';
      box.classList.toggle('hide-furigana', !showFurigana);

      // Event klik kata target untuk menampilkan popup notifikasi arti
      box.querySelectorAll('.kaigo-target-kw').forEach(el => {
        el.addEventListener('click', () => {
          let kanjiText = el.querySelector('ruby')
            ? el.querySelector('ruby').childNodes[0].textContent.trim()
            : el.textContent.trim();
          const found = rawVocab.find(v => v.kanji === kanjiText || v.furigana === kanjiText);
          if (found) {
            showNotice(`[${found.kanji}] ${found.furigana} : ${found.arti}`);
          }
        });
      });
    }
  }

  const btnDokkaiInElem = $('btnDokkaiIn');
  if (btnDokkaiInElem) {
    btnDokkaiInElem.addEventListener('click', () => {
      if (dokkaiZoom < 1.6) {
        dokkaiZoom += 0.1;
        if ($('dokkaiContent'))$('dokkaiContent').style.fontSize = `${1.22 * dokkaiZoom}rem`;
        if ($('dokkaiZoomVal'))$('dokkaiZoomVal').textContent = `${Math.round(dokkaiZoom * 100)}%`;
      }
    });
  }

  const btnDokkaiOutElem = $('btnDokkaiOut');
  if (btnDokkaiOutElem) {
    btnDokkaiOutElem.addEventListener('click', () => {
      if (dokkaiZoom > 0.8) {
        dokkaiZoom -= 0.1;
        if ($('dokkaiContent'))$('dokkaiContent').style.fontSize = `${1.22 * dokkaiZoom}rem`;
        if ($('dokkaiZoomVal'))$('dokkaiZoomVal').textContent = `${Math.round(dokkaiZoom * 100)}%`;
      }
    });
  }

  // ---------------- 8. GANTI MODE NAV DOCK ----------------
  function setMode(mode) {
    activeMode = mode;
    document.querySelectorAll('.dock-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    if ($('view-flashcard'))$('view-flashcard').classList.toggle('active', mode === 'flashcard');
    if ($('view-mc'))$('view-mc').classList.toggle('active', mode === 'mc');
    if ($('view-typing'))$('view-typing').classList.toggle('active', mode === 'typing');
    if ($('view-dokkai'))$('view-dokkai').classList.toggle('active', mode === 'dokkai');
    if ($('view-result'))$('view-result').classList.toggle('active', false);

    if (mode === 'flashcard') renderFlashcard();
    else if (mode === 'dokkai') renderDokkai();
    else startQuiz(mode);
  }

  document.querySelectorAll('.dock-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // ---------------- 9. LOAD DATA JSON ----------------
  async function loadData() {
    const config = CATEGORY_CONFIG[currentCategory];
    if ($('frontText'))$('frontText').textContent = 'Memuat...';

    const paths = [
      `../${config.folder}/${config.prefix}${currentBab}.json`,
      `../../${config.folder}/${config.prefix}${currentBab}.json`,
      `../../Bab/${config.folder}/${config.prefix}${currentBab}.json`
    ];

    let data = null;
    for (const p of paths) {
      try {
        const res = await fetch(p, { cache: 'no-cache' });
        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch (e) {}
    }

    if (data) {
      const list = Array.isArray(data) ? data : (data.vocab || Object.values(data).find(Array.isArray) || []);
      rawVocab = list.map((v, i) => ({
        id: i,
        kanji: v.kanji || v.furigana || v.jepang || '',
        furigana: v.furigana || v.kanji || v.jepang || '',
        arti: v.arti || v.indonesia || ''
      }));
      dokkaiData = data.dokkai || null;
      currentIndex = 0;
      renderFlashcard();
      if (activeMode === 'dokkai') renderDokkai();
    } else {
      rawVocab = [];
      dokkaiData = null;
      renderFlashcard();
      if ($('frontText'))$('frontText').textContent = 'File Belum Tersedia';
      showNotice(`Gagal memuat ${config.prefix}${currentBab}.json pada ${config.label}.`);
    }
  }

  // Inisialisasi awal
  initPreferences();
  applyCategoryTheme(currentCategory);
  updateNavbarBabLabel();
  loadData();
});