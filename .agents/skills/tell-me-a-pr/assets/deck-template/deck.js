(() => {
  // ---------- core slide state ----------
  const slides   = Array.from(document.querySelectorAll('.slide'));
  const total    = slides.length;
  const indexEl  = document.getElementById('slideIndex');
  const totalEl  = document.getElementById('slideTotal');
  const barFill  = document.getElementById('barFill');
  const barSvg   = document.querySelector('.bar-sketch');
  const prevBtn  = document.getElementById('prevBtn');
  const nextBtn  = document.getElementById('nextBtn');
  const titleEl  = document.getElementById('deckTitle');

  if (totalEl) totalEl.textContent = total || 1;

  // optional manifest
  let manifest = {};
  try {
    const raw = document.getElementById('manifest');
    if (raw) {
      manifest = JSON.parse(raw.textContent.trim() || '{}');
      if (manifest.mr_id && titleEl) titleEl.textContent = `MR !${manifest.mr_id}`;
      if (manifest.mr_title && titleEl) titleEl.textContent = manifest.mr_title;
    }
  } catch (_) {}

  let i = 0;

  function show(n) {
    if (!total) return;
    i = Math.max(0, Math.min(total - 1, n));
    slides.forEach((s, k) => s.classList.toggle('active', k === i));
    if (indexEl) indexEl.textContent = i + 1;
    if (barFill) barFill.style.width = `${((i + 1) / total) * 100}%`;
    history.replaceState(null, '', `#${i + 1}`);
    // hide any open tooltips when switching slides
    document.querySelectorAll('.callout-tooltip.visible').forEach(t => t.classList.remove('visible'));
    // Re-place callouts on the now-visible slide. Their geometry comes from
    // getBoundingClientRect, which returns zeroes while the slide is display:none.
    const active = slides[i];
    if (active && active.dataset.kind === 'code') {
      const container = active.querySelector('.diff-container');
      if (container) attachCalloutsForSlide(active, container);
    }
  }

  // ---------- rough.js sketchy decorations ----------
  const RoughLib = window.rough;
  const roughOpts = {
    roughness: 1.6,
    bowing: 1.4,
    stroke: '#2b2b2b',
    strokeWidth: 1.2,
    fill: undefined,
  };

  function clearSvg(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  function drawSketchRect(svg, opts = {}) {
    if (!svg || !RoughLib) return;
    const w = svg.clientWidth || svg.getBoundingClientRect().width || 0;
    const h = svg.clientHeight || svg.getBoundingClientRect().height || 0;
    if (!w || !h) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    clearSvg(svg);
    const rc = RoughLib.svg(svg);
    const node = rc.rectangle(2, 2, Math.max(0, w - 4), Math.max(0, h - 4), { ...roughOpts, ...opts });
    svg.appendChild(node);
  }

  function drawSketchCircle(svg, opts = {}) {
    if (!svg || !RoughLib) return;
    const w = svg.clientWidth || svg.getBoundingClientRect().width || 0;
    const h = svg.clientHeight || svg.getBoundingClientRect().height || 0;
    if (!w || !h) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    clearSvg(svg);
    const rc = RoughLib.svg(svg);
    const node = rc.ellipse(w / 2, h / 2, w - 4, h - 4, { ...roughOpts, ...opts });
    svg.appendChild(node);
  }

  function paintAllChrome() {
    drawSketchRect(barSvg, { roughness: 1.2, strokeWidth: 1, stroke: '#2b2b2b99' });
    drawSketchRect(document.querySelector('.kbd-hint .kbd-frame'), { roughness: 2.0, strokeWidth: 1, stroke: '#2b2b2b88' });
    document.querySelectorAll('.nav-btn .nav-sketch').forEach(svg => {
      drawSketchCircle(svg, { roughness: 1.8, strokeWidth: 1.4 });
    });
    document.querySelectorAll('.diff-frame .frame-sketch').forEach(svg => {
      drawSketchRect(svg, { roughness: 1.4, strokeWidth: 1.2, stroke: '#2b2b2baa' });
    });
  }

  // ---------- diff rendering ----------
  function renderDiffs() {
    const Diff2HtmlUI = window.Diff2HtmlUI;
    document.querySelectorAll('.slide[data-kind="code"]').forEach(slide => {
      const diffScript = slide.querySelector('script.slide-diff');
      const container  = slide.querySelector('.diff-container');
      if (!diffScript || !container) return;
      const diffText = diffScript.textContent.replace(/^\s+|\s+$/g, '');
      if (!diffText) return;

      if (Diff2HtmlUI) {
        try {
          const ui = new Diff2HtmlUI(container, diffText, {
            outputFormat: 'line-by-line',
            drawFileList: false,
            matching: 'lines',
            highlight: true,
          });
          ui.draw();
          if (ui.highlightCode) ui.highlightCode();
        } catch (e) {
          container.innerHTML = `<pre class="diff-fallback">${escapeHtml(diffText)}</pre>`;
        }
      } else {
        container.innerHTML = `<pre class="diff-fallback">${escapeHtml(diffText)}</pre>`;
      }

      attachCalloutsForSlide(slide, container);
    });
  }

  function attachCalloutsForSlide(slide, container) {
    const calloutsScript = slide.querySelector('script.slide-callouts');
    let callouts = [];
    try { callouts = JSON.parse((calloutsScript && calloutsScript.textContent) || '[]'); } catch (_) {}
    if (Array.isArray(callouts) && callouts.length) {
      // wait a tick so the diff is in the DOM and laid out
      requestAnimationFrame(() => attachCallouts(slide, container, callouts));
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeCalloutText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function renderedCodeText(row) {
    const code = row && (
      row.querySelector('.d2h-code-line-ctn') ||
      row.querySelector('.d2h-code-side-line') ||
      row.querySelector('td:last-child')
    );
    return normalizeCalloutText(code ? code.textContent : '');
  }

  function findRowForSideLine(container, lineNumber, side = 'new') {
    // diff2html line-by-line rows expose old/new numbers as .line-num1/.line-num2.
    // New decks anchor callouts by side + line + line_text so bad line numbers do not
    // silently draw around the wrong rendered row.
    const candidates = container.querySelectorAll('.d2h-code-linenumber, .d2h-code-side-linenumber');
    let target = null;
    candidates.forEach(el => {
      const lineEl = side === 'old' ? el.querySelector('.line-num1') : el.querySelector('.line-num2');
      const txt = (lineEl ? lineEl.textContent : el.textContent).trim();
      if (txt === String(lineNumber)) {
        target = el.closest('tr') || el.parentElement;
      }
    });
    return target;
  }

  function findRowsForCallout(container, callout) {
    const side = callout.side || 'new';
    const start = callout.line_start || callout.line;
    const end = callout.line_end || start;
    if (!start) return [];

    const rows = [];
    for (let line = start; line <= end; line += 1) {
      const row = findRowForSideLine(container, line, side);
      if (!row) {
        console.warn('Skipping callout: line is absent from rendered diff', { side, line, callout });
        return [];
      }
      rows.push(row);
    }

    if (callout.line_text) {
      const expected = normalizeCalloutText(callout.line_text);
      const actual = renderedCodeText(rows[0]);
      if (expected && actual !== expected) {
        console.warn('Skipping callout: line_text does not match rendered diff row', {
          side,
          line: start,
          expected,
          actual,
          callout,
        });
        return [];
      }
    }

    return rows;
  }

  function attachCallouts(slide, container, callouts) {
    const frame = slide.querySelector('.diff-frame');
    if (!frame) return;
    // overlay layer sits on top of the scroll container, positioned relative to .diff-frame
    let overlay = frame.querySelector('.callout-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'callout-overlay';
      Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '4',
      });
      frame.appendChild(overlay);
    } else {
      overlay.innerHTML = '';
    }

    callouts.forEach(c => {
      const rows = findRowsForCallout(container, c);
      if (!rows.length) return;
      const rowRects  = rows.map(row => row.getBoundingClientRect());
      const frameRect = frame.getBoundingClientRect();
      const minTop    = Math.min(...rowRects.map(r => r.top));
      const maxBottom = Math.max(...rowRects.map(r => r.bottom));
      const maxWidth  = Math.max(...rowRects.map(r => r.width));

      const top    = minTop - frameRect.top + container.scrollTop - 6;
      const height = (maxBottom - minTop) + 12;
      const width  = Math.min(frameRect.width - 24, maxWidth + 24);
      const left   = 6;

      const wrap = document.createElement('div');
      wrap.className = 'callout-circle';
      Object.assign(wrap.style, {
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: `${height}px`,
        position: 'absolute',
        pointerEvents: 'auto',
      });

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      wrap.appendChild(svg);

      const colorByKind = {
        info:  '#4a6fa5',
        warn:  '#d4a73a',
        risk:  '#c46a4a',
      };
      const stroke = colorByKind[c.kind] || colorByKind.warn;
      const rc = RoughLib && RoughLib.svg(svg);
      if (rc) {
        const node = rc.ellipse(width / 2, height / 2, Math.max(20, width - 8), Math.max(14, height - 6), {
          roughness: 2.4,
          bowing: 2,
          stroke,
          strokeWidth: 2,
        });
        svg.appendChild(node);
      }

      const tip = document.createElement('div');
      tip.className = `callout-tooltip kind-${c.kind || 'warn'}`;
      const noteEl = document.createElement('div');
      noteEl.className = 'callout-note';
      noteEl.textContent = c.note || '';
      tip.appendChild(noteEl);
      if (c.why) {
        const whyEl = document.createElement('div');
        whyEl.className = 'callout-why';
        whyEl.textContent = c.why;
        tip.appendChild(whyEl);
      }
      Object.assign(tip.style, {
        top:  `${top + height + 6}px`,
        left: `${left + 24}px`,
      });
      overlay.appendChild(wrap);
      overlay.appendChild(tip);

      const showTip = () => tip.classList.add('visible');
      const hideTip = () => tip.classList.remove('visible');
      wrap.addEventListener('mouseenter', showTip);
      wrap.addEventListener('mouseleave', hideTip);
      wrap.addEventListener('focus', showTip);
      wrap.addEventListener('blur', hideTip);
      wrap.addEventListener('click', () => tip.classList.toggle('visible'));
      wrap.tabIndex = 0;
    });
  }

  // ---------- keyboard + buttons ----------
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { show(i + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { show(i - 1); e.preventDefault(); }
    else if (e.key === 'Home') { show(0); e.preventDefault(); }
    else if (e.key === 'End')  { show(total - 1); e.preventDefault(); }
  });

  if (prevBtn) prevBtn.addEventListener('click', () => show(i - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => show(i + 1));

  // ---------- init ----------
  function init() {
    paintAllChrome();
    renderDiffs();
    const hash = parseInt(location.hash.slice(1), 10);
    show(isNaN(hash) ? 0 : hash - 1);
  }

  // re-paint sketches on resize (debounced) so they don't stretch
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(paintAllChrome, 180);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
