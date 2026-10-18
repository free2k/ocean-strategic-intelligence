const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// Attribute fragments are supplied by the calling view; all option content is escaped here.
export function multiSelect({id, title, options, selected = [], placeholder = '请选择', summary = '', className = '', attributes = '', summaryAttributes = '', textAttributes = '', searchAttributes = '', searchValue = '', optionsClass = '', resetAttributes = '', resetLabel = '清空选择', hint = '勾选后即时应用，可选择多项', sourceId = ''}) {
  const values = new Set(selected.map(String));
  const names = options.filter(option => values.has(String(option.value))).map(option => option.label);
  summary ||= names.length ? names.slice(0, 2).join('、') + (names.length > 2 ? ' 等' : '') : placeholder;
  return `<details id="${esc(id)}" class="ui-multiselect ${esc(className)}" data-multiselect data-placeholder="${esc(placeholder)}" ${sourceId ? `data-multi-source="${esc(sourceId)}"` : ''} ${attributes}>
    <summary aria-haspopup="dialog" aria-controls="${esc(id)}-menu" aria-expanded="false" aria-label="${esc(title)}" ${summaryAttributes}><span data-multi-summary ${textAttributes}>${esc(summary || placeholder)}</span><span class="ui-multi-count" data-multi-count ${values.size ? '' : 'hidden'}>${values.size}</span><svg class="ui-multi-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></summary>
    <div id="${esc(id)}-menu" class="ui-multi-menu" data-multi-menu popover="manual" role="dialog" aria-label="${esc(title)}">
      <div class="ui-multi-heading"><strong>${esc(title)}</strong><button type="button" class="ui-multi-dismiss" data-multi-close aria-label="收起${esc(title)}"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>
      <div class="ui-multi-search"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input type="search" data-multi-search ${searchAttributes} value="${esc(searchValue)}" aria-label="搜索${esc(title)}" placeholder="搜索名称或关键词" autocomplete="off"></div>
      <div class="ui-multi-toolbar"><span data-multi-status role="status">已选 ${values.size} 项</span><button type="button" data-multi-clear ${resetAttributes}>${esc(resetLabel)}</button></div>
      <div class="ui-multi-options ${esc(optionsClass)}" role="group" aria-label="${esc(title)}选项">${options.map(option => `<label class="ui-multi-option" data-multi-option data-search="${esc((option.search || option.label + ' ' + option.value).toLowerCase())}" ${option.rowAttributes || ''}><input type="checkbox" data-multi-value="${esc(option.value)}" value="${esc(option.value)}" ${values.has(String(option.value)) ? 'checked' : ''} ${option.attributes || ''}><span class="ui-multi-option-copy"><span data-multi-label>${esc(option.label)}</span>${option.note ? `<small>${esc(option.note)}</small>` : ''}</span></label>`).join('')}</div>
      <p class="ui-multi-empty" data-multi-empty hidden>没有匹配的选项，请换个关键词。</p>
      <div class="ui-multi-footer"><span>${esc(hint)}</span><button type="button" data-multi-close>完成选择</button></div>
    </div></details>`;
}

