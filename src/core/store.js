// C-6 (2026-10-23): localStorage 래퍼 하나 (사생활 보호 모드·용량 초과 예외 무시). 키는 호출하는 쪽이 'hd3d_' 접두사로 씀
export const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} },
};
