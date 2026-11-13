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
  const calloutLayoutState = new WeakMap();
  const warnedCallouts = new Set();

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
    if (!Array.isArray(callouts) || !callouts.length) {
      const overlay = container.querySelector('.callout-overlay');
      if (overlay) overlay.remove();
      return;
    }

    let state = calloutLayoutState.get(container);
    if (!state) {
      state = { slide, callouts, scheduled: false, scrollBound: false, fontsBound: false };
      calloutLayoutState.set(container, state);
    }
    state.slide = slide;
    state.callouts = callouts;

    if (!state.scrollBound) {
      container.addEventListener('scroll', () => scheduleCalloutLayout(container), { passive: true });
      state.scrollBound = true;
    }

    scheduleCalloutLayout(container);
    requestAnimationFrame(() => requestAnimationFrame(() => scheduleCalloutLayout(container)));
    setTimeout(() => scheduleCalloutLayout(container), 120);

    if (!state.fontsBound && document.fonts && document.fonts.ready) {
      state.fontsBound = true;
      document.fonts.ready.then(() => scheduleCalloutLayout(container)).catch(() => {});
    }
  }

  function scheduleCalloutLayout(container) {
    const state = calloutLayoutState.get(container);
    if (!state || state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      attachCallouts(state.slide, container, state.callouts);
    });
  }

  function scheduleActiveCallouts() {
    const active = slides[i];
    if (active && active.dataset.kind === 'code') {
      const container = active.querySelector('.diff-container');
      if (container) attachCalloutsForSlide(active, container);
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
    return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function codeCellForRow(row, side = 'new') {
    if (!row) return null;
    const sideCells = Array.from(row.querySelectorAll('.d2h-code-side-line'));
    if (sideCells.length > 1) return side === 'old' ? sideCells[0] : sideCells[1];
    if (sideCells.length === 1) return sideCells[0];
    return row.querySelector('.d2h-code-line') || row.querySelector('td:last-child');
  }

  function renderedCodeText(row, side = 'new') {
    const cell = codeCellForRow(row, side);
    if (!cell) return '';
    const code = cell.querySelector('.d2h-code-line-ctn');
    if (code) return normalizeCalloutText(code.textContent);

    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.d2h-code-line-prefix').forEach(el => el.remove());
    return normalizeCalloutText(clone.textContent);
  }

  function rowsForSideLine(container, lineNumber, side = 'new') {
    // diff2html line-by-line rows expose old/new numbers as .line-num1/.line-num2.
    // New decks anchor callouts by side + line + line_text so bad line numbers do not
    // silently draw around the wrong rendered row.
    const candidates = container.querySelectorAll('.d2h-code-linenumber, .d2h-code-side-linenumber');
    const rows = [];
    candidates.forEach(el => {
      const lineEl = side === 'old' ? el.querySelector('.line-num1') : el.querySelector('.line-num2');
      const txt = (lineEl ? lineEl.textContent : el.textContent).trim();
      if (txt === String(lineNumber)) {
        const row = el.closest('tr') || el.parentElement;
        if (row && !rows.includes(row)) rows.push(row);
      }
    });
    return rows;
  }

  function warnSkippedCallout(reason, details) {
    const c = details.callout || {};
    const key = [
      reason,
      details.side || '',
      details.line || '',
      c.line_text || '',
      c.note || '',
    ].join('|');
    if (warnedCallouts.has(key)) return;
    warnedCallouts.add(key);
    console.warn(reason, details);
  }

  function findRowsForCallout(container, callout) {
    const side = callout.side === 'old' ? 'old' : 'new';
    const start = Number(callout.line_start || callout.line);
    const end = Number(callout.line_end || callout.line || callout.line_start);
    const expected = normalizeCalloutText(callout.line_text);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      warnSkippedCallout('Skipping callout: line is absent from rendered diff', { side, line: callout.line, callout });
      return [];
    }
    if (!expected) {
      warnSkippedCallout('Skipping callout: line_text is required to place callout', { side, line: start, callout });
      return [];
    }

    const firstLineRows = rowsForSideLine(container, start, side);
    if (!firstLineRows.length) {
      warnSkippedCallout('Skipping callout: line is absent from rendered diff', { side, line: start, callout });
      return [];
    }

    const firstRow = firstLineRows.find(row => renderedCodeText(row, side) === expected);
    if (!firstRow) {
      warnSkippedCallout('Skipping callout: line_text does not match rendered diff row', {
        side,
        line: start,
        expected,
        actual: firstLineRows.map(row => renderedCodeText(row, side)),
        callout,
      });
      return [];
    }

    const rows = [firstRow];
    for (let line = start + 1; line <= end; line += 1) {
      const lineRows = rowsForSideLine(container, line, side);
      if (!lineRows.length) {
        warnSkippedCallout('Skipping callout: line is absent from rendered diff', { side, line, callout });
        return [];
      }
      rows.push(lineRows[0]);
    }

    return rows;
  }

  function calloutGeometry(container, rows, side) {
    const containerRect = container.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height) return null;

    const rects = rows.map(row => {
      const cell = codeCellForRow(row, side) || row;
      const cellRect = cell.getBoundingClientRect();
      const code = cell.querySelector('.d2h-code-line-ctn') || cell;
      const codeRect = code.getBoundingClientRect();
      const codeOffset = Math.max(0, codeRect.left - cellRect.left);
      const width = Math.max(
        cellRect.width,
        cell.scrollWidth || 0,
        codeOffset + (code.scrollWidth || codeRect.width)
      );
      return {
        top: cellRect.top - containerRect.top + container.scrollTop,
        left: cellRect.left - containerRect.left + container.scrollLeft,
        bottom: cellRect.bottom - containerRect.top + container.scrollTop,
        right: cellRect.left - containerRect.left + container.scrollLeft + width,
      };
    }).filter(r => r.bottom > r.top && r.right > r.left);

    if (!rects.length) return null;

    const padX = 10;
    const padY = 6;
    const minTop = Math.min(...rects.map(r => r.top));
    const maxBottom = Math.max(...rects.map(r => r.bottom));
    const minLeft = Math.min(...rects.map(r => r.left));
    const maxRight = Math.max(...rects.map(r => r.right));

    return {
      top: Math.max(0, minTop - padY),
      left: Math.max(0, minLeft - padX),
      width: Math.max(28, maxRight - minLeft + padX * 2),
      height: Math.max(18, maxBottom - minTop + padY * 2),
    };
  }

  function attachCallouts(slide, container, callouts) {
    if (!slide.classList.contains('active')) return;

    const frame = slide.querySelector('.diff-frame');
    if (frame) {
      Array.from(frame.children).forEach(child => {
        if (child.classList && child.classList.contains('callout-overlay')) child.remove();
      });
    }

    let overlay = container.querySelector('.callout-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'callout-overlay';
      Object.assign(overlay.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        pointerEvents: 'none',
        zIndex: '4',
      });
      container.appendChild(overlay);
    } else {
      overlay.innerHTML = '';
    }
    Object.assign(overlay.style, {
      width: `${container.scrollWidth}px`,
      height: `${container.scrollHeight}px`,
    });

    callouts.forEach(c => {
      const rows = findRowsForCallout(container, c);
      if (!rows.length) return;
      const geometry = calloutGeometry(container, rows, c.side === 'old' ? 'old' : 'new');
      if (!geometry) return;
      const { top, left, width, height } = geometry;

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
    resizeT = setTimeout(() => {
      paintAllChrome();
      scheduleActiveCallouts();
    }, 180);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
