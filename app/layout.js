import "./globals.css";

export const metadata = {
  title: "EasyFinance AI",
  description: "누구나 쉽게 이해할 수 있는 재무 데이터 시각화 분석 서비스",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}
