export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "That item") => new HttpError(404, "not_found", `${what} wasn't found`);
export const forbidden = (message = "You don't have access to that") => new HttpError(403, "forbidden", message);
export const badRequest = (message: string) => new HttpError(400, "bad_request", message);
export const unauthorized = (message = "Please sign in") => new HttpError(401, "unauthorized", message);
