// source:
// (function () {
//   If WebAuthn is unavailable, exit silently.
//   Bind the add and skip controls in the welcome panel.
//   Convert registration options challenge, user.id, and exclude credential ids
//   from base64url to Uint8Array for navigator.credentials.create().
//   Convert attestation response fields back to base64url for the server.
//   POST /passkey/register/start, run navigator.credentials.create(), then POST
//   /passkey/register/finish with optional friendly_name. Redirect to the
//   dashboard without ?welcome=1 on success; show inline error on failure.
//   Either POST can come back step-up-required (no fresh credential-change
//   proof) — follow its step_up_url instead of showing the generic error.
// })();

export const ENROLL_JS = `(function () {
  if (typeof window.PublicKeyCredential !== 'function') return;
  var addButton = document.getElementById('passkey-add');
  var skipButton = document.getElementById('passkey-skip');
  var friendlyNameInput = document.getElementById('passkey-friendly-name');
  var errorEl = document.getElementById('passkey-enroll-error');
  if (!addButton) return;

  function showError() {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = "couldn't add passkey. try again.";
    }
    addButton.disabled = false;
    if (skipButton) skipButton.disabled = false;
  }

  // Follows step_up_url on a step-up-required refusal, resolving to null so
  // the caller can short-circuit the rest of the enroll chain without
  // throwing. Any other shape (or an unparsable body) is a real failure.
  function followStepUpOrThrow(response, tag) {
    return response.json().catch(function () { return null; }).then(function (body) {
      if (body && body.step_up_required && body.step_up_url) {
        location.href = body.step_up_url;
        return null;
      }
      throw new Error(tag);
    });
  }

  function toBase64Url(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(value) {
    var padded = value.replace(/-/g, '+').replace(/_/g, '/');
    padded += value.length % 4 === 2 ? '==' : value.length % 4 === 3 ? '=' : '';
    var binary = atob(padded);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function decodeCreationOptions(options) {
    options.challenge = fromBase64Url(options.challenge);
    options.user.id = fromBase64Url(options.user.id);
    if (Array.isArray(options.excludeCredentials)) {
      options.excludeCredentials = options.excludeCredentials.map(function (credential) {
        return Object.assign({}, credential, { id: fromBase64Url(credential.id) });
      });
    }
    return options;
  }

  function encodeCredential(credential) {
    var response = credential.response;
    return {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: credential.type || 'public-key',
      authenticatorAttachment: credential.authenticatorAttachment || null,
      clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
      response: {
        attestationObject: toBase64Url(response.attestationObject),
        clientDataJSON: toBase64Url(response.clientDataJSON),
        transports: typeof response.getTransports === 'function' ? response.getTransports() : undefined,
      },
    };
  }

  if (skipButton) skipButton.addEventListener('click', function () { location.href = '/'; });

  addButton.addEventListener('click', function () {
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    addButton.disabled = true;
    if (skipButton) skipButton.disabled = true;
    var friendlyName = friendlyNameInput ? friendlyNameInput.value.trim() : '';

    fetch('/passkey/register/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}',
    }).then(function (response) {
      if (!response.ok) return followStepUpOrThrow(response, 'start');
      return response.json();
    }).then(function (body) {
      if (!body) return null;
      return navigator.credentials.create({ publicKey: decodeCreationOptions(body.options) });
    }).then(function (credential) {
      if (!credential) return null;
      return fetch('/passkey/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ response: encodeCredential(credential), friendly_name: friendlyName }),
      });
    }).then(function (response) {
      if (!response) return null;
      if (!response.ok) return followStepUpOrThrow(response, 'finish');
      location.href = '/';
    }).catch(showError);
  });
})();`;
