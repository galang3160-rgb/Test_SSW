// ==================== Konfigurasi & State Global ====================
const APP_CONFIG = {
  storageKey: 'jft_prep_active_session',
  historyKey: 'jft_prep_exam_history',
  defaultDurationSec: 60 * 60, // 60 Menit
  pointPerQuestion: 2,
  passPercentageThreshold: 70
};

const APP_MODES = {
  EXAM: 'exam',
  PRACTICE: 'practice',
  REVIEW: 'review'
};

let currentMode = APP_MODES.EXAM;
let questionsData = [];
let currentIndex = 0;
let userAnswers = {};          // { [questionId]: optionIndex }
let flaggedQuestions = new Set();
let bookmarkedQuestions = new Set();
let remainingSeconds = APP_CONFIG.defaultDurationSec;
let timerInterval = null;
let isSubmitted = false;
let autoNextDebounceTimer = null;

// ==================== Audio Synthesizer ====================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSelectSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}

function playFinishSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.value = freq;

      const startTime = ctx.currentTime + (idx * 0.09);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  } catch (e) {}
}

// ==================== DOM Selectors ====================
const topQuestionIndicator = document.getElementById('topQuestionIndicator');
const sectionName = document.getElementById('sectionName');
const instructionText = document.getElementById('instructionText');
const passageBox = document.getElementById('passageBox');
const passageContent = document.getElementById('passageContent');
const questionText = document.getElementById('questionText');
const optionsContainer = document.getElementById('optionsContainer');
const timerText = document.getElementById('timerText');
const timerBoxWrapper = document.getElementById('timerBoxWrapper');
const timerModeLabel = document.getElementById('timerModeLabel');
const currentModeBadge = document.getElementById('currentModeBadge');
const modeSwitchBtn = document.getElementById('modeSwitchBtn');

const desktopPaletteGrid = document.getElementById('desktopPaletteGrid');
const mobilePaletteGrid = document.getElementById('mobilePaletteGrid');
const mobilePaletteToggle = document.getElementById('mobilePaletteToggle');
const mobileProgressLabel = document.getElementById('mobileProgressLabel');
const mobileDrawerOverlay = document.getElementById('mobileDrawerOverlay');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const drawerStatsText = document.getElementById('drawerStatsText');

const backBtn = document.getElementById('backBtn');
const nextBtn = document.getElementById('nextBtn');
const flagBtn = document.getElementById('flagBtn');
const finishBtn = document.getElementById('finishBtn');
const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
const spotlightToggle = document.getElementById('spotlightToggle');

// Meta & Feedback
const questionCategoryTag = document.getElementById('questionCategoryTag');
const questionDifficultyTag = document.getElementById('questionDifficultyTag');
const bookmarkBtn = document.getElementById('bookmarkBtn');
const explanationContainer = document.getElementById('explanationContainer');
const expBodyContent = document.getElementById('expBodyContent');
const expStatusPill = document.getElementById('expStatusPill');

// Audio Element
const audioPlayerBlock = document.getElementById('audioPlayerBlock');
const btnPlayAudio = document.getElementById('btnPlayAudio');
const questionAudioEl = document.getElementById('questionAudioEl');
const audioStatusText = document.getElementById('audioStatusText');

// Modals
const finishModal = document.getElementById('finishModal');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalAnsweredCount = document.getElementById('modalAnsweredCount');
const modalUnansweredCount = document.getElementById('modalUnansweredCount');
const modalFlaggedCount = document.getElementById('modalFlaggedCount');

const modeConfirmModal = document.getElementById('modeConfirmModal');
const modeCancelBtn = document.getElementById('modeCancelBtn');
const modeProceedBtn = document.getElementById('modeProceedBtn');

const sessionBanner = document.getElementById('sessionBanner');
const bannerResumeBtn = document.getElementById('bannerResumeBtn');
const bannerResetBtn = document.getElementById('bannerResetBtn');

