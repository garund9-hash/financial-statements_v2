# 📊 EasyFinance AI - 재무 데이터 시각화 분석 서비스

**누구나 쉽게 이해할 수 있는 재무 데이터 시각화 분석 서비스**입니다. Next.js를 기반으로 구축되었으며, 기업(상장사 및 비상장사)의 주요 재무제표(매출액, 영업이익, 당기순이익)를 OpenDart에서 가져와 막대 그래프로 시각화합니다. 추가적으로 OpenAI GPT-4o 모델을 사용하여 해당 재무제표 데이터가 의미하는 바를 일반인이 알기 쉽게 해설해 줍니다.

## 🚀 주요 기능 (Core Features)
1. **회사명 검색**: 미리 내장된 `corp.xml` 데이터를 파싱하여 회사 이름만으로 기업의 고유번호(`corp_code`)를 찾아냅니다. (동일 이름일 경우 상장사 우선 매칭 지원)
2. **OpenDart 수집**: 금융감독원의 외부 OpenDart API를 호출하여 최신 사업보고서 기준 주요계정 재무제표 데이터를 추출합니다.
3. **데이터 시각화**: `Recharts` 라이브러리를 활용해 수집된 매출액, 영업이익, 당기순이익 데이터를 직관적이고 깔끔한 막대 차트로 렌더링합니다.
4. **AI 재무 분석 요약**: 수집된 재무 지표를 바탕으로 가장 발전된 AI 모델인 OpenAI GPT-4o를 이용해, 재무 현황을 쉽고 친절한 언어로 해설해줍니다.

## 🛠 기술 스택 (Tech Stack)
- **Frontend**: Next.js 15 (App Router), React, Recharts, Vanilla CSS Modules
- **Backend API**: Next.js Serverless API Routes (`/api/company`, `/api/finance`, `/api/analyze`)
- **Third-party**: Fast-XML-Parser, OpenAI Node SDK

## 🔐 환경 변수 (Environment Setup)
프로젝트 구동을 위해 루트 디렉토리에 `.env.local` 파일을 생성하고 아래의 API 키를 입력해야 합니다:
```env
OPENDART_API_KEY=your_opendart_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```
> **주의사항**: 위 키는 서버 사이드(`app/api/*`)에서만 안전하게 호출되며, 클라이언트(브라우저)로 유출되지 않습니다.

## 🏃‍♂️ 실행 가이드 (How to Run)
1. **패키지 설치**
   ```bash
   npm install
   ```
2. **개발 서버 실행**
   ```bash
   npm run dev
   ```
3. 브라우저에서 `http://localhost:3000` 으로 접속하여 서비스를 이용합니다.

## 🌐 Vercel 배포 (Vercel Deployment)
이 프로젝트는 Vercel 배포 규칙에 최적화되어 있습니다:
- API Keys는 클라이언트 번들에 포함되지 않으며 Vercel 대시보드에서 Environment Variables로 관리할 수 있습니다.
- `corp.xml`과 같은 정적 데이터는 프로젝트 내부에 포함되어 API Route에서 원활하게 파싱됩니다.

## 💡 개발 가이드 및 규칙 준수
- Vanilla CSS를 사용하여 빠르고 충돌 없는 스타일링 구성을 완료했습니다.
- 보안과 안정성을 위해 API 요청을 프록시하는 백엔드를 구성하여 클라이언트 단의 과도한 데이터 처리를 방지했습니다.
