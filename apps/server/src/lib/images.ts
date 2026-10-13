/** Detects an image type from its first bytes so a renamed file can't pass as a photo. */
export function sniffImageType(head: Buffer): { mime: string; ext: string } | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (head.length >= 6 && (head.subarray(0, 6).toString("ascii") === "GIF87a" || head.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { mime: "image/gif", ext: "gif" };
  }
  if (head.length >= 12 && head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  if (head.length >= 12 && head.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = head.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return { mime: "image/heic", ext: "heic" };
    if (["mif1", "msf1"].includes(brand)) return { mime: "image/heif", ext: "heif" };
  }
  return null;
}
