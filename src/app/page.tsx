"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import initialPosts from "../data/posts.json";

type Platform = "instagram" | "facebook" | "x" | "tiktok";
type Status = "scheduled" | "published" | "failed";
type Post = { id: string; content: string; platforms: Platform[]; mediaUrl?: string; scheduledAt: string; status: Status; errorMessage?: string };

const platformInfo: Record<Platform, { label: string; short: string; className: string; limit: number }> = {
  instagram: { label: "Instagram", short: "ig", className: "instagram", limit: 2200 },
  facebook: { label: "Facebook", short: "f", className: "facebook", limit: 5000 },
  x: { label: "X", short: "𝕏", className: "x", limit: 280 },
  tiktok: { label: "TikTok", short: "♪", className: "tiktok", limit: 2200 },
};
const filters: (Platform | "all")[] = ["all", "instagram", "facebook", "x", "tiktok"];
const statusOptions: (Status | "all")[] = ["all", "scheduled", "published", "failed"];
const emptyForm = () => { const d = new Date(Date.now() + 3600_000); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d; };
const locationChangeEvent = "flintzy:locationchange";
function subscribeLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(locationChangeEvent, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(locationChangeEvent, onChange);
  };
}
function getLocationSearch() { return window.location.search; }
function getServerLocationSearch() { return ""; }

