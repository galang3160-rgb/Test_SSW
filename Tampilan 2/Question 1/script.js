// ==================== Konfigurasi & State ====================
const POINT_PER_QUESTION = 2; // Poin per soal (30 soal x 2 = 60 poin)

let questionsData = [];
let currentIndex = 0;
let userAnswers = {};   // Format: { index: optionIndex }
let flaggedQuestions = new Set();
let remainingSeconds = 60 * 60; // 60 menit
let timerInterval = null;

// ==================== Audio Synthesizer (Web Audio API) ====================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Suara klik opsi jawaban
function playSelectSound() {
  try {
    const ctx = getAudioContext();
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
  } catch (e) {
    console.warn("Audio Context blocked", e);
  }
}

// Suara selesai ujian
function playFinishSound() {
  try {
    const ctx = getAudioContext();
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
  } catch (e) {
    console.warn("Audio Context blocked", e);
  }
}

// ==================== DOM Elements ====================
const topQuestionIndicator = document.getElementById('topQuestionIndicator');
const instructionText = document.getElementById('instructionText');
const questionText = document.getElementById('questionText');
const optionsContainer = document.getElementById('optionsContainer');
const timerText = document.getElementById('timerText');

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

// Modal Konfirmasi Selesai
const finishModal = document.getElementById('finishModal');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalAnsweredCount = document.getElementById('modalAnsweredCount');
const modalUnansweredCount = document.getElementById('modalUnansweredCount');
const modalFlaggedCount = document.getElementById('modalFlaggedCount');

// Modal Hasil & Nilai
const resultModal = document.getElementById('resultModal');
const scoreTotalVal = document.getElementById('scoreTotalVal');
const scoreMaxVal = document.getElementById('scoreMaxVal');
const resCorrectCount = document.getElementById('resCorrectCount');
const resWrongCount = document.getElementById('resWrongCount');
const resEmptyCount = document.getElementById('resEmptyCount');
const resPercentage = document.getElementById('resPercentage');
const resultGridList = document.getElementById('resultGridList');
const resultFeedback = document.getElementById('resultFeedback');
const btnRestart = document.getElementById('btnRestart');

// ==================== Inisialisasi ====================
document.addEventListener('DOMContentLoaded', () => {
  loadQuestions();
  setupEventListeners();
  startTimer();
});

// Load file question.json langsung
async function loadQuestions() {
  const filePath = 'question.json';

  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    let data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Data JSON kosong.");
    }

    // Pastikan 30 soal (jika isi JSON kurang dari 30, duplikasi otomatis untuk testing)
    if (data.length < 30) {
      const originalLength = data.length;
      while (data.length < 30) {
        const item = data[data.length % originalLength];
        data.push({
          ...item,
          id: data.length + 1
        });
      }
    } else if (data.length > 30) {
      data = data.slice(0, 30);
    }

    questionsData = data;
    renderPalettes();
    renderQuestion(0);
  } catch (error) {
    console.error(error);
    questionText.innerHTML = `
      <span style="color:#ef4444; font-size:14px;">
        Gagal memuat <code>${filePath}</code>.<br>
        Pastikan file <code>question.json</code> berada di folder yang sama dengan <code>index.html</code> dan dijalankan via local server (Live Server).
      </span>
    `;
  }
}

// Render Palette untuk Desktop dan Drawer HP
function renderPalettes() {
  desktopPaletteGrid.innerHTML = '';
  mobilePaletteGrid.innerHTML = '';

  questionsData.forEach((_, idx) => {
    // Tombol Desktop
    const btnDesktop = createPaletteButton(idx);
    desktopPaletteGrid.appendChild(btnDesktop);

    // Tombol Drawer HP
    const btnMobile = createPaletteButton(idx, true);
    mobilePaletteGrid.appendChild(btnMobile);
  });

  updatePaletteStatus();
}

function createPaletteButton(idx, isMobile = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'palette-btn';
  btn.textContent = idx + 1;
  btn.dataset.index = idx;

  btn.addEventListener('click', () => {
    goToQuestion(idx);
    if (isMobile) {
      closeMobileDrawer();
    }
  });

  return btn;
}

// Update Status Tombol Nomor (Warna: Hijau jika terisi, Abu jika belum, Kuning jika flag)
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
    btn.classList.toggle('active', idx === currentIndex);
    btn.classList.toggle('answered', userAnswers[idx] !== undefined);
    btn.classList.toggle('flagged', flaggedQuestions.has(idx));
  });
}

// Render Soal Aktif
function renderQuestion(index) {
  if (!questionsData || !questionsData[index]) return;

  currentIndex = index;
  const currentQ = questionsData[index];

  topQuestionIndicator.textContent = `Question: ${index + 1} / ${questionsData.length}`;
  instructionText.innerHTML = currentQ.instruction || '（  ）に入れるのに最もよいものを、A・B・C・Dから一つ選んでください。';
  questionText.innerHTML = currentQ.question;

  optionsContainer.innerHTML = '';
  const badges = ['A', 'B', 'C', 'D'];

  if (Array.isArray(currentQ.options)) {
    currentQ.options.forEach((optText, optIdx) => {
      const optDiv = document.createElement('div');
      optDiv.className = 'option-item';
      if (userAnswers[currentIndex] === optIdx) {
        optDiv.classList.add('selected');
      }

      optDiv.innerHTML = `
        <div class="option-badge">${badges[optIdx] || optIdx + 1}</div>
        <div class="option-label">${optText}</div>
      `;

      optDiv.addEventListener('click', () => selectAnswer(optIdx));
      optionsContainer.appendChild(optDiv);
    });
  }

  backBtn.disabled = currentIndex === 0;
  nextBtn.textContent = (currentIndex === questionsData.length - 1) ? 'Finish' : 'Next >';
  flagBtn.classList.toggle('active', flaggedQuestions.has(currentIndex));

  updatePaletteStatus();
}

