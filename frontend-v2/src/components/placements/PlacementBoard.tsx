"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Plus,
  Search,
  X,
  RefreshCw,
  Pencil,
  Archive,
  Send,
  Eye,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { placementsAPI } from "@/config/api";
import type {
  DocumentCategory,
  Placement,
  PlacementDocument,
  PlacementInput,
  PlacementStatus,
} from "./types";
import styles from "./Placements.module.css";

const categories: { value: DocumentCategory; label: string }[] = [
  { value: "job-description", label: "Job descriptions" },
  { value: "company-profile", label: "Company profile PDFs" },
  { value: "learning-resource", label: "Learning resources" },
];
const blank: PlacementInput = {
  companyName: "",
  companyProfile: "",
  logoImage: null,
  package: "",
  jobTitle: "",
  visitDate: null,
  status: "draft",
  learningResources: [],
};
function inputOf(p: Placement): PlacementInput {
  return {
    companyName: p.companyName,
    companyProfile: p.companyProfile,
    logoImage: p.logoImage || null,
    package: p.package,
    jobTitle: p.jobTitle,
    visitDate: p.visitDate,
    status: p.status,
    learningResources: p.learningResources,
  };
}
function message(error: unknown) {
  const e = error as { response?: { data?: { message?: string | string[] } } };
  const m = e.response?.data?.message;
  return Array.isArray(m)
    ? m.join(" ")
    : typeof m === "string"
      ? m
      : error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
}

