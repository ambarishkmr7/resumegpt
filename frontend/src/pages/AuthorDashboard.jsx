import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { api } from "../api/client";

const card = { background: "#fff", border: "1px solid #e2dccf", borderRadius: 14, padding: 20, marginBottom: 20 };
const label = { display: "block", fontSize: 12, fontWeight: 700, color: "#6b6258", margin: "0 0 4px" };
const input = { width: "100%", padding: "10px 12px", border: "1px solid #e2dccf", borderRadius: 8, fontSize: 14, background: "#faf6ee", boxSizing: "border-box" };
const emptyPost = { id: null, title: "", excerpt: "", content: "", status: "published" };

export default function AuthorDashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState(emptyPost);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const flash = (m) => { setMsg(m); setErr(""); setTimeout(() => setMsg(""), 2500); };
  const fail = (e) => { setErr(e.message || "Something went wrong"); setMsg(""); };

  useEffect(() => {
    if (!localStorage.getItem("author_token")) { navigate("/author/login"); return; }
    api.authorMe()
      .then((a) => {
        setMe(a);
        setProfile({ name: a.name || "", role: a.role || "", credentials: a.credentials || "",
          bio: a.bio || "", avatar_url: a.avatar_url || "", linkedin_url: a.linkedin_url || "" });
        return api.authorListPosts();
      })
      .then((list) => setPosts(Array.isArray(list) ? list : []))
      .catch(() => { localStorage.removeItem("author_token"); navigate("/author/login"); })
      .finally(() => setLoading(false));
  }, [navigate]);

  const saveProfile = async (e) => {
    e.preventDefault();
    try { const a = await api.authorUpdateProfile(profile); setMe(a); flash("Profile saved."); }
    catch (e2) { fail(e2); }
  };

  const savePost = async (e) => {
    e.preventDefault();
    try {
      const body = { title: draft.title, excerpt: draft.excerpt, content: draft.content, status: draft.status };
      if (draft.id) {
        const p = await api.authorUpdatePost(draft.id, body);
        setPosts((ps) => ps.map((x) => (x.id === p.id ? p : x)));
        flash("Post updated.");
      } else {
        const p = await api.authorCreatePost(body);
        setPosts((ps) => [p, ...ps]);
        flash("Post published.");
      }
      setDraft(emptyPost);
    } catch (e2) { fail(e2); }
  };

  const editPost = (p) => { setDraft({ id: p.id, title: p.title, excerpt: p.excerpt || "", content: p.content || "", status: p.status }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const delPost = async (p) => {
    if (!window.confirm(`Delete “${p.title}”?`)) return;
    try { await api.authorDeletePost(p.id); setPosts((ps) => ps.filter((x) => x.id !== p.id)); flash("Post deleted."); }
    catch (e2) { fail(e2); }
  };
  const logout = () => { api.authorLogout(); navigate("/author/login"); };

  if (loading) return (<><Topbar /><div style={{ maxWidth: 820, margin: "60px auto", textAlign: "center", color: "#6b6258" }}>Loading…</div></>);

  return (
    <>
      <Topbar />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 24px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Author Dashboard</h1>
            <p style={{ fontSize: 13, color: "#6b6258", margin: "4px 0 0" }}>
              Signed in as <strong>{me?.name}</strong> · <Link to="/resources/editorial-team" style={{ color: "#b45309" }}>view your public profile</Link>
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
        </div>

        {msg && <div style={{ margin: "14px 0", padding: "10px 12px", background: "#ecfdf3", border: "1px solid #abefc6", borderRadius: 8, color: "#067647", fontSize: 13.5 }}>{msg}</div>}
        {err && <div className="error" style={{ margin: "14px 0" }}>{err}</div>}

        {/* Profile */}
        <form onSubmit={saveProfile} style={{ ...card, marginTop: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 14px" }}>Your profile</h2>
          {profile && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={label}>Name</label><input style={input} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></div>
              <div><label style={label}>Role / title</label><input style={input} value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })} placeholder="Lead Career Editor · CPRW" /></div>
              <div><label style={label}>Credentials (badge)</label><input style={input} value={profile.credentials} onChange={(e) => setProfile({ ...profile, credentials: e.target.value })} placeholder="CPRW · 9 yrs" /></div>
              <div><label style={label}>LinkedIn URL</label><input style={input} value={profile.linkedin_url} onChange={(e) => setProfile({ ...profile, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/…" /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Avatar image URL (optional)</label><input style={input} value={profile.avatar_url} onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })} placeholder="https://…/me.jpg" /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Bio</label><textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} /></div>
            </div>
          )}
          <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} type="submit">Save profile</button>
        </form>

        {/* Post editor */}
        <form onSubmit={savePost} style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 14px" }}>{draft.id ? "Edit post" : "Write a new post"}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <div><label style={label}>Title</label><input style={input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required placeholder="5 Resume Bullet Mistakes That Cost Interviews" /></div>
            <div><label style={label}>Excerpt (short summary)</label><input style={input} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} placeholder="One line shown under the title" /></div>
            <div><label style={label}>Content</label><textarea style={{ ...input, minHeight: 160, resize: "vertical" }} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} required placeholder="Write your post…" /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ ...label, margin: 0 }}>Status</label>
              <select style={{ ...input, width: "auto" }} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="published">Published (visible in Our Authors)</option>
                <option value="draft">Draft (hidden)</option>
              </select>
              <button className="btn btn-primary btn-sm" type="submit">{draft.id ? "Update post" : "Publish post"}</button>
              {draft.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(emptyPost)}>Cancel edit</button>}
            </div>
          </div>
        </form>

        {/* Post list */}
        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 14px" }}>Your posts ({posts.length})</h2>
          {posts.length === 0 && <p style={{ color: "#6b6258", fontSize: 14 }}>No posts yet. Write your first one above.</p>}
          <div style={{ display: "grid", gap: 10 }}>
            {posts.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "#faf6ee", border: "1px solid #eee5d6", borderRadius: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {p.title}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: p.status === "published" ? "#067647" : "#9a6a00", background: p.status === "published" ? "#ecfdf3" : "#fef6e7", padding: "1px 8px", borderRadius: 20 }}>{p.status}</span>
                  </div>
                  {p.excerpt && <p style={{ fontSize: 12.5, color: "#6b6258", margin: "4px 0 0" }}>{p.excerpt}</p>}
                </div>
                <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => editPost(p)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "#b42318" }} onClick={() => delPost(p)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
