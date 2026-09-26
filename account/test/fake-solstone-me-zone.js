import { vi } from 'vitest';

export function installFakeSolstoneMeZone({
  zoneId = 'test-solstone-me-zone-id',
  initialRecords = [],
} = {}) {
  const originalFetch = globalThis.fetch;
  let records = initialRecords.map((r, i) => ({
    id: r.id || `rec_${i + 1}`,
    type: r.type,
    name: r.name,
    content: r.content,
    data: r.data,
    proxied: r.proxied ?? false,
    ttl: r.ttl ?? 60,
  }));
  let nextId = records.length + 1;

  let afterListHook = null;
  let beforeBatchHook = null;
  let afterBatchStepHook = null;
  let forceBatchResult = null;
  let forceCountTotal = null;
  let forceListResult = null;
  let forceCountResult = null;

  const fakeFetch = vi.fn(async (input, init = {}) => {
    const urlStr = typeof input === 'string' ? input : input?.url || '';
    if (!urlStr.startsWith('https://api.cloudflare.com/client/v4/')) {
      return originalFetch(input, init);
    }

    const url = new URL(urlStr);
    const path = url.pathname;

    // GET /zones/{zone}/dns_records
    if (init.method === 'GET' || !init.method) {
      if (path === `/client/v4/zones/${zoneId}/dns_records`) {
        if (forceCountResult) {
          const res = forceCountResult;
          forceCountResult = null;
          return new Response(JSON.stringify(res.body), {
            status: res.status ?? 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.searchParams.get('per_page') === '1' && !url.searchParams.get('name')) {
          const totalCount = typeof forceCountTotal === 'number' ? forceCountTotal : records.length;
          return new Response(JSON.stringify({
            success: true,
            errors: [],
            messages: [],
            result: [],
            result_info: {
              page: 1,
              per_page: 1,
              count: 0,
              total_count: totalCount,
              total_pages: Math.max(1, totalCount),
            },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const nameFilter = url.searchParams.get('name');
        if (forceListResult) {
          const res = forceListResult;
          forceListResult = null;
          return new Response(JSON.stringify(res.body), {
            status: res.status ?? 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (afterListHook) {
          const hook = afterListHook;
          afterListHook = null;
          await hook(nameFilter);
        }

        const matched = nameFilter
          ? records.filter((r) => r.name === nameFilter)
          : [...records];

        return new Response(JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: matched,
          result_info: {
            page: 1,
            per_page: 100,
            count: matched.length,
            total_count: matched.length,
            total_pages: 1,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /zones/{zone}/dns_records/batch
    if (init.method === 'POST' && path === `/client/v4/zones/${zoneId}/dns_records/batch`) {
      const body = JSON.parse(init.body || '{}');

      if (beforeBatchHook) {
        const hook = beforeBatchHook;
        beforeBatchHook = null;
        await hook(body);
      }

      if (forceBatchResult) {
        const res = forceBatchResult;
        forceBatchResult = null;
        return new Response(JSON.stringify(res.body), {
          status: res.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 1. Deletes
      if (Array.isArray(body.deletes)) {
        const deleteIds = new Set(body.deletes.map((d) => d.id));
        records = records.filter((r) => !deleteIds.has(r.id));
      }
      if (afterBatchStepHook) await afterBatchStepHook('deletes', records);

      // 2. Patches
      if (Array.isArray(body.patches)) {
        for (const patch of body.patches) {
          const idx = records.findIndex((r) => r.id === patch.id);
          if (idx >= 0) {
            records[idx] = {
              ...records[idx],
              ...patch,
            };
          }
        }
      }
      if (afterBatchStepHook) await afterBatchStepHook('patches', records);

      // 3. Puts
      if (Array.isArray(body.puts)) {
        for (const put of body.puts) {
          const idx = records.findIndex((r) => r.id === put.id);
          if (idx >= 0) {
            records[idx] = { ...put };
          }
        }
      }
      if (afterBatchStepHook) await afterBatchStepHook('puts', records);

      // 4. Posts
      if (Array.isArray(body.posts)) {
        for (const post of body.posts) {
          // Refuse A record beside CNAME
          if (post.type === 'A') {
            const hasCname = records.some((r) => r.name === post.name && r.type === 'CNAME');
            if (hasCname) {
              return new Response(JSON.stringify({
                success: false,
                errors: [{ code: 1004, message: 'CNAME and A record conflict' }],
                messages: [],
                result: null,
              }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
          }
          // Refuse identical duplicate post
          const duplicate = records.some((r) =>
            r.type === post.type &&
            r.name === post.name &&
            r.content === post.content &&
            JSON.stringify(r.data || null) === JSON.stringify(post.data || null)
          );
          if (duplicate) {
            return new Response(JSON.stringify({
              success: false,
              errors: [{ code: 1004, message: 'Duplicate record' }],
              messages: [],
              result: null,
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          }

          const newRec = {
            id: `rec_${nextId++}`,
            type: post.type,
            name: post.name,
            content: post.content,
            data: post.data,
            proxied: post.proxied ?? false,
            ttl: post.ttl ?? 60,
          };
          records.push(newRec);
        }
      }
      if (afterBatchStepHook) await afterBatchStepHook('posts', records);

      return new Response(JSON.stringify({
        success: true,
        errors: [],
        messages: [],
        result: {},
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: false,
      errors: [{ code: 81044, message: 'Record does not exist.' }],
      messages: [],
      result: null,
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  });

  globalThis.fetch = fakeFetch;

  return {
    fetchSpy: fakeFetch,
    getRecords: (name) => name ? records.filter((r) => r.name === name) : [...records],
    addRecord: (rec) => {
      const newRec = {
        id: rec.id || `rec_${nextId++}`,
        type: rec.type,
        name: rec.name,
        content: rec.content,
        data: rec.data,
        proxied: rec.proxied ?? false,
        ttl: rec.ttl ?? 60,
      };
      records.push(newRec);
      return newRec;
    },
    deleteRecord: (id) => {
      records = records.filter((r) => r.id !== id);
    },
    setTotalRecordCount: (n) => {
      forceCountTotal = n;
    },
    afterList: (fn) => {
      afterListHook = fn;
    },
    beforeBatch: (fn) => {
      beforeBatchHook = fn;
    },
    afterBatchStep: (fn) => {
      afterBatchStepHook = fn;
    },
    forceNextBatch: (res) => {
      forceBatchResult = res;
    },
    forceNextList: (res) => {
      forceListResult = res;
    },
    forceNextCount: (res) => {
      forceCountResult = res;
    },
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
