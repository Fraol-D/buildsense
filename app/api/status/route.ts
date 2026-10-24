import { modelStatus } from "@/lib/ai/coach";

export async function GET(request: Request) {
  // Read the request so this status is not frozen at build time.
  void request.headers.get("accept");
  return Response.json(
    modelStatus({
      apiKey: process.env.XAI_API_KEY,
      model: process.env.XAI_MODEL,
    }),
  );
}
