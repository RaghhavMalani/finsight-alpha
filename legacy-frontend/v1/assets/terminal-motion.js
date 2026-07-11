(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 1 : 620;
  const ease = 'cubic-bezier(.18,.82,.2,1)';

  function animate(el, keyframes, options = {}) {
    if (!el || reduced || !el.animate) return null;
    return el.animate(keyframes, { duration, easing: ease, fill: 'both', ...options });
  }

  window.setActiveFunction = (id = 'home') => {
    document.querySelectorAll('.fn-key').forEach((button) => {
      button.classList.toggle('active', button.dataset.fn === id);
    });
  };

  window.beginTerminalTransition = (target) => {
    const workspace = target?.closest('#primary-workspace');
    if (!workspace) return;
    workspace.classList.remove('function-cut');
    void workspace.offsetWidth;
    workspace.classList.add('function-cut');
    setTimeout(() => workspace.classList.remove('function-cut'), reduced ? 1 : 680);
  };

  window.animateTerminalView = (root) => {
    if (!root) return;
    animate(root, [
      { opacity: 0, transform: 'translateY(18px) scale(.992)', clipPath: 'inset(0 0 100% 0)' },
      { opacity: 1, transform: 'translateY(0) scale(1)', clipPath: 'inset(0 0 0 0)' },
    ], { duration: reduced ? 1 : 720 });
    root.querySelectorAll('.kpi').forEach((el, index) => animate(el, [
      { opacity: 0, transform: 'translateY(12px)', filter: 'brightness(1.8)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'brightness(1)' },
    ], { delay: reduced ? 0 : 90 + index * 34, duration: reduced ? 1 : 440 }));
    root.querySelectorAll('.tbl tr').forEach((el, index) => animate(el, [
      { opacity: 0, transform: 'translateX(-8px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ], { delay: reduced ? 0 : Math.min(80 + index * 24, 420), duration: reduced ? 1 : 360 }));
  };

  window.animatePlot = (plot) => {
    animate(plot, [
      { opacity: .15, clipPath: 'inset(0 100% 0 0)', filter: 'saturate(.4)' },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', filter: 'saturate(1)' },
    ], { duration: reduced ? 1 : 880 });
    plot?.querySelectorAll('.scatterlayer path, .barlayer path').forEach((path, index) => animate(path, [
      { opacity: 0 }, { opacity: 1 }
    ], { delay: reduced ? 0 : 160 + index * 35, duration: reduced ? 1 : 520 }));
  };

  window.animateMarketStage = (stage) => {
    if (!stage) return;
    animate(stage, [
      { opacity: 0, transform: 'scale(1.035)', filter: 'brightness(.45)' },
      { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
    ], { duration: reduced ? 1 : 1100 });
    stage.querySelectorAll('.stage-hud > *, .stage-stat, .stage-instrument').forEach((el, index) => animate(el, [
      { opacity: 0, transform: index % 2 ? 'translateX(22px)' : 'translateY(18px)' },
      { opacity: 1, transform: 'translate(0,0)' },
    ], { delay: reduced ? 0 : 240 + index * 65, duration: reduced ? 1 : 560 }));
  };

  window.pulseMarketRows = () => {
    document.querySelectorAll('.watch-row, .stage-instrument').forEach((row, index) => {
      animate(row, [
        { backgroundColor: 'rgba(69,185,211,.18)' },
        { backgroundColor: 'rgba(69,185,211,0)' },
      ], { delay: reduced ? 0 : index * 45, duration: reduced ? 1 : 740 });
    });
  };

  function bootSequence() {
    const boot = document.querySelector('#boot-sequence');
    if (!boot) return;
    if (reduced) { boot.remove(); return; }
    setTimeout(() => boot.classList.add('is-ready'), 120);
    setTimeout(() => boot.classList.add('is-leaving'), 980);
    setTimeout(() => boot.remove(), 1680);
  }

  document.addEventListener('pointermove', (event) => {
    const stage = document.querySelector('.market-stage');
    if (!stage || reduced) return;
    stage.style.setProperty('--mx', ((event.clientX / innerWidth) - .5).toFixed(3));
    stage.style.setProperty('--my', ((event.clientY / innerHeight) - .5).toFixed(3));
  }, { passive: true });

  document.addEventListener('DOMContentLoaded', () => {
    bootSequence();
    window.animateMarketStage(document.querySelector('.market-stage'));
  });
})();
