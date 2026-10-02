// source:
// (function () {
//   On ordinary support-form submission, disable submit controls and announce
//   progress. Native form submission remains the authorization path.
// })();

export const SUPPORT_FORMS_JS = String.raw`(function () {
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('form[data-support-form]')) return;
    var about = form.elements.about;
    if (about && new TextEncoder().encode(about.value.replace(/\r\n/g, '\n')).byteLength > 8192) {
      event.preventDefault();
      about.setCustomValidity('your versions are too long. keep them under 8192 bytes.');
      about.reportValidity();
      return;
    }
    if (event.defaultPrevented) return;
    var status = form.querySelector('[data-support-progress]');
    form.querySelectorAll('button[type="submit"]').forEach(function (button) { button.disabled = true; });
    if (status) { status.hidden = false; status.textContent = 'working…'; }
  });
  document.querySelectorAll('textarea[name="about"]').forEach(function (about) {
    about.addEventListener('input', function () { about.setCustomValidity(''); });
  });
  document.querySelectorAll('[data-support-restart]').forEach(function (button) {
    button.addEventListener('click', function () {
      var form = button.closest('form');
      form.elements.operation_key.value = button.dataset.operationKey;
      form.elements.attachment_operation_key.value = button.dataset.attachmentKey;
      button.hidden = true;
    });
  });
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('form[data-support-form] button[type="submit"]').forEach(function (button) { button.disabled = false; });
  });
})();`;
