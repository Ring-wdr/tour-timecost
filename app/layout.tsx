import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "주말 어디 갈까 — 예산·이동시간 비교",
  description: "출발지와 예산으로 주말 여행지 후보(시군구)를 이동시간·비용·볼거리로 비교합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a href="#main" className="sr-only">본문 바로가기</a>
        <header className="site">
          <div className="wrap">
            <Link href="/" className="brand">주말 어디 갈까</Link>
            <nav className="small"><Link href="/">새로 검색</Link></nav>
          </div>
        </header>
        <main id="main" className="wrap">{children}</main>
        <footer className="site">
          <div className="wrap">
            <p>
              관광정보 출처: <strong>한국관광공사</strong> TourAPI 4.0 (국문 관광정보 서비스) — 공공누리 이용조건에 따라 이용합니다.
              개별 콘텐츠의 공공누리 유형은 각 항목의 원본 정보를 따릅니다.
            </p>
            <p>
              이동시간·비용은 모두 <strong>추정</strong>입니다. 숙박비·식비·입장료는 실제 가격 데이터가 아니라 사용자 입력값(또는 기본값)입니다.
              일정 생성·숙소 예약·결제는 제공하지 않습니다.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
