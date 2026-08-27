(() => {
  'use strict';

  function qsa(sel, root=document) {
    return [...root.querySelectorAll(sel)];
  }

  function getDirectPool(section) {
    if (!section) return null;
    return qsa(':scope > .fp-numbers', section)[0] || null;
  }

  function originalValues(pool) {
    if (!pool) return [];
    if (!pool.dataset.k62Original) {
      const vals = qsa('.fp-num', pool)
        .map(x => (x.textContent.match(/\d+/) || [])[0])
        .filter(Boolean)
        .map(Number);
      pool.dataset.k62Original = JSON.stringify(vals);
    }
    try {
      return JSON.parse(pool.dataset.k62Original);
    } catch {
      return [];
    }
  }

  function setOrder(pool, mode) {
    const chips = qsa('.fp-num', pool);
    if (!chips.length) return;

    const originals = originalValues(pool);
    const chipMap = new Map();
    chips.forEach(ch => {
      const n = Number((ch.textContent.match(/\d+/) || [])[0]);
      chipMap.set(n, ch);
    });

    let order = originals.slice();

    if (mode === 'asc' || mode === 'both') {
      order.sort((a,b) => a-b);
    }

    order.forEach(n => {
      const chip = chipMap.get(Number(n));
      if (chip) pool.appendChild(chip);
    });

    pool.dataset.k62Mode = mode;
  }

  function ensureModeBar(section) {
    if (!section) return;
    const pool = getDirectPool(section);
    if (!pool) return;

    if (qsa('.fp-num', pool).length < 10) return;

    pool.classList.add('k62-fp-pool20');

    let bar = section.querySelector(':scope > .k62-fp-modebar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'k62-fp-modebar';
      bar.innerHTML = `
        <button type="button" data-k62-fpmode="fall">Вып</button>
        <button type="button" data-k62-fpmode="asc" class="on">Возр</button>
        <button type="button" data-k62-fpmode="both">Вм</button>
      `;

      const label = [...section.children].find(el =>
        el.classList?.contains('fp-label')
      );

      if (label && label.nextElementSibling === pool) {
        label.insertAdjacentElement('afterend', bar);
      } else {
        pool.insertAdjacentElement('beforebegin', bar);
      }

      bar.addEventListener('click', e => {
        const btn = e.target.closest('[data-k62-fpmode]');
        if (!btn) return;
        const mode = btn.dataset.k62Fpmode;
        qsa('button', bar).forEach(x => x.classList.toggle('on', x === btn));
        setOrder(pool, mode);
      });
    }

    if (!pool.dataset.k62Mode) setOrder(pool, 'asc');
  }

  function fixFingerprint() {
    qsa('#fingerprintResult .fp-section').forEach(ensureModeBar);
  }

  function boot() {
    fixFingerprint();

    const root = document.getElementById('fingerprintResult');
    if (!root) {
      setTimeout(boot, 300);
      return;
    }

    const mo = new MutationObserver(() => {
      requestAnimationFrame(fixFingerprint);
    });

    mo.observe(root, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