const resultModal = document.getElementById('resultModal');
const scoreTotalVal = document.getElementById('scoreTotalVal');
const scoreMaxVal = document.getElementById('scoreMaxVal');
const resCorrectCount = document.getElementById('resCorrectCount');
const resWrongCount = document.getElementById('resWrongCount');
const resEmptyCount = document.getElementById('resEmptyCount');
const resPercentage = document.getElementById('resPercentage');
const resultGridList = document.getElementById('resultGridList');
const resultFeedback = document.getElementById('resultFeedback');
const categoryProgressList = document.getElementById('categoryProgressList');
const btnReviewAll = document.getElementById('btnReviewAll');
const btnRetryWrong = document.getElementById('btnRetryWrong');
const btnRestart = document.getElementById('btnRestart');

// ==================== Grammar & Vocabulary Parser ====================
function sanitizeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/g, '');
}

// Daftar partikel part-of-speech bahasa Jepang
const JAPANESE_PARTICLES = new Set([
  'は', 'が', 'を', 'に', 'で', 'へ', 'と', 'から', 'まで', 'より', 
  'も', 'の', 'ね', 'よ', 'か', 'な', 'ば', 'や'
]);

/**
 * Memisahkan dan membungkus kata (kuning) vs partikel (biru)
 * Aman terhadap tag <ruby><rt>, <u>, dan spasi/tanda baca
 */
function wrapGrammarAndSpotlight(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return '';

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text || text.trim() === '') return;

      const fragment = document.createDocumentFragment();
      // Regex mengenali partikel tunggal, karakter kata Jepang/alfanumerik, tanda baca & spasi
      const regex = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\w]+|[^\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\w\s]+|\s+)/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const token = match[0];
        
        // Lewati tanda baca dan spasi murni
        if (token.trim() === '' || /^[（）()、。：「」／\s\-・]+$/.test(token)) {
          fragment.appendChild(document.createTextNode(token));
        } else if (JAPANESE_PARTICLES.has(token)) {
          // Partikel gramatikal -> Biru
          const span = document.createElement('span');
          span.className = 'grammar-particle';
          span.textContent = token;
          fragment.appendChild(span);
        } else {
          // Kosakata / Isi Leksikal -> Kuning
          const span = document.createElement('span');
          span.className = 'vocab-word';
          span.textContent = token;
          fragment.appendChild(span);
        }
      }

      if (fragment.childNodes.length > 0) {
        node.parentNode.replaceChild(fragment, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // <ruby> dianggap sebagai satu kesatuan leksikal -> Kuning
      if (node.tagName.toLowerCase() === 'ruby') {
        const span = document.createElement('span');
        span.className = 'vocab-word';
        node.parentNode.insertBefore(span, node);
        span.appendChild(node);
      } else if (node.tagName.toLowerCase() !== 'rt') {
        Array.from(node.childNodes).forEach(processNode);
      }
    }
  }

  Array.from(tempDiv.childNodes).forEach(processNode);
  return tempDiv.innerHTML;
}

// ==================== Validasi Bank Soal ====================
function validateQuestionItem(item, idx) {
  if (!item || typeof item !== 'object') {
    console.warn(`[Bank Soal] Soal #${idx} format objek tidak valid.`);
    return false;
  }
  if (!item.question || typeof item.question !== 'string') {
    console.warn(`[Bank Soal] Soal #${idx} tidak memiliki pertanyaan.`);
    return false;
  }
  if (!Array.isArray(item.options) || item.options.length < 2) {
    console.warn(`[Bank Soal] Soal #${idx} pilihan ganda kurang dari 2.`);
    return false;
  }
  if (typeof item.correct !== 'number' || item.correct < 0 || item.correct >= item.options.length) {
    console.warn(`[Bank Soal] Soal #${idx} kunci jawaban di luar indeks opsi.`);
    return false;
  }
  return true;
}

// ==================== Inisialisasi ====================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadQuestions();
  checkSavedSession();
});

