import { isKakaoMock, isTourMock } from "@/lib/env";

/** mock 데이터로 동작 중이면 화면 상단에 분명히 알린다 (서버 컴포넌트) */
export function DataNotice() {
  const tour = isTourMock();
  const routing = isKakaoMock();
  if (!tour && !routing) return null;
  return (
    <div className="notice" role="status">
      <strong>시연 모드</strong>
      {tour && <> · 관광 데이터가 <b>합성(synthetic) 픽스처</b>입니다. 장소 이름의 [합성]은 실제 장소가 아닙니다.</>}
      {routing && <> · 이동시간·거리·통행료가 카카오 API가 아닌 <b>직선거리 기반 mock</b> 값입니다.</>}
    </div>
  );
}
