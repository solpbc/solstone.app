import { describe, expect, it } from 'vitest';
import { SUPPORT_DRAFT_JS } from '../src/inline/support-draft.js';
import { SUPPORT_FORMS_JS } from '../src/inline/support-forms.js';
import { parseAbout } from '../src/support-about.js';

const BLOCK = '\nios app 1.2.3 (42) · ios 18.6 · arm64\njournal 2.0.29\n ';
const FRAGMENT = '#' + new URLSearchParams({report: 'v1', app: 'solstone for ios', about: BLOCK, version: '1.2.3', os: 'ios', os_version: '18.6'});
function storage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function draftPage({ hash = '', saved = storage(), returned = false, created = false, form = true } = {}) {
  const events = {};
  const fields = Object.fromEntries(['about', 'product', 'subject', 'description'].map(key => [key, {value: ''}]));
  const supportForm = {elements: fields, hasAttribute: () => returned, addEventListener: (name, listener) => {events[name] = listener;}};
  const appended = [];
  const document = {querySelector: selector => selector === '[data-support-created]' ? created : selector === 'main' ? {append: (...values) => appended.push(...values)} : form ? supportForm : null, createElement: () => ({})};
  const history = {replaceState() {}};
  const run = () => new Function('window', 'document', 'sessionStorage', 'history', SUPPORT_DRAFT_JS)({location: {hash, pathname: '/support', search: ''}}, document, saved, history);
  return {run, fields, events, saved, appended};
}

describe('support draft stays local through sign-in and owner edits', () => {
  it('captures the handoff at sign-in and restores it after a redirect without sending', () => {
    const saved = storage();
    draftPage({hash: FRAGMENT, saved, form: false}).run();
    const support = draftPage({saved});
    support.run();
    expect(support.fields.about.value).toBe(BLOCK);
    expect(support.fields.description.value).toContain('version: 1.2.3');
    expect(support.fields.description.value).not.toContain(BLOCK);
    support.fields.about.value = '';
    support.events.input();
    const retry = draftPage({hash: FRAGMENT, saved});
    retry.run();
    expect(retry.fields.about.value).toBe('');
  });
  it('retains server-returned edits, including empty versions, and clears only confirmed creation', () => {
    const saved = storage();
    draftPage({hash: FRAGMENT, saved, form: false}).run();
    const returned = draftPage({hash: FRAGMENT, saved, returned: true});
    returned.fields.description.value = 'owner edited description';
    returned.run();
    const reopened = draftPage({saved});
    reopened.run();
    expect(reopened.fields.description.value).toBe('owner edited description');
    expect(reopened.fields.about.value).toBe('');
    expect(saved.data.size).toBe(1);
    draftPage({hash: FRAGMENT, saved, created: true, form: false}).run();
    expect(saved.data.size).toBe(0);
  });
  it('shows selectable versions when browser storage is unavailable at sign-in', () => {
    const saved = {getItem() {throw Error('denied');}, setItem() {throw Error('denied');}};
    const page = draftPage({hash: FRAGMENT, saved, form: false});
    page.run();
    expect(page.appended[1].textContent).toBe(BLOCK);
    expect(page.appended[0].textContent).toContain("couldn't save this report");
  });
  it('preserves LF and spaces and distinguishes the exact UTF-8 boundary', () => {
    expect(parseAbout(BLOCK.replaceAll('\n', '\r\n'))).toEqual({ok: true, value: BLOCK});
    expect(parseAbout('é'.repeat(4096)).ok).toBe(true);
    expect(parseAbout('é'.repeat(4096) + 'x').ok).toBe(false);
    expect(parseAbout(null).ok).toBe(false);
  });
  it('blocks oversize before disabling send, and fresh-key action never submits', () => {
    class Form {
      elements = {about: {value: 'é'.repeat(4096) + 'x', setCustomValidity() {}, reportValidity() {}}, operation_key: {value: 'old'}, attachment_operation_key: {value: 'old-batch'}};
      matches() {return true;}
      querySelector() {throw Error('oversize must not begin sending');}
    }
    const form = new Form();
    let submit;
    let restart;
    const button = {dataset: {operationKey: 'fresh', attachmentKey: 'fresh-batch'}, closest: () => form, addEventListener: (_, handler) => {restart = handler;}};
    const document = {addEventListener: (_, handler) => {submit = handler;}, querySelectorAll: selector => selector === '[data-support-restart]' ? [button] : []};
    new Function('window', 'document', 'HTMLFormElement', SUPPORT_FORMS_JS)({addEventListener() {}}, document, Form);
    let prevented = false;
    submit({target: form, preventDefault() {prevented = true;}});
    expect(prevented).toBe(true);
    restart();
    expect(form.elements.operation_key.value).toBe('fresh');
    expect(form.elements.attachment_operation_key.value).toBe('fresh-batch');
    expect(form.elements.about.value).toBe('é'.repeat(4096) + 'x');
  });
});
