// 상점 설정 — 가격·입금 안내 문구는 여기만 바꾸면 됩니다. (실제 결제 연동 없음: 구매 신청 → 관리자 확인·승인 → 우편으로 지급)
export const ROSE_PRICE = '₩9,900';
export const BUDEUL_PRICE = '₩9,900';
export const SEOYUN_PRICE = '₩9,900';
export const PAY_INFO = '관리자 확인 후 우편으로 지급됩니다'; // 예) '국민은행 000-00-0000 (예금주 홍길동)으로 입금 후 기다려 주세요. 관리자 확인 후 우편으로 지급됩니다'
export const ADMIN_EMAIL = 'hyunjk11@daum.net'; // UI 표시용. 실제 권한은 서버(supabase/schema.sql의 hd3d_is_admin)가 판단
export const SHOP = {
  tables: { orders: 'hd3d_orders', mail: 'hd3d_mail', owned: 'hd3d_owned' },
  items: {
    hero_gunner: { kind: 'hero', hero: 'gunner', n: '유료 영웅 · 총사 로즈', price: ROSE_PRICE, tag: '한정 영웅',
      desc: '분홍 장미의 쌍권총잡이. 눈부시게 빠른 좌우 교차 연사와 회전 난사 스킬 「로즈 피니시」, 전용 전설 쌍권총(도탄 난사 · 장미 탄막)까지!' },
    hero_mechanic: { kind: 'hero', hero: 'mechanic', n: '유료 영웅 · 메카닉 버들', price: BUDEUL_PRICE, tag: '신규 영웅',
      desc: '등에 멘 개조 로봇 팔로 싸우는 근접 메카닉. 드릴 연타와 해머 넉백, 필살기 「변신」으로 10초간 거대 로봇이 되어 로켓 펀치로 마무리! 전용 전설 건틀릿(과부하 드릴 · 기가 해머 낙하)까지!' },
    hero_fighter: { kind: 'hero', hero: 'fighter', n: '유료 영웅 · 격투가 서윤', price: SEOYUN_PRICE, tag: '신규 영웅',
      desc: '고양이 귀 후드를 쓴 주황빛 격투가. 눈에 안 보이는 주먹 2연타와 회전 돌려차기, 멀리 있는 적에게는 기를 모아 날리는 관통 장풍, 필살기 「냥냥 진각」으로 뛰어올라 땅을 내려찍어 모두 기절!' },
  },
};
