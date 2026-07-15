"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, session } from "@/lib/api";

export default function Templates() {
  const router = useRouter(), current = session()?.user, isAdmin = current?.role === "ADMIN";
  const [items, setItems] = useState<any[]>([]), [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState(""), [name, setName] = useState(""), [description, setDescription] = useState("");
  const [style, setStyle] = useState("heritage"), [clip, setClip] = useState<any>(null), [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [templates, people] = await Promise.all([
        api<any[]>("/templates"),
        isAdmin ? api<any[]>("/admin/users") : Promise.resolve([]),
      ]);
      setItems(templates); setUsers(people.filter((person: any) => person.role !== "ADMIN"));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load templates"); }
  }
  useEffect(() => { load(); }, []);
  function useTemplate(item: any) { localStorage.setItem("kathaforge_selected_template", JSON.stringify(item)); router.push("/"); }
  async function upload(file?: File) { if (!file) return; const form = new FormData(); form.append("media", file); const response = await fetch("/api/media-upload", { method: "POST", body: form }), data = await response.json(); if (!response.ok) throw new Error(data.error); setClip(data.files[0]); }
  async function create() { if (!name.trim()) return setError("Enter a template name."); setSaving(true); setError(""); try { await api("/templates", { method: "POST", body: JSON.stringify({ name, description, style, videoUrl: clip?.url }) }); setName(""); setDescription(""); setClip(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to create template"); } finally { setSaving(false); } }
  async function remove(id: string) { if (confirm("Delete this template?")) { await api(`/templates/${id}`, { method: "DELETE" }); load(); } }
  async function toggleAccess(item: any, userId: string) { const currentIds: string[] = item.allowedUserIds ?? [], userIds = currentIds.includes(userId) ? currentIds.filter(id => id !== userId) : [...currentIds, userId]; await api(`/admin-insights/templates/${item.id}/access`, { method: "POST", body: JSON.stringify({ userIds }) }); await load(); }

  return <main className="module-page"><header><Link href="/">← Dashboard</Link><b>Video templates</b><span>{isAdmin ? "Private library & access" : "Your private library"}</span></header><section>
    <div className="template-hero"><div><p className="eyebrow">PRIVATE TEMPLATE STUDIO</p><h1>Reusable designs, controlled by their creators</h1><p>Your uploads remain private. An administrator can grant selected customers access without publishing a template platform-wide.</p></div></div>
    {error && <div className="auth-error">{error}</div>}
    <div className="template-builder"><div><b>Create your own template</b><small>Only you can see it initially. Upload a reusable background or opening clip.</small></div><input value={name} onChange={e => setName(e.target.value)} placeholder="Template name"/><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description"/><select value={style} onChange={e => setStyle(e.target.value)}><option value="heritage">Indian Heritage</option><option value="royal">Royal Violet</option><option value="minimal">Minimal Dark</option></select><label>{clip ? `✓ ${clip.name}` : "Upload MP4, WebM or MOV"}<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e => upload(e.target.files?.[0]).catch(x => setError(x.message))}/></label>{clip && <video src={clip.url} controls muted/>}<button onClick={create} disabled={saving}>{saving ? "Creating…" : "Create private template"}</button></div>
    <div className="template-grid polished">{items.map(item => <article key={item.id} className="template-library-card">{item.videoUrl ? <video src={item.videoUrl} controls muted preload="metadata"/> : <div className={`template-swatch ${item.style}`}/>}<div className="template-card-badges"><span className="template-style">{item.style}</span><span className="template-private">{item.createdBy === current?.id ? "MY TEMPLATE" : item.creatorRole === "ADMIN" ? "ADMIN SHARED" : "SHARED WITH ME"}</span></div><b>{item.name}</b><small>{item.description || `${item.style} visual style`}</small><div className="template-card-actions"><button onClick={() => useTemplate(item)}>Preview & use</button>{(isAdmin || item.createdBy === current?.id) && <button className="delete-template" onClick={() => remove(item.id)}>Delete</button>}</div>{isAdmin && <details className="template-access"><summary>Customer access · {(item.allowedUserIds ?? []).length} selected</summary><div>{users.map(user => <label key={user.id}><input type="checkbox" checked={(item.allowedUserIds ?? []).includes(user.id)} onChange={() => toggleAccess(item, user.id)}/><span><b>{user.fullName}</b><small>{user.email}</small></span></label>)}</div></details>}</article>)}</div>
    {!error && !items.length && <div className="empty-projects">No templates are available to this account yet. Upload your first private template above.</div>}
  </section></main>;
}
