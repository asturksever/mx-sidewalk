// The contact form. The US site's Worker takes the messages for every country: /us/api/message stores them and
// emails them on. It only accepts posts from its own origin, so this works on www.opensidewalks.org, not in local dev.
const form = document.getElementById('contact-form');
const status = document.getElementById('contact-status');
const button = form.querySelector('button[type="submit"]');
const opened = Date.now();
// Set when the visitor came from "Send feedback" on the map: the view they were looking at.
// Marked as Mexico so the inbox can tell the sites apart.
const ref = `mx: ${new URLSearchParams(location.search).get('ref') || location.pathname}`.slice(0, 300); // the Worker refuses a longer ref


function say(text, bad = false) {
  status.textContent = text;
  status.classList.toggle('bad', bad);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (data.message.trim().length < 5) {
    say('Please write a message first.', true);
    form.elements.message.focus();
    return;
  }
  if (!form.elements.email.checkValidity()) {
    say('That email address does not look right.', true);
    form.elements.email.focus();
    return;
  }
  button.disabled = true;
  say('Sending…');
  try {
    const res = await fetch('/us/api/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...data, ref, elapsed: Date.now() - opened }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'The message could not be sent.');
    const done = document.getElementById('contact-done');
    form.hidden = true;
    done.hidden = false;
    done.focus();
  } catch (err) {
    // A network failure has no message of ours to show.
    say(err instanceof TypeError ? 'The message could not be sent. Check your connection and try again.' : err.message, true);
    button.disabled = false;
  }
});
