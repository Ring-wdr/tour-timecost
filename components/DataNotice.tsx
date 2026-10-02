import { isKakaoMock } from "@/lib/env";
import { tourDataSource } from "@/lib/ingest";

/** mock 데이터로 동작 중이면 화면 상단에 분명히 알린다 (서버 컴포넌트) */
export async function DataNotice() {
  const tour = (await tourDataSource().catch(() => null)) !== "live";
  const routing = isKakaoMock();
  if (!tour && !routing) return null;
  return (
    <div className="notice" role="status">
      <strong>{tour ? "시연 모드" : "부분 시연 모드"}</strong>
      {tour && <> · 관광 데이터가 <b>합성(synthetic) 픽스처</b>입니다. 장소 이름의 [합성]은 실제 장소가 아닙니다.</>}
      {routing && <> · 이동시간·거리·통행료가 카카오 API가 아닌 <b>직선거리 기반 mock</b> 값입니다(카카오 REST 키 미설정).</>}
    </div>
  );
}
