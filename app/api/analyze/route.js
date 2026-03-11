import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { companyName, financeData, year } = body;

    if (!companyName || !financeData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const payload = `
다음은 ${companyName}의 ${year ? year + '년 ' : ''}주요 재무제표 데이터입니다. 
당신은 최고의 월스트리트 투자 분석가입니다. 이 데이터를 바탕으로 잠재적 투자자들이 회사의 재무 건전성 및 실적을 쉽게 이해할 수 있도록 전문적이면서도 친절한 심층 분석 리포트를 작성해주세요.
단순 수치 요약을 넘어서, 매출/영업이익/당기순이익이 의미하는 바, 향후 투자 매력도, 긍정적인 신호 및 리스크 요소를 객관적인 투자자 관점에서 설명해주세요. 
Markdown 구조 기호(별표 등) 사용을 적절히 하되 보기 좋고 읽기 편한 문단 형태의 깔끔한 리포트 형식으로 작성해주세요.

데이터(JSON):
${JSON.stringify(financeData)}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: payload }],
      max_tokens: 3000,
      temperature: 0.7,
    });

    return NextResponse.json({ analysis: response.choices[0].message.content });
  } catch (error) {
    console.error('Error analyzing:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
