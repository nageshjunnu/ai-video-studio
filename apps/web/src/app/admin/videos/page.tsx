"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, session } from "@/lib/api";

export default function AllUserVideos() {
  const [videos, setVideos] = useState<any[]>([]),
    [users, setUsers] = useState<any[]>([]),
    [owner, setOwner] = useState("ALL"),
    [status, setStatus] = useState("ACTIVE"),
    [scope, setScope] = useState<"USERS" | "ADMINS">("USERS"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      const [v, u] = await Promise.all([
        api<any[]>("/admin/videos"),
        api<any[]>("/admin/users"),
      ]);
      setVideos(v);
      setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load videos");
    }
  }
  useEffect(() => {
    setScope(new URLSearchParams(window.location.search).get("scope") === "admins" ? "ADMINS" : "USERS");
    load();
  }, []);
  const shown = useMemo(
    () =>
      videos.filter(
        (v) =>
          (owner === "ALL" || v.user.email === owner) &&
          (scope === "ADMINS" ? v.user.role === "ADMIN" : v.user.role !== "ADMIN") &&
          (status === "ALL" ||
            (status === "ACTIVE"
              ? v.status !== "ARCHIVED"
              : v.status === status)) &&
          `${v.title} ${v.user.fullName} ${v.user.email}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [videos, owner, status, query, scope],
  );
  async function target(video: any) {
    const current = (video.targetUserIds ?? [])
        .map((id: string) => users.find((u) => u.id === id)?.email)
        .filter(Boolean)
        .join(", "),
      emails = prompt(
        "Target user emails separated by commas. Empty means all users.",
        current,
      );
    if (emails === null) return;
    const wanted = emails
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
      userIds = users
        .filter((u) => wanted.includes(u.email.toLowerCase()))
        .map((u) => u.id);
    await api(`/admin-insights/videos/${video.id}/target-users`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    });
    load();
  }
  async function remove(video: any) {
    if (!confirm(`Move “${video.title}” to Trash for 60 days?`)) return;
    try {
      if (video.finalVideoUrl?.startsWith("/renders/")) {
        const token = session()?.accessToken,
          response = await fetch("/api/video-trash", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              projectId: video.id,
              url: video.finalVideoUrl,
              action: "trash",
            }),
          }),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        await api(`/projects/${video.id}/file-url`, {
          method: "PATCH",
          body: JSON.stringify({ url: data.url }),
        });
      }
      await api(`/admin-insights/videos/${video.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete video");
    }
  }
  async function permanentDelete(ids:string[]){if(!ids.length)return;if(!confirm(`Permanently delete ${ids.length} selected video(s) from the database and storage? This cannot be undone.`))return;setDeleting(true);setError("");try{await api('/admin-insights/videos/permanent-delete',{method:'POST',body:JSON.stringify({ids})});setSelected([]);await load()}catch(e){setError(e instanceof Error?e.message:'Permanent deletion failed')}finally{setDeleting(false)}}
  async function truncateAll(){const confirmation=prompt('This permanently deletes ALL videos for ALL users. Type DELETE ALL VIDEOS to continue.');if(confirmation!=='DELETE ALL VIDEOS')return;setDeleting(true);setError('');try{const result=await api<any>('/admin-insights/videos/truncate',{method:'POST'});setSelected([]);await load();alert(`${result.deleted} videos permanently deleted.`)}catch(e){setError(e instanceof Error?e.message:'Video truncate failed')}finally{setDeleting(false)}}
  function toggle(id:string){setSelected(value=>value.includes(id)?value.filter(item=>item!==id):[...value,id])}
  const owners = [
    ...new Map(videos.map((v) => [v.user.email, v.user])).values(),
  ];
  return (
    <main className="module-page">
      <header>
        <Link href="/admin">← Admin</Link>
        <b>{scope === "ADMINS" ? "Admin-created videos" : "User-created videos"}</b>
        <span>{shown.length} results</span>
      </header>
      <section>
        <div className="video-admin-hero">
          <div>
            <p className="eyebrow">PLATFORM VIDEO LIBRARY</p>
            <h1>Every creator’s video, in one place</h1>
            <p>
              Review ownership, audience targeting and retention operations
              across the platform.
            </p>
          </div>
          <div>
            <b>{videos.filter((v) => v.user.role === "CUSTOMER").length}</b>
            <span>Customer videos</span>
          </div>
          <div>
            <b>{videos.filter((v) => v.user.role === "ADMIN").length}</b>
            <span>Admin videos</span>
          </div>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <div className="video-scope-menu"><button className={scope==="USERS"?"active":""} onClick={()=>setScope("USERS")}>User-created videos</button><button className={scope==="ADMINS"?"active":""} onClick={()=>setScope("ADMINS")}>Admin-created videos</button></div><div className="video-admin-toolbar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search video, creator or email…"
          />
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="ALL">All creators</option>
            {owners.map((u: any) => (
              <option value={u.email} key={u.email}>
                {u.fullName} · {u.email}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Active videos</option>
            <option value="ALL">All statuses</option>
            <option>COMPLETED</option>
            <option>PROCESSING</option>
            <option>FAILED</option>
            <option>ARCHIVED</option>
          </select>
        </div>
        <div className="video-bulk-actions"><label><input type="checkbox" checked={shown.length>0&&shown.every(video=>selected.includes(video.id))} onChange={event=>setSelected(event.target.checked?[...new Set([...selected,...shown.map(video=>video.id)])]:selected.filter(id=>!shown.some(video=>video.id===id)))}/><span>Select all visible</span></label><b>{selected.length} selected</b><button disabled={!selected.length||deleting} onClick={()=>permanentDelete(selected)}>Permanently delete selected</button><button className="truncate" disabled={!videos.length||deleting} onClick={truncateAll}>Truncate all videos</button></div>
        <div className="platform-video-grid">
          {shown.map((v) => (
            <article key={v.id}>
              <label className="video-select"><input type="checkbox" checked={selected.includes(v.id)} onChange={()=>toggle(v.id)}/><span>Select</span></label>
              <div className="platform-video-player">
                {v.finalVideoUrl && v.status !== "ARCHIVED" ? (
                  <video src={v.finalVideoUrl} controls preload="metadata" />
                ) : (
                  <div>{v.status}</div>
                )}
                <span>{v.user.role}</span>
              </div>
              <div className="platform-video-copy">
                <div>
                  <b>{v.title}</b>
                  <small>
                    {v.user.fullName} · {v.user.email}
                  </small>
                </div>
                <dl>
                  <span>{v.language?.toUpperCase()}</span>
                  <span>{v.format}</span>
                  <span>{v.country || "GLOBAL"}</span>
                  <span>{v.creditsConsumed} credits</span>
                </dl>
                <p>
                  {v.targetUserIds?.length
                    ? `Targeted to ${v.targetUserIds.length} selected users`
                    : "Available to all target users"}
                </p>
              </div>
              <div className="platform-video-actions">
                <Link href={`/videos/${v.id}`}>Open video</Link>
                <button onClick={() => target(v)}>Target users</button>
                {v.status !== "ARCHIVED" && (
                  <button className="danger" onClick={() => remove(v)}>
                    Delete
                  </button>
                )}
                <button className="danger permanent" onClick={()=>permanentDelete([v.id])}>Permanently delete</button>
              </div>
            </article>
          ))}
        </div>
        {!shown.length && !error && (
          <div className="empty-projects">No videos match these filters.</div>
        )}
      </section>
    </main>
  );
}