// Handler Saat Opsi Jawaban Dipilih
function selectAnswer(optionIndex) {
  playSelectSound();
  userAnswers[currentIndex] = optionIndex;
  renderQuestion(currentIndex);

  const isDesktopAuto = autoAdvanceToggle && autoAdvanceToggle.checked;
  // Di layar HP otomatis next agar praktis
  if (isDesktopAuto || window.innerWidth <= 768) {
    setTimeout(() => {
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
}

// Buka & Tutup Drawer HP
function openMobileDrawer() {
  updatePaletteStatus();
  mobileDrawerOverlay.classList.remove('hidden');
}

function closeMobileDrawer() {
  mobileDrawerOverlay.classList.add('hidden');
}

// Pengatur Waktu Mundur
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      showResult();
      return;
    }
    remainingSeconds--;
    updateTimerDisplay();
  }, 1000);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  timerText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Modal Konfirmasi Selesai
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

// Tampilkan Hasil Evaluasi & Perhitungan Nilai
function showResult() {
  closeFinishModal();
  closeMobileDrawer();
  clearInterval(timerInterval);
  playFinishSound();

  let correctCount = 0;
  let wrongCount = 0;
  let emptyCount = 0;

  resultGridList.innerHTML = '';

  questionsData.forEach((q, idx) => {
    const isAnswered = userAnswers[idx] !== undefined;
    const isCorrect = isAnswered && userAnswers[idx] === q.correct;

    if (!isAnswered) {
      emptyCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      wrongCount++;
    }

    const badge = document.createElement('div');
    badge.className = `res-item ${!isAnswered ? 'empty' : isCorrect ? 'correct' : 'wrong'}`;
    badge.innerHTML = `
      <span class="num">${idx + 1}</span>
      <span class="mark">${!isAnswered ? '-' : isCorrect ? '✓' : '✗'}</span>
    `;
    resultGridList.appendChild(badge);
  });

  const totalQuestions = questionsData.length;
  const totalMaxScore = totalQuestions * POINT_PER_QUESTION; // 30 * 2 = 60
  const finalScore = correctCount * POINT_PER_QUESTION;
  const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  scoreTotalVal.textContent = finalScore;
  scoreMaxVal.textContent = `/ ${totalMaxScore} 点`;
  resCorrectCount.textContent = `${correctCount} 問`;
  resWrongCount.textContent = `${wrongCount} 問`;
  resEmptyCount.textContent = `${emptyCount} 問`;
  resPercentage.textContent = `${percentage}%`;

  if (percentage >= 70) {
    resultFeedback.textContent = "合格 (Pass)! 素晴らしい結果です。";
    resultFeedback.className = "result-feedback pass";
  } else {
    resultFeedback.textContent = "不合格 (Need Improvement). 復習しましょう。";
    resultFeedback.className = "result-feedback fail";
  }

  resultModal.classList.remove('hidden');
}

// Ulangi Tes
function restartExam() {
  resultModal.classList.add('hidden');
  userAnswers = {};
  flaggedQuestions.clear();
  remainingSeconds = 60 * 60;
  currentIndex = 0;
  startTimer();
  renderPalettes();
  renderQuestion(0);
}

// Event Listeners
function setupEventListeners() {
  backBtn.addEventListener('click', () => {
    if (currentIndex > 0) goToQuestion(currentIndex - 1);
  });

  nextBtn.addEventListener('click', () => {
    if (currentIndex < questionsData.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      openFinishModal();
    }
  });

  flagBtn.addEventListener('click', toggleFlag);
  finishBtn.addEventListener('click', openFinishModal);
  modalCancelBtn.addEventListener('click', closeFinishModal);
  modalConfirmBtn.addEventListener('click', showResult);
  btnRestart.addEventListener('click', restartExam);

  // Toggle & Close Bottom Sheet Nomor di HP
  mobilePaletteToggle.addEventListener('click', openMobileDrawer);
  closeDrawerBtn.addEventListener('click', closeMobileDrawer);
  mobileDrawerOverlay.addEventListener('click', (e) => {
    if (e.target === mobileDrawerOverlay) closeMobileDrawer();
  });

  // Shortcut Keyboard (Laptop)
  document.addEventListener('keydown', (e) => {
    if (!finishModal.classList.contains('hidden') || !resultModal.classList.contains('hidden')) return;

    if (e.key === 'ArrowRight') {
      if (currentIndex < questionsData.length - 1) goToQuestion(currentIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      if (currentIndex > 0) goToQuestion(currentIndex - 1);
    } else if (['1', 'a', 'A'].includes(e.key)) {
      selectAnswer(0);
    } else if (['2', 'b', 'B'].includes(e.key)) {
      selectAnswer(1);
    } else if (['3', 'c', 'C'].includes(e.key)) {
      selectAnswer(2);
    } else if (['4', 'd', 'D'].includes(e.key)) {
      selectAnswer(3);
    }
  });
}