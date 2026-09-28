/*!
 * TaskFlow – vanilla JS todo app
 * Flow: Store (persistence) -> state -> actions -> render().
 * DOM is built with createElement/textContent, so user input is never parsed as HTML (XSS-safe).
 */
(() => {
  'use strict';

  const KEY = 'taskflow:v1';
  const THEME_KEY = 'taskflow:theme';
  const $ = (s) => document.querySelector(s);
  const el = {
    form: $('#form'), title: $('#title'), priority: $('#priority'), due: $('#due'),
    list: $('#list'), empty: $('#empty'), left: $('#left'), clear: $('#clear'),
    search: $('#search'), summary: $('#summary'), bar: $('#bar'), theme: $('#theme'),
    filters: document.querySelectorAll('[data-filter]'),
  };

  /* ---------- Persistence ---------- */
  const Store = {
    load() {
      try {
        const data = JSON.parse(localStorage.getItem(KEY));
        return Array.isArray(data) ? data : [];
      } catch { return []; }
    },
    save(tasks) {
      try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch { /* storage full or blocked */ }
    },
  };

  /* ---------- State & actions ---------- */
  const state = { tasks: Store.load(), filter: 'all', query: '', editing: null };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const find = (id) => state.tasks.find((t) => t.id === id);

  const actions = {
    add: (title, priority, due) => state.tasks.unshift({ id: uid(), title, priority, due, done: false }),
    toggle: (id) => { const t = find(id); if (t) t.done = !t.done; },
    remove: (id) => { state.tasks = state.tasks.filter((t) => t.id !== id); },
    rename: (id, title) => { const t = find(id); if (t && title) t.title = title; },
    clearDone: () => { state.tasks = state.tasks.filter((t) => !t.done); },
  };

  const commit = () => { Store.save(state.tasks); render(); };
  const refocus = (id, sel) => el.list.querySelector(`[data-id="${CSS.escape(id)}"] ${sel}`)?.focus();

  /* ---------- Rendering ---------- */
  const h = (tag, props = {}, ...kids) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...kids);
    return node;
  };
  const todayISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
  const fmtDate = (iso) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const row = (t) => {
    const li = h('li', { className: `item${t.done ? ' is-done' : ''}` });
    li.dataset.id = t.id;

    const check = h('input', { type: 'checkbox', className: 'check', checked: t.done });
    check.setAttribute('aria-label', `Mark "${t.title}" as ${t.done ? 'not done' : 'done'}`);

    let body;
    if (state.editing === t.id) {
      body = h('input', { className: 'edit', value: t.title, maxLength: 120 });
      body.setAttribute('aria-label', 'Edit task title');
    } else {
      const meta = h('div', { className: 'meta' },
        h('span', { className: `tag tag--${t.priority}`, textContent: t.priority }));
      if (t.due) {
        const late = !t.done && t.due < todayISO();
        meta.append(h('span', { className: late ? 'overdue' : '', textContent: `${late ? 'Overdue: ' : 'Due '}${fmtDate(t.due)}` }));
      }
      body = h('div', { className: 'body' }, h('span', { className: 'title', textContent: t.title }), meta);
    }

    const btn = (act, label, text) => {
      const b = h('button', { type: 'button', className: 'act', textContent: text });
      b.dataset.act = act;
      b.setAttribute('aria-label', `${label} "${t.title}"`);
      return b;
    };
    li.append(check, body, btn('edit', 'Edit', '\u270E'), btn('delete', 'Delete', '\u2715'));
    return li;
  };

  const visible = () => state.tasks.filter((t) =>
    (state.filter === 'all' || (state.filter === 'done') === t.done) &&
    t.title.toLowerCase().includes(state.query));

  function render() {
    const total = state.tasks.length;
    const done = state.tasks.filter((t) => t.done).length;
    const left = total - done;
    const pct = total ? Math.round((done / total) * 100) : 0;

    el.list.replaceChildren(...visible().map(row));
    el.empty.hidden = el.list.children.length > 0;
    el.empty.textContent = total ? 'No tasks match your search or filter.' : 'No tasks yet. Add your first one above.';
    el.left.textContent = `${left} ${left === 1 ? 'task' : 'tasks'} left`;
    el.summary.textContent = total ? `${done} of ${total} completed` : 'Plan your day, one task at a time.';
    el.bar.style.width = `${pct}%`;
    el.bar.parentElement.setAttribute('aria-valuenow', pct);
    el.clear.hidden = !done;
    el.filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));

    const editor = el.list.querySelector('.edit');
    if (editor) { editor.focus(); editor.select(); }
  }

  /* ---------- Events ---------- */
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = el.title.value.trim();
    if (!title) { el.title.focus(); return; }
    actions.add(title, el.priority.value, el.due.value);
    el.form.reset();
    el.title.focus();
    commit();
  });

  // Event delegation: one listener per event type instead of one per row
  el.list.addEventListener('change', (e) => {
    if (!e.target.matches('.check')) return;
    const id = e.target.closest('li').dataset.id;
    actions.toggle(id);
    commit();
    refocus(id, '.check');
  });

  el.list.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const id = e.target.closest('li').dataset.id;
    if (act === 'delete') { actions.remove(id); commit(); }
    else { state.editing = id; render(); }
  });

  el.list.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.title')) return;
    state.editing = e.target.closest('li').dataset.id;
    render();
  });

  const finishEdit = (input, save, viaKey) => {
    const id = state.editing;
    if (!id) return; // already finished (blur fires again when the input is removed)
    state.editing = null;
    if (save) actions.rename(id, input.value.trim());
    commit();
    if (viaKey) refocus(id, '[data-act="edit"]');
  };

  el.list.addEventListener('keydown', (e) => {
    if (!e.target.matches('.edit')) return;
    if (e.key === 'Enter') finishEdit(e.target, true, true);
    else if (e.key === 'Escape') finishEdit(e.target, false, true);
  });
  el.list.addEventListener('focusout', (e) => {
    if (e.target.matches('.edit')) finishEdit(e.target, true, false);
  });

  el.search.addEventListener('input', () => { state.query = el.search.value.trim().toLowerCase(); render(); });
  el.filters.forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; render(); }));
  el.clear.addEventListener('click', () => { actions.clearDone(); commit(); });

  el.theme.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  });

  // Keep multiple open tabs in sync
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { state.tasks = Store.load(); render(); }
  });

  render();
})();