/* =========================================================
   SSW KAIGO PORTAL HUB CONTROLLER
   Transisi mulus & efek suara interaktif Web Audio API
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.feature-card');

  // Audio synthesizer native (tanpa perlu file audio luar)
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

  // Handle klik dengan jeda transisi halus
  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const targetUrl = card.getAttribute('href');

      playClickTone();
      card.style.transform = 'scale(0.97)';

      setTimeout(() => {
        window.location.href = targetUrl;
      }, 140);
    });
  });
});