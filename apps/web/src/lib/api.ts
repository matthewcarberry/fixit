import type { ApiError } from "@fixit/shared";

export class RequestError extends Error {
  constructor(
    public status: number,
    public body: Partial<ApiError>,
  ) {
    super(body.message || `Request failed (${status})`);
  }
  get fields() {
    return this.body.fields ?? {};
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/api/auth/login") && !url.startsWith("/api/auth/passkey/")) {
      window.dispatchEvent(new Event("fixit:signed-out"));
    }
    throw new RequestError(res.status, data ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  delete: <T>(url: string) => request<T>("DELETE", url),
  upload: <T>(url: string, form: FormData) => request<T>("POST", url, form),
};

export async function uploadPhotos(ticketId: number, files: File[], commentId?: number) {
  if (files.length === 0) return;
  const form = new FormData();
  if (commentId) form.append("commentId", String(commentId));
  for (const file of files) form.append("photos", file, file.name);
  await api.upload(`/api/tickets/${ticketId}/attachments`, form);
}
