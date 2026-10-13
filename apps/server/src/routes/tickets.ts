import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { type TicketListQuery, updateTicketSchema } from "@fixit/shared";
import type { AppContext } from "../app";
import { attachments, categories, comments } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { sniffImageType } from "../lib/images";

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function ticketRoutes(ctx: AppContext) {
  const { db, config, tickets } = ctx;
  const uploadRoot = path.join(config.dataDir, "uploads");

  return async function (app: FastifyInstance) {
    app.get("/categories", async (req) => {
      ctx.requireUser(req);
      return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)).all();
    });

    app.get("/tickets", async (req) => {
      const user = ctx.requireUser(req);
      return tickets.list(user, req.query as TicketListQuery);
    });

    app.post("/tickets", async (req, reply) => {
      const user = ctx.requireUser(req);
      const ticket = tickets.create(user, req.body as never);
      reply.status(201);
      return tickets.detail(user, ticket.id);
    });

    app.get("/tickets/:id", async (req) => {
      const user = ctx.requireUser(req);
      const { id } = idParam.parse(req.params);
      return tickets.detail(user, id);
    });

    app.patch("/tickets/:id", async (req) => {
      const user = ctx.requireAdmin(req);
      const { id } = idParam.parse(req.params);
      tickets.update(user, id, updateTicketSchema.parse(req.body));
      return tickets.detail(user, id);
    });

    app.post("/tickets/:id/comments", async (req, reply) => {
      const user = ctx.requireUser(req);
      const { id } = idParam.parse(req.params);
      const comment = tickets.addComment(user, id, req.body as never);
      reply.status(201);
      return { id: comment.id };
    });

    app.post("/tickets/:id/confirm", async (req) => {
      const user = ctx.requireUser(req);
      const { id } = idParam.parse(req.params);
      tickets.confirm(user, id);
      return tickets.detail(user, id);
    });

    app.post("/tickets/:id/reopen", async (req) => {
      const user = ctx.requireUser(req);
      const { id } = idParam.parse(req.params);
      tickets.reopen(user, id);
      return tickets.detail(user, id);
    });

    /** Upload one or more photos to a ticket, optionally tied to a comment (field "commentId"). */
    app.post("/tickets/:id/attachments", async (req, reply) => {
      const user = ctx.requireUser(req);
      const { id } = idParam.parse(req.params);
      tickets.getRow(user, id);
      if (!req.isMultipart()) throw badRequest("Send photos as a file upload");

      const dir = path.join(uploadRoot, String(id));
      fs.mkdirSync(dir, { recursive: true });
      let commentId: number | null = null;
      const saved: number[] = [];

      for await (const part of req.parts()) {
        if (part.type === "field") {
          if (part.fieldname === "commentId" && part.value) {
            commentId = Number(part.value);
            const comment = db
              .select()
              .from(comments)
              .where(and(eq(comments.id, commentId), eq(comments.ticketId, id)))
              .get();
            if (!comment || comment.authorId !== user.id) throw badRequest("That comment isn't yours");
          }
          continue;
        }

        const storedBase = crypto.randomBytes(16).toString("hex");
        const tmpPath = path.join(dir, `${storedBase}.upload`);
        await pipeline(part.file, fs.createWriteStream(tmpPath));
        if (part.file.truncated) {
          fs.rmSync(tmpPath, { force: true });
          throw Object.assign(new Error("too large"), { code: "FST_REQ_FILE_TOO_LARGE" });
        }

        const fd = fs.openSync(tmpPath, "r");
        const head = Buffer.alloc(16);
        fs.readSync(fd, head, 0, 16, 0);
        fs.closeSync(fd);
        const type = sniffImageType(head);
        if (!type) {
          fs.rmSync(tmpPath, { force: true });
          throw badRequest(`"${part.filename}" isn't a photo. Use JPEG, PNG, WebP, GIF or HEIC.`);
        }

        const storedName = `${storedBase}.${type.ext}`;
        fs.renameSync(tmpPath, path.join(dir, storedName));
        const size = fs.statSync(path.join(dir, storedName)).size;
        const row = db
          .insert(attachments)
          .values({
            ticketId: id,
            commentId,
            filename: (part.filename || `photo.${type.ext}`).slice(0, 200),
            storedName,
            mimeType: type.mime,
            size,
            uploadedBy: user.id,
          })
          .returning()
          .get();
        saved.push(row.id);
      }

      if (saved.length === 0) throw badRequest("Choose at least one photo");
      reply.status(201);
      return { ids: saved };
    });

    app.get("/attachments/:id", async (req, reply) => {
      const user = ctx.requireUser(req);
      const { id } = idParam.parse(req.params);
      const row = db.select().from(attachments).where(eq(attachments.id, id)).get();
      if (!row) throw notFound("That photo");
      tickets.getRow(user, row.ticketId);
      if (row.commentId && user.role !== "admin") {
        const comment = db.select().from(comments).where(eq(comments.id, row.commentId)).get();
        if (!comment || comment.internal) throw notFound("That photo");
      }
      const file = path.join(uploadRoot, String(row.ticketId), row.storedName);
      if (!fs.existsSync(file)) throw notFound("That photo");
      reply
        .header("Content-Type", row.mimeType)
        .header("Cache-Control", "private, max-age=86400")
        .header("Content-Disposition", `inline; filename="${row.filename.replace(/[^\w.\- ]/g, "_")}"`);
      return reply.send(fs.createReadStream(file));
    });
  };
}
