// The "get updates" card, as on the US site: asks for an email address to hear about new data and releases.
// The US site's Worker keeps the list for every country (/us/api/subscribe); it only accepts posts from its own
// origin, so signing up works on www.opensidewalks.org, not in local dev. The card slides into a corner rather than covering the page, never takes focus when it
// appears by itself, and is not shown again once the visitor has signed up or, for a while, closed it.
// Any link marked data-updates opens it on request.
import './updates.css';

// The three country sites share an origin, and so this answer: signing up or closing the card on one holds on all.
const KEY = 'us-updates';
const DAY = 86400e3;
// Closed without signing up: ask again after this long.
const ASK_AGAIN = 60 * DAY;
const loaded = Date.now();
let card = null;
let opener = null;
let onMap = false;

const HTML = `
  <button class="updates-close" type="button" aria-label="Close">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 3.5 9 9m0-9-9 9" /></svg>
  </button>
  <form novalidate>
    <h2 id="updates-title">Get updates on the data</h2>
    <p id="updates-text">New data releases, new places and product news, by email. Only when there is something new.</p>
    <div class="updates-row">
      <input name="email" type="email" required maxlength="200" autocomplete="email" spellcheck="false" placeholder="you@example.com" aria-label="Email address" />
      <button class="updates-send" type="submit">Keep me posted</button>
    </div>
    <label class="updates-trap" aria-hidden="true">Website <input name="website" type="text" tabindex="-1" autocomplete="off" /></label>
    <p class="updates-status" role="status"></p>
    <p class="updates-fine">Your email is used only for these updates. You can unsubscribe at any time.</p>
  </form>
  <div class="updates-done" tabindex="-1" hidden>
    <h2>You are on the list</h2>
    <p>Thank you. I will write when there is new data or a new release.</p>
  </div>`;

function saved() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

// Storage can be blocked (private windows); the card then simply comes back on the next visit.
function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

function build() {
  card = document.createElement('section');
  card.id = 'updates';
  card.classList.toggle('on-map', onMap);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'updates-title');
  card.setAttribute('aria-describedby', 'updates-text');
  card.innerHTML = HTML;
  document.body.append(card);

  const form = card.querySelector('form');
  const status = card.querySelector('.updates-status');
  const button = form.querySelector('button[type="submit"]');
  const say = (text, bad = false) => {
    status.textContent = text;
    status.classList.toggle('bad', bad);
  };

  card.querySelector('.updates-close').addEventListener('click', () => close());
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.elements.email;
    if (!email.value.trim() || !email.checkValidity()) {
      say('That email address does not look right.', true);
      email.focus();
      return;
    }
    button.disabled = true;
    say('Sending…');
    try {
      const res = await fetch('/us/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), website: form.elements.website.value, page: location.pathname, elapsed: Date.now() - loaded }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'That did not go through. Please try again.');
      save({ subscribed: Date.now() });
      const done = card.querySelector('.updates-done');
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } catch (err) {
      // A network failure has no message of ours to show.
      say(err instanceof TypeError ? 'That did not go through. Check your connection and try again.' : err.message, true);
      button.disabled = false;
    }
  });
}

// `asked` is true when the visitor opened the card themselves: only then does it take focus.
function open(asked) {
  if (!card) build();
  // Laid out first, so the slide has somewhere to start from.
  card.getBoundingClientRect();
  card.classList.add('open');
  if (asked) card.querySelector(card.querySelector('form').hidden ? '.updates-done' : 'input[name="email"]').focus();
}

function close() {
  if (!card?.classList.contains('open')) return;
  const inside = card.contains(document.activeElement);
  card.classList.remove('open');
  if (!saved().subscribed) save({ closed: Date.now() });
  if (inside) opener?.focus();
  opener = null;
}

// Typing, or reading a dialog: not the moment.
function busy() {
  const el = document.activeElement;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName) || !!document.querySelector('dialog[open]');
}

// The card appears by itself a few seconds after the page opens. On the map page (`map`) it sits between the
// legend and the Layers panel, and on a screen too narrow to hold all three it stays away.
const AFTER = 5e3;

export function initUpdates({ map = false } = {}) {
  onMap = map;
  for (const a of document.querySelectorAll('[data-updates]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      opener = a;
      open(true);
    });
  }

  const state = saved();
  // Someone who came to write a message (the map's "Send feedback" link) is not interrupted.
  const writing = new URLSearchParams(location.search).has('ref');
  if (state.subscribed || Date.now() - (state.closed || 0) < ASK_AGAIN || writing) return;
  if (map && matchMedia('(max-width: 900px)').matches) return;

  let done = false;
  const show = () => {
    if (done || card?.classList.contains('open')) return;
    if (document.hidden || busy()) {
      setTimeout(show, 5e3);
      return;
    }
    done = true;
    open(false);
  };
  setTimeout(show, AFTER);
}
