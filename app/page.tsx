"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { Building2, CalendarDays, ClipboardCheck, FileImage, MapPin, Pencil, Plus, Search, Ticket, Trash2, UploadCloud } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type RecordItem = {
  id: string; kind: "hold" | "manual"; rate: string; record_date: string;
  store: string;
  person_name: string; amount: number; unit: "玉" | "枚"; purpose: string;
  receipt_name: string; hallcon_name: string | null; created_at: string; confirmed_by: string | null;
  confirmed_at: string | null; has_hallcon: boolean; has_signature: boolean;
};
type PageModelContext = {
  registerTool: (tool: {
    name: string; title: string; description: string; inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => unknown;
  }, options: { signal: AbortSignal }) => void | Promise<void>;
};

const today = () => new Date().toLocaleDateString("sv-SE");
const currentMonth = () => today().slice(0, 7);
const rates = [
  "4円パチンコ",
  "1円パチンコ",
  "0.5円パチンコ",
  "20円スロット",
  "10円スロット",
  "5円スロット",
  "2円スロット",
];
const stores = ["岩槻本店", "桶川店", "平塚店", "ふじみ野店", "美女木店", "鶴瀬店"] as const;
type Store = typeof stores[number];
type MonthPhoto = { name: string; uploaded_at: string };
const monthEndDate = (value: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return "月を選択";
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

async function optimizeImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を処理できませんでした。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.86;
  let blob: Blob | null = null;
  do {
    blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    quality -= 0.08;
  } while (blob && blob.size > 450 * 1024 && quality >= 0.54);
  if (!blob) throw new Error("画像を処理できませんでした。");
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

export default function Home() {
  const [store, setStore] = useState<Store | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<"hold" | "manual">("hold");
  const [rate, setRate] = useState(rates[0]);
  const [date, setDate] = useState(today);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [hallconFile, setHallconFile] = useState<File | null>(null);
  const [hallconFileKey, setHallconFileKey] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [month, setMonth] = useState(currentMonth);
  const [view, setView] = useState<"register" | "month-end">("register");
  const [monthPhotos, setMonthPhotos] = useState<[MonthPhoto | null, MonthPhoto | null]>([null, null]);
  const [monthPhotoLoading, setMonthPhotoLoading] = useState(false);
  const [monthPhotoError, setMonthPhotoError] = useState("");
  const [monthPhotoSuccess, setMonthPhotoSuccess] = useState("");
  const [monthPhotoFiles, setMonthPhotoFiles] = useState<[File | null, File | null]>([null, null]);
  const [monthPhotoInputKeys, setMonthPhotoInputKeys] = useState<[number, number]>([0, 0]);
  const [monthPhotoVersions, setMonthPhotoVersions] = useState<[number, number]>([0, 0]);
  const [savingMonthPhoto, setSavingMonthPhoto] = useState<1 | 2 | null>(null);
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editKind, setEditKind] = useState<"hold" | "manual">("hold");
  const [editRate, setEditRate] = useState(rates[0]);
  const [editDate, setEditDate] = useState("");
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editingSave, setEditingSave] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const loadRecords = useCallback(async (selectedMonth: string, selectedStore: Store) => {
    setLoadError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/records?month=${encodeURIComponent(selectedMonth)}&store=${encodeURIComponent(selectedStore)}`, { cache: "no-store" });
      const data = await response.json() as { records: RecordItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || "記録を読み込めませんでした。");
      setRecords(data.records);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "記録を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!store) return;
    const timer = window.setTimeout(() => void loadRecords(month, store), 0);
    return () => window.clearTimeout(timer);
  }, [loadRecords, month, store]);
  useEffect(() => {
    if (!store || view !== "month-end") return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setMonthPhotoLoading(true); setMonthPhotoError(""); setMonthPhotos([null, null]);
      try {
        const response = await fetch(`/api/month-end?store=${encodeURIComponent(store)}&month=${encodeURIComponent(month)}`, { cache: "no-store" });
        const data = await response.json() as { photos: [MonthPhoto | null, MonthPhoto | null]; error?: string };
        if (!response.ok) throw new Error(data.error || "月末写真を読み込めませんでした。");
        if (active) setMonthPhotos(data.photos);
      } catch (caught) {
        if (active) setMonthPhotoError(caught instanceof Error ? caught.message : "月末写真を読み込めませんでした。");
      } finally {
        if (active) setMonthPhotoLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [store, month, view]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: PageModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "stage_record_details",
        title: "記録内容を入力",
        description: "保留券または手入力の記録内容をフォームに入力します。保存には画面でレシート画像とホールコン画像を添付してください。",
        inputSchema: {
          type: "object", properties: {
            kind: { type: "string", enum: ["hold", "manual"] },
            rate: { type: "string", enum: rates },
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            name: { type: "string", minLength: 1, maxLength: 100 },
            amount: { type: "integer", minimum: 1, maximum: 100000000 },
            purpose: { type: "string", minLength: 1, maxLength: 1000 }
          },
          required: ["kind", "rate", "date", "name", "amount", "purpose"],
          additionalProperties: false
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== "object") throw new Error("入力内容を確認してください。");
          const value = input as Record<string, unknown>;
          if ((value.kind !== "hold" && value.kind !== "manual") || typeof value.rate !== "string" || !rates.includes(value.rate) ||
            typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
            typeof value.name !== "string" || !value.name.trim() || value.name.length > 100 ||
            typeof value.amount !== "number" || !Number.isSafeInteger(value.amount) || value.amount < 1 || value.amount > 100000000 ||
            typeof value.purpose !== "string" || !value.purpose.trim() || value.purpose.length > 1000) throw new Error("入力内容を確認してください。");
          setKind(value.kind); setRate(value.rate); setDate(value.date); setName(value.name);
          setAmount(String(value.amount)); setPurpose(value.purpose);
          return { staged: true, needs_receipt_image: true, needs_hallcon_image: true };
        }
      }, { signal: lifecycle.signal })).catch(error => console.error("WebMCP registration failed", error));
    } catch (error) { console.error("WebMCP registration failed", error); }
    return () => lifecycle.abort();
  }, []);
  const visible = useMemo(() => records.filter(row => {
    const matchesText = [row.person_name, row.purpose, row.rate].some(value => value.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter = filter === "all" || (filter === "pending" ? !row.confirmed_at : !!row.confirmed_at);
    return matchesText && matchesFilter;
  }), [records, search, filter]);

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!store) { setError("店舗を選択してください。"); return; }
    if (!file) { setError("レシート画像を選択してください。"); return; }
    if (!hallconFile) { setError("ホールコン画像を選択してください。"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("画像は10MB以内にしてください。"); return; }
    if (hallconFile.size > 10 * 1024 * 1024) { setError("ホールコン画像は10MB以内にしてください。"); return; }
    setSaving(true);
    try {
      const [receiptUpload, hallconUpload] = await Promise.all([optimizeImage(file), optimizeImage(hallconFile)]);
      const body = new FormData();
      body.set("receipt", receiptUpload); body.set("hallcon", hallconUpload); body.set("store", store); body.set("kind", kind); body.set("rate", rate);
      body.set("record_date", date); body.set("person_name", name); body.set("amount", amount);
      body.set("purpose", purpose);
      const response = await fetch("/api/records", { method: "POST", body });
      const data = await response.json() as { record: RecordItem; error?: string };
      if (!response.ok) throw new Error(data.error || "保存できませんでした。");
      const savedMonth = data.record.record_date.slice(0, 7);
      if (savedMonth === month) setRecords(current => [data.record, ...current]);
      else setMonth(savedMonth);
      setName(""); setAmount(""); setPurpose(""); setFile(null); setFileKey(value => value + 1);
      setHallconFile(null); setHallconFileKey(value => value + 1);
      setSuccess("記録を保存しました。店舗責任者確認は一覧から行えます。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally { setSaving(false); }
  }

  function closeDetail(open: boolean) {
    if (!open) { setSelected(null); setEditing(false); setDetailError(""); setManagerName(""); setHasInk(false); }
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget, rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }
  function beginDraw(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget, ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.setPointerCapture(event.pointerId); drawing.current = true;
    const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#173b4b";
  }
  function moveDraw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d"); if (!ctx) return;
    const p = point(event); ctx.lineTo(p.x, p.y); ctx.stroke(); setHasInk(true);
  }
  function endDraw() { drawing.current = false; }
  async function confirmRecord() {
    if (!selected) return;
    setDetailError("");
    if (!managerName.trim()) { setDetailError("店舗責任者名を入力してください。"); return; }
    if (!hasInk || !canvasRef.current) { setDetailError("確認サインを記入してください。"); return; }
    setConfirming(true);
    try {
      const response = await fetch(`/api/records/${selected.id}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manager_name: managerName, signature: canvasRef.current.toDataURL("image/png") })
      });
      const data = await response.json() as { confirmed_by: string; confirmed_at: string; error?: string };
      if (!response.ok) throw new Error(data.error || "確認を保存できませんでした。");
      setRecords(current => current.map(row => row.id === selected.id ? { ...row, confirmed_by: data.confirmed_by, confirmed_at: data.confirmed_at, has_signature: true } : row));
      setSelected(row => row ? { ...row, confirmed_by: data.confirmed_by, confirmed_at: data.confirmed_at, has_signature: true } : null);
      setSuccess("店舗責任者確認を保存しました。");
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "確認を保存できませんでした。");
    } finally { setConfirming(false); }
  }

  function startEditingRecord(record: RecordItem) {
    setEditKind(record.kind); setEditRate(record.rate); setEditDate(record.record_date);
    setEditName(record.person_name); setEditAmount(String(record.amount)); setEditPurpose(record.purpose);
    setDetailError(""); setEditing(true);
  }

  async function saveEditedRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setDetailError(""); setEditingSave(true);
    try {
      const response = await fetch(`/api/records/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: editKind, rate: editRate, record_date: editDate, person_name: editName, amount: Number(editAmount), purpose: editPurpose })
      });
      const data = await response.json() as { record: RecordItem; error?: string };
      if (!response.ok) throw new Error(data.error || "修正できませんでした。");
      setRecords(current => current.map(row => row.id === data.record.id ? data.record : row));
      setSelected(data.record); setEditing(false); setSuccess("記録を修正しました。");
      if (data.record.record_date.slice(0, 7) !== month) setMonth(data.record.record_date.slice(0, 7));
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "修正できませんでした。");
    } finally { setEditingSave(false); }
  }

  async function deleteMonthRecords() {
    if (!store) return;
    setDeleteError(""); setDeleting(true);
    try {
      const response = await fetch("/api/records", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, month, password: deletePassword })
      });
      const data = await response.json() as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "削除できませんでした。");
      setRecords([]); setMonthPhotos([null, null]); setMonthPhotoVersions(([first, second]) => [first + 1, second + 1]);
      setDeleteOpen(false); setDeletePassword("");
      setSuccess(`${data.deleted ?? 0}件の記録を削除しました。`);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "削除できませんでした。");
    } finally { setDeleting(false); }
  }

  async function saveMonthPhoto(event: FormEvent<HTMLFormElement>, slot: 1 | 2) {
    event.preventDefault();
    const file = monthPhotoFiles[slot - 1];
    if (!store || !file) { setMonthPhotoError(`${slot}枚目の写真を選択してください。`); return; }
    if (slot === 2 && !monthPhotos[0]) { setMonthPhotoError("先に1枚目を保存してください。"); return; }
    if (file.size > 10 * 1024 * 1024) { setMonthPhotoError("写真は10MB以内にしてください。"); return; }
    setMonthPhotoError(""); setMonthPhotoSuccess(""); setSavingMonthPhoto(slot);
    try {
      const image = await optimizeImage(file);
      const body = new FormData();
      body.set("store", store); body.set("month", month); body.set("slot", String(slot)); body.set("photo", image);
      const response = await fetch("/api/month-end", { method: "POST", body });
      const data = await response.json() as { photo: MonthPhoto; error?: string };
      if (!response.ok) throw new Error(data.error || "月末写真を保存できませんでした。");
      setMonthPhotos(current => slot === 1 ? [data.photo, current[1]] : [current[0], data.photo]);
      setMonthPhotoVersions(([first, second]) => slot === 1 ? [first + 1, second] : [first, second + 1]);
      setMonthPhotoFiles(current => slot === 1 ? [null, current[1]] : [current[0], null]);
      setMonthPhotoInputKeys(([first, second]) => slot === 1 ? [first + 1, second] : [first, second + 1]);
      setMonthPhotoSuccess(`${slot}枚目のホールコン写真を保存しました。`);
    } catch (caught) {
      setMonthPhotoError(caught instanceof Error ? caught.message : "月末写真を保存できませんでした。");
    } finally { setSavingMonthPhoto(null); }
  }

  function openRecord(row: RecordItem) {
    setSelected(row); setDetailError(""); setManagerName(""); setHasInk(false);
  }

  function chooseStore(value: Store) {
    setStore(value); setView("register"); setRecords([]); setSearch(""); setFilter("all"); setLoadError(""); setSuccess(""); setError("");
  }

  if (!store) return <main className="store-select-screen">
    <section className="store-select-card" aria-labelledby="store-select-heading">
      <span className="store-select-icon"><Building2 size={30}/></span>
      <p className="eyebrow">保留券・手入力管理</p>
      <h1 id="store-select-heading">店舗を選択してください</h1>
      <p className="store-select-intro">記録を登録・確認する店舗を選んでください。</p>
      <div className="store-grid">{stores.map(value => <button key={value} type="button" onClick={() => chooseStore(value)}><MapPin size={19}/><span>{value}</span><span aria-hidden="true">→</span></button>)}</div>
    </section>
  </main>;

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Ticket size={20}/></span><div><strong>保留券・手入力管理</strong><small>{store}</small></div></div><button type="button" className="change-store" onClick={()=>setStore(null)}><MapPin size={15}/>{store}<span>変更</span></button></header>
    <nav className="view-nav" aria-label="管理画面"><button type="button" className={view==="register"?"active":""} aria-current={view==="register"?"page":undefined} onClick={()=>setView("register")}><Ticket size={17}/>記録・台帳</button><button type="button" className={view==="month-end"?"active":""} aria-current={view==="month-end"?"page":undefined} onClick={()=>setView("month-end")}><CalendarDays size={17}/>月末確認</button></nav>
    <div className="workspace">
      {view === "register" ? <>
      <div className="page-heading"><div><p className="eyebrow">記録台帳</p><h1>新しい記録を登録</h1><p className="page-intro">レシートを添付し、内容を入力してください。</p></div><span className="date-chip">本日の記録</span></div>
      <div className="columns">
        <section className="form-card" aria-labelledby="entry-heading">
          <div className="card-heading"><span className="card-icon"><Plus size={19}/></span><div><h2 id="entry-heading">登録内容</h2><p>入力した内容は台帳に保存されます</p></div></div>
          <form className="entry-form" onSubmit={saveRecord}>
            <div className="field full"><label htmlFor="receipt">レシート画像 <em>必須</em></label><label className="upload-zone" htmlFor="receipt"><UploadCloud size={27}/><span>{file ? file.name : "画像を選択・撮影"}</span><small>JPG・PNG・WEBP、10MBまで</small></label><input key={fileKey} id="receipt" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setFile(e.target.files?.[0]??null)}/></div>
            <div className="field full"><label htmlFor="hallcon">ホールコン画像 <em>必須</em></label><label className="upload-zone hallcon-upload" htmlFor="hallcon"><FileImage size={27}/><span>{hallconFile ? hallconFile.name : "ホールコン画面を撮影・選択"}</span><small>レシート内容との照合に使用します</small></label><input key={hallconFileKey} id="hallcon" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setHallconFile(e.target.files?.[0]??null)}/></div>
            <div className="field full"><span className="field-label">区分 <em>必須</em></span><div className="segmented" role="group" aria-label="区分"><button type="button" className={kind==="hold"?"active":""} aria-pressed={kind==="hold"} onClick={()=>setKind("hold")}>保留券</button><button type="button" className={kind==="manual"?"active":""} aria-pressed={kind==="manual"} onClick={()=>setKind("manual")}>手入力</button></div></div>
            <div className="field"><label htmlFor="rate">レート <em>必須</em></label><Select value={rate} onValueChange={setRate}><SelectTrigger id="rate" className="wide-select"><SelectValue placeholder="選択してください"/></SelectTrigger><SelectContent>{rates.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className="field"><label htmlFor="date">日付 <em>必須</em></label><Input id="date" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div>
            <div className="field"><label htmlFor="name">担当者 <em>必須</em></label><Input id="name" value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="担当者名" required/></div>
            <div className="field"><label htmlFor="count">玉数・枚数 <em>必須</em></label><Input id="count" type="number" min="1" max="100000000" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" required/></div>
            <div className="field full"><label htmlFor="purpose">用途・詳細 <em>必須</em></label><Textarea id="purpose" value={purpose} onChange={e=>setPurpose(e.target.value)} maxLength={1000} placeholder="例：前日の保留券対応、台トラブルの補填など" rows={3} required/></div>
            <div className="confirmation-preview"><ClipboardCheck size={19}/><div><strong>店舗責任者確認</strong><span>登録後、店舗責任者が確認サインを記入できます</span></div><span className="pending-pill">確認待ち</span></div>
            {error && <p className="form-alert error" role="alert">{error}</p>}
            {success && <p className="form-alert success" role="status">{success}</p>}
            <button type="submit" className="submit-button" disabled={saving}>{saving ? "保存中…" : "記録を保存する"} <span aria-hidden="true">→</span></button>
          </form>
        </section>
        <section className="ledger-card" aria-labelledby="ledger-heading"><div className="ledger-heading"><div><p className="eyebrow">一覧</p><h2 id="ledger-heading">記録台帳</h2></div><span className="total-pill">{records.length} 件</span></div>
          <div className="month-actions"><label className="month-picker" htmlFor="ledger-month"><span>確認する月</span><Input id="ledger-month" type="month" value={month} onChange={event=>setMonth(event.target.value)} /></label><button type="button" className="delete-month-button" disabled={loading} onClick={()=>{setDeletePassword("");setDeleteError("");setDeleteOpen(true);}}><Trash2 size={15}/>この月を削除</button></div>
          <div className="ledger-toolbar"><label className="search-box"><Search size={17}/><Input aria-label="担当者・用途で検索" value={search} onChange={e=>setSearch(e.target.value)} placeholder="担当者・用途で検索"/></label><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="確認状態で絞り込み" className="filter-select"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem><SelectItem value="pending">確認待ち</SelectItem><SelectItem value="confirmed">確認済み</SelectItem></SelectContent></Select></div>
          {loadError && <div className="list-error" role="alert">{loadError}<button type="button" onClick={()=>loadRecords(month, store)}>再読み込み</button></div>}
          {loading ? <p className="loading-state">記録を読み込み中…</p> : visible.length === 0 ? <div className="empty-state"><span className="empty-icon"><FileImage size={30}/></span><h3>{records.length ? "該当する記録がありません" : "まだ記録がありません"}</h3><p>{records.length ? "検索条件を変えてください。" : "左のフォームから最初のレシートを登録してください。"}</p></div> : <Table className="records-table"><TableHeader><TableRow><TableHead>日付・区分</TableHead><TableHead>担当者・用途</TableHead><TableHead>玉数/枚数</TableHead><TableHead>確認</TableHead></TableRow></TableHeader><TableBody>{visible.map(row=><TableRow key={row.id} className="record-row" onClick={()=>openRecord(row)}><TableCell><strong>{row.record_date}</strong><small>{row.kind==="hold"?"保留券":"手入力"} · {row.rate}</small></TableCell><TableCell><strong>{row.person_name}</strong><small className="truncate-purpose">{row.purpose}</small></TableCell><TableCell><strong>{row.amount.toLocaleString()}{row.unit}</strong></TableCell><TableCell><span className={row.confirmed_at?"confirmed-pill":"pending-pill"}>{row.confirmed_at?"確認済み":"確認待ち"}</span></TableCell></TableRow>)}</TableBody></Table>}
        </section>
      </div>
      </> : <section className="month-end-screen" aria-labelledby="month-end-heading">
        <div className="page-heading month-end-heading"><div><p className="eyebrow">{store} · 月末確認</p><h1 id="month-end-heading">月末ホールコン記録</h1><p className="page-intro">月末の画面写真と、その月の保留券・手入力を確認できます。</p></div></div>
        <div className="month-end-topline"><label htmlFor="month-end-month">確認する月<Input id="month-end-month" type="month" value={month} onChange={event=>{setMonth(event.target.value);setMonthPhotoFiles([null,null]);setMonthPhotoInputKeys(([first,second])=>[first+1,second+1]);setMonthPhotoSuccess("");setMonthPhotoError("");}}/></label><div><small>月末最終日</small><strong>{monthEndDate(month)}</strong></div></div>
        <div className="month-end-columns">
          <section className="month-end-photo-card" aria-labelledby="month-photo-heading">
            <h2 id="month-photo-heading">月末のホールコン写真</h2>
            <p>最終日のホールコン画面を2枚撮影して保存してください。</p>
            {monthPhotoLoading ? <p className="loading-state">写真を読み込み中…</p> : <div className="month-end-photo-slots">{([1,2] as const).map(slot => {
              const index = slot - 1;
              const photo = monthPhotos[index];
              const file = monthPhotoFiles[index];
              return <div className="month-end-photo-slot" key={slot}>
                <h3>{slot}枚目 <span>{photo ? "保存済み" : "未保存"}</span></h3>
                {photo ? <div className="month-end-photo-preview"><img key={monthPhotoVersions[index]} src={`/api/month-end/photo?store=${encodeURIComponent(store)}&month=${encodeURIComponent(month)}&slot=${slot}&v=${monthPhotoVersions[index]}`} alt={`${store} ${month}の月末ホールコン写真 ${slot}枚目`}/><small>保存日時：{new Date(photo.uploaded_at).toLocaleString("ja-JP")}</small></div> : <div className="month-end-photo-empty"><FileImage size={30}/><span>写真はまだありません</span></div>}
                <form onSubmit={event=>saveMonthPhoto(event,slot)}><label className="upload-zone hallcon-upload" htmlFor={`month-end-photo-${slot}`}><UploadCloud size={25}/><span>{file ? file.name : `${slot}枚目を撮影・選択`}</span><small>JPG・PNG・WEBP、10MBまで</small></label><input key={monthPhotoInputKeys[index]} id={`month-end-photo-${slot}`} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={slot===2&&!monthPhotos[0]} onChange={event=>setMonthPhotoFiles(([first,second])=>slot===1?[event.target.files?.[0]??null,second]:[first,event.target.files?.[0]??null])}/><button type="submit" className="submit-button" disabled={!file || savingMonthPhoto!==null || (slot===2&&!monthPhotos[0])}>{savingMonthPhoto===slot ? "保存中…" : photo ? `${slot}枚目を撮り直して保存` : `${slot}枚目を保存`}</button></form>
                {slot===2&&!monthPhotos[0]&&<small className="month-end-slot-note">先に1枚目を保存してください。</small>}
              </div>;
            })}</div>}
            {monthPhotoError && <p className="form-alert error" role="alert">{monthPhotoError}</p>}{monthPhotoSuccess && <p className="form-alert success" role="status">{monthPhotoSuccess}</p>}
          </section>
          <section className="month-end-list-card" aria-labelledby="month-records-heading">
            <div className="ledger-heading"><h2 id="month-records-heading">当月のデータ一覧</h2><span className="total-pill">{records.length} 件</span></div>
            <div className="month-end-counts"><span>保留券 <strong>{records.filter(row=>row.kind==="hold").length}件</strong></span><span>手入力 <strong>{records.filter(row=>row.kind==="manual").length}件</strong></span></div>
            {loadError && <div className="list-error" role="alert">{loadError}<button type="button" onClick={()=>loadRecords(month,store)}>再読み込み</button></div>}
            {loading ? <p className="loading-state">記録を読み込み中…</p> : records.length === 0 ? <div className="month-end-list-empty">この月の記録はありません。</div> : <div className="month-end-records">{records.map(row=><button type="button" className="month-end-record" key={row.id} onClick={()=>openRecord(row)}><span className="month-end-record-top"><time>{row.record_date}</time><span className={row.confirmed_at?"confirmed-pill":"pending-pill"}>{row.confirmed_at?"確認済み":"確認待ち"}</span></span><span className="month-end-record-kind">{row.kind==="hold"?"保留券":"手入力"} · {row.rate}</span><span className="month-end-record-main"><strong>{row.person_name}</strong><strong>{row.amount.toLocaleString()}{row.unit}</strong></span><span className="month-end-record-purpose">{row.purpose}</span></button>)}</div>}
          </section>
        </div>
      </section>}
    </div>
    <Dialog open={!!selected} onOpenChange={closeDetail}>
      <DialogContent className="detail-dialog">
        <DialogHeader><DialogTitle>{editing ? "記録を修正" : "記録の詳細"}</DialogTitle><DialogDescription>{selected?.store} · {selected?.record_date} · {selected?.kind==="hold"?"保留券":"手入力"}</DialogDescription></DialogHeader>
        {selected && (editing ? <form className="edit-form" onSubmit={saveEditedRecord}>
          <div className="field full"><span className="field-label">区分</span><div className="segmented"><button type="button" className={editKind==="hold"?"active":""} onClick={()=>setEditKind("hold")}>保留券</button><button type="button" className={editKind==="manual"?"active":""} onClick={()=>setEditKind("manual")}>手入力</button></div></div>
          <div className="field"><label htmlFor="edit-rate">レート</label><Select value={editRate} onValueChange={setEditRate}><SelectTrigger id="edit-rate" className="wide-select"><SelectValue/></SelectTrigger><SelectContent>{rates.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="field"><label htmlFor="edit-date">日付</label><Input id="edit-date" type="date" value={editDate} onChange={event=>setEditDate(event.target.value)} required/></div>
          <div className="field"><label htmlFor="edit-name">担当者</label><Input id="edit-name" value={editName} onChange={event=>setEditName(event.target.value)} maxLength={100} required/></div>
          <div className="field"><label htmlFor="edit-amount">玉数・枚数</label><Input id="edit-amount" type="number" min="1" max="100000000" value={editAmount} onChange={event=>setEditAmount(event.target.value)} required/></div>
          <div className="field full"><label htmlFor="edit-purpose">用途・詳細</label><Textarea id="edit-purpose" value={editPurpose} onChange={event=>setEditPurpose(event.target.value)} maxLength={1000} rows={3} required/></div>
          {detailError && <p className="form-alert error" role="alert">{detailError}</p>}
          <div className="edit-actions"><button type="button" onClick={()=>{setEditing(false);setDetailError("");}}>キャンセル</button><button type="submit" disabled={editingSave}>{editingSave?"保存中…":"修正を保存"}</button></div>
        </form> : <div className="detail-content">
          <div className="detail-grid"><div><small>レート</small><strong>{selected.rate}</strong></div><div><small>担当者</small><strong>{selected.person_name}</strong></div><div><small>玉数・枚数</small><strong>{selected.amount.toLocaleString()}{selected.unit}</strong></div><div><small>用途</small><strong>{selected.purpose}</strong></div></div>
          <button type="button" className="edit-record-button" onClick={()=>startEditingRecord(selected)}><Pencil size={16}/>この記録を修正</button>
          <div className="receipt-panel"><span>レシート画像</span><img src={`/api/records/${selected.id}/receipt`} alt="添付されたレシート"/></div>
          <div className="receipt-panel hallcon-panel"><span>ホールコン画像</span>{selected.has_hallcon ? <img src={`/api/records/${selected.id}/hallcon`} alt="添付されたホールコン画面"/> : <div className="missing-image">既存記録のため画像はありません</div>}</div>
          {selected.confirmed_at ? <div className="signed-panel"><strong>店舗責任者確認済み</strong><span>{selected.confirmed_by} · {new Date(selected.confirmed_at).toLocaleString("ja-JP")}</span>{selected.has_signature && <img src={`/api/records/${selected.id}/signature`} alt="店舗責任者確認サイン"/>}</div> : <div className="sign-form"><h3>店舗責任者確認サイン</h3><p>店舗責任者本人が名前とサインを記入してください。</p><label htmlFor="manager-name">店舗責任者名</label><Input id="manager-name" value={managerName} onChange={e=>setManagerName(e.target.value)} maxLength={100} placeholder="店舗責任者名を入力"/><div className="signature-label"><span>サイン</span><button type="button" className="clear-signature" onClick={clearSignature} disabled={!hasInk}>クリア</button></div><canvas ref={canvasRef} width={600} height={160} className="signature-canvas" aria-label="店舗責任者確認サイン記入欄" onPointerDown={beginDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw}/>{detailError && <p className="form-alert error" role="alert">{detailError}</p>}<button type="button" className="submit-button" onClick={confirmRecord} disabled={confirming}>{confirming?"保存中…":"店舗責任者確認を保存"}</button></div>}
        </div>)}
      </DialogContent>
    </Dialog>
    <Dialog open={deleteOpen} onOpenChange={open=>{setDeleteOpen(open);if(!open){setDeletePassword("");setDeleteError("");}}}>
      <DialogContent className="delete-dialog"><DialogHeader><DialogTitle>この月の記録を削除</DialogTitle><DialogDescription>{store}の{Number(month.slice(0,4))}年{Number(month.slice(5,7))}月の記録をすべて削除します。</DialogDescription></DialogHeader><div className="delete-warning"><Trash2 size={20}/><p>レシート・ホールコン画像・月末のホールコン写真・店舗責任者サインも削除され、元に戻せません。</p></div><label htmlFor="delete-password">削除パスワード</label><Input id="delete-password" type="password" value={deletePassword} onChange={event=>setDeletePassword(event.target.value)} autoComplete="off" placeholder="パスワードを入力"/>{deleteError && <p className="form-alert error" role="alert">{deleteError}</p>}<button type="button" className="confirm-delete-button" disabled={deleting || !deletePassword} onClick={deleteMonthRecords}>{deleting?"削除中…":"この月の記録を削除する"}</button></DialogContent>
    </Dialog>
  </main>;
}
