export async function parseJsonResponse<T = unknown>(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const snippet = (await response.text()).slice(0, 120);
    throw new Error(
      `Expected JSON but received ${response.status} ${response.statusText}: ${snippet}`
    );
  }

  return (await response.json()) as T;
}
