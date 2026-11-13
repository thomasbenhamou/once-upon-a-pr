(() => {
  const slides = Array.from(document.querySelectorAll('.slide'));
  // Opening the unfilled template should show its bundled preview, not an empty canvas.
  if (!slides.length && document.getElementById('manifest')?.textContent.trim() === '<!-- MANIFEST -->') {
    const sample = new URL('sample.html', location.href);
    sample.hash = location.hash || '#1';
    location.replace(sample.href);
    return;
  }
  const indexEl = document.getElementById('slideIndex');
  const totalEl = document.getElementById('slideTotal');
  const barFill = document.getElementById('barFill');
  const progress = document.getElementById('progressBar');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const titleEl = document.getElementById('deckTitle');
  let current = 0;

  try {
    const manifest = JSON.parse(document.getElementById('manifest')?.textContent || '{}');
    if (titleEl) titleEl.textContent = manifest.mr_title || 'A walkthrough of the change';
  } catch (_) {}
  if (totalEl) totalEl.textContent = slides.length;
  if (progress) progress.setAttribute('aria-valuemax', slides.length);

  function show(index) {
    if (!slides.length) return;
    current = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, n) => {
      slide.classList.toggle('active', n === current);
      slide.hidden = n !== current;
    });
    if (indexEl) indexEl.textContent = current + 1;
    if (barFill) barFill.style.width = `${((current + 1) / slides.length) * 100}%`;
    if (progress) progress.setAttribute('aria-valuenow', current + 1);
    if (prevBtn) prevBtn.disabled = current === 0;
    if (nextBtn) nextBtn.disabled = current === slides.length - 1;
    if (location.hash !== `#${current + 1}`) history.replaceState(null, '', `#${current + 1}`);
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function normalize(text) {
    return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function codeCell(row, side) {
    const cells = Array.from(row.querySelectorAll('.d2h-code-side-line'));
    if (cells.length > 1) return side === 'old' ? cells[0] : cells[1];
    return cells[0] || row.querySelector('.d2h-code-line');
  }

  function rowsForLine(container, line, side) {
    return Array.from(container.querySelectorAll('tr')).filter(row => {
      const number = row.querySelector(side === 'old' ? '.line-num1' : '.line-num2');
      return number && number.textContent.trim() === String(line);
    });
  }

  function anchoredRows(container, callout) {
    const side = callout.side === 'old' ? 'old' : 'new';
    const start = Number(callout.line_start ?? callout.line);
    const end = Number(callout.line_end ?? callout.line ?? start);
    const expected = normalize(callout.line_text);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || !expected) return [];
    const first = rowsForLine(container, start, side).find(row =>
      normalize(codeCell(row, side)?.querySelector('.d2h-code-line-ctn')?.textContent) === expected
    );
    if (!first) return [];
    const rows = [first];
    for (let line = start + 1; line <= end; line++) {
      const row = rowsForLine(container, line, side)[0];
      if (!row) return [];
      rows.push(row);
    }
    return rows;
  }

  function addNotes(slide, container, callouts) {
    if (!callouts.length) return;
    let layout = slide.querySelector('.code-layout');
    if (!layout) {
      // Also support earlier generated HTML that has a standalone diff-frame.
      const frame = slide.querySelector('.diff-frame');
      if (!frame) return;
      layout = document.createElement('div');
      layout.className = 'code-layout';
      frame.before(layout);
      layout.appendChild(frame);
    }

    const aside = document.createElement('aside');
    aside.className = 'code-notes';
    aside.setAttribute('aria-label', 'Notes on this diff');
    const heading = document.createElement('p');
    heading.className = 'notes-heading';
    heading.textContent = 'What matters here';
    aside.appendChild(heading);

    callouts.forEach(callout => {
      const rows = anchoredRows(container, callout);
      if (!rows.length) {
        console.warn('Skipping callout: anchor does not match rendered diff', callout);
        return;
      }
      const number = aside.querySelectorAll('.code-note').length + 1;
      rows.forEach(row => row.classList.add('annotated-line'));
      const gutter = rows[0].querySelector('.d2h-code-linenumber, .d2h-code-side-linenumber');
      if (gutter) {
        gutter.classList.add('annotated-gutter');
        gutter.dataset.noteNumber = gutter.dataset.noteNumber ? `${gutter.dataset.noteNumber},${number}` : number;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-note';
      const badge = document.createElement('span');
      badge.className = 'note-number';
      badge.textContent = number;
      badge.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'note-text';
      text.textContent = callout.note || 'Review this line';
      if (callout.why) {
        const why = document.createElement('span');
        why.className = 'note-why';
        why.textContent = callout.why;
        text.appendChild(why);
      }
      const label = document.createElement('span');
      label.className = 'note-label';
      const start = callout.line_start ?? callout.line;
      const end = callout.line_end ?? start;
      label.textContent = `L${start}${end !== start ? `–${end}` : ''}${callout.side === 'old' ? ' · removed' : ''}${callout.kind === 'risk' ? ' · risk' : ''}`;
      text.appendChild(label);
      button.append(badge, text);
      const emphasize = on => rows.forEach(row => row.classList.toggle('is-emphasized', on));
      button.addEventListener('mouseenter', () => emphasize(true));
      button.addEventListener('mouseleave', () => emphasize(button === document.activeElement));
      button.addEventListener('focus', () => emphasize(true));
      button.addEventListener('blur', () => emphasize(false));
      button.addEventListener('click', () => {
        rows[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      });
      aside.appendChild(button);
    });

    if (aside.querySelector('.code-note')) {
      layout.classList.add('has-notes');
      layout.appendChild(aside);
    }
  }

  function renderDiffs() {
    slides.filter(slide => slide.dataset.kind === 'code').forEach(slide => {
      const script = slide.querySelector('.slide-diff');
      const container = slide.querySelector('.diff-container');
      if (!script || !container) return;
      // JSON preserves source backslashes as well as literal HTML closing tags.
      // Older generated decks used an opaque text block instead.
      const diff = script.type === 'application/json'
        ? JSON.parse(script.textContent)
        : script.textContent.trim().replace(/<\\\//g, '</');
      try {
        if (!window.Diff2HtmlUI) throw new Error('Diff renderer unavailable');
        new window.Diff2HtmlUI(container, diff, {
          outputFormat: 'line-by-line', drawFileList: false, matching: 'lines', highlight: false,
        }).draw();
      } catch (_) {
        container.innerHTML = `<pre class="diff-fallback">${escapeHtml(diff)}</pre>`;
      }
      let callouts = [];
      try { callouts = JSON.parse(slide.querySelector('.slide-callouts')?.textContent || '[]'); } catch (_) {}
      if (Array.isArray(callouts)) addNotes(slide, container, callouts);
    });
  }

  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === ' ' && event.target.closest('button, a')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { show(current + 1); event.preventDefault(); }
    else if (['ArrowLeft', 'PageUp'].includes(event.key)) { show(current - 1); event.preventDefault(); }
    else if (event.key === 'Home') { show(0); event.preventDefault(); }
    else if (event.key === 'End') { show(slides.length - 1); event.preventDefault(); }
  });
  prevBtn?.addEventListener('click', () => show(current - 1));
  nextBtn?.addEventListener('click', () => show(current + 1));
  window.addEventListener('hashchange', () => show((parseInt(location.hash.slice(1), 10) || 1) - 1));

  renderDiffs();
  show((parseInt(location.hash.slice(1), 10) || 1) - 1);
})();
