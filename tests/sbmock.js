// Fake supabase-js createClient for tests/account.py (hero-defense-3d) (no network, no emails). Server state lives in localStorage '__mockdb'
// so it survives reloads; flags in localStorage '__mockflags' ({offline, noTables, noShop, confirm}). Installed as window.__hd3dSupabaseMock.
(() => {
  const db = () => JSON.parse(localStorage.getItem('__mockdb') || '{"users":{},"hd3d_profiles":{},"hd3d_progress":{},"hd3d_records":{},"calls":[]}');
  const put = d => localStorage.setItem('__mockdb', JSON.stringify(d));
  const flags = () => JSON.parse(localStorage.getItem('__mockflags') || '{}');
  const log = c => { const d = db(); d.calls.push(c); put(d); };
  const netErr = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', name: 'AuthRetryableFetchError', status: 0 } });
  window.__hd3dSupabaseMock = (url, key, opts) => {
    const SK = opts.auth.storageKey, subs = [];
    const emit = (ev, s) => subs.forEach(f => f(ev, s));
    const sess = () => JSON.parse(localStorage.getItem(SK) || 'null');
    const mk = u => ({ access_token: 'tok-' + u.id, user: { id: u.id, email: u.email, identities: [{}] } });
    const auth = {
      onAuthStateChange(cb) { subs.push(cb); setTimeout(() => cb('INITIAL_SESSION', sess()), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: sess() }, error: null }; },
      async signUp({ email, password }) {
        log('signUp'); if (flags().offline) return netErr();
        const d = db();
        if (password.length < 6) return { data: {}, error: { code: 'weak_password', message: 'Password should be at least 6 characters.' } };
        if (Object.values(d.users).some(u => u.email === email)) return { data: { user: { id: 'x', identities: [] }, session: null }, error: null };
        const u = { id: 'u' + Math.random().toString(36).slice(2, 10), email, password }; d.users[u.id] = u; put(d);
        if (flags().confirm) return { data: { user: { id: u.id, email, identities: [{}] }, session: null }, error: null };
        const s = mk(u); localStorage.setItem(SK, JSON.stringify(s)); emit('SIGNED_IN', s); return { data: { user: s.user, session: s }, error: null };
      },
      async signInWithPassword({ email, password }) {
        log('signIn'); if (flags().offline) return netErr();
        const u = Object.values(db().users).find(u => u.email === email);
        if (u && flags().confirm) return { data: { user: null, session: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 } };
        if (!u || u.password !== password) return { data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } };
        const s = mk(u); localStorage.setItem(SK, JSON.stringify(s)); emit('SIGNED_IN', s); return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { log('signOut'); localStorage.removeItem(SK); emit('SIGNED_OUT', null); return { error: null }; },
    };
    const uid = () => sess()?.user?.id || null;
    const pk = { hd3d_profiles: 'id', hd3d_progress: 'user_id', hd3d_orders: 'user_id', hd3d_mail: 'user_id', hd3d_owned: 'user_id' };
    // 상점 테이블 (supabase/schema.sql 흉내): 관리자 = hyunjk11@daum.net (hd3d_admins + JWT 이메일), RLS 본인 행만(관리자는 전체)
    const SHOPT = ['hd3d_orders', 'hd3d_mail', 'hd3d_owned'], isAdm = () => (sess()?.user?.email || '').toLowerCase() === 'hyunjk11@daum.net';
    const nid = d => (d.seq = (d.seq || 0) + 1), now = () => new Date(Date.now() + (db().seq || 0)).toISOString();
    const missing = t => flags().noTables || (flags().noShop && SHOPT.includes(t));
    const VALID = r => r == null || (typeof r === 'object' && Object.keys(r).every(k => ['souls', 'steel', 'crystal', 'hero'].includes(k)) && ['souls', 'steel', 'crystal'].every(k => r[k] == null || (Number.isInteger(r[k]) && r[k] >= 0 && r[k] <= 1e6)) && (r.hero == null || r.hero === 'gunner'));
    const REW = { hero_gunner: { hero: 'gunner' } }, NM = { hero_gunner: '유료 영웅 · 총사 로즈' };
    const mail = (d, user_id, title, body, reward, order_id) => { const id = nid(d); d.hd3d_mail[id] = { id, user_id, title, body, reward: reward || null, order_id: order_id || null, claimed: false, claimed_at: null, created_at: now() }; return id; };
    function from(t) {
      const q = { t, f: [], op: 'select', lim: null, ord: null, single: false };
      const run = async () => {
        log(q.op + ':' + t);
        if (flags().offline) return { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
        if (missing(t)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` }, status: 404 };
        const d = db(); for (const k of SHOPT) d[k] = d[k] || {};
        if (q.op === 'insert') {
          if (t !== 'hd3d_orders' || !uid()) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 };
          const item = q.row.item; if (item !== 'hero_gunner') return { data: null, error: { code: '23514', message: 'check constraint' }, status: 400 };
          if (d.hd3d_owned[uid() + ':' + item]) return { data: null, error: { code: '23505', message: 'already owned', hint: 'hd3d_owned' }, status: 409 };
          if (Object.values(d.hd3d_orders).some(o => o.user_id === uid() && o.item === item && o.status === 'pending')) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "hd3d_orders_one_pending"' }, status: 409 };
          const id = nid(d), nick = (d.hd3d_profiles[uid()] || {}).nickname || null; d.hd3d_orders[id] = { id, user_id: uid(), email: sess().user.email, nickname: nick, item, status: 'pending', note: null, created_at: now(), decided_at: null }; put(d); return { data: null, error: null, status: 201 };
        }
        if (q.op === 'upsert') {
          const row = q.row, id = row[pk[t]];
          if (!uid() || id !== uid()) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 };
          d[t][id] = { ...(d[t][id] || {}), ...row, updated_at: Date.now() }; put(d); return { data: null, error: null, status: 201 };
        }
        let rows = Object.values(d[t]);
        if (t !== 'hd3d_records' && !(SHOPT.includes(t) && isAdm())) rows = rows.filter(r => r[pk[t]] === uid()); // RLS: own rows only (관리자는 상점 테이블 전체)
        for (const [c, v] of q.f) rows = rows.filter(r => r[c] === v);
        if (q.ord) rows.sort((a, b) => (a[q.ord] > b[q.ord] ? 1 : a[q.ord] < b[q.ord] ? -1 : 0) * (q.desc ? -1 : 1));
        if (q.lim != null) rows = rows.slice(0, q.lim);
        if (t === 'hd3d_records') rows = rows.map(({ map, lap_ms, nickname, char }) => ({ map, lap_ms, nickname, char }));
        if (q.head) return { data: null, error: null, status: 200 };
        return { data: q.single ? rows[0] || null : rows, error: null, status: 200 };
      };
      const b = {
        select(c, o) { q.head = !!o?.head; return b; }, eq(c, v) { q.f.push([c, v]); return b; }, order(c, o) { q.ord = c; q.desc = o && o.ascending === false; return b; },
        limit(n) { q.lim = n; return b; }, maybeSingle() { q.single = true; return run(); },
        upsert(row) { q.op = 'upsert'; q.row = row; return run(); }, insert(row) { q.op = 'insert'; q.row = row; return b; }, then(res, rej) { return run().then(res, rej); },
      };
      return b;
    }
    async function rpc(fn, a) {
      log('rpc:' + fn); if (flags().offline) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
      const SHOPF = ['hd3d_claim_mail', 'hd3d_admin_approve', 'hd3d_admin_reject', 'hd3d_admin_send_mail', 'hd3d_is_admin'];
      if (flags().noTables || (flags().noShop && SHOPF.includes(fn))) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } };
      if (SHOPF.includes(fn)) {
        const d = db(); for (const k of SHOPT) d[k] = d[k] || {}; const me = uid(); if (!me) return { data: null, error: { code: '42501', message: 'not authenticated' } };
        const R = data => { put(d); return { data, error: null }; };
        if (fn === 'hd3d_is_admin') return { data: isAdm(), error: null };
        if (fn === 'hd3d_claim_mail') { const m = d.hd3d_mail[a.p_mail_id]; if (!m || m.user_id !== me) return { data: null, error: { code: 'P0002', message: 'mail not found' } };
          if (m.claimed) return { data: { ok: true, already: true, id: m.id }, error: null };
          m.claimed = true; m.claimed_at = now(); if (m.reward && m.reward.hero) { const k = me + ':hero_' + m.reward.hero; d.hd3d_owned[k] = d.hd3d_owned[k] || { user_id: me, item: 'hero_' + m.reward.hero, source_mail: m.id, created_at: now() }; }
          return R({ ok: true, already: false, id: m.id, reward: m.reward }); }
        if (!isAdm()) return { data: null, error: { code: '42501', message: 'forbidden' } };
        if (fn === 'hd3d_admin_send_mail') { const u = Object.values(d.users).find(u => u.email.toLowerCase() === String(a.p_email).trim().toLowerCase()); if (!u) return { data: { ok: false, reason: 'no_user' }, error: null };
          if (!VALID(a.p_reward)) return { data: { ok: false, reason: 'bad_reward' }, error: null }; return R({ ok: true, mail: mail(d, u.id, String(a.p_title).slice(0, 60), String(a.p_body || '').slice(0, 1000), a.p_reward) }); }
        const o = d.hd3d_orders[a.p_order_id]; if (!o || o.status !== 'pending') return { data: { ok: false, reason: 'not_pending' }, error: null };
        o.decided_at = now();
        if (fn === 'hd3d_admin_approve') { o.status = 'approved'; return R({ ok: true, order: o.id, mail: mail(d, o.user_id, '🎁 구매하신 상품이 도착했습니다', NM[o.item] + ' 구매가 승인되었습니다. 감사합니다! \'받기\'를 눌러 수령하세요.', REW[o.item], o.id) }); }
        o.status = 'rejected'; o.note = a.p_reason || null; return R({ ok: true, order: o.id, mail: mail(d, o.user_id, '구매 신청이 거절되었습니다', NM[o.item] + ' 구매 신청이 거절되었습니다.' + (a.p_reason ? ' 사유: ' + a.p_reason : ''), null, o.id) });
      }
      const d = db(), k = uid() + ':' + a.p_map, o = d.hd3d_records[k];
      d.hd3d_records[k] = { user_id: uid(), map: a.p_map, lap_ms: o ? Math.min(o.lap_ms, a.p_lap_ms) : a.p_lap_ms, nickname: a.p_nickname, char: a.p_char };
      put(d); return { data: d.hd3d_records[k].lap_ms, error: null };
    }
    return { auth, from, rpc };
  };
})();