function Icon({ platform, small = false }: { platform: Platform; small?: boolean }) {
  const info = platformInfo[platform];
  return <span aria-label={info.label} title={info.label} className={`platform-icon ${info.className}${small ? " tiny" : ""}`}>{info.short}</span>;
}
function formatTime(iso: string, local: boolean) {
  return new Intl.DateTimeFormat("en-US", { timeZone: local ? undefined : "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}
function groupKey(iso: string, local: boolean) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: local ? undefined : "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}
function dayLabel(iso: string, local: boolean, currentTime: number) {
  const date = new Date(iso); const timeZone = local ? undefined : "UTC";
  if (!currentTime) return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(date);
  const now = new Date(currentTime);
  const dateParts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" });
  const partsFor = (value: Date) => dateParts.formatToParts(value);
  const todayParts = partsFor(now); const targetParts = partsFor(date);
  const toDate = (parts: Intl.DateTimeFormatPart[]) => new Date(Number(parts.find((p) => p.type === "year")?.value), Number(parts.find((p) => p.type === "month")?.value) - 1, Number(parts.find((p) => p.type === "day")?.value));
  const today = toDate(todayParts); const target = toDate(targetParts);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(date);
}

export default function Home() {
  return <Dashboard />;
}

function Dashboard() {
  const search = useSyncExternalStore(subscribeLocation, getLocationSearch, getServerLocationSearch);
  const searchParams = new URLSearchParams(search);
  const [posts, setPosts] = useState<Post[]>(initialPosts as Post[]);
  const platform = searchParams.get("platform") || "all";
  const status = searchParams.get("status") || "all";
  const query = searchParams.get("q") || "";
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState(""); const [selected, setSelected] = useState<Platform[]>(["instagram"]);
  const [mediaUrl, setMediaUrl] = useState(""); const [scheduledAt, setScheduledAt] = useState<Date>(new Date(0));
  const [mediaError, setMediaError] = useState(""); const [checkingMedia, setCheckingMedia] = useState(false);
  const [previewMediaUrl, setPreviewMediaUrl] = useState("");
  const [previewState, setPreviewState] = useState<"loading" | "loaded" | "error">("loading");
  const [toast, setToast] = useState(""); const [retrying, setRetrying] = useState<string[]>([]);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!previewMediaUrl) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewMediaUrl(""); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [previewMediaUrl]);
  const mounted = now > 0;

  const visiblePosts = useMemo(() => posts.filter((post) =>
    (platform === "all" || post.platforms.includes(platform as Platform)) &&
    (status === "all" || post.status === status) && post.content.toLowerCase().includes(query.toLowerCase())
  ).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [posts, platform, status, query]);
  const grouped = useMemo(() => visiblePosts.reduce<Record<string, Post[]>>((acc, post) => {
    const key = groupKey(post.scheduledAt, mounted); (acc[key] ||= []).push(post); return acc;
  }, {}), [visiblePosts, mounted]);
  const overLimit = selected.filter((p) => content.length > platformInfo[p].limit);
  const dateMin = now ? new Date(now - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : undefined;
  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); }, []);

  function updateSearchParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(locationChangeEvent));
  }
  function clearFilters() {
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
    window.dispatchEvent(new Event(locationChangeEvent));
  }
  function openComposer() {
    setScheduledAt(emptyForm());
    setComposerOpen(true);
  }
  function togglePlatform(p: Platform) { setSelected((current) => current.includes(p) ? current.filter((x) => x !== p) : [...current, p]); }
  async function createPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || !selected.length || overLimit.length || scheduledAt.getTime() <= Date.now()) return;
    if (mediaUrl.trim()) {
      setCheckingMedia(true); setMediaError("");
      const isImage = await new Promise<boolean>((resolve) => {
        const image = document.createElement("img"); let settled = false;
        const finish = (valid: boolean) => { if (!settled) { settled = true; window.clearTimeout(timeout); resolve(valid); } };
        const timeout = window.setTimeout(() => finish(false), 10_000);
        image.onload = () => finish(true); image.onerror = () => finish(false); image.src = mediaUrl.trim();
      });
      setCheckingMedia(false);
      if (!isImage) { setMediaError("This link doesn’t load an image. Paste a direct image URL and try again."); return; }
    }
    if (scheduledAt.getTime() <= Date.now()) return;
    setPosts((current) => [{ id: `p-${Date.now()}`, content: content.trim(), platforms: selected, mediaUrl: mediaUrl.trim() || undefined, scheduledAt: scheduledAt.toISOString(), status: "scheduled" }, ...current]);
    setComposerOpen(false); setContent(""); setMediaUrl(""); setMediaError(""); setSelected(["instagram"]); setScheduledAt(emptyForm()); notify("Your post is scheduled.");
  }
  function retryPost(post: Post) {
    if (retrying.includes(post.id)) return;
    if (status === "failed") updateSearchParam("status", "");
    setRetrying((current) => [...current, post.id]);
    setPosts((current) => current.map((p) => p.id === post.id ? { ...p, status: "scheduled", errorMessage: undefined } : p));
    window.setTimeout(() => {
      const failed = Math.random() < 0.2;
      if (failed) {
        setPosts((current) => current.map((p) => p.id === post.id ? { ...p, status: "failed", errorMessage: "Retry failed. Please try again in a moment." } : p)); notify("Retry failed. Your post is still in the queue.");
      } else notify("Post retry started successfully.");
      setRetrying((current) => current.filter((id) => id !== post.id));
    }, 1000);
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top"><span>flintzy<span className="brand-dot">.</span></span></a>
      <a className="nav-item active" href="#queue"><span className="nav-icon">▦</span> Post queue</a>
    </aside>
    <section className="main-area" id="top">
      <header className="topbar"><div className="breadcrumb"><strong>Schedule</strong></div><div className="top-actions"><span className="timezone">{mounted ? `Local time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}` : ""}</span></div></header>
      <div className="content-wrap" id="queue">
        <div className="page-heading"><div><h1>Post queue</h1><p>Manage scheduled and published social posts.</p></div><button className="primary-button" onClick={openComposer}><span>＋</span> Create post</button></div>
        <div className="queue-heading"><div><h2>All posts</h2><span>{visiblePosts.length} posts</span></div></div>
        <div className="filter-panel"><div className="filter-tabs" aria-label="Filter by platform">{filters.map((filter) => <button key={filter} className={`filter-tab ${platform === filter ? "selected" : ""}`} onClick={() => updateSearchParam("platform", filter === "all" ? "" : filter)}>{filter === "all" ? "All channels" : <><Icon platform={filter}/>{platformInfo[filter].label}</>}</button>)}</div><div className="filter-tools"><label className="search-box"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><input value={query} onChange={(e) => updateSearchParam("q", e.target.value)} placeholder="Search posts..." aria-label="Search posts" />{query && <button type="button" onClick={() => updateSearchParam("q", "")} aria-label="Clear search">×</button>}</label><label className="status-select"><span>Status:</span><select value={status} onChange={(e) => updateSearchParam("status", e.target.value === "all" ? "" : e.target.value)} aria-label="Filter by status">{statusOptions.map((s) => <option value={s} key={s}>{s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</option>)}</select></label></div></div>
        <div className="queue-list">{Object.keys(grouped).length === 0 ? <div className="empty-state"><span className="empty-illustration">⌕</span><h3>No posts found</h3><p>Try changing your filters or search for something else.</p><button className="text-button" onClick={clearFilters}>Clear all filters</button></div> : Object.entries(grouped).map(([key, dayPosts]) => <section className="day-group" key={key}><div className="day-heading"><span>{dayLabel(dayPosts[0].scheduledAt, mounted, now)}</span><span className="day-line"/><span>{dayPosts.length} {dayPosts.length === 1 ? "post" : "posts"}</span></div><div className="post-list">{dayPosts.map((post) => <article className="post-card" key={post.id}><div className="post-time"><span className="time-dot"/><strong suppressHydrationWarning>{formatTime(post.scheduledAt, mounted)}</strong><small suppressHydrationWarning>{mounted ? new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date(post.scheduledAt)).find(p => p.type === "timeZoneName")?.value : "UTC"}</small></div><div className="post-divider"/><div className="post-body"><div className="post-platforms">{[...new Set(post.platforms)].map(p => <Icon key={p} platform={p}/>)}</div><p>{post.content}</p>{post.errorMessage && <div className="post-error">⚠ {post.errorMessage}</div>}{post.mediaUrl && <button type="button" className="media-chip" onClick={() => { setPreviewState("loading"); setPreviewMediaUrl(post.mediaUrl!); }} aria-label="View attached image"><span>▧</span> View attached image</button>}</div><div className="post-end"><span className={`status-badge ${post.status}`}><i/>{post.status}</span>{post.status === "failed" && <button className="retry-button" onClick={() => retryPost(post)} disabled={retrying.includes(post.id)}>{retrying.includes(post.id) ? <><span className="spinner"/> Retrying</> : "↻ Retry"}</button>}</div></article>)}</div></section>)}</div>
      </div>
    </section>
    {composerOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setComposerOpen(false); }}><section className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title"><div className="composer-head"><div><div className="eyebrow">MAKE SOMETHING GOOD</div><h2 id="composer-title">Create a post</h2></div><button className="close-button" onClick={() => setComposerOpen(false)} aria-label="Close">×</button></div><form onSubmit={createPost}><label className="field-label">Post text</label><textarea className="post-input" value={content} onChange={(e) => setContent(e.target.value)} placeholder="What would you like to share?" rows={5} required/><div className="counter-list">{selected.length ? selected.map(p => <span key={p} className={content.length > platformInfo[p].limit ? "over" : ""}><Icon platform={p} small/>{content.length.toLocaleString()} / {platformInfo[p].limit.toLocaleString()}</span>) : <span className="counter-hint">Choose a channel to see its character limit.</span>}</div>{overLimit.length > 0 && <div className="form-error">Your post is over the character limit for {overLimit.map(p => platformInfo[p].label).join(", ")}.</div>}
        <label className="field-label platform-label">Publish to</label><div className="platform-choices">{(["instagram", "facebook", "x", "tiktok"] as Platform[]).map(p => <button type="button" key={p} onClick={() => togglePlatform(p)} className={`platform-choice ${selected.includes(p) ? "chosen" : ""}`}><Icon platform={p}/><span>{platformInfo[p].label}</span><i>{selected.includes(p) ? "✓" : "+"}</i></button>)}</div>
        <label className="field-label">Image URL <span className="optional">Optional</span></label><input className="plain-input" type="url" value={mediaUrl} onChange={(e) => { setMediaUrl(e.target.value); setMediaError(""); }} placeholder="https://example.com/image.jpg" aria-invalid={Boolean(mediaError)}/>{mediaError && <div className="form-error" role="alert">{mediaError}</div>}
        <label className="field-label schedule-label">Schedule for</label><div className="date-row"><input className="plain-input" type="datetime-local" min={dateMin} value={new Date(scheduledAt.getTime() - scheduledAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} onChange={(e) => setScheduledAt(new Date(e.target.value))} required/><span className="local-note">Your local time · saved in UTC</span></div>{now > 0 && scheduledAt.getTime() <= now && <div className="form-error">Choose a time in the future.</div>}
        <div className="composer-actions"><button type="button" className="cancel-button" onClick={() => setComposerOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={checkingMedia || !content.trim() || !selected.length || overLimit.length > 0 || scheduledAt.getTime() <= now}>{checkingMedia ? "Checking image…" : "Schedule post"} <span>→</span></button></div></form></section></div>}
    {previewMediaUrl && <div className="modal-backdrop media-preview-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreviewMediaUrl(""); }}><section className="media-preview" role="dialog" aria-modal="true" aria-label="Attached image preview"><div className="media-preview-head"><strong>Attached image</strong><button className="close-button" onClick={() => setPreviewMediaUrl("")} aria-label="Close image preview">×</button></div><div className={`media-preview-stage ${previewState}`} aria-live="polite">{previewState === "loading" && <span className="media-preview-loading"><i/>Loading image…</span>}{previewState === "error" ? <span className="media-preview-error">This image could not be loaded.</span> : <Image className="preview-image" src={previewMediaUrl} alt="Attached post media preview" width={1200} height={900} unoptimized onLoad={() => setPreviewState("loaded")} onError={() => setPreviewState("error")}/>}</div></section></div>}
    {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
  </main>;
}
