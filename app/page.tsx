"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { ClipboardCheck, FileImage, Plus, Search, Ticket, UploadCloud } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type RecordItem = {
  id: string; kind: "hold" | "manual"; rate: string; record_date: string;
  person_name: string; amount: number; unit: "玉" | "枚"; purpose: string;
  receipt_name: string; created_at: string; confirmed_by: string | null;
  confirmed_at: string | null; has_signature: boolean;
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

export default function Home() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [month, setMonth] = useState(currentMonth);
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [managerName, setManagerName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  async function loadRecords(selectedMonth = month) {
    setLoadError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/records?month=${encodeURIComponent(selectedMonth)}`, { cache: "no-store" });
      const data = await response.json() as { records: RecordItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || "記録を読み込めませんでした。");
      setRecords(data.records);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "記録を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void loadRecords(month); }, [month]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: PageModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "stage_record_details",
        title: "記録内容を入力",
        description: "保留券または手入力の記録内容をフォームに入力します。保存には画面でレシート画像を添付してください。",
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
          return { staged: true, needs_receipt_image: true };
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
    if (!file) { setError("レシート画像を選択してください。"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("画像は10MB以内にしてください。"); return; }
    const body = new FormData();
    body.set("receipt", file); body.set("kind", kind); body.set("rate", rate);
    body.set("record_date", date); body.set("person_name", name); body.set("amount", amount);
    body.set("purpose", purpose);
    setSaving(true);
    try {
      const response = await fetch("/api/records", { method: "POST", body });
      const data = await response.json() as { record: RecordItem; error?: string };
      if (!response.ok) throw new Error(data.error || "保存できませんでした。");
      const savedMonth = data.record.record_date.slice(0, 7);
      if (savedMonth === month) setRecords(current => [data.record, ...current]);
      else setMonth(savedMonth);
      setName(""); setAmount(""); setPurpose(""); setFile(null); setFileKey(value => value + 1);
      setSuccess("記録を保存しました。店長確認は一覧から行えます。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally { setSaving(false); }
  }

  function closeDetail(open: boolean) {
    if (!open) { setSelected(null); setDetailError(""); setManagerName(""); setHasInk(false); }
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
    if (!managerName.trim()) { setDetailError("店長名を入力してください。"); return; }
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
      setSuccess("店長確認を保存しました。");
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "確認を保存できませんでした。");
    } finally { setConfirming(false); }
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Ticket size={20}/></span><div><strong>保留券・手入力管理</strong><small>店舗記録</small></div></div><span className="top-note">レシートと処理内容を一か所に</span></header>
    <div className="workspace">
      <div className="page-heading"><div><p className="eyebrow">記録台帳</p><h1>新しい記録を登録</h1><p className="page-intro">レシートを添付し、内容を入力してください。</p></div><span className="date-chip">本日の記録</span></div>
      <div className="columns">
        <section className="form-card" aria-labelledby="entry-heading">
          <div className="card-heading"><span className="card-icon"><Plus size={19}/></span><div><h2 id="entry-heading">登録内容</h2><p>入力した内容は台帳に保存されます</p></div></div>
          <form className="entry-form" onSubmit={saveRecord}>
            <div className="field full"><label htmlFor="receipt">レシート画像 <em>必須</em></label><label className="upload-zone" htmlFor="receipt"><UploadCloud size={27}/><span>{file ? file.name : "画像を選択・撮影"}</span><small>JPG・PNG・WEBP、10MBまで</small></label><input key={fileKey} id="receipt" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setFile(e.target.files?.[0]??null)}/></div>
            <div className="field full"><span className="field-label">区分 <em>必須</em></span><div className="segmented" role="group" aria-label="区分"><button type="button" className={kind==="hold"?"active":""} aria-pressed={kind==="hold"} onClick={()=>setKind("hold")}>保留券</button><button type="button" className={kind==="manual"?"active":""} aria-pressed={kind==="manual"} onClick={()=>setKind("manual")}>手入力</button></div></div>
            <div className="field"><label htmlFor="rate">レート <em>必須</em></label><Select value={rate} onValueChange={setRate}><SelectTrigger id="rate" className="wide-select"><SelectValue placeholder="選択してください"/></SelectTrigger><SelectContent>{rates.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className="field"><label htmlFor="date">日付 <em>必須</em></label><Input id="date" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div>
            <div className="field"><label htmlFor="name">担当者 <em>必須</em></label><Input id="name" value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="担当者名" required/></div>
            <div className="field"><label htmlFor="count">玉数・枚数 <em>必須</em></label><div className="count-input"><Input id="count" type="number" min="1" max="100000000" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" required/><span>{rate.includes("パチンコ") ? "玉" : "枚"}</span></div></div>
            <div className="field full"><label htmlFor="purpose">用途・詳細 <em>必須</em></label><Textarea id="purpose" value={purpose} onChange={e=>setPurpose(e.target.value)} maxLength={1000} placeholder="例：前日の保留券対応、台トラブルの補填など" rows={3} required/></div>
            <div className="confirmation-preview"><ClipboardCheck size={19}/><div><strong>店長確認</strong><span>登録後、店長が確認サインを記入できます</span></div><span className="pending-pill">確認待ち</span></div>
            {error && <p className="form-alert error" role="alert">{error}</p>}
            {success && <p className="form-alert success" role="status">{success}</p>}
            <button type="submit" className="submit-button" disabled={saving}>{saving ? "保存中…" : "記録を保存する"} <span aria-hidden="true">→</span></button>
          </form>
        </section>
        <section className="ledger-card" aria-labelledby="ledger-heading"><div className="ledger-heading"><div><p className="eyebrow">一覧</p><h2 id="ledger-heading">記録台帳</h2></div><span className="total-pill">{records.length} 件</span></div>
          <label className="month-picker" htmlFor="ledger-month"><span>確認する月</span><Input id="ledger-month" type="month" value={month} onChange={event=>setMonth(event.target.value)} /></label>
          <div className="ledger-toolbar"><label className="search-box"><Search size={17}/><Input aria-label="担当者・用途で検索" value={search} onChange={e=>setSearch(e.target.value)} placeholder="担当者・用途で検索"/></label><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="確認状態で絞り込み" className="filter-select"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem><SelectItem value="pending">確認待ち</SelectItem><SelectItem value="confirmed">確認済み</SelectItem></SelectContent></Select></div>
          {loadError && <div className="list-error" role="alert">{loadError}<button type="button" onClick={()=>loadRecords(month)}>再読み込み</button></div>}
          {loading ? <p className="loading-state">記録を読み込み中…</p> : visible.length === 0 ? <div className="empty-state"><span className="empty-icon"><FileImage size={30}/></span><h3>{records.length ? "該当する記録がありません" : "まだ記録がありません"}</h3><p>{records.length ? "検索条件を変えてください。" : "左のフォームから最初のレシートを登録してください。"}</p></div> : <Table className="records-table"><TableHeader><TableRow><TableHead>日付・区分</TableHead><TableHead>担当者・用途</TableHead><TableHead>玉数/枚数</TableHead><TableHead>確認</TableHead></TableRow></TableHeader><TableBody>{visible.map(row=><TableRow key={row.id} className="record-row" onClick={()=>{setSelected(row);setDetailError("");setManagerName("");setHasInk(false);}}><TableCell><strong>{row.record_date}</strong><small>{row.kind==="hold"?"保留券":"手入力"} · {row.rate}</small></TableCell><TableCell><strong>{row.person_name}</strong><small className="truncate-purpose">{row.purpose}</small></TableCell><TableCell><strong>{row.amount.toLocaleString()}{row.unit}</strong></TableCell><TableCell><span className={row.confirmed_at?"confirmed-pill":"pending-pill"}>{row.confirmed_at?"確認済み":"確認待ち"}</span></TableCell></TableRow>)}</TableBody></Table>}
        </section>
      </div>
    </div>
    <Dialog open={!!selected} onOpenChange={closeDetail}><DialogContent className="detail-dialog"><DialogHeader><DialogTitle>記録の詳細</DialogTitle><DialogDescription>{selected?.record_date} · {selected?.kind==="hold"?"保留券":"手入力"}</DialogDescription></DialogHeader>{selected && <div className="detail-content"><div className="detail-grid"><div><small>レート</small><strong>{selected.rate}</strong></div><div><small>担当者</small><strong>{selected.person_name}</strong></div><div><small>玉数・枚数</small><strong>{selected.amount.toLocaleString()}{selected.unit}</strong></div><div><small>用途</small><strong>{selected.purpose}</strong></div></div><div className="receipt-panel"><span>レシート画像</span><img src={`/api/records/${selected.id}/receipt`} alt="添付されたレシート"/></div>{selected.confirmed_at ? <div className="signed-panel"><strong>店長確認済み</strong><span>{selected.confirmed_by} · {new Date(selected.confirmed_at).toLocaleString("ja-JP")}</span>{selected.has_signature && <img src={`/api/records/${selected.id}/signature`} alt="店長確認サイン"/>}</div> : <div className="sign-form"><h3>店長確認サイン</h3><p>店長本人が名前とサインを記入してください。</p><label htmlFor="manager-name">店長名</label><Input id="manager-name" value={managerName} onChange={e=>setManagerName(e.target.value)} maxLength={100} placeholder="店長名を入力"/><div className="signature-label"><span>サイン</span><button type="button" onClick={clearSignature}>書き直す</button></div><canvas ref={canvasRef} width={600} height={160} className="signature-canvas" aria-label="店長確認サイン記入欄" onPointerDown={beginDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw}/>{detailError && <p className="form-alert error" role="alert">{detailError}</p>}<button type="button" className="submit-button" onClick={confirmRecord} disabled={confirming}>{confirming?"保存中…":"店長確認を保存"}</button></div>}</div>}</DialogContent></Dialog>
  </main>;
}
