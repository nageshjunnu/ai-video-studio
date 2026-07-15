"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, session } from "@/lib/api";

export default function Admin() {
  const [users, setUsers] = useState<any[]>([]),
    [videos, setVideos] = useState<any[]>([]),
    [purchases, setPurchases] = useState<any[]>([]),
    [templates, setTemplates] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null),
    [analytics, setAnalytics] = useState<any>(null),
    [tab, setTab] = useState("payments"),
    [error, setError] = useState("");
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [style, setStyle] = useState("heritage"),
    [clip, setClip] = useState<any>(null),
    [saving, setSaving] = useState(false);
  async function load() {
    try {
      const [s, u, v, p, a, t] = await Promise.all([
        api("/admin/dashboard"),
        api("/admin/users"),
        api("/admin/videos"),
        api("/admin/purchases"),
        api("/admin-insights/analytics"),
        api("/templates"),
      ]);
      setStats(s);
      setUsers(u as any[]);
      setVideos(v as any[]);
      setPurchases(p as any[]);
      setAnalytics(a);
      setTemplates(t as any[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load");
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function credits(id: string, amount: number) {
    await api(`/admin/users/${id}/credits`, {
      method: "POST",
      body: JSON.stringify({ amount, reason: "Admin panel adjustment" }),
    });
    load();
  }
  async function role(id: string, value: string) {
    await api(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: value }),
    });
    load();
  }
  async function approve(id: string) {
    await api(`/admin/purchases/${id}/approve`, { method: "POST" });
    load();
  }
  async function upload(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.append("media", file);
    const response = await fetch("/api/media-upload", {
        method: "POST",
        body: form,
      }),
      data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setClip(data.files[0]);
  }
  async function createTemplate() {
    if (!name.trim()) return setError("Template name is required");
    setSaving(true);
    setError("");
    try {
      await api("/admin-insights/templates", {
        method: "POST",
        body: JSON.stringify({ name, description, style, videoUrl: clip?.url }),
      });
      setName("");
      setDescription("");
      setClip(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Template creation failed");
    } finally {
      setSaving(false);
    }
  }
  async function removeTemplate(id: string) {
    await api(`/admin-insights/templates/${id}`, { method: "DELETE" });
    load();
  }
  async function targetVideoUsers(video: any) {
    const current = (video.targetUserIds ?? [])
        .map((id: string) => users.find((u) => u.id === id)?.email)
        .filter(Boolean)
        .join(", "),
      emails = prompt(
        "Enter target user emails separated by commas. Leave empty to target all users.",
        current,
      );
    if (emails === null) return;
    const requested = emails
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
      userIds = users
        .filter((u) => requested.includes(u.email.toLowerCase()))
        .map((u) => u.id);
    await api(`/admin-insights/videos/${video.id}/target-users`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    });
    load();
  }
  async function deleteVideo(video: any) {
    if (!confirm("Move this video to Trash for 60 days?")) return;
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
  const bars = (title: string, rows: any[] = [], key: string) => (
    <article>
      <h2>{title}</h2>
      {rows.map((r) => (
        <div className="bar-row" key={r[key]}>
          <span>{r[key]}</span>
          <i>
            <b style={{ width: `${Math.min(100, r._count * 12)}%` }} />
          </i>
          <strong>{r._count}</strong>
        </div>
      ))}
    </article>
  );
  return (
    <main className="module-page">
      <header>
        <Link href="/">← Dashboard</Link>
        <b>Drishyana Admin</b>
        <span>Full operations</span>
      </header>
      <section>
        <p className="eyebrow">ADMIN CONTROL CENTER</p>
        <h1>Platform operations</h1>
        {error && <div className="auth-error">{error}</div>}
        {stats && (
          <div className="stats-row">
            <article>
              <b>{stats.users}</b>
              <span>Total users</span>
            </article>
            <article>
              <b>{stats.videos?.COMPLETED ?? 0}</b>
              <span>Completed videos</span>
            </article>
            <article>
              <b>{purchases.filter((p) => p.status === "PENDING").length}</b>
              <span>Pending payments</span>
            </article>
            <article>
              <b>{stats.creditsIssued}</b>
              <span>Credit activity</span>
            </article>
          </div>
        )}
        <div className="admin-shortcuts">
          <Link href="/admin/videos?scope=users">User-created videos</Link>
          <Link href="/admin/videos?scope=admins">Admin-created videos</Link>
          <Link href="/team">Manage team</Link>
          <Link href="/templates">Manage templates</Link>
          <Link href="/admin/notifications">Notification management</Link>
          <Link href="/admin/features">Creator tool access</Link>
        </div>
        <div className="admin-tabs">
          {[
            "payments",
            "users",
            "admins",
            "videos",
            "analytics",
            "templates",
          ].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "payments" && (
          <div className="user-table">
            <div className="tr payment head">
              <span>Customer</span>
              <span>Transaction</span>
              <span>Package</span>
              <span>Status/action</span>
            </div>
            {purchases.map((p) => (
              <div className="tr payment" key={p.id}>
                <span>
                  <b>{p.user.fullName}</b>
                  <small>{p.user.email}</small>
                </span>
                <span>{p.transactionId || "—"}</span>
                <span>
                  {p.package.name} · ₹{p.amountInPaise / 100}
                </span>
                <span>
                  {p.status === "PENDING" ? (
                    <button onClick={() => approve(p.id)}>
                      Approve credits
                    </button>
                  ) : (
                    p.status
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {["users", "admins"].includes(tab) && (
          <div className="user-table">
            <div className="tr head">
              <span>User</span>
              <span>Role</span>
              <span>Credits</span>
              <span>Operations</span>
            </div>
            {users
              .filter((u) =>
                tab === "admins" ? u.role === "ADMIN" : u.role !== "ADMIN",
              )
              .map((u) => (
                <div className="tr" key={u.id}>
                  <span>
                    <b>{u.fullName}</b>
                    <small>{u.email}</small>
                  </span>
                  <select
                    value={u.role}
                    onChange={(e) => role(u.id, e.target.value)}
                  >
                    <option>CUSTOMER</option>
                    <option>ADMIN</option>
                    <option>TEST_USER</option>
                  </select>
                  <span>{u.credits.toLocaleString()}</span>
                  <span>
                    <button onClick={() => credits(u.id, 1000)}>+1000</button>
                    <button onClick={() => credits(u.id, -100)}>-100</button>
                  </span>
                </div>
              ))}
          </div>
        )}
        {tab === "videos" && (
          <div className="admin-video-grid professional">
            {videos
              .filter((v) => v.status !== "ARCHIVED")
              .map((v) => (
                <article key={v.id}>
                  {v.finalVideoUrl ? (
                    <video src={v.finalVideoUrl} controls />
                  ) : (
                    <div className="video-placeholder">{v.status}</div>
                  )}
                  <div className="video-card-head">
                    <b>{v.title}</b>
                    <span>{v.status}</span>
                  </div>
                  <small>
                    {v.user.fullName} · {v.user.email}
                  </small>
                  <span>
                    {v.voice} · {v.creditsConsumed} credits ·{" "}
                    {v.country || "GLOBAL"}
                  </span>
                  <span>
                    {Array.isArray(v.targetUserIds) && v.targetUserIds.length
                      ? `${v.targetUserIds.length} target users`
                      : "All users targeted"}
                  </span>
                  <div className="admin-video-actions">
                    <Link href={`/videos/${v.id}`}>Open details</Link>
                    <button onClick={() => targetVideoUsers(v)}>
                      Target users
                    </button>
                    <button className="danger" onClick={() => deleteVideo(v)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
          </div>
        )}
        {tab === "analytics" && analytics && (
          <>
            <div className="stats-row admin-metrics">
              <article>
                <b>{analytics.totals.users}</b>
                <span>All users</span>
              </article>
              <article>
                <b>{analytics.totals.admins}</b>
                <span>Admins</span>
              </article>
              <article>
                <b>{analytics.totals.videos}</b>
                <span>All videos</span>
              </article>
              <article>
                <b>₹{(analytics.totals.revenuePaise / 100).toLocaleString()}</b>
                <span>Approved payments</span>
              </article>
            </div>
            <div className="analytics-grid">
              {bars("Users by role", analytics.roles, "role")}
              {bars("Videos by status", analytics.statuses, "status")}
              {bars("Video formats", analytics.formats, "format")}
              {bars("Languages", analytics.languages, "language")}
              {bars("Payments", analytics.payments, "status")}
            </div>
          </>
        )}
        {tab === "templates" && (
          <>
            <div className="template-form">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
              />
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="heritage">Heritage</option>
                <option value="royal">Royal</option>
                <option value="minimal">Minimal</option>
              </select>
              <label>
                {clip ? clip.name : "Upload template video clip"}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(e) =>
                    upload(e.target.files?.[0]).catch((x) =>
                      setError(x.message),
                    )
                  }
                />
              </label>
              <button onClick={createTemplate} disabled={saving}>
                {saving ? "Saving…" : "Create template"}
              </button>
            </div>
            <div className="template-grid">
              {templates.map((t) => (
                <article key={t.id}>
                  {t.videoUrl ? (
                    <video src={t.videoUrl} controls muted />
                  ) : (
                    <div className={`template-swatch ${t.style}`} />
                  )}
                  <b>{t.name}</b>
                  <small>{t.description || t.style}</small>
                  <button onClick={() => removeTemplate(t.id)}>Delete</button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
