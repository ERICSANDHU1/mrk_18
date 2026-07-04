import Link from "next/link";
import type { ReactNode } from "react";

/** Turn a heading's text into a stable anchor id (shared by the renderer and the
 *  table of contents so `#section` links land correctly). */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Top-level `##` sections, for the on-this-page nav. (`###` subsections are
 *  excluded — `^##\s` can't match `###` because the 3rd char isn't whitespace.) */
export function extractSections(md: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) out.push({ id: slugify(m[1]), title: m[1] });
  }
  return out;
}

/* Inline: **bold**, [text](url) links, and bare [PLACEHOLDER] tokens (rendered
   as a highlighted mark so no un-filled legal blank ever ships silently). Bold
   and link text recurse so a placeholder inside bold is still caught.
   The regex is instantiated PER CALL — a shared /g regex's lastIndex would be
   clobbered by the recursive calls and spin the outer loop forever (OOM). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+?)\*\*|\[([^\]]+?)\]\(([^)]+?)\)|\[([^\]]+?)\]/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i}`;
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {renderInline(m[1], key)}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      const href = m[3];
      nodes.push(
        href.startsWith("/") ? (
          <Link key={key} href={href} className="font-medium text-molten underline-offset-2 hover:underline">
            {m[2]}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            target={/^https?:/.test(href) ? "_blank" : undefined}
            rel={/^https?:/.test(href) ? "noopener noreferrer" : undefined}
            className="font-medium text-molten underline-offset-2 hover:underline"
          >
            {m[2]}
          </a>
        ),
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <mark key={key} className="legal-ph" title="Placeholder — fill before publishing">
          [{m[4]}]
        </mark>,
      );
    }
    last = re.lastIndex;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Heading({ level, text, k }: { level: number; text: string; k: string }) {
  const id = slugify(text);
  const inner = renderInline(text, k);
  if (level === 1)
    return (
      <h1 className="font-display text-[clamp(2.1rem,5vw,3rem)] leading-[1.06] tracking-[-0.01em] text-ink">
        {inner}
      </h1>
    );
  if (level === 2)
    return (
      <h2 id={id} className="mt-12 mb-1 scroll-mt-28 font-display text-[25px] leading-tight text-ink">
        {inner}
      </h2>
    );
  if (level === 3)
    return (
      <h3 id={id} className="mt-7 mb-1 scroll-mt-28 text-[17px] font-semibold text-ink">
        {inner}
      </h3>
    );
  return <h4 className="mt-5 text-[15px] font-semibold text-ink">{inner}</h4>;
}

/** Purpose-built Markdown renderer for the legal docs — handles exactly the
 *  constructs they use (headings, bold, links, bullet + numbered lists, rules,
 *  paragraphs) with no third-party dependency. Server component. */
export function LegalMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const key = `p${blocks.length}`;
    const parts: ReactNode[] = [];
    para.forEach((ln, idx) => {
      if (idx > 0) parts.push(<br key={`${key}-br${idx}`} />);
      parts.push(...renderInline(ln, `${key}-${idx}`));
    });
    blocks.push(
      <p key={key} className="mt-4 text-[15px] leading-[1.75] text-ink/85">
        {parts}
      </p>,
    );
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === "") {
      flushPara();
      i += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushPara();
      blocks.push(<hr key={`hr${blocks.length}`} className="my-9 border-0 border-t border-[rgba(27,24,21,0.14)]" />);
      i += 1;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      blocks.push(<Heading key={`h${blocks.length}`} level={h[1].length} text={h[2]} k={`h${blocks.length}`} />);
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      const key = `ul${blocks.length}`;
      blocks.push(
        <ul key={key} className="mt-3.5 space-y-2">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2.5 text-[15px] leading-[1.7] text-ink/85">
              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-molten/70" />
              <span className="min-w-0">{renderInline(it, `${key}-${idx}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      const key = `ol${blocks.length}`;
      blocks.push(
        <ol key={key} className="mt-3.5 space-y-2.5">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-3 text-[15px] leading-[1.7] text-ink/85">
              <span aria-hidden className="font-data mt-px shrink-0 text-[13px] font-semibold text-molten">
                {idx + 1}.
              </span>
              <span className="min-w-0">{renderInline(it, `${key}-${idx}`)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    para.push(line);
    i += 1;
  }
  flushPara();

  return <div className="legal-body">{blocks}</div>;
}