async function loadQuestions() {
  const filePath = 'question.json';
  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP status: ${res.status}`);

    const rawData = await res.json();
    if (!Array.isArray(rawData) || rawData.length === 0) {
      throw new Error("File question.json kosong atau tidak valid.");
    }

    const validated = rawData.filter(validateQuestionItem);
    if (validated.length === 0) {
      throw new Error("Tidak ada butir soal yang memenuhi syarat struktur.");
    }

    questionsData = validated;
    renderPalettes();
    renderQuestion(0);
  } catch (err) {
    console.error('[loadQuestions Error]', err);
    questionText.innerHTML = `
      <div style="color: #ef4444; font-size: 14px; line-height: 1.5;">
        <strong>Gagal memuat bank soal (<code>${filePath}</code>).</strong><br>
        Pastikan file <code>question.json</code> berada di folder yang sama dan dijalankan via Local Server / GitHub Pages.<br>
        <small style="color: #64748b;">Detail: ${err.message}</small>
      </div>
    `;
  }
}

// ==================== Palette Rendering ====================
function renderPalettes() {
  desktopPaletteGrid.innerHTML = '';
  mobilePaletteGrid.innerHTML = '';

  questionsData.forEach((_, idx) => {
    desktopPaletteGrid.appendChild(createPaletteButton(idx, false));
    mobilePaletteGrid.appendChild(createPaletteButton(idx, true));
  });

  updatePaletteStatus();
}

function createPaletteButton(idx, isMobile = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'palette-btn';
  btn.textContent = idx + 1;
  btn.dataset.index = idx;
  btn.setAttribute('aria-label', `Pindah ke nomor ${idx + 1}`);

  btn.addEventListener('click', () => {
    goToQuestion(idx);
    if (isMobile) closeMobileDrawer();
  });

  return btn;
}

function updatePaletteStatus() {
  const answeredCount = Object.keys(userAnswers).length;
  const total = questionsData.length;

  if (mobileProgressLabel) {
    mobileProgressLabel.textContent = `No. ${currentIndex + 1} (${answeredCount}/${total})`;
  }
  if (drawerStatsText) {
    drawerStatsText.textContent = `${answeredCount}/${total} Terisi`;
  }

  const allButtons = document.querySelectorAll('.palette-btn');
  allButtons.forEach((btn) => {
    const idx = parseInt(btn.dataset.index, 10);
    const qItem = questionsData[idx];
    const isAnswered = qItem && userAnswers[qItem.id] !== undefined;

    btn.classList.toggle('active', idx === currentIndex);
    btn.classList.toggle('answered', isAnswered);
    btn.classList.toggle('flagged', flaggedQuestions.has(idx));

    if (currentMode !== APP_MODES.EXAM && isAnswered && qItem) {
      const isCorrect = userAnswers[qItem.id] === qItem.correct;
      btn.classList.toggle('is-correct', isCorrect);
      btn.classList.toggle('is-wrong', !isCorrect);
    } else {
      btn.classList.remove('is-correct', 'is-wrong');
    }
  });
}

// ==================== Render Soal & Konteks ====================
function renderQuestion(index) {
  if (!questionsData || !questionsData[index]) return;

  currentIndex = index;
  const currentQ = questionsData[index];

  topQuestionIndicator.textContent = `Question: ${index + 1} / ${questionsData.length}`;

  // Render Instruksi
  instructionText.innerHTML = wrapGrammarAndSpotlight(
    sanitizeHTML(currentQ.instruction || '問題 文中の（ ）に入れるのに最もよいものを一つ選んでください。')
  );

  // Render Passage (Konteks Percakapan / Cerita terpisah)
  if (currentQ.passage && currentQ.passage.trim() !== '') {
    passageBox.classList.remove('hidden');
    passageContent.innerHTML = wrapGrammarAndSpotlight(sanitizeHTML(currentQ.passage));
  } else {
    passageBox.classList.add('hidden');
    passageContent.innerHTML = '';
  }

  // Render Kalimat Soal
  questionText.innerHTML = wrapGrammarAndSpotlight(sanitizeHTML(currentQ.question));

  // Meta info
  questionCategoryTag.textContent = currentQ.category || '介護・語彙';
  questionDifficultyTag.textContent = currentQ.difficulty || 'A2';
  bookmarkBtn.classList.toggle('bookmarked', bookmarkedQuestions.has(currentQ.id));

  // Audio setup
  setupAudio(currentQ.audio);

  // Render Opsi
  optionsContainer.innerHTML = '';
  const badges = ['A', 'B', 'C', 'D'];
  const userSelected = userAnswers[currentQ.id];

  if (Array.isArray(currentQ.options)) {
    currentQ.options.forEach((optText, optIdx) => {
      const optDiv = document.createElement('div');
      optDiv.className = 'option-item';
      optDiv.setAttribute('role', 'radio');
      optDiv.setAttribute('tabindex', '0');
      optDiv.setAttribute('aria-checked', userSelected === optIdx ? 'true' : 'false');

      if (userSelected === optIdx) {
        optDiv.classList.add('selected');
      }

      if ((currentMode === APP_MODES.PRACTICE && userSelected !== undefined) || currentMode === APP_MODES.REVIEW) {
        if (optIdx === currentQ.correct) {
          optDiv.classList.add('feedback-correct');
        } else if (userSelected === optIdx && optIdx !== currentQ.correct) {
          optDiv.classList.add('feedback-wrong');
        }
      }

      optDiv.innerHTML = `
        <div class="option-badge">${badges[optIdx] || optIdx + 1}</div>
        <div class="option-label">${sanitizeHTML(optText)}</div>
      `;

      optDiv.addEventListener('click', () => {
        if (currentMode === APP_MODES.REVIEW) return;
        selectAnswer(optIdx);
      });

      optDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (currentMode !== APP_MODES.REVIEW) selectAnswer(optIdx);
        }
      });

      optionsContainer.appendChild(optDiv);
    });
  }

  renderExplanation(currentQ, userSelected);

  // Navigasi
  backBtn.disabled = currentIndex === 0;
  nextBtn.textContent = (currentIndex === questionsData.length - 1) ? (currentMode === APP_MODES.EXAM ? 'Finish' : 'Selesai') : 'Next >';
  flagBtn.classList.toggle('active', flaggedQuestions.has(currentIndex));

  updatePaletteStatus();
}

function renderExplanation(q, userSelected) {
  if ((currentMode === APP_MODES.PRACTICE && userSelected !== undefined) || currentMode === APP_MODES.REVIEW) {
    explanationContainer.classList.remove('hidden');
    const isCorrect = userSelected === q.correct;

    expStatusPill.textContent = isCorrect ? '正解 (Benar)' : (userSelected === undefined ? '未解答 (Kosong)' : '不正解 (Salah)');
    expStatusPill.className = `exp-status-pill ${isCorrect ? 'correct' : 'wrong'}`;

    let expHTML = '';
    if (q.explanation) {
      expHTML += `<div class="exp-section"><div class="exp-section-title">Penjelasan:</div><div>${sanitizeHTML(q.explanation)}</div></div>`;
    }
    if (q.translation) {
      expHTML += `<div class="exp-section"><div class="exp-section-title">Arti Kalimat / Percakapan:</div><div>${sanitizeHTML(q.translation)}</div></div>`;
    }
    if (Array.isArray(q.vocabulary) && q.vocabulary.length > 0) {
      expHTML += `<div class="exp-section"><div class="exp-section-title">Kosakata & Istilah:</div><ul>`;
      q.vocabulary.forEach(v => {
        expHTML += `<li><strong>${sanitizeHTML(v.word)}</strong>${v.furigana ? ` (${sanitizeHTML(v.furigana)})` : ''}: ${sanitizeHTML(v.meaning)}</li>`;
      });
      expHTML += `</ul></div>`;
    }

    if (!expHTML) {
      expHTML = `<div>Kunci Jawaban benar: Opsi <strong>${['A', 'B', 'C', 'D'][q.correct]}</strong></div>`;
    }

    expBodyContent.innerHTML = expHTML;
  } else {
    explanationContainer.classList.add('hidden');
    expBodyContent.innerHTML = '';
  }
}

// ==================== Audio Player ====================
function setupAudio(audioSrc) {
  if (!audioSrc) {
    audioPlayerBlock.classList.add('hidden');
    questionAudioEl.pause();
    questionAudioEl.src = '';
    return;
  }

  audioPlayerBlock.classList.remove('hidden');
  questionAudioEl.src = audioSrc;
  audioStatusText.textContent = "Siap diputar";

  btnPlayAudio.onclick = () => {
    if (questionAudioEl.paused) {
      questionAudioEl.play().then(() => {
        audioStatusText.textContent = "Memutar audio...";
      }).catch(() => {
        audioStatusText.textContent = "Audio gagal dimuat.";
      });
    } else {
      questionAudioEl.pause();
      audioStatusText.textContent = "Audio dijeda";
    }
  };

  questionAudioEl.onended = () => {
    audioStatusText.textContent = "Audio selesai diputar";
  };
}

// ==================== Jawaban & Navigasi ====================
function selectAnswer(optionIndex) {
  playSelectSound();
  const currentQ = questionsData[currentIndex];
  if (!currentQ) return;

  userAnswers[currentQ.id] = optionIndex;
  saveSession();
  renderQuestion(currentIndex);

  if (currentMode === APP_MODES.REVIEW) return;

  const isAuto = autoAdvanceToggle && autoAdvanceToggle.checked;
  if (isAuto) {
    if (autoNextDebounceTimer) clearTimeout(autoNextDebounceTimer);
    autoNextDebounceTimer = setTimeout(() => {
      if (currentIndex < questionsData.length - 1) {
        goToQuestion(currentIndex + 1);
      }
    }, 280);
  }
}

function goToQuestion(index) {
  if (index >= 0 && index < questionsData.length) {
    renderQuestion(index);
  }
}

function toggleFlag() {
  if (flaggedQuestions.has(currentIndex)) {
    flaggedQuestions.delete(currentIndex);
  } else {
    flaggedQuestions.add(currentIndex);
  }
  flagBtn.classList.toggle('active', flaggedQuestions.has(currentIndex));
  updatePaletteStatus();
  saveSession();
}

function toggleBookmark() {
  const currentQ = questionsData[currentIndex];
  if (!currentQ) return;

  if (bookmarkedQuestions.has(currentQ.id)) {
    bookmarkedQuestions.delete(currentQ.id);
  } else {
    bookmarkedQuestions.add(currentQ.id);
  }
  bookmarkBtn.classList.toggle('bookmarked', bookmarkedQuestions.has(currentQ.id));
}

// ==================== Timer ====================
function startTimer() {
  clearInterval(timerInterval);
  if (currentMode !== APP_MODES.EXAM) {
    timerBoxWrapper.classList.add('hidden');
    return;
  }

  timerBoxWrapper.classList.remove('hidden');
  timerModeLabel.textContent = "Time Remaining";

  timerInterval = setInterval(() => {
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      handleTimeExpired();
      return;
    }
    remainingSeconds--;
    updateTimerDisplay();

    if (remainingSeconds % 10 === 0) {
      saveSession();
    }
  }, 1000);

  updateTimerDisplay();
}

function updateTimerDisplay() {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  timerText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  if (remainingSeconds <= 300) {
    timerBoxWrapper.classList.add('warning');
  } else {
    timerBoxWrapper.classList.remove('warning');
  }
}

function handleTimeExpired() {
  if (isSubmitted) return;
  alert("Waktu ujian telah habis! Hasil ujian dievaluasi secara otomatis.");
  showResult();
}

// ==================== Selesai & Hasil ====================
function openFinishModal() {
  const total = questionsData.length;
  const answered = Object.keys(userAnswers).length;
  modalAnsweredCount.textContent = answered;
  modalUnansweredCount.textContent = total - answered;
  modalFlaggedCount.textContent = flaggedQuestions.size;
  finishModal.classList.remove('hidden');
}

function closeFinishModal() {
  finishModal.classList.add('hidden');
}

function showResult() {
  closeFinishModal();
  closeMobileDrawer();
  clearInterval(timerInterval);
  isSubmitted = true;
  playFinishSound();

  let correctCount = 0;
  let wrongCount = 0;
  let emptyCount = 0;
  const categoryStats = {};

  resultGridList.innerHTML = '';

  questionsData.forEach((q, idx) => {
    const isAnswered = userAnswers[q.id] !== undefined;
    const isCorrect = isAnswered && userAnswers[q.id] === q.correct;
    const cat = q.category || 'General';

    if (!categoryStats[cat]) {
      categoryStats[cat] = { total: 0, correct: 0 };
    }
    categoryStats[cat].total++;

    if (!isAnswered) {
      emptyCount++;
    } else if (isCorrect) {
      correctCount++;
      categoryStats[cat].correct++;
    } else {
      wrongCount++;
    }

    const badge = document.createElement('div');
    badge.className = `res-item ${!isAnswered ? 'empty' : isCorrect ? 'correct' : 'wrong'}`;
    badge.title = `Klik untuk tinjau nomor ${idx + 1}`;
    badge.innerHTML = `
      <span class="num">${idx + 1}</span>
      <span class="mark">${!isAnswered ? '-' : isCorrect ? '✓' : '✗'}</span>
    `;
    badge.addEventListener('click', () => {
      resultModal.classList.add('hidden');
      enterReviewMode(idx);
    });
    resultGridList.appendChild(badge);
  });

  const totalQuestions = questionsData.length;
  const totalMaxScore = totalQuestions * APP_CONFIG.pointPerQuestion;
  const finalScore = correctCount * APP_CONFIG.pointPerQuestion;
  const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  scoreTotalVal.textContent = finalScore;
  scoreMaxVal.textContent = `/ ${totalMaxScore} 点`;
  resCorrectCount.textContent = `${correctCount} 問`;
  resWrongCount.textContent = `${wrongCount} 問`;
  resEmptyCount.textContent = `${emptyCount} 問`;
  resPercentage.textContent = `${percentage}%`;

  if (percentage >= APP_CONFIG.passPercentageThreshold) {
    resultFeedback.textContent = `合格 (Pass - Simulasi)! Nilai Anda mencapai ambang kelulusan ${APP_CONFIG.passPercentageThreshold}%.`;
    resultFeedback.className = "result-feedback pass";
  } else {
    resultFeedback.textContent = `不合格 (Belum Mencapai Ambang). Perbanyak latihan di bagian yang belum dikuasai.`;
    resultFeedback.className = "result-feedback fail";
  }

  renderCategoryAnalysis(categoryStats);

  saveExamHistory({
    date: new Date().toISOString(),
    score: finalScore,
    maxScore: totalMaxScore,
    percentage: percentage,
    correctCount: correctCount,
    totalQuestions: totalQuestions
  });

  clearActiveSession();
  resultModal.classList.remove('hidden');
}

function renderCategoryAnalysis(stats) {
  categoryProgressList.innerHTML = '';
  Object.keys(stats).forEach(cat => {
    const item = stats[cat];
    const catPercent = Math.round((item.correct / item.total) * 100);
    const row = document.createElement('div');
    row.className = 'cat-item-row';
    row.innerHTML = `
      <span class="cat-name">${sanitizeHTML(cat)}</span>
      <span class="cat-score">${item.correct}/${item.total} (${catPercent}%)</span>
    `;
    categoryProgressList.appendChild(row);
  });
}

function enterReviewMode(targetIndex = 0) {
  currentMode = APP_MODES.REVIEW;
  currentModeBadge.textContent = "REVIEW MODE";
  timerBoxWrapper.classList.add('hidden');
  finishBtn.classList.add('hidden');
  renderPalettes();
  goToQuestion(targetIndex);
}

function retryWrongQuestions() {
  const wrongIds = [];
  questionsData.forEach(q => {
    if (userAnswers[q.id] !== q.correct) {
      wrongIds.push(q.id);
    }
  });

  if (wrongIds.length === 0) {
    alert("Hebat! Anda tidak memiliki soal yang salah.");
    return;
  }

  questionsData = questionsData.filter(q => wrongIds.includes(q.id));
  resultModal.classList.add('hidden');
  switchMode(APP_MODES.PRACTICE);
}

// ==================== Mode Management ====================
function openModeConfirmModal() {
  modeConfirmModal.classList.remove('hidden');
}

function closeModeConfirmModal() {
  modeConfirmModal.classList.add('hidden');
}

function switchMode(newMode) {
  currentMode = newMode;
  userAnswers = {};
  flaggedQuestions.clear();
  isSubmitted = false;
  remainingSeconds = APP_CONFIG.defaultDurationSec;
  currentIndex = 0;

  if (currentMode === APP_MODES.EXAM) {
    currentModeBadge.textContent = "EXAM MODE";
    modeSwitchBtn.textContent = "Mode: Exam";
    finishBtn.classList.remove('hidden');
    startTimer();
  } else {
    currentModeBadge.textContent = "PRACTICE MODE";
    modeSwitchBtn.textContent = "Mode: Practice";
    finishBtn.classList.remove('hidden');
    clearInterval(timerInterval);
    timerBoxWrapper.classList.add('hidden');
  }

  clearActiveSession();
  renderPalettes();
  renderQuestion(0);
}

// ==================== Local Storage & Recovery ====================
function saveSession() {
  if (isSubmitted || currentMode === APP_MODES.REVIEW) return;

  const sessionData = {
    mode: currentMode,
    currentIndex: currentIndex,
    userAnswers: userAnswers,
    flagged: Array.from(flaggedQuestions),
    bookmarked: Array.from(bookmarkedQuestions),
    remainingSeconds: remainingSeconds,
    timestamp: Date.now()
  };

  try {
    localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(sessionData));
  } catch (e) {}
}

function checkSavedSession() {
  try {
    const raw = localStorage.getItem(APP_CONFIG.storageKey);
    if (!raw) {
      startTimer();
      return;
    }

    const saved = JSON.parse(raw);
    if (saved && Object.keys(saved.userAnswers || {}).length > 0) {
      sessionBanner.classList.remove('hidden');
    } else {
      startTimer();
    }
  } catch (e) {
    startTimer();
  }
}

function restoreSession() {
  try {
    const raw = localStorage.getItem(APP_CONFIG.storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);

    currentMode = saved.mode || APP_MODES.EXAM;
    currentIndex = saved.currentIndex || 0;
    userAnswers = saved.userAnswers || {};
    flaggedQuestions = new Set(saved.flagged || []);
    bookmarkedQuestions = new Set(saved.bookmarked || []);
    remainingSeconds = typeof saved.remainingSeconds === 'number' ? saved.remainingSeconds : APP_CONFIG.defaultDurationSec;

    sessionBanner.classList.add('hidden');

    if (currentMode === APP_MODES.EXAM) {
      currentModeBadge.textContent = "EXAM MODE";
      modeSwitchBtn.textContent = "Mode: Exam";
      startTimer();
    } else {
      currentModeBadge.textContent = "PRACTICE MODE";
      modeSwitchBtn.textContent = "Mode: Practice";
      clearInterval(timerInterval);
      timerBoxWrapper.classList.add('hidden');
    }

    renderPalettes();
    renderQuestion(currentIndex);
  } catch (e) {
    clearActiveSession();
    startTimer();
  }
}

function clearActiveSession() {
  try {
    localStorage.removeItem(APP_CONFIG.storageKey);
  } catch (e) {}
}

function saveExamHistory(record) {
  try {
    const raw = localStorage.getItem(APP_CONFIG.historyKey);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(record);
    localStorage.setItem(APP_CONFIG.historyKey, JSON.stringify(list.slice(0, 15)));
  } catch (e) {}
}

// Drawer Bottom Sheet (HP)
function openMobileDrawer() {
  updatePaletteStatus();
  mobileDrawerOverlay.classList.remove('hidden');
}

function closeMobileDrawer() {
  mobileDrawerOverlay.classList.add('hidden');
}

// ==================== Event Listeners ====================
function setupEventListeners() {
  backBtn.addEventListener('click', () => {
    if (currentIndex > 0) goToQuestion(currentIndex - 1);
  });

  nextBtn.addEventListener('click', () => {
    if (currentIndex < questionsData.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      if (currentMode === APP_MODES.EXAM) {
        openFinishModal();
      } else {
        showResult();
      }
    }
  });

  flagBtn.addEventListener('click', toggleFlag);
  bookmarkBtn.addEventListener('click', toggleBookmark);
  finishBtn.addEventListener('click', openFinishModal);

  modalCancelBtn.addEventListener('click', closeFinishModal);
  modalConfirmBtn.addEventListener('click', showResult);

  btnReviewAll.addEventListener('click', () => {
    resultModal.classList.add('hidden');
    enterReviewMode(0);
  });
  btnRetryWrong.addEventListener('click', retryWrongQuestions);
  btnRestart.addEventListener('click', () => {
    resultModal.classList.add('hidden');
    window.location.reload();
  });

  modeSwitchBtn.addEventListener('click', openModeConfirmModal);
  modeCancelBtn.addEventListener('click', closeModeConfirmModal);
  modeProceedBtn.addEventListener('click', () => {
    closeModeConfirmModal();
    const nextMode = currentMode === APP_MODES.EXAM ? APP_MODES.PRACTICE : APP_MODES.EXAM;
    switchMode(nextMode);
  });

  bannerResumeBtn.addEventListener('click', restoreSession);
  bannerResetBtn.addEventListener('click', () => {
    clearActiveSession();
    sessionBanner.classList.add('hidden');
    startTimer();
  });

  mobilePaletteToggle.addEventListener('click', openMobileDrawer);
  closeDrawerBtn.addEventListener('click', closeMobileDrawer);
  mobileDrawerOverlay.addEventListener('click', (e) => {
    if (e.target === mobileDrawerOverlay) closeMobileDrawer();
  });

  if (spotlightToggle) {
    spotlightToggle.addEventListener('change', (e) => {
      document.body.classList.toggle('disable-spotlight', !e.target.checked);
    });
  }

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (!finishModal.classList.contains('hidden') || !resultModal.classList.contains('hidden') || !modeConfirmModal.classList.contains('hidden')) {
      if (e.key === 'Escape') {
        closeFinishModal();
        closeModeConfirmModal();
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      if (currentIndex < questionsData.length - 1) goToQuestion(currentIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      if (currentIndex > 0) goToQuestion(currentIndex - 1);
    } else if (['1', 'a', 'A'].includes(e.key)) {
      if (currentMode !== APP_MODES.REVIEW) selectAnswer(0);
    } else if (['2', 'b', 'B'].includes(e.key)) {
      if (currentMode !== APP_MODES.REVIEW) selectAnswer(1);
    } else if (['3', 'c', 'C'].includes(e.key)) {
      if (currentMode !== APP_MODES.REVIEW) selectAnswer(2);
    } else if (['4', 'd', 'D'].includes(e.key)) {
      if (currentMode !== APP_MODES.REVIEW) selectAnswer(3);
    }
  });
}