import { describe, expect, it } from 'vitest';
import {
  formatByteSize,
  renderEnableSmeConsent,
  renderEnableSpbConsent,
  renderEnableSpbRestoreConsent,
  renderEnableSplConsent,
  renderEnableSppConsent,
  renderServicesSpp,
} from '../src/html.js';

const ID_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const ID_B = 'bbbbbbbb-1111-2222-3333-444444444444';

// What an owner can read: the page's body without its form plumbing or inline styles.
function visible(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<input[^>]*>/g, '');
}

const candidate = (instanceId, sizeBytes) => ({
  instanceId,
  sizeBytes,
  lastBackupMs: Date.now() - 60_000,
  createdAt: 1_790_000_000_000,
});

describe('a journal is named by its id where a choice or a request concerns one', () => {
  const turnOn = [
    ['private network', renderEnableSplConsent],
    ['encrypted backup', renderEnableSpbConsent],
    ['confidential processing', renderEnableSppConsent],
    ['solstone.me', renderEnableSmeConsent],
  ];

  it.each(turnOn)('the %s turn-on page shows the id it holds', (_service, render) => {
    const html = render({ csrf: 'c', nonce: 'n', instance: ID_A });
    expect(html).toContain(`name="instance" value="${ID_A}"`);
    expect(visible(html)).toContain(ID_A);
  });

  it.each(turnOn)('the %s turn-on page holds no empty id slot without one', (_service, render) => {
    const lead = (html) => html.match(/<p class="lead">([\s\S]*?)<\/p>/)[1];
    expect(lead(render({ csrf: 'c', nonce: 'n', instance: ID_A }))).toContain(ID_A);
    expect(lead(render({ csrf: 'c', nonce: 'n', instance: '' }))).not.toContain('<span');
  });

  it('escapes a requested id before showing it', () => {
    const html = renderEnableSplConsent({ csrf: 'c', nonce: 'n', instance: '<img src=x>' });
    expect(html).not.toContain('<img src=x>');
  });

  it('shows each restore candidate by id ahead of its size, one candidate or several', () => {
    const one = visible(renderEnableSpbRestoreConsent({ csrf: 'c', nonce: 'n', candidates: [candidate(ID_A, 2048)] }));
    expect(one.indexOf(ID_A)).toBeGreaterThan(-1);
    expect(one.indexOf(ID_A)).toBeLessThan(one.indexOf(formatByteSize(2048)));

    const several = visible(renderEnableSpbRestoreConsent({
      csrf: 'c',
      nonce: 'n',
      candidates: [candidate(ID_A, 2048), candidate(ID_B, 4096)],
    }));
    expect(several.indexOf(ID_A)).toBeGreaterThan(-1);
    expect(several.indexOf(ID_A)).toBeLessThan(several.indexOf(formatByteSize(2048)));
    expect(several.indexOf(ID_B)).toBeGreaterThan(several.indexOf(formatByteSize(2048)));
    expect(several.indexOf(ID_B)).toBeLessThan(several.indexOf(formatByteSize(4096)));
  });

  it('shows each journal a subscription covers by id in its own release row', () => {
    const html = renderServicesSpp({
      entitlement: { source: 'stripe', status: 'active' },
      menu: {},
      onSale: true,
      journals: [
        { instance_id: ID_A, created_at: 1_790_000_000_000 },
        { instance_id: ID_B, created_at: 1_790_000_100_000 },
      ],
      csrf: 'c',
    });
    const seen = visible(html);
    expect(seen).toContain(ID_A);
    expect(seen).toContain(ID_B);
    expect(html).toContain(`name="instance" value="${ID_A}"`);
    expect(html).toContain(`name="instance" value="${ID_B}"`);
  });
});
