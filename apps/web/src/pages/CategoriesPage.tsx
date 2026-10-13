import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { CATEGORY_ICONS, type Category, type UpdateCategoryInput } from "@fixit/shared";
import { CategoryIcon, ErrorNote, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { keys, useCategories } from "../lib/queries";

export function CategoriesPage() {
  const categories = useCategories();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("wrench");
  const add = useMutation({
    mutationFn: () => api.post("/api/categories", { name, icon }),
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: keys.categories });
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-muted">
        <ArrowLeft className="size-4" aria-hidden /> Settings
      </Link>
      <PageHeader title="Categories" />
      <form
        className="card flex flex-wrap items-end gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <IconSelect value={icon} onChange={setIcon} />
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor="new-category">
            New category
          </label>
          <input id="new-category" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required />
        </div>
        <button className="btn-primary" disabled={add.isPending}>
          Add
        </button>
        <div className="w-full">
          <ErrorNote error={add.error} />
        </div>
      </form>
      {categories.isPending ? (
        <Spinner />
      ) : (
        <ul className="card divide-y divide-[var(--border)]">
          {categories.data?.map((c) => <CategoryRow key={c.id} category={c} />)}
        </ul>
      )}
      <p className="text-sm text-muted">Hidden categories stay on old tickets but can't be picked for new ones.</p>
    </div>
  );
}

function IconSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor="icon">
        Icon
      </label>
      <div className="relative">
        <CategoryIcon icon={value} className="pointer-events-none absolute left-3 top-3 size-4" />
        <select id="icon" className="input w-36 pl-9" value={value} onChange={(e) => onChange(e.target.value)}>
          {CATEGORY_ICONS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CategoryRow({ category: c }: { category: Category }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(c.name);
  const update = useMutation({
    mutationFn: (input: UpdateCategoryInput) => api.patch(`/api/categories/${c.id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories }),
  });
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3">
      <CategoryIcon icon={c.icon} className="size-5 text-brand-700 dark:text-brand-500" />
      <input
        aria-label="Category name"
        className="input min-w-32 flex-1 py-1.5"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== c.name && update.mutate({ name: name.trim() })}
      />
      <button className="btn-secondary px-3 py-1.5" onClick={() => update.mutate({ active: !c.active })} disabled={update.isPending}>
        {c.active ? "Hide" : "Show"}
      </button>
      {update.error ? (
        <div className="w-full">
          <ErrorNote error={update.error} />
        </div>
      ) : null}
    </li>
  );
}
