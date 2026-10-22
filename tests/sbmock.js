// Fake supabase-js createClient for tests/account.py (hero-defense-3d) (no network, no emails). Server state lives in localStorage '__mockdb'
// so it survives reloads; flags in localStorage '__mockflags' ({offline, noTables, noShop, noAdmin2: 2026-10-22 관리자 확장 SQL 미실행(새 RPC/테이블 없음), confirm, loseSave: 저장은 서버에 반영되고 응답만 유실, loseClaim: 우편 받기 성공 후 응답 유실}). Installed as window.__hd3dSupabaseMock.
// 관리자 확장(supabase/schema.sql 2026-10-22)도 흉내: hd3d_admins(owner)·hd3d_bans·hd3d_notices·hd3d_admin_log·hd3d_broadcasts + 권한 검사(관리자/owner/정지) 그대로.
(() => {
  const db = () => JSON.parse(localStorage.getItem('__mockdb') || '{"users":{},"hd3d_profiles":{},"hd3d_progress":{},"hd3d_records":{},"calls":[]}');
  const put = d => localStorage.setItem('__mockdb', JSON.stringify(d));
  const flags = () => JSON.parse(localStorage.getItem('__mockflags') || '{}');
  const log = c => { const d = db(); d.calls.push(c); put(d); };
  const netErr = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', name: 'AuthRetryableFetchError', status: 0 } });
  const OWNER = 'hyunjk11@daum.net';
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
        const u = { id: 'u' + Math.random().toString(36).slice(2, 10), email, password, created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString() }; d.users[u.id] = u;
        if (email.toLowerCase() === OWNER) { d.hd3d_admins = d.hd3d_admins || {}; d.hd3d_admins[u.id] = { owner: true, created_at: u.created_at }; } put(d); // schema.sql 재실행 = owner 등록
        if (flags().confirm) return { data: { user: { id: u.id, email, identities: [{}] }, session: null }, error: null };
        const s = mk(u); localStorage.setItem(SK, JSON.stringify(s)); emit('SIGNED_IN', s); return { data: { user: s.user, session: s }, error: null };
      },
      async signInWithPassword({ email, password }) {
        log('signIn'); if (flags().offline) return netErr();
        const d0 = db(), u = Object.values(d0.users).find(u => u.email === email); if (u && !flags().confirm && u.password === password) { u.last_sign_in_at = new Date().toISOString(); put(d0); }
        if (u && flags().confirm) return { data: { user: null, session: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 } };
        if (!u || u.password !== password) return { data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } };
        const s = mk(u); localStorage.setItem(SK, JSON.stringify(s)); emit('SIGNED_IN', s); return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { log('signOut'); localStorage.removeItem(SK); emit('SIGNED_OUT', null); return { error: null }; },
    };
    const uid = () => sess()?.user?.id || null;
    const pk = { hd3d_profiles: 'id', hd3d_progress: 'user_id', hd3d_orders: 'user_id', hd3d_mail: 'user_id', hd3d_owned: 'user_id', hd3d_bans: 'user_id' };
    // 상점 테이블 (supabase/schema.sql 흉내): 관리자 = hyunjk11@daum.net (hd3d_admins + JWT 이메일), RLS 본인 행만(관리자는 전체)
    const SHOPT = ['hd3d_orders', 'hd3d_mail', 'hd3d_owned'], ADM2T = ['hd3d_notices', 'hd3d_bans', 'hd3d_admin_log'];
    // 관리자 = hd3d_admins 행 (owner 행은 JWT 이메일도 일치해야) · owner · 정지
    const isAdm = () => { const a = (db().hd3d_admins || {})[uid()]; return !!a && (!a.owner || (sess()?.user?.email || '').toLowerCase() === OWNER); };
    const isOwner = () => { const a = (db().hd3d_admins || {})[uid()]; return !!a && a.owner && (sess()?.user?.email || '').toLowerCase() === OWNER; };
    const banned = () => !flags().noAdmin2 && !!(db().hd3d_bans || {})[uid()];
    const RLS = { data: null, error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 };
    const nid = d => (d.seq = (d.seq || 0) + 1), now = () => new Date(Date.now() + (db().seq || 0)).toISOString();
    const ts = d => { d.lastTs = Math.max(Date.now(), (d.lastTs || 0) + 1); return new Date(d.lastTs).toISOString(); }; // 저장 행 updated_at: 쓸 때마다 증가 (낙관적 동시성 검사용)
    const missing = t => flags().noTables || (flags().noShop && SHOPT.includes(t)) || (flags().noAdmin2 && ADM2T.includes(t));
    const VALID = r => r == null || (typeof r === 'object' && Object.keys(r).every(k => ['souls', 'steel', 'crystal', 'hero'].includes(k)) && ['souls', 'steel', 'crystal'].every(k => r[k] == null || (Number.isInteger(r[k]) && r[k] >= 0 && r[k] <= 1e6)) && (r.hero == null || r.hero === 'gunner' || r.hero === 'mechanic'));
    const REW = { hero_gunner: { hero: 'gunner' }, hero_mechanic: { hero: 'mechanic' } }, NM = { hero_gunner: '유료 영웅 · 총사 로즈', hero_mechanic: '유료 영웅 · 메카닉 버들' };
    const mail = (d, user_id, title, body, reward, order_id) => { const id = nid(d); d.hd3d_mail[id] = { id, user_id, title, body, reward: reward || null, order_id: order_id || null, claimed: false, claimed_at: null, created_at: now() }; return id; };
    function from(t) {
      const q = { t, f: [], op: 'select', lim: null, ord: null, single: false };
      const run = async () => {
        log(q.op + ':' + t);
        if (flags().offline) return { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
        if (missing(t)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` }, status: 404 };
        const d = db(); for (const k of [...SHOPT, ...ADM2T]) d[k] = d[k] || {};
        if (q.op !== 'select' && (t === 'hd3d_progress' || t === 'hd3d_profiles') && banned()) return RLS; // 정지: 진행/닉네임 쓰기 RLS 거부
        if (q.op === 'insert' && t === 'hd3d_progress') { // 저장 행 첫 생성 (이미 있으면 23505 → 클라이언트가 병합 경로로)
          if (!uid() || q.row.user_id !== uid()) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 };
          if (d[t][uid()]) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "hd3d_progress_pkey"' }, status: 409 };
          d[t][uid()] = { merged: false, ...q.row, updated_at: ts(d) }; put(d); if (flags().loseSave) return netErr(); return { data: q.ret ? [{ ...d[t][uid()] }] : null, error: null, status: 201 };
        }
        if (q.op === 'insert') {
          if (t !== 'hd3d_orders' || !uid()) return RLS;
          if (banned()) return { data: null, error: { code: '42501', message: 'banned', hint: 'banned' }, status: 403 }; // 주문 트리거: 정지 계정
          const item = q.row.item; if (item !== 'hero_gunner' && item !== 'hero_mechanic') return { data: null, error: { code: '23514', message: 'check constraint' }, status: 400 };
          if (d.hd3d_owned[uid() + ':' + item]) return { data: null, error: { code: '23505', message: 'already owned', hint: 'hd3d_owned' }, status: 409 };
          if (Object.values(d.hd3d_orders).some(o => o.user_id === uid() && o.item === item && o.status === 'pending')) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "hd3d_orders_one_pending"' }, status: 409 };
          const id = nid(d), nick = (d.hd3d_profiles[uid()] || {}).nickname || null; d.hd3d_orders[id] = { id, user_id: uid(), email: sess().user.email, nickname: nick, item, status: 'pending', note: null, created_at: now(), decided_at: null }; put(d); return { data: null, error: null, status: 201 };
        }
        if (q.op === 'upsert') {
          const row = q.row, id = row[pk[t]];
          if (!uid() || id !== uid()) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 };
          d[t][id] = { ...(d[t][id] || {}), ...row, updated_at: ts(d) }; put(d); if (flags().loseSave) return netErr(); return { data: q.ret ? [d[t][id]] : null, error: null, status: 201 };
        }
        if (q.op === 'update') { // PATCH ... where 필터 (RLS: 본인 행만). updated_at 은 서버 트리거처럼 갱신
          let rows = Object.values(d[t]).filter(r => r[pk[t]] === uid()); for (const [c, v] of q.f) rows = rows.filter(r => r[c] === v);
          for (const r of rows) Object.assign(r, q.row, t === 'hd3d_progress' ? { updated_at: ts(d) } : {}); put(d); if (flags().loseSave) return netErr();
          return { data: q.ret ? rows.map(r => ({ ...r })) : null, error: null, status: 200 };
        }
        let rows = Object.values(d[t]);
        if (t === 'hd3d_notices') { const n = Date.now(); if (!isAdm()) rows = rows.filter(r => r.active && (!r.starts_at || Date.parse(r.starts_at) <= n) && (!r.ends_at || Date.parse(r.ends_at) > n)); } // 게시 중인 공지만 (관리자는 전체)
        else if (t === 'hd3d_admin_log') { if (!isAdm()) rows = []; }
        else if (t !== 'hd3d_records' && !(SHOPT.includes(t) && isAdm())) rows = rows.filter(r => r[pk[t]] === uid()); // RLS: own rows only (관리자는 상점 테이블 전체)
        for (const [c, v] of q.f) rows = rows.filter(r => r[c] === v);
        if (q.ord) rows.sort((a, b) => (a[q.ord] > b[q.ord] ? 1 : a[q.ord] < b[q.ord] ? -1 : 0) * (q.desc ? -1 : 1));
        if (q.lim != null) rows = rows.slice(0, q.lim);
        if (t === 'hd3d_records') rows = rows.map(({ map, lap_ms, nickname, char }) => ({ map, lap_ms, nickname, char }));
        if (q.head) return { data: null, error: null, status: 200 };
        return { data: q.single ? rows[0] || null : rows, error: null, status: 200 };
      };
      const b = {
        select(c, o) { q.head = !!o?.head; if (q.op !== 'select') q.ret = true; return b; }, eq(c, v) { q.f.push([c, v]); return b; }, order(c, o) { q.ord = c; q.desc = o && o.ascending === false; return b; },
        limit(n) { q.lim = n; return b; }, maybeSingle() { q.single = true; return run(); },
        upsert(row) { q.op = 'upsert'; q.row = row; return b; }, update(row) { q.op = 'update'; q.row = row; return b; }, insert(row) { q.op = 'insert'; q.row = row; return b; }, then(res, rej) { return run().then(res, rej); },
      };
      return b;
    }
    // ---------- 관리자 확장 (schema.sql 2026-10-22 흉내) ----------
    const ADM2F = ['hd3d_my_status', 'hd3d_admin_users', 'hd3d_admin_user', 'hd3d_admin_grant_hero', 'hd3d_admin_revoke_hero', 'hd3d_admin_broadcast_count', 'hd3d_admin_broadcast', 'hd3d_admin_notice_save', 'hd3d_admin_notice_active',
      'hd3d_admin_ban', 'hd3d_admin_unban', 'hd3d_admin_orders', 'hd3d_admin_refund', 'hd3d_admin_log_list', 'hd3d_owner_admins', 'hd3d_owner_add_admin', 'hd3d_owner_remove_admin'];
    const ITEMS = ['hero_gunner', 'hero_mechanic'], STS = ['pending', 'approved', 'rejected', 'refunded'];
    const logA = (d, action, target, detail) => { d.hd3d_admin_log = d.hd3d_admin_log || {}; const id = nid(d); d.hd3d_admin_log[id] = { id, admin_id: uid(), admin_email: sess().user.email, action, target_user: target || null, target_email: target && d.users[target] ? d.users[target].email : null, detail: detail || null, created_at: now() }; };
    const reason = r => { const t = String(r == null ? '' : r).trim(); return t.length >= 1 && t.length <= 200 ? t : null; };
    const jn = v => (typeof v === 'number' && v >= 0 && isFinite(v) ? Math.floor(v) : 0), ob = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const stars = v => Object.values(ob(v)).reduce((s, x) => s + (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 999 ? Math.min(3, x) : typeof x === 'string' && /^[0-9]{1,3}$/.test(x) ? Math.min(3, +x) : 0), 0);
    const summary = g => { if (!g || typeof g !== 'object' || Array.isArray(g)) return null; const adv = {}; for (const [k, v] of Object.entries(ob(g.adv))) if (v && typeof v === 'object' && typeof v.b === 'string') adv[k.slice(0, 20)] = v.b.slice(0, 20);
      return { stars: stars(g.st), hstars: stars(g.hst), souls: jn(g.souls), steel: jn(ob(g.mat).steel), crystal: jn(ob(g.mat).crystal), essence: jn(ob(g.mat).essence), bestWave: jn(g.bestWave), runs: jn(ob(g.stats).runs), hero: typeof g.hero === 'string' ? g.hero.slice(0, 20) : null, adv }; };
    const isGameUser = (d, id) => !!(d.hd3d_profiles[id] || d.hd3d_progress[id]);
    const card = (d, id) => { const u = d.users[id]; if (!u) return null; const p = d.hd3d_profiles[id] || {}, g = d.hd3d_progress[id], b = d.hd3d_bans[id], ad = d.hd3d_admins[id];
      return { id, email: u.email, nickname: p.nickname || null, created_at: u.created_at || null, last_seen: u.last_sign_in_at || null, saved_at: g ? g.updated_at : null, summary: summary(g && g.data),
        owned: Object.values(d.hd3d_owned).filter(o => o.user_id === id).map(o => o.item).sort(), banned: !!b, ban_reason: b ? b.reason : null, banned_at: b ? b.created_at : null, admin: !!ad, owner: !!(ad && ad.owner) }; };
    const like = (q, ...xs) => xs.some(x => x && String(x).toLowerCase().includes(q.toLowerCase()));
    const page = (o, l, dl, mx) => [Math.min(Math.max(Math.floor(+o || 0), 0), 1e6), Math.min(Math.max(Math.floor(+l || dl), 1), mx)];
    const recips = d => [...new Set([...Object.keys(d.hd3d_profiles), ...Object.keys(d.hd3d_progress)])];
    const FORB = { data: null, error: { code: '42501', message: 'forbidden' } };
    function adm2(fn, a) {
      if (flags().noAdmin2) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } };
      const d = db(); for (const k of ['hd3d_admins', 'hd3d_bans', 'hd3d_notices', 'hd3d_admin_log', 'hd3d_broadcasts', 'hd3d_profiles', 'hd3d_progress', ...SHOPT]) d[k] = d[k] || {};
      const me = uid(), R = data => { put(d); return { data, error: null }; }, NO = reason => ({ data: { ok: false, reason }, error: null }), L = (x, t, dt) => logA(d, x, t, dt);
      if (fn === 'hd3d_my_status') { const b = d.hd3d_bans[me]; return { data: { admin: isAdm(), owner: isOwner(), banned: !!b, ban_reason: b ? b.reason : null, banned_at: b ? b.created_at : null }, error: null }; }
      if (fn.startsWith('hd3d_owner_')) { if (!isOwner()) return FORB; }
      else if (!isAdm()) return FORB;
      const byEmail = e => Object.values(d.users).find(u => u.email.toLowerCase() === String(e || '').trim().toLowerCase());
      switch (fn) {
        case 'hd3d_admin_users': { const q = String(a.p_query || '').trim().slice(0, 100), [off, lim] = page(a.p_offset, a.p_limit, 20, 50);
          const act = id => { const u = d.users[id], g = d.hd3d_progress[id]; return [u.created_at, u.last_sign_in_at, g && g.updated_at].filter(Boolean).sort().pop() || ''; };
          const f = Object.keys(d.users).filter(id => isGameUser(d, id) && (!q || like(q, d.users[id].email, (d.hd3d_profiles[id] || {}).nickname) || id === q)).sort((x, y) => (act(y) > act(x) ? 1 : act(y) < act(x) ? -1 : x < y ? -1 : 1));
          return { data: { ok: true, total: f.length, offset: off, limit: lim, rows: f.slice(off, off + lim).map(id => card(d, id)) }, error: null }; }
        case 'hd3d_admin_user': { const c = card(d, a.p_user); if (!c) return NO('no_user'); const by = (o, n) => Object.values(o).filter(x => (x.user_id || x.target_user) === a.p_user).sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).slice(0, n);
          return { data: { ok: true, user: c, orders: by(d.hd3d_orders, 30), mail: by(d.hd3d_mail, 30).map(m => ({ id: m.id, title: m.title, reward: m.reward, claimed: m.claimed, revoked: !!m.revoked, created_at: m.created_at })), log: Object.values(d.hd3d_admin_log).filter(l => l.target_user === a.p_user).sort((x, y) => y.id - x.id).slice(0, 20) }, error: null }; }
        case 'hd3d_admin_grant_hero': case 'hd3d_admin_revoke_hero': { if (!ITEMS.includes(a.p_item)) return NO('bad_item'); const r = reason(a.p_reason); if (!r) return NO('bad_reason'); const k = a.p_user + ':' + a.p_item;
          if (fn === 'hd3d_admin_grant_hero') { if (!d.users[a.p_user]) return NO('no_user'); if (d.hd3d_owned[k]) return NO('already'); d.hd3d_owned[k] = { user_id: a.p_user, item: a.p_item, source_mail: null, created_at: now() }; L('hero_grant', a.p_user, { item: a.p_item, reason: r }); return R({ ok: true }); }
          if (!d.hd3d_owned[k]) return NO('not_owned'); delete d.hd3d_owned[k]; let n = 0; for (const m of Object.values(d.hd3d_mail)) if (m.user_id === a.p_user && !m.claimed && !m.revoked && m.reward && 'hero_' + m.reward.hero === a.p_item) { m.revoked = true; n++; }
          L('hero_revoke', a.p_user, { item: a.p_item, reason: r, mail_revoked: n }); return R({ ok: true, mail_revoked: n }); }
        case 'hd3d_admin_broadcast_count': return { data: { ok: true, count: recips(d).length }, error: null };
        case 'hd3d_admin_broadcast': { const t = String(a.p_title || '').trim(), rw = a.p_reward && Object.keys(a.p_reward).length ? a.p_reward : null; if (!t || t.length > 60) return NO('bad_title'); if (String(a.p_body || '').length > 1000) return NO('bad_body'); if (!VALID(rw)) return NO('bad_reward');
          if (Object.values(d.hd3d_broadcasts).some(b => Date.now() - Date.parse(b.created_at) < 30000)) return NO('too_soon'); const rc = recips(d); if (a.p_expected !== rc.length) return { data: { ok: false, reason: 'count_mismatch', count: rc.length }, error: null };
          const bid = nid(d); d.hd3d_broadcasts[bid] = { id: bid, title: t, body: String(a.p_body || ''), reward: rw, recipients: rc.length, created_by: me, created_at: new Date().toISOString() };
          for (const u of rc) { const id = mail(d, u, t, String(a.p_body || ''), rw); d.hd3d_mail[id].broadcast_id = bid; } L('broadcast', null, { broadcast: bid, title: t, reward: rw, recipients: rc.length }); return R({ ok: true, broadcast: bid, count: rc.length }); }
        case 'hd3d_admin_notice_save': { const t = String(a.p_title || '').trim(); if (!t || t.length > 80) return NO('bad_title'); if (String(a.p_body || '').length > 2000) return NO('bad_body'); if (a.p_starts && a.p_ends && Date.parse(a.p_ends) <= Date.parse(a.p_starts)) return NO('bad_range');
          if (a.p_id == null) { const id = nid(d); d.hd3d_notices[id] = { id, title: t, body: String(a.p_body || ''), active: a.p_active !== false, starts_at: a.p_starts || null, ends_at: a.p_ends || null, created_by: me, created_at: now(), updated_at: now() }; L('notice_create', null, { notice: id, title: t, active: a.p_active !== false }); return R({ ok: true, id }); }
          const n = d.hd3d_notices[a.p_id]; if (!n) return NO('not_found'); Object.assign(n, { title: t, body: String(a.p_body || ''), active: a.p_active == null ? n.active : !!a.p_active, starts_at: a.p_starts || null, ends_at: a.p_ends || null, updated_at: now() }); L('notice_update', null, { notice: n.id, title: t, active: a.p_active }); return R({ ok: true, id: n.id }); }
        case 'hd3d_admin_notice_active': { const n = d.hd3d_notices[a.p_id]; if (!n) return NO('not_found'); n.active = !!a.p_active; L(a.p_active ? 'notice_activate' : 'notice_deactivate', null, { notice: n.id }); return R({ ok: true, id: n.id }); }
        case 'hd3d_admin_ban': { const r = reason(a.p_reason); if (!r) return NO('bad_reason'); if (!a.p_user || a.p_user === me) return NO('self'); if (d.hd3d_admins[a.p_user]) return NO('target_admin'); if (!d.users[a.p_user]) return NO('no_user');
          d.hd3d_bans[a.p_user] = { user_id: a.p_user, reason: r, banned_by: me, created_at: now() }; L('ban', a.p_user, { reason: r }); return R({ ok: true }); }
        case 'hd3d_admin_unban': { const r = reason(a.p_reason); if (!r) return NO('bad_reason'); if (!d.hd3d_bans[a.p_user]) return NO('not_banned'); delete d.hd3d_bans[a.p_user]; L('unban', a.p_user, { reason: r }); return R({ ok: true }); }
        case 'hd3d_admin_orders': { const st = String(a.p_status || '').trim() || null, q = String(a.p_query || '').trim().slice(0, 100), [off, lim] = page(a.p_offset, a.p_limit, 50, 100); if (st && !STS.includes(st)) return NO('bad_status');
          const all = Object.values(d.hd3d_orders), f = all.filter(o => (!st || o.status === st) && (!q || like(q, o.email, o.nickname) || o.user_id === q)).sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : y.id - x.id));
          const counts = {}; for (const o of all) counts[o.status] = (counts[o.status] || 0) + 1; return { data: { ok: true, total: f.length, offset: off, limit: lim, rows: f.slice(off, off + lim), counts }, error: null }; }
        case 'hd3d_admin_refund': { const r = reason(a.p_reason); if (!r) return NO('bad_reason'); const o = d.hd3d_orders[a.p_order_id]; if (!o || o.status !== 'approved') return NO('not_approved');
          Object.assign(o, { status: 'refunded', refunded_at: now(), refund_note: r }); const k = o.user_id + ':' + o.item, on = d.hd3d_owned[k] ? 1 : 0; delete d.hd3d_owned[k]; let n = 0; for (const m of Object.values(d.hd3d_mail)) if (m.order_id === o.id && !m.claimed && !m.revoked) { m.revoked = true; n++; }
          mail(d, o.user_id, '환불 처리 안내', NM[o.item] + ' 구매가 환불 처리되어 영웅이 회수되었습니다. 사유: ' + r, null, o.id); L('order_refund', o.user_id, { order: o.id, item: o.item, reason: r, owned_removed: on, mail_revoked: n }); return R({ ok: true, order: o.id, owned_removed: on, mail_revoked: n }); }
        case 'hd3d_admin_log_list': { const ac = String(a.p_action || '').trim() || null, [off, lim] = page(a.p_offset, a.p_limit, 50, 100), f = Object.values(d.hd3d_admin_log).filter(l => !ac || l.action === ac).sort((x, y) => y.id - x.id);
          return { data: { ok: true, total: f.length, offset: off, limit: lim, rows: f.slice(off, off + lim) }, error: null }; }
        case 'hd3d_owner_admins': return { data: { ok: true, rows: Object.entries(d.hd3d_admins).filter(([id]) => d.users[id]).map(([id, x]) => ({ user_id: id, email: d.users[id].email, nickname: (d.hd3d_profiles[id] || {}).nickname || null, owner: !!x.owner, created_at: x.created_at })).sort((x, y) => (y.owner - x.owner) || (x.created_at < y.created_at ? -1 : 1)) }, error: null };
        case 'hd3d_owner_add_admin': { const u = byEmail(a.p_email); if (!u) return NO('no_user'); if (d.hd3d_bans[u.id]) return NO('target_banned'); if (d.hd3d_admins[u.id]) return NO('already'); d.hd3d_admins[u.id] = { owner: false, added_by: me, created_at: now() }; L('admin_add', u.id, null); return R({ ok: true }); }
        case 'hd3d_owner_remove_admin': { const u = byEmail(a.p_email); if (!u) return NO('no_user'); const x = d.hd3d_admins[u.id]; if (x && x.owner) return NO('owner'); if (!x) return NO('not_admin'); delete d.hd3d_admins[u.id]; L('admin_remove', u.id, null); return R({ ok: true }); }
      }
      return { data: null, error: { code: 'PGRST202', message: 'unknown ' + fn } };
    }
    async function rpc(fn, a) {
      log('rpc:' + fn); if (flags().offline) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
      const SHOPF = ['hd3d_claim_mail', 'hd3d_admin_approve', 'hd3d_admin_reject', 'hd3d_admin_send_mail', 'hd3d_is_admin', 'hd3d_is_owner'];
      if (flags().noTables || (flags().noShop && (SHOPF.includes(fn) || ADM2F.includes(fn))) || (flags().noAdmin2 && (ADM2F.includes(fn) || fn === 'hd3d_is_owner'))) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } };
      if (ADM2F.includes(fn) && !uid()) return { data: null, error: { code: '42501', message: 'permission denied for function ' + fn } };
      if (SHOPF.includes(fn)) {
        const d = db(); for (const k of SHOPT) d[k] = d[k] || {}; const me = uid(); if (!me) return { data: null, error: { code: '42501', message: 'not authenticated' } };
        const R = data => { put(d); return { data, error: null }; };
        if (fn === 'hd3d_is_admin') return { data: isAdm(), error: null };
        if (fn === 'hd3d_claim_mail') { if (banned()) return { data: null, error: { code: '42501', message: 'banned', hint: 'banned' } };
          const m = d.hd3d_mail[a.p_mail_id]; if (!m || m.user_id !== me) return { data: null, error: { code: 'P0002', message: 'mail not found' } };
          if (m.revoked && !m.claimed) return { data: null, error: { code: 'P0002', message: 'mail revoked', hint: 'revoked' } };
          if (m.claimed) return { data: { ok: true, already: true, id: m.id, reward: m.reward }, error: null }; // schema.sql: already 일 때도 reward 반환 (장부 복구용)
          m.claimed = true; m.claimed_at = now(); if (m.reward && m.reward.hero) { const k = me + ':hero_' + m.reward.hero; d.hd3d_owned[k] = d.hd3d_owned[k] || { user_id: me, item: 'hero_' + m.reward.hero, source_mail: m.id, created_at: now() }; }
          if (flags().loseClaim) { put(d); return netErr(); } // 서버에선 성공했지만 응답 유실
          return R({ ok: true, already: false, id: m.id, reward: m.reward }); }
        if (fn === 'hd3d_is_owner') return { data: isOwner(), error: null };
        if (!isAdm()) return { data: null, error: { code: '42501', message: 'forbidden' } };
        const L = (action, target, detail) => logA(d, action, target, detail);
        if (fn === 'hd3d_admin_send_mail') { const u = Object.values(d.users).find(u => u.email.toLowerCase() === String(a.p_email).trim().toLowerCase()); if (!u) return { data: { ok: false, reason: 'no_user' }, error: null };
          if (!VALID(a.p_reward)) return { data: { ok: false, reason: 'bad_reward' }, error: null }; const t = String(a.p_title || '').trim(); if (!t || t.length > 60) return { data: { ok: false, reason: 'bad_title' }, error: null };
          const mid = mail(d, u.id, t, String(a.p_body || '').slice(0, 1000), a.p_reward); L('mail_send', u.id, { mail: mid, title: t, reward: a.p_reward || null }); return R({ ok: true, mail: mid }); }
        const o = d.hd3d_orders[a.p_order_id]; if (!o || o.status !== 'pending') return { data: { ok: false, reason: 'not_pending' }, error: null };
        o.decided_at = now();
        if (fn === 'hd3d_admin_approve') { o.status = 'approved'; const mid = mail(d, o.user_id, '🎁 구매하신 상품이 도착했습니다', NM[o.item] + ' 구매가 승인되었습니다. 감사합니다! \'받기\'를 눌러 수령하세요.', REW[o.item], o.id); L('order_approve', o.user_id, { order: o.id, item: o.item }); return R({ ok: true, order: o.id, mail: mid }); }
        o.status = 'rejected'; o.note = a.p_reason || null; const mid = mail(d, o.user_id, '구매 신청이 거절되었습니다', NM[o.item] + ' 구매 신청이 거절되었습니다.' + (a.p_reason ? ' 사유: ' + a.p_reason : ''), null, o.id); L('order_reject', o.user_id, { order: o.id, item: o.item, reason: a.p_reason || null }); return R({ ok: true, order: o.id, mail: mid });
      }
      if (ADM2F.includes(fn)) return adm2(fn, a || {});
      const d = db(), k = uid() + ':' + a.p_map, o = d.hd3d_records[k];
      d.hd3d_records[k] = { user_id: uid(), map: a.p_map, lap_ms: o ? Math.min(o.lap_ms, a.p_lap_ms) : a.p_lap_ms, nickname: a.p_nickname, char: a.p_char };
      put(d); return { data: d.hd3d_records[k].lap_ms, error: null };
    }
    return { auth, from, rpc };
  };
})();
