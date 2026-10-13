import clsx from "clsx";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { URGENCIES, URGENCY_HINTS, URGENCY_LABELS, type TicketDetail, type Urgency } from "@fixit/shared";
import { PhotoPicker } from "../components/PhotoPicker";
import { CategoryIcon, ErrorNote, Field, PageHeader } from "../components/ui";
import { api, RequestError, uploadPhotos } from "../lib/api";
import { keys, useCategories } from "../lib/queries";

export function NewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<unknown>(null);

  const create = useMutation({
    mutationFn: async () => {
      const ticket = await api.post<TicketDetail>("/api/tickets", {
        title,
        description,
        categoryId,
        urgency,
        location: location.trim() || null,
      });
      try {
        await uploadPhotos(ticket.id, photos);
      } catch (err) {
        // The ticket exists either way; say so rather than losing it.
        setPhotoError(err);
      }
      return ticket;
    },
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: keys.tickets() });
      navigate(`/tickets/${ticket.id}`, { replace: true });
    },
  });
  const fields = create.error instanceof RequestError ? create.error.fields : {};

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Report something" />
      <form
        className="card space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="What's wrong?" htmlFor="title" error={fields.title}>
          <input
            id="title"
            className="input"
            placeholder="Wifi keeps dropping upstairs"
            value={title}
            maxLength={140}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>

        <Field label="Details" htmlFor="description" error={fields.description}>
          <textarea
            id="description"
            className="input min-h-28"
            placeholder="When did it start? What have you tried?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </Field>

        <fieldset>
          <legend className="label">
            Category <span className="font-normal text-muted">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {categories.data
              ?.filter((c) => c.active)
              .map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={categoryId === c.id}
                  onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                    categoryId === c.id ? "border-brand-700 bg-brand-700 text-white" : "border-default",
                  )}
                >
                  <CategoryIcon icon={c.icon} className="size-4" />
                  {c.name}
                </button>
              ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">How urgent is it?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {URGENCIES.map((u) => (
              <button
                type="button"
                key={u}
                aria-pressed={urgency === u}
                onClick={() => setUrgency(u)}
                className={clsx(
                  "rounded-xl border px-3 py-2.5 text-left",
                  urgency === u
                    ? u === "urgent"
                      ? "border-red-600 bg-red-50 dark:bg-red-950/50"
                      : "border-brand-700 bg-brand-50 dark:bg-brand-900/40"
                    : "border-default",
                )}
              >
                <span className="block text-sm font-semibold">{URGENCY_LABELS[u]}</span>
                <span className="block text-xs text-muted">{URGENCY_HINTS[u]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Where in the house?" htmlFor="location" hint="Optional, like Kitchen or Garage.">
          <input id="location" className="input" value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} />
        </Field>

        <div>
          <span className="label">Photos</span>
          <PhotoPicker files={photos} onChange={setPhotos} />
        </div>

        {!Object.keys(fields).length && <ErrorNote error={create.error} />}
        {photoError ? <ErrorNote error={photoError} /> : null}

        <button className="btn-primary w-full sm:w-auto" disabled={create.isPending}>
          {create.isPending ? "Sending…" : "Send to Fixit"}
        </button>
      </form>
    </div>
  );
}
