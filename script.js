/* =========================================================
   SSW KAIGO PORTAL HUB CONTROLLER
   Transisi klik singkat dan nada klik via Web Audio API
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // Sebelumnya memakai '.feature-card', padahal kelas di HTML adalah '.hub-card'
  const cards = document.querySelectorAll('.hub-card');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Audio synthesizer native (tanpa file audio luar)
  let audioCtx = null;
  function playClickTone() {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!audioCtx) audioCtx = new AudioCtxClass();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      const now = audioCtx.currentTime;
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.08);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      // Browser membatasi audio jika belum ada gesture
    }
  }

  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      // Biarkan Ctrl/Cmd/Shift + klik tetap membuka tab atau jendela baru
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const targetUrl = card.getAttribute('href');
      if (!targetUrl) return;

      e.preventDefault();
      if (card.classList.contains('is-leaving')) return; // cegah klik ganda

      playClickTone();
      card.classList.add('is-leaving');

      const delay = reduceMotion.matches ? 0 : 140;
      setTimeout(() => {
        window.location.href = targetUrl;
      }, delay);
    });
  });

  // Saat kembali lewat tombol Back (bfcache), kartu kembali normal
  window.addEventListener('pageshow', () => {
    cards.forEach(card => card.classList.remove('is-leaving'));
  });
});