import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The legal documents live as plain Markdown in `content/legal/` (edit them
 *  there — swap in the lawyer-filled versions when ready). Read at module load;
 *  the legal pages are statically pre-rendered, so this runs at BUILD time and
 *  the output is baked into static HTML — no runtime filesystem read, no
 *  serverless file-tracing gotchas. */
const dir = join(process.cwd(), "content", "legal");
const read = (file: string) => readFileSync(join(dir, file), "utf8");

// `[Privacy Policy]` in the Terms is a cross-reference — turn it into a real link.
export const TERMS_MD = read("terms-of-service.md").replace(
  /\[Privacy Policy\]/g,
  "[Privacy Policy](/privacy)",
);
export const PRIVACY_MD = read("privacy-policy.md");
