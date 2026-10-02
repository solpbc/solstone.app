// The report fragment stays in this tab until the owner submits the support form.
// Sign-in requests never carry these values.
export const SUPPORT_DRAFT_JS = String.raw`(function () {
  var key = 'solstone-support-draft-v1';
  var form = document.querySelector('form[action="/support"][data-support-form]');
  var fragment = window.location.hash;
  var params = new URLSearchParams(fragment.slice(1));
  var report = params.get('report') === 'v1';
  function read() {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function save(draft) {
    try { sessionStorage.setItem(key, JSON.stringify(draft)); return true; } catch (_) { return false; }
  }
  if (document.querySelector('[data-support-created]')) {
    try { sessionStorage.removeItem(key); } catch (_) {}
    if (report) history.replaceState(null, '', window.location.pathname + window.location.search);
    return;
  }
  var draft = read();
  if (report && (!draft || draft.fragment !== fragment)) {
    var app = (params.get('app') || '').slice(0, 120);
    var lines = [];
    [['app', 120], ['version', 120], ['build', 120], ['os', 120], ['os_version', 120], ['route', 500], ['error_code', 200], ['state', 500]].forEach(function (field) {
      var value = (params.get(field[0]) || '').slice(0, field[1]);
      if (value) lines.push(field[0].replace(/_/g, ' ') + ': ' + value);
    });
    var recent = (params.get('recent') || '').slice(0, 4000);
    if (recent) lines.push('', 'recent error/state lines:', recent);
    draft = { fragment: fragment, product: 'solstone', subject: app ? 'report from ' + app : '', description: lines.join('\n'), about: params.get('about') || '' };
    if (!save(draft) && !form) {
      var warning = document.createElement('p');
      warning.className = 'error';
      warning.textContent = "your browser couldn't save this report for sign-in. copy it below, then paste it into support after signing in.";
      var text = document.createElement('pre');
      text.textContent = draft.about;
      document.querySelector('main').append(warning, text);
    }
  }
  if (!form) return;
  function current() {
    var values = { fragment: draft && draft.fragment || (report ? fragment : '') };
    ['product', 'subject', 'description', 'about'].forEach(function (name) { values[name] = form.elements[name].value; });
    return values;
  }
  if (!form.hasAttribute('data-support-returned') && draft) {
    ['product', 'subject', 'description', 'about'].forEach(function (name) {
      if (typeof draft[name] === 'string') form.elements[name].value = draft[name];
    });
  }
  save(current());
  form.addEventListener('input', function () { save(current()); });
  form.addEventListener('submit', function () { save(current()); });
})();`;
