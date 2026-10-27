import { handleCoachRequest } from "@/lib/ai/coach";

export async function POST(request: Request) {
  const result = await handleCoachRequest(await request.text(), {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
  });
  return Response.json(result.body, { status: result.status });
}
