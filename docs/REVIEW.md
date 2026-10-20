# 코드 리뷰 · 보안 점검 · 개선 제안 (2026-10-20)

> 작업 중 중단에 대비해 진행하면서 계속 갱신합니다. (Part A 정리 결과 / Part B 리뷰·제안)

## 진행 상황
- [ ] Part A 정리 (동작 불변)
- [ ] Part B-1 보안
- [ ] Part B-2 안정성/성능
- [ ] Part B-3 게임플레이 제안

## 초기 메모
- schema.sql: 모든 hd3d_ 테이블 RLS 켜짐, SECURITY DEFINER 함수 전부 `set search_path = ''`.
- 클라이언트 innerHTML: 닉네임·우편 제목/본문·주문 닉네임/이메일·아이템 이름은 esc() 적용됨. 장비 id(data-id)는 미이스케이프(자기 세이브만 영향, 낮음).
- 사용하지 않는 모델 후보: archer.glb, mage.glb, warrior.glb (KayKit 구버전), mechanic_meshy.glb (ASSETS 목록에 없음).
