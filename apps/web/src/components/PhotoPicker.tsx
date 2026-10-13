import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

const MAX_PHOTOS = 10;

/** Lets people pick or take photos and shows thumbnails before upload. */
export function PhotoPicker({ files, onChange, compact }: { files: File[]; onChange: (files: File[]) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative">
            <img src={src} alt="" className="size-20 rounded-xl object-cover" />
            <button
              type="button"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-1 text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={
              compact
                ? "btn-secondary px-3"
                : "flex size-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-default text-xs text-muted"
            }
          >
            <Camera className={compact ? "size-4" : "size-5"} aria-hidden />
            {compact ? "Photo" : "Add photo"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="photo-input"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          onChange([...files, ...picked].slice(0, MAX_PHOTOS));
          e.target.value = "";
        }}
      />
    </div>
  );
}
