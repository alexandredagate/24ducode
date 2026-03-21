const baseUrl = process.env.API_URL || "http://localhost:3001";

export async function helloWorld(): Promise<{ message: string }> {
  const res = await fetch(`${baseUrl}/`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return (await res.json()) as { message: string };
}
