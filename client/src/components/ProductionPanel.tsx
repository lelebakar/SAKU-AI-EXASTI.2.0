import { Factory, FlaskConical, Play, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Item = { id: number; name: string; unit: string; itemType: string; producible: number; trackStock: number };
type Bom = { id: number; name: string; version: string; outputItemId: number; outputQuantity: number; unit: string; lines: Array<{ inputItemId: number; quantity: number; unit: string; wastePercent: number }> };
type ProductionOrder = { id: number; orderNumber: string; bomId: number; plannedQuantity: number; actualQuantity: number; status: string };
const parseQuantity = (value: string) => Number(value.replace(",", "."));

export default function ProductionPanel({ items }: { items: Item[] }) {
  const utils = trpc.useUtils();
  const { data: rawBoms = [] } = trpc.workspace.inventory.boms.list.useQuery();
  const { data: rawOrders = [] } = trpc.workspace.inventory.production.list.useQuery();
  const boms = rawBoms as Bom[];
  const orders = rawOrders as ProductionOrder[];
  const [recipeName, setRecipeName] = useState("");
  const [outputItemId, setOutputItemId] = useState(0);
  const [recipeInputId, setRecipeInputId] = useState(0);
  const [recipeQuantity, setRecipeQuantity] = useState("1");
  const [recipeLines, setRecipeLines] = useState<Array<{ inputItemId: number; quantity: number; unit: string; wastePercent: number }>>([]);
  const [productionBomId, setProductionBomId] = useState(0);
  const [productionOrderNumber, setProductionOrderNumber] = useState("");
  const [productionQuantity, setProductionQuantity] = useState("1");
  const outputItems = useMemo(() => items.filter((item) => item.producible), [items]);
  const inputItems = useMemo(() => items.filter((item) => item.trackStock), [items]);
  const createBom = trpc.workspace.inventory.boms.create.useMutation({
    onSuccess: () => { void utils.workspace.inventory.boms.list.invalidate(); setRecipeName(""); setOutputItemId(0); setRecipeLines([]); toast.success("Resep/BOM berhasil disimpan."); },
    onError: (error) => toast.error(error.message || "Resep belum bisa disimpan."),
  });
  const createProduction = trpc.workspace.inventory.production.create.useMutation({
    onSuccess: () => { void utils.workspace.inventory.production.list.invalidate(); setProductionOrderNumber(""); setProductionQuantity("1"); toast.success("Production order berhasil dibuat."); },
    onError: (error) => toast.error(error.message || "Production order belum bisa dibuat."),
  });
  const completeProduction = trpc.workspace.inventory.production.complete.useMutation({
    onSuccess: () => { void utils.workspace.inventory.production.list.invalidate(); void utils.workspace.inventory.list.invalidate(); void utils.workspace.inventory.movements.invalidate(); toast.success("Produksi selesai; bahan berkurang dan produk jadi bertambah."); },
    onError: (error) => toast.error(error.message || "Produksi belum bisa diselesaikan."),
  });
  const addRecipeLine = () => {
    const item = inputItems.find((candidate) => candidate.id === recipeInputId);
    const quantity = parseQuantity(recipeQuantity);
    if (!item || !Number.isInteger(quantity) || quantity <= 0) { toast.error("Pilih bahan dan isi jumlah yang valid."); return; }
    setRecipeLines((current) => [...current, { inputItemId: item.id, quantity, unit: item.unit, wastePercent: 0 }]);
    setRecipeInputId(0); setRecipeQuantity("1");
  };
  const submitBom = () => {
    const output = outputItems.find((item) => item.id === outputItemId);
    if (!recipeName.trim() || !output || !recipeLines.length) { toast.error("Nama resep, produk jadi, dan minimal satu bahan wajib diisi."); return; }
    createBom.mutate({ name: recipeName.trim(), version: "v1", outputItemId: output.id, outputQuantity: 1, unit: output.unit, lines: recipeLines });
  };
  const submitProduction = () => {
    if (!productionBomId || !productionOrderNumber.trim()) { toast.error("Pilih resep dan isi nomor produksi."); return; }
    createProduction.mutate({ bomId: productionBomId, orderNumber: productionOrderNumber.trim(), plannedQuantity: parseQuantity(productionQuantity) || 0 });
  };

  return <section className="mt-5 grid gap-5 lg:grid-cols-2">
    <div className="rounded-2xl border border-[#d8ebe0] bg-white p-4 shadow-[0_8px_28px_rgba(56,98,78,0.05)]">
      <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff1dd] text-[#b77226]"><FlaskConical className="h-4 w-4" /></span><div><h2 className="text-[14px] font-bold text-[#34433e]">BOM / resep produksi</h2><p className="mt-1 text-[11px] text-[#8a9690]">Tentukan bahan yang dikonsumsi untuk menghasilkan satu produk jadi.</p></div></div>
      <div className="mt-4 space-y-3"><input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} placeholder="Nama resep, contoh: Es Kopi Susu" className="soft-input w-full" /><select value={outputItemId} onChange={(event) => setOutputItemId(Number(event.target.value))} className="soft-input w-full"><option value={0}>Pilih produk jadi</option>{outputItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="grid grid-cols-[1fr_90px_auto] gap-2"><select value={recipeInputId} onChange={(event) => setRecipeInputId(Number(event.target.value))} className="soft-input"><option value={0}>Pilih bahan</option>{inputItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input type="number" min="0.01" step="0.01" value={recipeQuantity} onChange={(event) => setRecipeQuantity(event.target.value)} className="soft-input" /><button type="button" onClick={addRecipeLine} className="inline-flex items-center justify-center rounded-xl bg-[#edf6f1] px-3 text-[#2b836b]" aria-label="Tambah bahan"><Plus className="h-4 w-4" /></button></div>{recipeLines.map((line, index) => { const item = inputItems.find((candidate) => candidate.id === line.inputItemId); return <div key={`${line.inputItemId}-${index}`} className="flex items-center justify-between rounded-xl bg-[#f8fbf9] px-3 py-2 text-[11px]"><span>{item?.name} · {line.quantity} {line.unit}</span><button type="button" onClick={() => setRecipeLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="text-[#af6857]" aria-label="Hapus bahan"><Trash2 className="h-3.5 w-3.5" /></button></div>; })}<button type="button" onClick={submitBom} disabled={createBom.isPending} className="primary-button w-full justify-center">{createBom.isPending ? "Menyimpan…" : "Simpan resep"}</button></div>
      {boms.length > 0 && <div className="mt-4 space-y-2">{boms.slice(0, 5).map((bom) => <div key={bom.id} className="rounded-xl bg-[#f8fbf9] px-3 py-2 text-[11px]"><strong>{bom.name} · {bom.version}</strong><span className="ml-2 text-[#7c8b84]">{bom.lines.length} bahan</span></div>)}</div>}
    </div>
    <div className="rounded-2xl border border-[#d8ebe0] bg-white p-4 shadow-[0_8px_28px_rgba(56,98,78,0.05)]">
      <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8eef8] text-[#5c70a7]"><Factory className="h-4 w-4" /></span><div><h2 className="text-[14px] font-bold text-[#34433e]">Produksi</h2><p className="mt-1 text-[11px] text-[#8a9690]">Selesaikan produksi untuk mengurangi bahan dan menambah produk jadi otomatis.</p></div></div>
      <div className="mt-4 space-y-3"><select value={productionBomId} onChange={(event) => setProductionBomId(Number(event.target.value))} className="soft-input w-full"><option value={0}>Pilih resep aktif</option>{boms.map((bom) => <option key={bom.id} value={bom.id}>{bom.name} · {bom.version}</option>)}</select><div className="grid gap-2 sm:grid-cols-2"><input value={productionOrderNumber} onChange={(event) => setProductionOrderNumber(event.target.value)} placeholder="Nomor produksi, contoh: PROD-001" className="soft-input" /><input type="number" min="0.01" step="0.01" value={productionQuantity} onChange={(event) => setProductionQuantity(event.target.value)} placeholder="Jumlah hasil" className="soft-input" /></div><button type="button" onClick={submitProduction} disabled={createProduction.isPending} className="primary-button w-full justify-center">{createProduction.isPending ? "Menyimpan…" : "Buat production order"}</button></div>
      {orders.length > 0 && <div className="mt-4 space-y-2">{orders.slice(0, 5).map((order) => <div key={order.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#f8fbf9] px-3 py-2 text-[11px]"><span><strong>{order.orderNumber}</strong><span className="ml-2 text-[#7c8b84]">{order.plannedQuantity} unit · {order.status}</span></span>{order.status !== "completed" && order.status !== "cancelled" && <button type="button" onClick={() => completeProduction.mutate({ productionOrderId: order.id })} disabled={completeProduction.isPending} className="inline-flex items-center gap-1 rounded-lg bg-[#2d9478] px-2 py-1 font-bold text-white"><Play className="h-3 w-3" /> Selesaikan</button>}</div>)}</div>}
    </div>
  </section>;
}