export function PlacementBoard({ manage = false }: { manage?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [form, setForm] = useState<PlacementInput>({ ...blank });
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState<Partial<Record<DocumentCategory, File[]>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoRequest = useRef(0);
  const [fileReset, setFileReset] = useState(0);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const openedPlacement = items.find((item) => item.id === openedId);
  const [preview, setPreview] = useState<{
    placement: Placement;
    document: PlacementDocument;
    url: string | null;
    error: string;
  } | null>(null);
  const previewRequest = useRef(0);
  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview?.url]);
  useEffect(
    () => () => {
      previewRequest.current += 1;
    },
    [],
  );
  const replace = (item: Placement) =>
    setItems((prev) =>
      [item, ...prev.filter((p) => p.id !== item.id)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
  const load = useCallback(
    async (signal?: AbortSignal) => {
      await Promise.resolve();
      if (signal?.aborted) return;
      setLoading(true);
      setError("");
      try {
        const { data } = await placementsAPI.list(manage, signal);
        if (!signal?.aborted) setItems(data.placements);
      } catch (e) {
        if (!signal?.aborted) setError(message(e));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [manage],
  );
  useEffect(() => {
    if (authLoading || !user) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [authLoading, user, load]);
  // Refresh student cards after an admin saves in another tab or window.
  useEffect(() => {
    if (!user || manage) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [user, manage, load]);

  const openEditor = (p?: Placement) => {
    logoRequest.current += 1;
    setLogoBusy(false);
    setEditing(p?.id ?? null);
    setForm(p ? inputOf(p) : { ...blank });
    setLinks(
      p?.learningResources.map((l) => `${l.title} | ${l.url}`).join("\n") || "",
    );
    setFiles({});
    setFileReset((v) => v + 1);
    setError("");
    setNotice("");
  };
  async function chooseLogo(file?: File) {
    if (!file) return;
    const request = ++logoRequest.current;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setLogoBusy(false);
      setError("Choose a PNG, JPEG, or WebP logo up to 5 MB.");
      return;
    }
    setLogoBusy(true);
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image processing unavailable.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const logoImage = canvas.toDataURL("image/webp", 0.85);
        if (logoImage.length > 175000)
          throw new Error("Please choose a smaller logo image.");
        if (request === logoRequest.current)
          setForm((previous) => ({ ...previous, logoImage }));
      } finally {
        bitmap.close();
      }
    } catch {
      if (request === logoRequest.current)
        setError(
          "This logo could not be read. Please choose another PNG, JPEG, or WebP image.",
        );
    } finally {
      if (request === logoRequest.current) setLogoBusy(false);
    }
  }
  const chooseFiles = (category: DocumentCategory, chosen: FileList | null) => {
    const list = Array.from(chosen || []);
    if (
      list.length > 10 ||
      list.some((f) => f.type !== "application/pdf" || f.size > 8 * 1024 * 1024)
    ) {
      setError("Choose up to 10 PDFs per group, each 8 MB or smaller.");
      setFiles((prev) => ({ ...prev, [category]: [] }));
      setFileReset((v) => v + 1);
      return;
    }
    setError("");
    setFiles((prev) => ({ ...prev, [category]: list }));
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || logoBusy) return;
    setBusy(true);
    setError("");
    setNotice("");
    let savedId = editing;
    try {
      const resources = links
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf("|");
          const title = separator >= 0 ? line.slice(0, separator).trim() : line;
          const url = separator >= 0 ? line.slice(separator + 1).trim() : line;
          if (!/^https?:\/\//i.test(url))
            throw new Error(
              "Resource links need a full http:// or https:// URL. Use Title | URL on each line.",
            );
          return { title, url };
        });
      const payload = {
        ...form,
        learningResources: resources,
        status: "draft" as PlacementStatus,
      };
      const response = savedId
        ? await placementsAPI.update(savedId, payload)
        : await placementsAPI.create(payload);
      let item: Placement = response.data.placement;
      savedId = item.id;
      setEditing(savedId);
      replace(item);
      for (const group of categories) {
        const selected = files[group.value] || [];
        if (!selected.length) continue;
        item = (await placementsAPI.upload(savedId, group.value, selected)).data
          .placement;
        replace(item);
        setFiles((prev) => ({ ...prev, [group.value]: [] }));
      }
      if (form.status !== "draft") {
        item = (
          await placementsAPI.update(savedId, {
            ...payload,
            status: form.status,
          })
        ).data.placement;
        replace(item);
      }
      setEditing(undefined);
      setFiles({});
      setNotice(
        form.status === "published"
          ? "Placement published. Students can now see it."
          : "Placement saved.",
      );
    } catch (e) {
      setError(
        `${message(e)}${savedId ? " Your entry is saved as a draft; retry to finish." : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(p: Placement, next: PlacementStatus) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      replace(
        (await placementsAPI.update(p.id, { ...inputOf(p), status: next })).data
          .placement,
      );
      setNotice(
        next === "published"
          ? "Placement is visible to students."
          : next === "archived"
            ? "Placement archived."
            : "Placement moved to drafts.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function download(p: Placement, doc: PlacementDocument) {
    try {
      const response = await placementsAPI.download(p.id, doc.id);
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      setError(
        "This PDF could not be downloaded. Please try again or contact the placement team.",
      );
    }
  }
  const closePreview = () => {
    previewRequest.current += 1;
    setPreview(null);
  };
  async function viewDocument(
    placement: Placement,
    document: PlacementDocument,
  ) {
    const request = ++previewRequest.current;
    setPreview({ placement, document, url: null, error: "" });
    try {
      const response = await placementsAPI.download(placement.id, document.id);
      if (request !== previewRequest.current) return;
      const url = URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      setPreview({ placement, document, url, error: "" });
    } catch {
      if (request === previewRequest.current)
        setPreview({
          placement,
          document,
          url: null,
          error: "This PDF could not be opened. Please try again.",
        });
    }
  }
  function documentRow(p: Placement, doc: PlacementDocument) {
    return (
      <div className={styles.document} key={doc.id}>
        <FileText size={15} className={styles.fileIcon} />
        <div className={styles.fileName} title={doc.name}>
          <span>{doc.name}</span>
          <small>{(doc.size / 1024 / 1024).toFixed(1)} MB · PDF</small>
        </div>
        <div className={styles.fileActions}>
          <button
            type="button"
            className={styles.fileAction}
            aria-label={`Preview ${doc.name}`}
            title={`Preview ${doc.name}`}
            onClick={() => void viewDocument(p, doc)}
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            className={styles.fileAction}
            aria-label={`Download ${doc.name}`}
            title={`Download ${doc.name}`}
            onClick={() => void download(p, doc)}
          >
            <ArrowDownToLine size={15} />
          </button>
          {manage && (
            <button
              type="button"
              className={styles.fileAction}
              aria-label={`Remove ${doc.name}`}
              title={`Remove ${doc.name}`}
              disabled={busy}
              onClick={() => void removeDocument(p, doc)}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }
  async function removeDocument(p: Placement, doc: PlacementDocument) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      replace(
        (await placementsAPI.removeDocument(p.id, doc.id)).data.placement,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function resourceGroups(p: Placement) {
    return (
      <div className={styles.resources}>
        {categories.map((group) => {
          const docs = p.documents.filter(
            (doc) => doc.category === group.value,
          );
          return docs.length > 0 ? (
            <section className={styles.resourceGroup} key={group.value}>
              <h3>
                {group.label}
                <span>{docs.length}</span>
              </h3>
              <div className={styles.fileList}>
                {docs.map((doc) => documentRow(p, doc))}
              </div>
            </section>
          ) : null;
        })}
        {!!p.learningResources.length && (
          <section className={styles.resourceGroup}>
            <h3>
              Preparation links<span>{p.learningResources.length}</span>
            </h3>
            <div className={styles.fileList}>
              {p.learningResources.map((link, i) => (
                <a
                  className={styles.resourceLink}
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.title}
                  <ArrowUpRight size={14} />
                </a>
              ))}
            </div>
          </section>
        )}
        {!p.documents.length && !p.learningResources.length && (
          <p className={styles.hint}>
            Preparation material will be added here.
          </p>
        )}
      </div>
    );
  }
  const filtered = items.filter(
    (p) =>
      (!manage || status === "all" || p.status === status) &&
      `${p.companyName} ${p.jobTitle} ${p.companyProfile}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (!authLoading && !user)
    return (
      <div className={`${styles.page} ${manage ? styles.admin : ""}`}>
        <p className={styles.eyebrow}>CAMPUS OPPORTUNITIES</p>
        <h1>Placements</h1>
        <div className={styles.empty}>
          <BriefcaseBusiness size={28} />
          <h2>Your next opportunity starts here.</h2>
          <p>
            Sign in to explore visiting companies, role details, and preparation
            resources.
          </p>
          <Link
            className={styles.primary}
            href={`/login?returnTo=${encodeURIComponent("/placements")}`}
          >
            Sign in <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    );
  return (
    <div className={`${styles.page} ${manage ? styles.admin : ""}`}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>
            {manage ? "PLACEMENT DESK" : "CAMPUS OPPORTUNITIES"}
          </p>
          <h1>
            Placements<span className={styles.period}>.</span>
          </h1>
          <p>
            {manage
              ? "Prepare a company visit. Publish when everything is ready."
              : "Get to know the companies. Prepare for the opportunity."}
          </p>
        </div>
        {manage && (
          <button
            className={styles.primary}
            onClick={() => openEditor()}
            disabled={busy}
          >
            <Plus size={16} /> Add company
          </button>
        )}
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {manage && editing !== undefined && (
        <section className={styles.editor} aria-label="Placement editor">
          <div className={styles.editorHeading}>
            <div>
              <p className={styles.eyebrow}>
                {editing ? "EDIT COMPANY VISIT" : "NEW COMPANY VISIT"}
              </p>
              <h2>Make the opportunity clear.</h2>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close editor"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              <X size={19} />
            </button>
          </div>
          <form onSubmit={save}>
            <div className={styles.formGrid}>
              <div className={`${styles.full} ${styles.logoField}`}>
                <CompanyLogo
                  name={form.companyName || "Company"}
                  src={form.logoImage}
                />
                <div>
                  <label htmlFor="placement-logo">
                    Company logo{" "}
                    <span>Optional · PNG, JPEG or WebP, up to 5 MB</span>
                  </label>
                  <input
                    id="placement-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy || logoBusy}
                    onChange={(e) => {
                      void chooseLogo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {logoBusy && <small role="status">Preparing logo…</small>}
                  {form.logoImage && (
                    <button
                      type="button"
                      className={styles.removeLogo}
                      disabled={busy || logoBusy}
                      onClick={() =>
                        setForm((previous) => ({
                          ...previous,
                          logoImage: null,
                        }))
                      }
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
              <label>
                Company name<span>Required</span>
                <input
                  required
                  maxLength={180}
                  value={form.companyName}
                  placeholder="e.g. Acme Technologies"
                  onChange={(e) =>
                    setForm({ ...form, companyName: e.target.value })
                  }
                />
              </label>
              <label>
                Role / job title
                <input
                  maxLength={180}
                  value={form.jobTitle}
                  placeholder="e.g. Software Engineer"
                  onChange={(e) =>
                    setForm({ ...form, jobTitle: e.target.value })
                  }
                />
              </label>
              <label>
                Package / CTC<span>Required</span>
                <input
                  required
                  maxLength={120}
                  value={form.package}
                  placeholder="e.g. ₹8–12 LPA · full-time"
                  onChange={(e) =>
                    setForm({ ...form, package: e.target.value })
                  }
                />
              </label>
              <label>
                Visit date<span>Optional</span>
                <input
                  type="date"
                  value={form.visitDate || ""}
                  onChange={(e) =>
                    setForm({ ...form, visitDate: e.target.value || null })
                  }
                />
              </label>
              <label className={styles.full}>
                Company profile<span>Required</span>
                <textarea
                  required
                  rows={4}
                  maxLength={12000}
                  value={form.companyProfile}
                  placeholder="What the company does, the opportunity, and what students should know."
                  onChange={(e) =>
                    setForm({ ...form, companyProfile: e.target.value })
                  }
                />
              </label>
              <label className={styles.full}>
                Learning resource links
                <span>One per line: Title | https://example.com</span>
                <textarea
                  rows={3}
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                  placeholder="Interview preparation | https://example.com/prepare"
                />
              </label>
            </div>
            <div className={styles.uploadGrid}>
              {categories.map((group) => {
                const saved = items.find((p) => p.id === editing);
                const attached =
                  saved?.documents.filter(
                    (doc) => doc.category === group.value,
                  ) || [];
                return (
                  <section
                    className={styles.upload}
                    key={group.value}
                    aria-label={`${group.label} uploads`}
                  >
                    <label className={styles.uploadPicker}>
                      <FileText size={18} />
                      <strong>{group.label}</strong>
                      <span>Add PDFs · up to 8 MB each</span>
                      <input
                        key={fileReset}
                        type="file"
                        multiple
                        accept="application/pdf,.pdf"
                        aria-label={group.label}
                        disabled={busy}
                        onChange={(e) =>
                          chooseFiles(group.value, e.target.files)
                        }
                      />
                      <small>
                        {files[group.value]?.length
                          ? `${files[group.value]!.length} new: ${files[group.value]!.map((f) => f.name).join(", ")}`
                          : "Choose up to 10 new files"}
                      </small>
                    </label>
                    {editing && (
                      <div className={styles.attached}>
                        <p className={styles.attachedHeading}>
                          Uploaded <span>{attached.length}</span>
                        </p>
                        {attached.length && saved ? (
                          <div className={styles.fileList}>
                            {attached.map((doc) => documentRow(saved, doc))}
                          </div>
                        ) : (
                          <p className={styles.hint}>
                            No PDFs uploaded in this group.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <div className={styles.formActions}>
              <label>
                Visibility
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as PlacementStatus,
                    })
                  }
                >
                  <option value="draft">Draft · admins only</option>
                  <option value="published">
                    Published · visible to students
                  </option>
                  <option value="archived">Archived · admins only</option>
                </select>
              </label>
              <button
                className={styles.secondary}
                type="button"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
              <button
                className={styles.primary}
                type="submit"
                disabled={busy || logoBusy}
              >
                {busy ? "Saving…" : "Save placement"}
                <ArrowUpRight size={15} />
              </button>
            </div>
          </form>
        </section>
      )}
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={17} />
          <input
            aria-label="Search placements"
            placeholder="Search companies or roles"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {manage && (
          <select
            aria-label="Placement status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All entries</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
            <option value="archived">Archived</option>
          </select>
        )}
        <span className={styles.count}>
          {filtered.length} {filtered.length === 1 ? "company" : "companies"}
        </span>
        <button
          className={styles.iconButton}
          aria-label="Refresh placements"
          onClick={() => void load()}
          disabled={loading || busy}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {loading || authLoading ? (
        <div className={styles.empty} role="status">
          Loading placements…
        </div>
      ) : error && !items.length ? (
        <div className={styles.empty}>
          <h2>We couldn’t load placements.</h2>
          <p>Your page is still here. Try refreshing the list.</p>
          <button className={styles.secondary} onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : !filtered.length ? (
        <div className={styles.empty}>
          <BriefcaseBusiness size={30} />
          <h2>
            {search || status !== "all"
              ? "No matching companies."
              : manage
                ? "Your placement desk is ready."
                : "The next opportunity is on its way."}
          </h2>
          <p>
            {manage
              ? "Add a company, attach its PDFs, and publish the entry for students."
              : "Published company visits and preparation material will appear here."}
          </p>
          {manage && (
            <button className={styles.secondary} onClick={() => openEditor()}>
              <Plus size={15} />
              Add the first company
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((p) => (
            <article key={p.id} className={styles.card}>
              <div className={styles.cardTop}>
                <CompanyLogo name={p.companyName} src={p.logoImage} />
                {manage && (
                  <span className={styles.status} data-status={p.status}>
                    {p.status}
                  </span>
                )}
                {p.visitDate && (
                  <span className={styles.date}>
                    <CalendarDays size={13} />
                    {new Date(
                      `${p.visitDate.slice(0, 10)}T12:00:00`,
                    ).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
              <div className={styles.company}>
                <h2>{p.companyName}</h2>
                {p.jobTitle && <p>{p.jobTitle}</p>}
              </div>
              <div className={styles.package}>
                <span>PACKAGE / CTC</span>
                <strong>{p.package}</strong>
              </div>
              <p className={styles.profile}>{p.companyProfile}</p>
              <div
                className={styles.resourceSummary}
                aria-label="Available resources"
              >
                {categories.map((group) => {
                  const count = p.documents.filter(
                    (doc) => doc.category === group.value,
                  ).length;
                  return count ? (
                    <span key={group.value}>
                      <FileText size={12} />
                      {group.label}
                      <b>{count}</b>
                    </span>
                  ) : null;
                })}
                {!!p.learningResources.length && (
                  <span>
                    <ArrowUpRight size={12} />
                    Preparation links<b>{p.learningResources.length}</b>
                  </span>
                )}
              </div>
              <button
                type="button"
                className={`${styles.primary} ${styles.openPlacement}`}
                aria-label={`Open placement: ${p.companyName}`}
                onClick={() => setOpenedId(p.id)}
              >
                Open placement
                <ArrowUpRight size={16} />
              </button>
              {manage && (
                <div className={styles.cardActions}>
                  <button
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => openEditor(p)}
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() =>
                      void changeStatus(
                        p,
                        p.status === "published" ? "draft" : "published",
                      )
                    }
                  >
                    <Send size={13} />
                    {p.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  {p.status !== "archived" && (
                    <button
                      className={styles.archive}
                      disabled={busy}
                      title="Archive placement"
                      aria-label={`Archive ${p.companyName}`}
                      onClick={() => void changeStatus(p, "archived")}
                    >
                      <Archive size={15} />
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {openedPlacement && (
        <PlacementDetails
          placement={openedPlacement}
          onClose={() => setOpenedId(null)}
        >
          {resourceGroups(openedPlacement)}
        </PlacementDetails>
      )}
      {preview && (
        <PdfPreview
          name={preview.document.name}
          url={preview.url}
          error={preview.error}
          onClose={closePreview}
          onRetry={() => void viewDocument(preview.placement, preview.document)}
          onDownload={() => void download(preview.placement, preview.document)}
        />
      )}
    </div>
  );
}

function PdfPreview({
  name,
  url,
  error,
  onClose,
  onRetry,
  onDownload,
}: {
  name: string;
  url: string | null;
  error: string;
  onClose: () => void;
  onRetry: () => void;
  onDownload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.previewDialog}
      aria-label={`PDF preview: ${name}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.previewContent}>
        <header className={styles.previewHeader}>
          <div>
            <p className={styles.eyebrow}>PDF PREVIEW</p>
            <h2>{name}</h2>
          </div>
          <button
            type="button"
            className={styles.secondary}
            onClick={onDownload}
          >
            <ArrowDownToLine size={15} />
            Download
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close PDF preview"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        {url ? (
          <iframe
            className={styles.pdfFrame}
            src={url}
            title={`Preview of ${name}`}
          />
        ) : (
          <div
            className={styles.previewStatus}
            role={error ? "alert" : "status"}
          >
            {error || "Opening PDF…"}
            {error && (
              <button
                type="button"
                className={styles.secondary}
                onClick={onRetry}
              >
                Try again
              </button>
            )}
          </div>
        )}
        <p className={styles.previewHint}>
          If your browser cannot display this PDF, use Download to open it on
          your device.
        </p>
      </div>
    </dialog>
  );
}

function PlacementDetails({
  placement,
  onClose,
  children,
}: {
  placement: Placement;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.placementDialog}
      aria-label={`${placement.companyName} placement details`}
      onCancel={onClose}
    >
      <div className={styles.placementPage}>
        <header className={styles.placementNavigation}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            ← Back to placements
          </button>
          <span>COMPANY OPPORTUNITY</span>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close placement details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className={styles.placementScroll}>
          <div className={styles.placementHero}>
            <div>
              <CompanyLogo
                name={placement.companyName}
                src={placement.logoImage}
              />
              <p className={styles.eyebrow}>CAMPUS PLACEMENTS</p>
              <h2>{placement.companyName}</h2>
              {placement.jobTitle && (
                <p className={styles.placementRole}>{placement.jobTitle}</p>
              )}
            </div>
            <div className={styles.placementFacts}>
              <div>
                <span>PACKAGE / CTC</span>
                <strong>{placement.package}</strong>
              </div>
              {placement.visitDate && (
                <div>
                  <span>VISIT DATE</span>
                  <strong>
                    {new Date(
                      `${placement.visitDate.slice(0, 10)}T12:00:00`,
                    ).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                </div>
              )}
            </div>
          </div>
          <div className={styles.placementBody}>
            <section className={styles.fullProfile}>
              <h3>About the opportunity</h3>
              <p>{placement.companyProfile}</p>
            </section>
            <section
              className={styles.allResources}
              aria-label="Placement documents and learning resources"
            >
              <h3>Documents & preparation</h3>
              <p className={styles.resourceIntro}>
                Read the details, preview a PDF, or save it for later.
              </p>
              {children}
            </section>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function CompanyLogo({ name, src }: { name: string; src?: string | null }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div
      className={`${styles.monogram} ${src && src !== failedSource ? styles.hasLogo : ""}`}
    >
      {src && src !== failedSource ? (
        <Image
          src={src}
          alt={`${name} logo`}
          width={64}
          height={64}
          unoptimized
          onError={() => setFailedSource(src)}
        />
      ) : (
        <span aria-label={`${name} initials`}>
          {name
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase()}
        </span>
      )}
    </div>
  );
}
