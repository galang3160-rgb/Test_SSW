document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const urlParams = new URLSearchParams(window.location.search);
  const currentBab = urlParams.get('bab') || '1';

  let rawVocab = [];
  let dokkaiData = null;
  let activeMode = 'flashcard';
  let cardOrientation = 'kanji-first';
  let currentIndex = 0;
  let dokkaiZoom = 1.0;

  // State Kuis & Tracking
  let quizPool = [];
  let quizIndex = 0;
  let quizScore = 0;
  let answered = false;
  let questionStatus = [];

  function showNotice(msg, autoHide = 3000) {
    const n = $('dataNotice');
    if (!n) return;
    n.textContent = msg;
    n.hidden = false;
    if (autoHide) setTimeout(() => { n.hidden = true; }, autoHide);
  }

  // ---------------- GANTI MODE ----------------
  function setMode(mode) {
    activeMode = mode;
    document.querySelectorAll('.dock-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    $('view-flashcard').classList.toggle('active', mode === 'flashcard');
    $('view-mc').classList.toggle('active', mode === 'mc');$('view-typing').classList.toggle('active', mode === 'typing');
    $('view-dokkai').classList.toggle('active', mode === 'dokkai');$('view-result').classList.toggle('active', false);

    if (mode === 'flashcard') renderFlashcard();
    else if (mode === 'dokkai') renderDokkai();
    else startQuiz(mode);
  }

  document.querySelectorAll('.dock-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // ---------------- 1. FLASHCARD ENGINE ----------------
  function renderFlashcard() {
    const card = $('flashcard');
    if (!card) return;
    card.classList.remove('is-flipped');

    if (!rawVocab.length) {
      $('frontText').textContent = 'Kosakata Kosong';$('cardCounter').textContent = '0 / 0';
      return;
    }

    const item = rawVocab[currentIndex];
    $('cardCounter').textContent = `${currentIndex + 1} / ${rawVocab.length}`;

    if (cardOrientation === 'kanji-first') {
      $('frontLabel').textContent = 'KANJI';$('frontText').textContent = item.kanji || item.furigana;

      $('backLabel').textContent = 'CARA BACA & ARTI';$('backSubReading').textContent = item.furigana !== item.kanji ? item.furigana : '';
      $('backTranslation').textContent = item.arti;
    } else {
      $('frontLabel').textContent = 'ARTI INDONESIA';$('frontText').textContent = item.arti;

      $('backLabel').textContent = 'BAHASA JEPANG';$('backSubReading').textContent = item.kanji;
      $('backTranslation').textContent = item.furigana;
    }
  }

  function toggleFlip() {
    const card = $('flashcard');
    if (card) {
      card.classList.toggle('is-flipped');
    }
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

  $('flashcard').addEventListener('click', toggleFlip);$('btnNext').addEventListener('click', nextCard);
  $('btnPrev').addEventListener('click', prevCard);$('btnShuffle').addEventListener('click', shuffleFlashcards);

  $('btnKanjiFirst').addEventListener('click', () => {
    cardOrientation = 'kanji-first';
    $('btnKanjiFirst').classList.add('active');$('btnArtiFirst').classList.remove('active');
    renderFlashcard();
  });

  $('btnArtiFirst').addEventListener('click', () => {
    cardOrientation = 'arti-first';
    $('btnArtiFirst').classList.add('active');$('btnKanjiFirst').classList.remove('active');
    renderFlashcard();
  });

  // Navigasi Keyboard
  window.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (activeMode === 'flashcard') {
      if (e.code === 'Space') {
        e.preventDefault();
        toggleFlip();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        nextCard();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prevCard();
      }
    }
  });

  // Swipe Geser pada HP
  let touchStartX = 0;
  const cardElem = $('flashcard');
  cardElem.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  cardElem.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > 50) nextCard();
    if (touchEndX - touchStartX > 50) prevCard();
  }, { passive: true });

  // ---------------- 2. MODAL PENCARIAN ELEGAN ----------------
  const searchModal = $('searchModal');
  const searchBackdrop = $('searchBackdrop');
  const btnSearchTrigger = $('btnSearchTrigger');
  const btnCloseSearch = $('btnCloseSearch');
  const searchInput = $('navbarSearchInput');
  const searchDropdown = $('searchDropdown');
  const btnClearSearch = $('btnClearSearch');

  function openSearch() {
    searchModal.hidden = false;
    searchInput.value = '';
    searchDropdown.innerHTML = '<div class="search-empty">Ketik untuk mulai mencari kosakata</div>';
    btnClearSearch.hidden = true;
    setTimeout(() => searchInput.focus(), 80);
  }

  function closeSearch() {
    searchModal.hidden = true;
    searchInput.value = '';
    searchDropdown.innerHTML = '';
    btnClearSearch.hidden = true;
  }

  btnSearchTrigger.addEventListener('click', openSearch);
  btnCloseSearch.addEventListener('click', closeSearch);
  searchBackdrop.addEventListener('click', closeSearch);

  function renderSearchList() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      searchDropdown.innerHTML = '<div class="search-empty">Ketik untuk mulai mencari kosakata</div>';
      btnClearSearch.hidden = true;
      return;
    }

    btnClearSearch.hidden = false;
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
        const subReading = item.furigana && item.furigana !== item.kanji ? item.furigana : '';
        return `
          <div class="search-item" data-index="${itemIdx}">
            <div class="search-item-left">
              <span class="search-item-kanji">${esc(item.kanji)}</span>
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

  searchInput.addEventListener('input', renderSearchList);
  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchDropdown.innerHTML = '<div class="search-empty">Ketik untuk mulai mencari kosakata</div>';
    btnClearSearch.hidden = true;
    searchInput.focus();
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !searchModal.hidden) {
      closeSearch();
    }
  });

  // ---------------- 3. QUIZ & TRACKER NOMOR SOAL ----------------
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

      if (i === quizIndex) {
        b.classList.add('current');
      } else if (questionStatus[i] === 'correct') {
        b.classList.add('correct');
      } else if (questionStatus[i] === 'wrong') {
        b.classList.add('wrong');
      }

      container.appendChild(b);
    });

    const activeBadge = container.querySelector('.q-badge.current');
    if (activeBadge) {
      activeBadge.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  function showResult(score, total) {
    $('view-mc').classList.remove('active');
    $('view-typing').classList.remove('active');$('view-result').classList.add('active');

    const pct = Math.round((score / total) * 100);
    $('resultScoreText').textContent = `Skor: ${score} / ${total}`;
    $('resultPercent').textContent = `${pct}%`;
    $('resultRing').style.setProperty('--pct', pct);
  }

  // MC Logic
  function runMC() {
    if (quizIndex >= quizPool.length) return showResult(quizScore, quizPool.length);

    renderTracker('mcTracker');
    $('mcCounter').textContent = `Soal ${quizIndex + 1} / ${quizPool.length}`;
    $('mcScore').textContent = quizScore;
    $('mcFeedback').textContent = '';$('btnMcNext').disabled = true;
    answered = false;

    const q = quizPool[quizIndex];
    $('mcQuestionText').textContent = q.kanji;
    $('mcQuestionSub').textContent = q.furigana !== q.kanji ? q.furigana : '';

    const wrongs = shuffle(rawVocab.filter(v => v.id !== q.id && v.arti !== q.arti)).slice(0, 3);
    const opts = shuffle([q, ...wrongs]);

    const box = $('mcOptions');
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
          $('mcFeedback').textContent = 'Benar!';$('mcFeedback').className = 'feedback-text correct';
        } else {
          questionStatus[quizIndex] = 'wrong';
          btn.classList.add('wrong');
          $('mcFeedback').textContent = 'Salah!';$('mcFeedback').className = 'feedback-text wrong';
        }

        renderTracker('mcTracker');
        $('mcScore').textContent = quizScore;
        $('btnMcNext').disabled = false;
        $('btnMcNext').focus();
      });

      box.appendChild(btn);
    });
  }

  $('btnMcNext').addEventListener('click', () => {
    quizIndex++;
    runMC();
  });

  // Typing Logic
  const normalize = s => s.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();

  function runTyping() {
    if (quizIndex >= quizPool.length) return showResult(quizScore, quizPool.length);

    renderTracker('typingTracker');
    $('typingCounter').textContent = `Soal ${quizIndex + 1} / ${quizPool.length}`;
    $('typingScore').textContent = quizScore;
    $('typingFeedback').textContent = '';$('btnTypingNext').disabled = true;
    answered = false;

    const q = quizPool[quizIndex];
    $('typingQuestionText').textContent = q.kanji;
    $('typingQuestionSub').textContent = q.furigana !== q.kanji ? q.furigana : '';

    const inp = $('typingInput');
    inp.value = '';
    inp.disabled = false;
    inp.className = 'typing-field';
    setTimeout(() => inp.focus(), 60);
  }

  function checkTyping() {
    if (answered) return;
    const inp = $('typingInput');
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
      $('typingFeedback').textContent = 'Benar!';$('typingFeedback').className = 'feedback-text correct';
    } else {
      questionStatus[quizIndex] = 'wrong';
      inp.classList.add('wrong');
      $('typingFeedback').textContent = `Jawaban: ${q.arti}`;
      $('typingFeedback').className = 'feedback-text wrong';
    }

    renderTracker('typingTracker');
    $('typingScore').textContent = quizScore;
    $('btnTypingNext').disabled = false;
    $('btnTypingNext').focus();
  }

  $('btnTypingCheck').addEventListener('click', checkTyping);
  $('typingInput').addEventListener('keydown', e => {     if (e.key === 'Enter') checkTyping();   });$('btnTypingNext').addEventListener('click', () => {
    quizIndex++;
    runTyping();
  });

  $('btnRetryQuiz').addEventListener('click', () => startQuiz(activeMode));$('btnBackToCards').addEventListener('click', () => setMode('flashcard'));

  // ---------------- 4. DOKKAI ENGINE ----------------
  function renderDokkai() {
    const box = $('dokkaiContent');
    const title = $('dokkaiTitle');

    if (!dokkaiData || !dokkaiData.text) {
      title.textContent = '介護記録 · 読解';
      box.innerHTML = '<p style="color:var(--dim); text-align:center;">Dokkai belum tersedia untuk bab ini.</p>';
      return;
    }

    title.textContent = dokkaiData.title || '介護記録 · 読解';
    box.innerHTML = dokkaiData.text;

    box.querySelectorAll('.kaigo-target-kw').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.textContent.trim();
        const found = rawVocab.find(v => v.kanji === k);
        if (found) {
          showNotice(`[${found.kanji}] ${found.furigana} : ${found.arti}`);
        }
      });
    });
  }

  $('btnDokkaiIn').addEventListener('click', () => {
    if (dokkaiZoom < 1.7) {
      dokkaiZoom += 0.15;
      $('dokkaiContent').style.fontSize = `${1.2 * dokkaiZoom}rem`;
      $('dokkaiZoomVal').textContent = `${Math.round(dokkaiZoom * 100)}%`;
    }
  });

  $('btnDokkaiOut').addEventListener('click', () => {
    if (dokkaiZoom > 0.8) {
      dokkaiZoom -= 0.15;
      $('dokkaiContent').style.fontSize = `${1.2 * dokkaiZoom}rem`;
      $('dokkaiZoomVal').textContent = `${Math.round(dokkaiZoom * 100)}%`;
    }
  });

  // ---------------- LOAD DATA JSON ----------------
  async function loadData() {
    $('chapterHeading').textContent = `Bab ${currentBab}`;
    const paths = [
      `../main/main${currentBab}.json`,
      `../../Bab/main/main${currentBab}.json`
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
    } else {
      $('frontText').textContent = `Bab ${currentBab} Tidak Ditemukan`;
    }
  }

  loadData();
});