export function installMultiSelects(root = document) {
  const life = new AbortController(), {signal} = life, doc = root.ownerDocument || root;
  let active = null, focusedOption = null;
  const menuOf = details => details?.querySelector('[data-multi-menu]');
  const summaryOf = details => details?.querySelector('summary');
  function update(details) {
    const checked = [...details.querySelectorAll('[data-multi-value]:checked')];
    const names = checked.map(input => input.closest('label').querySelector('[data-multi-label]').textContent);
    const text = names.length ? names.slice(0, 2).join('、') + (names.length > 2 ? ' 等' : '') : details.dataset.placeholder;
    details.querySelector('[data-multi-summary]').textContent = text;
    const badge = details.querySelector('[data-multi-count]');
    badge.textContent = checked.length; badge.hidden = !checked.length;
    details.querySelector('[data-multi-status]').textContent = `已选 ${checked.length} 项`;
    summaryOf(details).setAttribute('aria-expanded', String(details.open));
    summaryOf(details).setAttribute('aria-description', checked.length ? `已选择${names.join('、')}` : details.dataset.placeholder);
    return checked.map(input => input.dataset.multiValue);
  }
  function filter(details) {
    const query = details.querySelector('[data-multi-search]').value.trim().toLowerCase();
    let count = 0;
    details.querySelectorAll('[data-multi-option]').forEach(row => {row.hidden = !row.dataset.search.includes(query); if (!row.hidden) count++;});
    details.querySelector('[data-multi-empty]').hidden = count > 0;
    details.querySelector('[data-multi-clear]').disabled = !details.querySelector('[data-multi-value]:checked');
  }
  function place() {
    if (!active?.isConnected || !active.open) return;
    const menu = menuOf(active), anchor = summaryOf(active).getBoundingClientRect(), viewport = window.visualViewport;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0, w = viewport?.width || innerWidth, h = viewport?.height || innerHeight;
    if (anchor.bottom < y || anchor.top > y + h) {close(); return;}
    const width = Math.min(Math.max(anchor.width, 360), 440, w - 24);
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${h - 24}px`;
    const wanted = Math.min(menu.scrollHeight, h - 24), below = y + h - anchor.bottom - 12, above = anchor.top - y - 12;
    const down = below >= Math.min(wanted, 280) || below >= above;
    const centered = Math.max(below, above) < 300;
    menu.style.maxHeight = `${Math.max(0, Math.min(h - 24, centered ? h - 24 : down ? below : above))}px`;
    const height = menu.getBoundingClientRect().height;
    menu.style.left = `${Math.max(x + 12, Math.min(anchor.left, x + w - width - 12))}px`;
    menu.style.top = `${centered ? y + (h - height) / 2 : Math.max(y + 12, Math.min(down ? anchor.bottom + 8 : anchor.top - height - 8, y + h - height - 12))}px`;
  }
  function close(restore = false) {
    if (!active) return;
    const previous = active, menu = menuOf(previous); active = null;
    if (menu?.hidePopover && menu.matches(':popover-open')) menu.hidePopover();
    menu?.classList.remove('is-visible'); previous.open = false;
    summaryOf(previous)?.setAttribute('aria-expanded', 'false');
    if (restore && previous.isConnected) summaryOf(previous)?.focus({preventScroll: true});
  }
  function open(details) {
    if (active !== details) {close(); active = details;}
    details.open = true; update(details); filter(details);
    const menu = menuOf(details);
    if (menu.showPopover) {if (!menu.matches(':popover-open')) menu.showPopover();}
    else menu.classList.add('is-visible');
    place();
  }
  function sourceChange(details) {
    const values = update(details), source = details.dataset.multiSource && root.getElementById(details.dataset.multiSource);
    if (source) {
      [...source.options].forEach(option => option.selected = values.includes(option.value));
      source.dispatchEvent(new Event('change', {bubbles: true}));
    }
    filter(details); place();
  }
  root.addEventListener('toggle', event => {
    const details = event.target;
    if (!details.matches?.('details[data-multiselect]')) return;
    if (details.open) open(details); else if (details === active) close();
  }, {capture: true, signal});
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-multi-close], [data-multi-clear]'), details = button?.closest('[data-multiselect]');
    if (!details?.isConnected) return;
    if (button.hasAttribute('data-multi-close')) {event.preventDefault(); close(true);}
    else if (details.dataset.multiSource) {details.querySelectorAll('[data-multi-value]').forEach(input => input.checked = false); sourceChange(details);}
    else {update(details); filter(details);}
  }, {signal});
  root.addEventListener('change', event => {
    const input = event.target, details = input.closest?.('[data-multiselect]');
    if (details?.isConnected && input.hasAttribute('data-multi-value')) sourceChange(details);
  }, {signal});
  root.addEventListener('input', event => {
    if (event.target.hasAttribute('data-multi-search')) {filter(event.target.closest('[data-multiselect]')); place();}
  }, {signal});
  doc.addEventListener('pointerdown', event => {if (active && !event.composedPath().includes(active)) close();}, {capture: true, signal});
  doc.addEventListener('focusin', event => {
    if (!active) return;
    if (!event.composedPath().includes(active)) {close(); return;}
    focusedOption = event.target.hasAttribute('data-multi-search') ? 'search' : event.target.dataset.multiValue ?? null;
  }, {signal});
  root.addEventListener('keydown', event => {
    const details = event.target.closest?.('[data-multiselect]');
    if (!details) return;
    if (event.key === 'Escape' && details.open) {event.preventDefault(); event.stopPropagation(); close(true); return;}
    const summary = summaryOf(details), search = details.querySelector('[data-multi-search]');
    if (event.target === summary && ['ArrowDown', 'ArrowUp'].includes(event.key)) {event.preventDefault(); open(details); search.focus(); return;}
    if (!details.open) return;
    if (event.target === search && event.key === 'Enter') event.preventDefault();
    if (event.target.matches('[data-multi-value]') && event.key === 'Enter') {event.preventDefault(); event.target.click(); return;}
    const rows = [...details.querySelectorAll('[data-multi-option]:not([hidden]) input')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.target.matches('[data-multi-value]') && ['Home', 'End'].includes(event.key)) {
      event.preventDefault(); const index = rows.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : event.key === 'ArrowDown' ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0);
      rows[next]?.focus();
    }
  }, {capture: true, signal});
  const observer = new MutationObserver(() => {
    const restore = active && !active.isConnected ? {id: active.id, option: focusedOption} : null;
    if (active && !active.isConnected) close();
    const opened = root.querySelector('details[data-multiselect][open]');
    if (opened && opened !== active) {
      open(opened);
      if (restore?.id === opened.id && restore.option != null) {
        const target = restore.option === 'search' ? opened.querySelector('[data-multi-search]') : [...opened.querySelectorAll('[data-multi-value]')].find(input => input.dataset.multiValue === restore.option);
        target?.focus({preventScroll: true});
      }
    }
  });
  observer.observe(root, {childList: true, subtree: true});
  doc.addEventListener('scroll', event => {if (active && !menuOf(active)?.contains(event.target)) place();}, {capture: true, signal});
  window.addEventListener('resize', place, {signal});
  window.visualViewport?.addEventListener('resize', place, {signal});
  window.visualViewport?.addEventListener('scroll', place, {signal});
  return () => {close(); observer.disconnect(); life.abort();};
}
