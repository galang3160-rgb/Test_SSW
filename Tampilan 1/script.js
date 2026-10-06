/**
 * NAKAMA GAKKOU — SSW KAIGO INTERACTIVE LEARNING ENGINE
 * Memuat data dinamis dari: Bab/main/main[n].json
 */

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  
  const shuffle = a => {
    const r = [...a];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };

  const CARD_MODE_KEY = 'nihonggo:kaigo_card_mode';
  const CARD_SIZE_KEY = 'nihonggo:kaigo_card_size';

  // ---------- STATE UTAMA ----------
  let currentBabNum = '1';
  let rawChapterVocab = [];
  let rawChapterDokkai = null;
  let activeVocab = [];
  let mode = 'carousel';
  let cardOrientation = 'kanji-first';
  let cardSize = 'normal';
  let audioOn = true;
  let vocabZoomRem = 3.4;

  // Baca Mode dan Ukuran Tersimpan
  try {
    const savedMode = localStorage.getItem(CARD_MODE_KEY);
    if (savedMode === 'arti-first' || savedMode === 'kanji-first') cardOrientation = savedMode;
    const savedSize = localStorage.getItem(CARD_SIZE_KEY);
    if (savedSize === 'compact' || savedSize === 'normal' || savedSize === 'large') cardSize = savedSize;
  } catch (e) {}

  // Kuis State
  let quizPool = [], qi = 0, qScore = 0, answered = false, runId = 0;

  // ---------- AUDIO SYNTHESIZER ----------
  let actx = null;
  const TONES = {
    pop: ['sine', 600, 300, 0.1, 0.12],
    correct: ['sine', 600, 1200, 0.2, 0.2],
    wrong: ['sawtooth', 300, 150, 0.2, 0.15],
    flip: ['sine', 400, 200, 0.08, 0.08],
    win: ['triangle', 523, 1046, 0.4, 0.2]
  };

  function playTone(type) {
    if (!audioOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const [wave, f1, f2, dur, vol] = TONES[type];
      const now = actx.currentTime;
      const osc = actx.createOscillator();
      const gain = actx.createGain();

      osc.type = wave;
      osc.frequency.setValueAtTime(f1, now);
      osc.frequency.exponentialRampToValueAtTime(f2, now + dur * 0.6);

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch (e) {}
  }

  // ---------- MOUSE TRAIL EFFECT CANVAS ----------
  const canvas = $('mouseTrail');
  if (canvas) {
    const cctx = canvas.getContext('2d');
    let particles = [];
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    if (!isTouchDevice) {
      window.addEventListener('mousemove', e => {
        for (let i = 0; i < 3; i++) {
          particles.push({
            x: e.clientX,
            y: e.clientY,
            vx: (Math.random() - 0.5) * 1.8,
            vy: (Math.random() - 0.5) * 1.8,
            size: Math.random() * 4 + 2,
            alpha: 0.8,
            color: Math.random() > 0.35 ? '#10B981' : '#34D399'
          });
        }
      });

      (function renderParticles() {
        cctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          cctx.save();
          cctx.globalAlpha = p.alpha;
          cctx.beginPath();
          cctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          cctx.fillStyle = p.color;
          cctx.shadowBlur = 8;
          cctx.shadowColor = '#10B981';
          cctx.fill();
          cctx.restore();

          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.028;
          p.size = Math.max(0, p.size - 0.07);
          if (p.alpha <= 0) particles.splice(i, 1);
        }
        requestAnimationFrame(renderParticles);
      })();
    }
  }

  // ---------- NOTIFIKASI STATUS DATA ----------
  let noticeTimer = null;
  function showNotice(msg, autoHide = 0) {
    const n = $('dataNotice');
    if (!n) return;
    clearTimeout(noticeTimer);
    n.textContent = msg;
    n.hidden = false;
    if (autoHide) noticeTimer = setTimeout(() => { n.hidden = true; }, autoHide);
  }
  const hideNotice = () => {
    const n = $('dataNotice');
    if (n) { clearTimeout(noticeTimer); n.hidden = true; }
  };

  // ---------- PENCARIAN KOSAKATA ----------
  const searchInput = $('searchInput');
  const btnClearSearch = $('btnClearSearch');

  function applySearchFilter() {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (btnClearSearch) btnClearSearch.hidden = !query;

    if (!query) {
      activeVocab = [...rawChapterVocab];
    } else {
      activeVocab = rawChapterVocab.filter(item => {
        const arti = (item.arti || '').toLowerCase();
        const furigana = (item.furigana || '').toLowerCase();
        const kanji = (item.kanji || '').toLowerCase();
        return arti.includes(query) || furigana.includes(query) || kanji.includes(query);
      });
    }

    if (mode === 'carousel') {
      Carousel.render();
    } else if (mode === 'dokkai') {
      renderDokkai();
    } else {
      startQuiz(mode);
    }

    if (query && activeVocab.length === 0) {
      showNotice(`Tidak ada kosakata yang cocok dengan "${query}".`);
    } else {
      hideNotice();
    }
  }

  if (searchInput) searchInput.addEventListener('input', applySearchFilter);
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      applySearchFilter();
      searchInput.focus();
    });
  }

  // ---------- FLASHCARD ENGINE ----------
  const Carousel = {
    index: 0,
    render() {
      const container = $('carouselContainer');
      if (!container) return;
      container.innerHTML = '';

      if (!activeVocab.length) {
        if ($('carouselCounter'))$('carouselCounter').textContent = '0 / 0';
        container.innerHTML = `
          <div class="chapter-flashcard center">
            <div class="carousel-card-inner">
              <div class="carousel-face front">
                <span class="c-tag">Status</span>
                <span class="c-arti">Kosong</span>
              </div>
            </div>
          </div>`;
        return;
      }

      activeVocab.forEach((v, i) => {
        const card = document.createElement('div');
        card.className = 'chapter-flashcard hidden';

        let frontHtml = '';
        let backHtml = '';

        const kanjiDisplay = esc(v.kanji);
        const furiganaDisplay = esc(v.furigana);
        const artiDisplay = esc(v.arti);

        if (cardOrientation === 'kanji-first') {
          frontHtml = `
            <span class="c-tag">Kanji</span>
            <span class="c-kanji japanese-font">${kanjiDisplay}</span>
            <span class="c-tap-hint">Ketuk untuk membalik kartu</span>
          `;
          backHtml = `
            <span class="c-tag">Cara Baca &amp; Arti</span>
            <div class="c-back-body">
              <span class="c-furigana-sub japanese-font">${furiganaDisplay}</span>
              <span class="c-arti-sub">${artiDisplay}</span>
            </div>
          `;
        } else {
          frontHtml = `
            <span class="c-tag">Arti Indonesia</span>
            <span class="c-arti">${artiDisplay}</span>
            <span class="c-tap-hint">Ketuk untuk membalik kartu</span>
          `;
          backHtml = `
            <span class="c-tag">Bahasa Jepang</span>
            <div class="c-back-body">
              <span class="c-kanji-sub japanese-font">${kanjiDisplay}</span>
              <span class="c-furigana-sub japanese-font">${furiganaDisplay}</span>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="carousel-card-inner">
            <div class="carousel-face front">
              ${frontHtml}
            </div>
            <div class="carousel-face back">
              ${backHtml}
            </div>
          </div>
        `;

        card.addEventListener('click', () => {
          if (i === this.index) {
            card.classList.toggle('is-flipped');
            playTone('flip');
          } else {
            this.index = i;
            this.update();
            playTone('pop');
          }
        });

        container.appendChild(card);
      });

      this.index = 0;
      this.update();
    },
    update() {
      const container = $('carouselContainer');
      if (!container) return;
      const cards = container.children;
      const n = cards.length;
      if ($('carouselCounter')) {$('carouselCounter').textContent = n ? `${Math.min(this.index + 1, n)} / ${n}` : '0 / 0';
      }
      if (!n) return;

      [...cards].forEach((c, i) => {
        if (i === this.index) {
          c.className = 'chapter-flashcard center';
        } else {
          c.className = 'chapter-flashcard hidden';
          c.classList.remove('is-flipped');
        }
      });
    },
    go(dir) {
      if (!activeVocab.length) return;
      this.index = (this.index + dir + activeVocab.length) % activeVocab.length;
      this.update();
      playTone('pop');
    }
  };

  const handleNext = () => Carousel.go(1);
  const handlePrev = () => Carousel.go(-1);

  if ($('btnCarouselNext'))$('btnCarouselNext').addEventListener('click', handleNext);
  if ($('btnCarouselPrev'))$('btnCarouselPrev').addEventListener('click', handlePrev);
  if ($('btnMobileCarouselNext'))$('btnMobileCarouselNext').addEventListener('click', handleNext);
  if ($('btnMobileCarouselPrev'))$('btnMobileCarouselPrev').addEventListener('click', handlePrev);

  // Swipe Ponsel Carousel
  let touchStartX = 0;
  let touchEndX = 0;
  const cContainer = $('carouselContainer');
  if (cContainer) {
    cContainer.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    cContainer.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) handleNext();
      if (touchEndX - touchStartX > 50) handlePrev();
    }, { passive: true });
  }

  // ---------- TOGGLE MODE KARTU ----------
  const btnModeKanjiFront = $('btnModeKanjiFront');
  const btnModeArtiFront = $('btnModeArtiFront');

  function setCardOrientation(newMode) {
    if (cardOrientation === newMode) return;
    cardOrientation = newMode;
    try { localStorage.setItem(CARD_MODE_KEY, newMode); } catch (e) {}

    if (btnModeKanjiFront) btnModeKanjiFront.classList.toggle('active', newMode === 'kanji-first');
    if (btnModeArtiFront) btnModeArtiFront.classList.toggle('active', newMode === 'arti-first');

    playTone('pop');
    Carousel.render();
  }

  if (btnModeKanjiFront) btnModeKanjiFront.addEventListener('click', () => setCardOrientation('kanji-first'));
  if (btnModeArtiFront) btnModeArtiFront.addEventListener('click', () => setCardOrientation('arti-first'));

  // ---------- PENGATUR UKURAN FLASHCARD ----------
  const flashcardStage = $('flashcardStage');
  const sizeButtons = document.querySelectorAll('.btn-size');

  function setFlashcardScale(sizeName) {
    cardSize = sizeName;
    try { localStorage.setItem(CARD_SIZE_KEY, sizeName); } catch (e) {}

    if (flashcardStage) {
      flashcardStage.className = `flashcard-horizontal-stage size-${sizeName}`;
    }
    sizeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === sizeName);
    });
    playTone('pop');
  }

  sizeButtons.forEach(btn => {
    btn.addEventListener('click', () => setFlashcardScale(btn.dataset.size));
  });
  setFlashcardScale(cardSize);

  // ---------- ZOOM FONT KUIS ----------
  function updateVocabFontSize() {
    document.documentElement.style.setProperty('--vocab-font-size', `${vocabZoomRem}rem`);
  }
  if ($('btnZoomIn')) {$('btnZoomIn').addEventListener('click', () => {
      if (vocabZoomRem < 4.8) {
        vocabZoomRem = +(vocabZoomRem + 0.3).toFixed(1);
        updateVocabFontSize();
      }
    });
  }
  if ($('btnZoomOut')) {$('btnZoomOut').addEventListener('click', () => {
      if (vocabZoomRem > 1.8) {
        vocabZoomRem = +(vocabZoomRem - 0.3).toFixed(1);
        updateVocabFontSize();
      }
    });
  }

  // =========================================================
  // DOKKAI ENGINE: ZOOM & GESER KANAN-KIRI/ATAS-BAWAH (PAN / DRAG)
  // =========================================================
  let dokkaiZoom = 1.0;
  let dokkaiPanX = 0;
  let dokkaiPanY = 0;
  let isDraggingDokkai = false;
  let dragStartX = 0;
  let dragStartY = 0;

  const viewport = $('dokkaiViewport');
  const canvasElem = $('dokkaiCanvas');
  const zoomDisplay = $('dokkaiZoomLevel');

  function applyDokkaiTransform() {
    if (!canvasElem || !viewport) return;
    
    const vpRect = viewport.getBoundingClientRect();
    const maxPanX = Math.max(0, (canvasElem.offsetWidth * dokkaiZoom - vpRect.width) / 2 + 80);
    const maxPanY = Math.max(0, (canvasElem.offsetHeight * dokkaiZoom - vpRect.height) / 2 + 80);

    if (dokkaiZoom <= 1.0) {
      dokkaiPanX = 0;
      dokkaiPanY = 0;
    } else {
      dokkaiPanX = Math.max(-maxPanX, Math.min(maxPanX, dokkaiPanX));
      dokkaiPanY = Math.max(-maxPanY, Math.min(maxPanY, dokkaiPanY));
    }

    canvasElem.style.transform = `translate(${dokkaiPanX}px, ${dokkaiPanY}px) scale(${dokkaiZoom})`;
    if (zoomDisplay) zoomDisplay.textContent = `${Math.round(dokkaiZoom * 100)}%`;
  }

  function setDokkaiZoom(newZoom) {
    dokkaiZoom = Math.min(2.5, Math.max(0.85, +newZoom.toFixed(2)));
    applyDokkaiTransform();
    playTone('pop');
  }

  if ($('btnDokkaiZoomIn'))$('btnDokkaiZoomIn').addEventListener('click', () => setDokkaiZoom(dokkaiZoom + 0.2));
  if ($('btnDokkaiZoomOut'))$('btnDokkaiZoomOut').addEventListener('click', () => setDokkaiZoom(dokkaiZoom - 0.2));
  if ($('btnDokkaiZoomReset'))$('btnDokkaiZoomReset').addEventListener('click', () => {
    dokkaiZoom = 1.0;
    dokkaiPanX = 0;
    dokkaiPanY = 0;
    applyDokkaiTransform();
    playTone('pop');
  });

  // Fitur Drag Geser Menggunakan Mouse
  if (viewport) {
    viewport.addEventListener('mousedown', e => {
      if (e.target.closest('.kaigo-target-kw')) return;
      isDraggingDokkai = true;
      viewport.classList.add('is-dragging');
      dragStartX = e.clientX - dokkaiPanX;
      dragStartY = e.clientY - dokkaiPanY;
    });

    window.addEventListener('mousemove', e => {
      if (!isDraggingDokkai) return;
      dokkaiPanX = e.clientX - dragStartX;
      dokkaiPanY = e.clientY - dragStartY;
      applyDokkaiTransform();
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingDokkai) {
        isDraggingDokkai = false;
        viewport.classList.remove('is-dragging');
      }
    });

    // Fitur Drag Geser di Ponsel (Touch Pan)
    let touchPanStartX = 0;
    let touchPanStartY = 0;

    viewport.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        touchPanStartX = e.touches[0].clientX - dokkaiPanX;
        touchPanStartY = e.touches[0].clientY - dokkaiPanY;
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && dokkaiZoom > 1.0) {
        dokkaiPanX = e.touches[0].clientX - touchPanStartX;
        dokkaiPanY = e.touches[0].clientY - touchPanStartY;
        applyDokkaiTransform();
      }
    }, { passive: true });
  }

  function renderDokkai() {
    const c = $('dokkaiContent');
    const title = $('dokkaiTitle');
    if (!c) return;

    if (!rawChapterDokkai || !rawChapterDokkai.text) {
      if (title) title.textContent = '読解練習';
      c.innerHTML = '<p style="color:var(--dim); text-align:center;">Materi dokkai belum tersedia untuk bab ini.</p>';
      return;
    }

    if (title) title.textContent = rawChapterDokkai.title || '読解練習';
    c.innerHTML = rawChapterDokkai.text.trim();

    // Reset posisi pan saat render ulang
    dokkaiZoom = 1.0;
    dokkaiPanX = 0;
    dokkaiPanY = 0;
    applyDokkaiTransform();

    // Klik kanji target (garis bawah hijau) untuk mengecek cara baca & arti mandiri
    c.querySelectorAll('.kaigo-target-kw').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        playTone('pop');
        const k = el.textContent.trim();
        const found = rawChapterVocab.find(v => v.kanji === k);
        if (found) {
          showNotice(`[${found.kanji}] Cara Baca: ${found.furigana} | Arti: ${found.arti}`, 3000);
        }
      });
    });
  }

  // ---------- GANTI MODE FITUR ----------
  function setMode(newMode) {
    mode = newMode;
    runId++;

    document.querySelectorAll('.dock-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === newMode);
    });

    if ($('mode-carousel'))$('mode-carousel').hidden = (newMode !== 'carousel');
    if ($('mode-result'))$('mode-result').hidden = true;
    if ($('quiz-global-header'))$('quiz-global-header').hidden = (newMode === 'carousel' || newMode === 'dokkai');
    if ($('mode-mc'))$('mode-mc').hidden = (newMode !== 'mc');
    if ($('mode-typing'))$('mode-typing').hidden = (newMode !== 'typing');
    if ($('mode-dokkai'))$('mode-dokkai').hidden = (newMode !== 'dokkai');

    if (newMode === 'carousel') {
      Carousel.update();
    } else if (newMode === 'dokkai') {
      renderDokkai();
    } else {
      startQuiz(newMode);
    }
  }

  document.querySelectorAll('.dock-item').forEach(b => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  if ($('btnAudioToggle')) {$('btnAudioToggle').addEventListener('click', function() {
      audioOn = !audioOn;
      const u = this.querySelector('.icon-unmuted');
      const m = this.querySelector('.icon-muted');
      if (u) u.style.display = audioOn ? 'block' : 'none';
      if (m) m.style.display = audioOn ? 'none' : 'block';
    });
  }

  // ---------- QUIZ SYSTEM ----------
  function startQuiz(type) {
    if (activeVocab.length < 4) {
      showNotice('Dibutuhkan minimal 4 kosakata untuk memulai latihan.', 4000);
      setMode('carousel');
      return;
    }

    quizPool = shuffle(activeVocab);
    qi = 0;
    qScore = 0;
    answered = false;

    if ($('quizTitle'))$('quizTitle').textContent = type === 'mc' ? 'Pilihan Ganda' : 'Quiz Mengetik';
    if ($('quizProgressFill'))$('quizProgressFill').style.width = '0%';

    if (type === 'mc') runMC();
    else if (type === 'typing') runTyping();
  }

  function setQuizProgress() {
    if ($('quizProgressFill'))$('quizProgressFill').style.width = `${(qi / quizPool.length) * 100}%`;
    if ($('quizCounter'))$('quizCounter').textContent = `Soal ${qi + 1} / ${quizPool.length}`;
    if ($('quizScore'))$('quizScore').textContent = `Benar ${qScore}`;
  }

  function showResult(score, total) {
    runId++;
    if ($('quizProgressFill'))$('quizProgressFill').style.width = '100%';
    if ($('mode-mc'))$('mode-mc').hidden = true;
    if ($('mode-typing'))$('mode-typing').hidden = true;
    if ($('mode-dokkai'))$('mode-dokkai').hidden = true;
    if ($('mode-result'))$('mode-result').hidden = false;

    if ($('resultScore'))$('resultScore').textContent = `Skor: ${score} / ${total}`;
    const pct = Math.round((score / total) * 100);
    if ($('resultRing'))$('resultRing').style.setProperty('--pct', pct);
    if ($('resultPct'))$('resultPct').textContent = pct + '%';

    playTone('win');
  }

  // 1. Pilihan Ganda
  function runMC() {
    if (qi >= quizPool.length) return showResult(qScore, quizPool.length);

    setQuizProgress();
    answered = false;
    const q = quizPool[qi];
    if ($('mcQuestionText'))$('mcQuestionText').textContent = q.kanji;
    if ($('mcQuestionSub'))$('mcQuestionSub').textContent = q.furigana !== q.kanji ? q.furigana : '';
    if ($('mcFeedback')) {
      $('mcFeedback').textContent = '';$('mcFeedback').className = 'feedback-text';
    }
    if ($('btnMcNext'))$('btnMcNext').disabled = true;

    const wrongs = shuffle(rawChapterVocab.filter(v => v.id !== q.id && v.arti !== q.arti)).slice(0, 3);
    const optionsBox = $('mcOptions');
    if (!optionsBox) return;
    optionsBox.innerHTML = '';

    shuffle([q, ...wrongs]).forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-mc-option';
      btn.dataset.key = ['A', 'B', 'C', 'D'][i];
      btn.dataset.id = item.id;
      btn.textContent = item.arti;

      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;

        optionsBox.querySelectorAll('.btn-mc-option').forEach(b => {
          b.disabled = true;
          if (b.dataset.id === String(q.id)) b.classList.add('correct');
        });

        if (item.id === q.id) {
          qScore++;
          if ($('mcFeedback')) {
            $('mcFeedback').textContent = 'Benar!';$('mcFeedback').classList.add('correct');
          }
          playTone('correct');
        } else {
          btn.classList.add('wrong');
          if ($('mcFeedback')) {
            $('mcFeedback').textContent = 'Salah!';$('mcFeedback').classList.add('wrong');
          }
          playTone('wrong');
        }

        if ($('quizScore'))$('quizScore').textContent = `Benar ${qScore}`;
        if ($('btnMcNext')) {$('btnMcNext').disabled = false;
          $('btnMcNext').focus();
        }
      });

      optionsBox.appendChild(btn);
    });
  }

  if ($('btnMcNext')) {$('btnMcNext').addEventListener('click', () => {
      qi++;
      runMC();
    });
  }

  // 2. Mengetik
  const normalize = s => s.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

  function runTyping() {
    if (qi >= quizPool.length) return showResult(qScore, quizPool.length);

    setQuizProgress();
    answered = false;
    const q = quizPool[qi];
    if ($('typingQuestionText'))$('typingQuestionText').textContent = q.kanji;
    if ($('typingQuestionSub'))$('typingQuestionSub').textContent = q.furigana !== q.kanji ? q.furigana : '';
    if ($('typingFeedback')) {
      $('typingFeedback').textContent = '';$('typingFeedback').className = 'feedback-text';
    }

    const input = $('typingInput');
    if (input) {
      input.value = '';
      input.className = 'input-typing-field';
      input.disabled = false;
      setTimeout(() => input.focus(), 60);
    }

    if ($('btnTypingCheck'))$('btnTypingCheck').disabled = false;
    if ($('btnTypingNext'))$('btnTypingNext').disabled = true;
  }

  function checkTyping() {
    if (answered) return;
    const input = $('typingInput');
    if (!input) return;
    const answer = normalize(input.value);
    if (!answer) return;

    answered = true;
    input.disabled = true;
    if ($('btnTypingCheck'))$('btnTypingCheck').disabled = true;

    const q = quizPool[qi];
    const accepted = [normalize(q.arti), ...q.arti.split(/[\/,]/).map(normalize)].filter(Boolean);

    if (accepted.includes(answer)) {
      qScore++;
      input.classList.add('correct');
      if ($('typingFeedback')) {
        $('typingFeedback').textContent = 'Benar!';$('typingFeedback').classList.add('correct');
      }
      playTone('correct');
    } else {
      input.classList.add('wrong');
      if ($('typingFeedback')) {$('typingFeedback').textContent = `Salah! Jawaban: ${q.arti}`;
        $('typingFeedback').classList.add('wrong');
      }
      playTone('wrong');
    }

    if ($('quizScore'))$('quizScore').textContent = `Benar ${qScore}`;
    if ($('btnTypingNext')) {$('btnTypingNext').disabled = false;
      $('btnTypingNext').focus();
    }
  }

  if ($('btnTypingCheck'))$('btnTypingCheck').addEventListener('click', checkTyping);
  if ($('typingInput')) {$('typingInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') checkTyping();
    });
  }
  if ($('btnTypingNext')) {$('btnTypingNext').addEventListener('click', () => {
      qi++;
      runTyping();
    });
  }

  if ($('btnRetryQuiz'))$('btnRetryQuiz').addEventListener('click', () => setMode(mode));
  if ($('btnResultCards'))$('btnResultCards').addEventListener('click', () => setMode('carousel'));

  // Navigasi Keyboard
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;

    if (mode === 'carousel') {
      if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const activeCard = document.querySelector('.chapter-flashcard.center');
        if (activeCard) {
          activeCard.classList.toggle('is-flipped');
          playTone('flip');
        }
      }
    } else if (mode === 'mc' && /^[1-4]$/.test(e.key)) {
      const opts = document.querySelectorAll('#mcOptions .btn-mc-option');
      const b = opts[+e.key - 1];
      if (b && !b.disabled) b.click();
    }
  });

  // ---------- PEMUATAN DATA JSON (VOCAB & DOKKAI) ----------
  function normalizeData(list) {
    return list.map((v, idx) => ({
      id: idx,
      kanji: v.kanji || v.furigana || v.jepang || '',
      furigana: v.furigana || v.kanji || v.jepang || '',
      arti: v.arti || v.indonesia || ''
    }));
  }

  async function loadQuestions(babNum) {
    currentBabNum = String(babNum);
    if ($('headerBabTitle')) {$('headerBabTitle').innerHTML = `Bab <b>${currentBabNum}</b>`;
    }

    const candidatePaths = [
      `../Bab/main/main${currentBabNum}.json`,
      `../bab/main/main${currentBabNum}.json`,
      `Bab/main/main${currentBabNum}.json`,
      `bab/main/main${currentBabNum}.json`,
      `main/main${currentBabNum}.json`,
      `../main/main${currentBabNum}.json`
    ];

    let foundData = null;
    let successPath = '';

    for (const p of candidatePaths) {
      try {
        const res = await fetch(p, { cache: 'no-cache' });
        if (res.ok) {
          const data = await res.json();
          foundData = data;
          successPath = p;
          break;
        }
      } catch (e) {}
    }

    if (foundData) {
      console.log(`Berhasil memuat: ${successPath}`);
      
      const list = Array.isArray(foundData) 
        ? foundData 
        : (foundData.vocab || Object.values(foundData).find(Array.isArray) || []);
      
      rawChapterVocab = normalizeData(list);
      rawChapterDokkai = foundData.dokkai || null;

      applySearchFilter();
      setMode('carousel');
    } else {
      console.error(`Gagal memuat Bab ${currentBabNum}`);
      showNotice(`Gagal memuat file Bab ${currentBabNum}. Pastikan file ada di 'Bab/main/main${currentBabNum}.json'.`);
      rawChapterVocab = [];
      rawChapterDokkai = null;
      applySearchFilter();
    }
  }

  // ---------- LOGIKA TAMPILAN VIEW (MENU vs BELAJAR) ----------
  const viewMenu = $('view-menu');
  const viewLearning = $('view-learning');

  function openBab(babNum, updateHistory = true) {
    if (viewMenu) viewMenu.hidden = true;
    if (viewLearning) viewLearning.hidden = false;

    if (updateHistory) {
      const newUrl = `${window.location.pathname}?bab=${babNum}`;
      window.history.pushState({ bab: babNum }, '', newUrl);
    }
    loadQuestions(babNum);
  }

  function showMenu(updateHistory = true) {
    if (viewLearning) viewLearning.hidden = true;
    if (viewMenu) viewMenu.hidden = false;

    if (updateHistory) {
      window.history.pushState({}, '', window.location.pathname);
    }
  }

  if ($('btnBackToMenu')) {$('btnBackToMenu').addEventListener('click', () => {
      showMenu();
    });
  }

  window.addEventListener('popstate', (e) => {
    const urlParams = new URLSearchParams(window.location.search);
    const b = urlParams.get('bab');
    if (b) {
      openBab(b, false);
    } else {
      showMenu(false);
    }
  });

  // Generate 25 Modul di Halaman Menu
  const feed = $('moduleFeed');
  if (feed) {
    feed.innerHTML = '';
    const TOTAL_BAB = 25;
    for (let i = 1; i <= TOTAL_BAB; i++) {
      const card = document.createElement('div');
      card.className = 'module-card-btn';
      card.innerHTML = `
        <div>
          <span class="mod-badge">MODUL ${i}</span>
          <div class="mod-name">Kosakata Kaigo Bab ${i}</div>
        </div>
        <div class="mod-arrow">›</div>
      `;
      card.addEventListener('click', () => openBab(i));
      feed.appendChild(card);
    }
  }

  // Cek parameter ?bab=X saat startup
  const initialUrlParams = new URLSearchParams(window.location.search);
  const initialBab = initialUrlParams.get('bab');
  if (initialBab) {
    openBab(initialBab, false);
  } else {
    showMenu(false);
  }
});