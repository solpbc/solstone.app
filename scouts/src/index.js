// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc
//
// The standalone scouts.solstone.app program is retired — the solstone scout
// service is converged onto the services account identity at
// services.solstone.app/scout. This worker now 301-redirects all traffic there.
// (Prior program code + the scouts-portal D1 are preserved in git history;
//  scout records were migrated into the account-portal worker.)

const TARGET = 'https://services.solstone.app/scout';

export default {
  async fetch() {
    return new Response(null, {
      status: 301,
      headers: {
        Location: TARGET,
        'Cache-Control': 'public, max-age=3600',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
    });
  },
};
