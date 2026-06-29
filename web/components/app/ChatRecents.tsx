"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, type LucideIcon, MoreVertical, Pencil, Pin, PinOff, Trash2 } from "lucide-react";

type Chat = { id: string; title: string; pinned?: boolean };
type Menu = { id: string; x: number; y: number; up: boolean };

const MENU_W = 168;
const MENU_H = 182;

/** The Chat tab's Recents — live saved chats, each with a ⋮ menu:
 *  Rename (inline), Pin / Unpin, Archive (hide), Delete. */
export default function ChatRecents() {
  const router = useRouter();
  const activeId = useSearchParams().get("id");

  const [chats, setChats] = useState<Chat[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const skipBlur = useRef(false);

  const load = () => {
    fetch("/api/chats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setChats(d as Chat[]))
      .catch(() => {});
  };
  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("mrk18:chats-changed", onChange);
    return () => window.removeEventListener("mrk18:chats-changed", onChange);
  }, []);

  // dismiss the floating menu on any outside click / scroll / Escape / resize
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const openMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const up = rect.bottom + MENU_H > window.innerHeight;
    setMenu({ id, x: rect.right, y: up ? rect.top - 4 : rect.bottom + 4, up });
    setConfirmDel(false);
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setMenu(null);
    await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    load();
  };

  const remove = async (id: string) => {
    setMenu(null);
    await fetch(`/api/chats/${id}`, { method: "DELETE" }).catch(() => {});
    if (activeId === id) router.push("/chat");
    load();
  };

  const startRename = (c: Chat) => {
    setMenu(null);
    setDraft(c.title);
    setRenameId(c.id);
  };
  const commitRename = (id: string) => {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    const t = draft.trim();
    setRenameId(null);
    const current = chats.find((c) => c.id === id);
    if (t && current && t !== current.title) patch(id, { title: t });
  };

  if (chats.length === 0) {
    return <p className="px-2.5 py-2 text-[12.5px] text-mute-2">No chats yet.</p>;
  }

  const open = menu ? chats.find((c) => c.id === menu.id) : null;

  return (
    <>
      {chats.map((c) =>
        renameId === c.id ? (
          <input
            key={c.id}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitRename(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename(c.id);
              } else if (e.key === "Escape") {
                skipBlur.current = true;
                setRenameId(null);
              }
            }}
            className="w-full rounded-lg border border-molten/50 bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
          />
        ) : (
          <div key={c.id} className="group/row relative">
            <Link
              href={`/chat?id=${c.id}`}
              title={c.title}
              className={`flex items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-8 text-[13px] transition-colors hover:bg-surface ${
                activeId === c.id ? "bg-surface text-ink" : "text-mute hover:text-ink"
              }`}
            >
              {c.pinned ? (
                <Pin size={11} className="shrink-0 text-molten" fill="currentColor" aria-hidden />
              ) : (
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full border border-line" />
              )}
              <span className="truncate">{c.title}</span>
            </Link>
            <button
              onClick={(e) => openMenu(e, c.id)}
              aria-label="Chat options"
              className={`absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-mute-2 transition-colors hover:bg-[var(--overlay-subtle)] hover:text-ink ${
                menu?.id === c.id ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
              }`}
            >
              <MoreVertical size={15} aria-hidden />
            </button>
          </div>
        ),
      )}

      {typeof document !== "undefined" &&
        menu &&
        open &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={
              menu.up
                ? { position: "fixed", left: menu.x - MENU_W, bottom: window.innerHeight - menu.y, width: MENU_W, zIndex: 80 }
                : { position: "fixed", left: menu.x - MENU_W, top: menu.y, width: MENU_W, zIndex: 80 }
            }
            className="overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl shadow-[var(--shadow-color)]"
          >
            <MenuItem icon={Pencil} label="Rename" onClick={() => startRename(open)} />
            <MenuItem
              icon={open.pinned ? PinOff : Pin}
              label={open.pinned ? "Unpin" : "Pin"}
              onClick={() => patch(open.id, { pinned: !open.pinned })}
            />
            <MenuItem icon={Archive} label="Archive" onClick={() => patch(open.id, { archived: true })} />
            <div aria-hidden className="my-1 border-t border-line" />
            {confirmDel ? (
              <MenuItem icon={Trash2} label="Confirm delete" danger onClick={() => remove(open.id)} />
            ) : (
              <MenuItem icon={Trash2} label="Delete" danger onClick={() => setConfirmDel(true)} />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-[var(--overlay-subtle)] ${
        danger ? "text-ember" : "text-mute hover:text-ink"
      }`}
    >
      <Icon size={14} aria-hidden />
      {label}
    </button>
  );
}
