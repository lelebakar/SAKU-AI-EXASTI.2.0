import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Boxes, History, PackagePlus, Search, ShoppingCart, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import ProductionPanel from "@/components/ProductionPanel";

type InventoryItem = {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  sellingPrice: number;
  itemType: ItemType;
  trackStock: number;
  sellable: number;
  producible: number;
};
type ItemType = "service" | "merchandise" | "raw_material" | "work_in_progress" | "finished_good" | "packaging" | "consumable" | "non_stock";
type SalesOrder = { id: number; orderNumber: string; status: "draft" | "confirmed" | "completed" | "cancelled"; total: number; createdAt: string | Date };
type MovementType = "in" | "out" | "adjustment";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID");
const parseQuantity = (value: string) => Number(value.replace(",", "."));

function StatCard({ label, value, detail, tone = "mint" }: { label: string; value: string; detail: string; tone?: "mint" | "amber" | "blue" }) {
  const toneClass = tone === "amber" ? "bg-[#fff5e7] text-[#b77226]" : tone === "blue" ? "bg-[#edf2ff] text-[#5c70a7]" : "bg-[#e8f7f0] text-[#2b836b]";
  return <div className="rounded-2xl border border-[#e0eee7] bg-white p-4 shadow-[0_8px_28px_rgba(56,98,78,0.05)]"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}><Boxes className="h-4 w-4" /></div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#899690]">{label}</p><p className="mt-1 text-xl font-bold text-[#2f4039]">{value}</p><p className="mt-1 text-[11px] text-[#8a9690]">{detail}</p></div>;
}

function EmptyInventory({ onAdd }: { onAdd: () => void }) {
  return <div className="rounded-2xl border border-dashed border-[#cfe4d9] bg-[#fbfefc] px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e6f5ed] text-[#2b836b]"><PackagePlus className="h-6 w-6" /></div><h3 className="mt-3 text-[15px] font-bold text-[#34433e]">Belum ada produk inventory</h3><p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-[#86938d]">Catat produk, bahan baku, atau kemasan agar SAKU bisa membantu memantau stok dan memberi peringatan saat persediaan menipis.</p><button type="button" onClick={onAdd} className="primary-button mx-auto mt-4"><PackagePlus className="h-4 w-4" /> Tambah produk pertama</button></div>;
}

export default function InventoryPage({ onBack }: { onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data: rawItems = [], isLoading } = trpc.workspace.inventory.list.useQuery();
  const items = rawItems as InventoryItem[];
  const { data: rawOrders = [] } = trpc.workspace.inventory.orders.list.useQuery();
  const orders = rawOrders as SalesOrder[];
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [movementItemId, setMovementItemId] = useState<number | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("in");
  const [movementQuantity, setMovementQuantity] = useState("1");
  const [movementNote, setMovementNote] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Umum");
  const [unit, setUnit] = useState("pcs");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [costPrice, setCostPrice] = useState("0");
  const [sellingPrice, setSellingPrice] = useState("0");
  const [itemType, setItemType] = useState<ItemType>("merchandise");
  const [trackStock, setTrackStock] = useState(true);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderItemId, setOrderItemId] = useState(0);
  const [orderQuantity, setOrderQuantity] = useState("1");
  const createMutation = trpc.workspace.inventory.create.useMutation({
    onSuccess: () => { void utils.workspace.inventory.list.invalidate(); setSku(""); setName(""); setCategory("Umum"); setUnit("pcs"); setInitialQuantity("0"); setMinQuantity("0"); setCostPrice("0"); setSellingPrice("0"); setItemType("merchandise"); setTrackStock(true); setAddOpen(false); toast.success("Item berhasil ditambahkan ke katalog."); },
    onError: (error) => toast.error(error.message || "Produk belum bisa disimpan."),
  });
  const moveMutation = trpc.workspace.inventory.move.useMutation({
    onSuccess: () => { void utils.workspace.inventory.list.invalidate(); void utils.workspace.inventory.movements.invalidate(); setMovementItemId(null); setMovementQuantity("1"); setMovementNote(""); toast.success("Pergerakan stok berhasil dicatat."); },
    onError: (error) => toast.error(error.message || "Pergerakan stok belum bisa dicatat."),
  });
  const confirmOrderMutation = trpc.workspace.inventory.orders.confirm.useMutation({
    onSuccess: () => { void utils.workspace.inventory.list.invalidate(); void utils.workspace.inventory.movements.invalidate(); void utils.workspace.inventory.orders.list.invalidate(); toast.success("Penjualan dikonfirmasi dan stok otomatis berkurang."); },
    onError: (error) => toast.error(error.message || "Stok belum bisa dikurangi."),
  });
  const orderMutation = trpc.workspace.inventory.orders.create.useMutation({
    onSuccess: (order) => { void utils.workspace.inventory.orders.list.invalidate(); setOrderNumber(""); setOrderItemId(0); setOrderQuantity("1"); void confirmOrderMutation.mutateAsync({ orderId: order.id }); },
    onError: (error) => toast.error(error.message || "Penjualan belum bisa disimpan."),
  });
  const selectedItem = items.find((item) => item.id === movementItemId);
  const { data: movements = [] } = trpc.workspace.inventory.movements.useQuery({ itemId: movementItemId ?? undefined }, { enabled: movementItemId !== null });
  const filteredItems = useMemo(() => items.filter((item) => `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase())), [items, search]);
  const lowStockItems = items.filter((item) => item.quantity <= item.minQuantity);
  const stockValue = items.reduce((total, item) => total + item.quantity * item.costPrice, 0);

  const submitProduct = () => {
    if (!sku.trim() || !name.trim()) { toast.error("SKU dan nama produk wajib diisi."); return; }
    createMutation.mutate({ sku: sku.trim(), name: name.trim(), category: category.trim() || "Umum", unit: unit.trim() || "pcs", initialQuantity: parseQuantity(initialQuantity) || 0, minQuantity: parseQuantity(minQuantity) || 0, costPrice: Number(costPrice) || 0, sellingPrice: Number(sellingPrice) || 0, itemType, trackStock, sellable: true, purchasable: itemType !== "service" && itemType !== "non_stock", producible: itemType === "finished_good" });
  };
  const submitMovement = () => {
    if (!selectedItem) return;
    const quantity = parseQuantity(movementQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) { toast.error("Jumlah stok harus lebih dari 0."); return; }
    moveMutation.mutate({ itemId: selectedItem.id, movementType, quantity, note: movementNote.trim() || undefined });
  };
  const submitOrder = () => {
    const item = items.find((candidate) => candidate.id === orderItemId);
    const quantity = parseQuantity(orderQuantity);
    if (!orderNumber.trim() || !item) { toast.error("Nomor order dan item penjualan wajib diisi."); return; }
    if (!Number.isInteger(quantity) || quantity <= 0) { toast.error("Jumlah penjualan harus lebih dari 0."); return; }
    orderMutation.mutate({ orderNumber: orderNumber.trim(), lines: [{ itemId: item.id, quantity }] });
  };

  return <div className="h-full overflow-y-auto bg-[#f7fbf9] px-4 py-5 sm:px-7 sm:py-7"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#6f8078] hover:text-[#2b836b]"><ArrowLeft className="h-3.5 w-3.5" /> Kembali ke workspace</button><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2b836b]">Operations · Inventory</p><h1 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[#2d4038]">Stok dan persediaan</h1><p className="mt-1 max-w-xl text-[12px] leading-5 text-[#84918b]">Pantau saldo produk, catat barang masuk atau keluar, dan ketahui stok mana yang perlu segera dibeli.</p></div><button type="button" onClick={() => setAddOpen((open) => !open)} className="primary-button"><PackagePlus className="h-4 w-4" /> Tambah produk</button></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3"><StatCard label="Produk aktif" value={number.format(items.length)} detail="SKU yang tercatat di workspace" /><StatCard label="Nilai stok" value={currency.format(stockValue)} detail="Berdasarkan harga modal" tone="blue" /><StatCard label="Perlu restock" value={number.format(lowStockItems.length)} detail={lowStockItems.length ? `${lowStockItems.slice(0, 2).map((item) => item.name).join(", ")}${lowStockItems.length > 2 ? "…" : ""}` : "Semua stok masih aman"} tone={lowStockItems.length ? "amber" : "mint"} /></div>
    <ProductionPanel items={items} />
    {addOpen && <section className="mt-5 rounded-2xl border border-[#d8ebe0] bg-white p-4 shadow-[0_8px_28px_rgba(56,98,78,0.05)]"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-bold text-[#34433e]">Tambah item katalog</h2><p className="mt-1 text-[11px] text-[#8a9690]">Pilih tipe item agar SAKU tahu apakah item ini berupa jasa, barang dagang, bahan, atau produk jadi.</p></div><button type="button" aria-label="Tutup form produk" onClick={() => setAddOpen(false)} className="rounded-lg p-1.5 text-[#899690] hover:bg-[#f0f7f3]"><X className="h-4 w-4" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[11px] font-semibold text-[#63736b]">SKU<input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="KOPI-ARABIKA" className="soft-input mt-1 w-full" /></label><label className="text-[11px] font-semibold text-[#63736b]">Nama item<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Kopi Arabika 1 kg" className="soft-input mt-1 w-full" /></label><label className="text-[11px] font-semibold text-[#63736b]">Tipe item<select value={itemType} onChange={(event) => { const next = event.target.value as ItemType; setItemType(next); if (next === "service" || next === "non_stock") setTrackStock(false); }} className="soft-input mt-1 w-full"><option value="service">Jasa</option><option value="merchandise">Barang dagang</option><option value="raw_material">Bahan baku</option><option value="work_in_progress">Produk antara</option><option value="finished_good">Produk jadi</option><option value="packaging">Kemasan</option><option value="consumable">Habis pakai</option><option value="non_stock">Non-stok</option></select></label><label className="text-[11px] font-semibold text-[#63736b]">Kategori<input value={category} onChange={(event) => setCategory(event.target.value)} className="soft-input mt-1 w-full" /></label><label className="text-[11px] font-semibold text-[#63736b]">Satuan<input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="pcs / kg / liter" className="soft-input mt-1 w-full" /></label><label className="text-[11px] font-semibold text-[#63736b]">Stok awal<input type="number" min="0" step="0.01" value={initialQuantity} onChange={(event) => setInitialQuantity(event.target.value)} className="soft-input mt-1 w-full" /></label><label className="text-[11px] font-semibold text-[#63736b]">Batas minimum<input type="number" min="0" step="0.01" value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} className="soft-input mt-1 w-full" /></label><label className="text-[11px] font-semibold text-[#63736b]">Harga modal<input type="number" min="0" value={costPrice} onChange={(event) => setCostPrice(event.target.value)} className="soft-input mt-1 w-full" /></label><label className="text-[11px] font-semibold text-[#63736b]">Harga jual<input type="number" min="0" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} className="soft-input mt-1 w-full" /></label></div><label className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[#63736b]"><input type="checkbox" checked={trackStock} onChange={(event) => setTrackStock(event.target.checked)} /> Item ini punya stok fisik dan perlu dipantau</label><button type="button" onClick={submitProduct} disabled={createMutation.isPending} className="primary-button mt-4">{createMutation.isPending ? "Menyimpan…" : "Simpan item"}</button></section>}
    <section className="mt-5 rounded-2xl border border-[#d8ebe0] bg-white p-4 shadow-[0_8px_28px_rgba(56,98,78,0.05)]"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8eef8] text-[#5c70a7]"><ShoppingCart className="h-4 w-4" /></span><div><h2 className="text-[14px] font-bold text-[#34433e]">Catat penjualan retail</h2><p className="mt-1 text-[11px] text-[#8a9690]">Konfirmasi order untuk otomatis mengurangi stok item yang dilacak.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-[11px] font-semibold text-[#63736b]">Nomor order<input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="ORD-001" className="soft-input mt-1 w-full" /></label><label className="text-[11px] font-semibold text-[#63736b]">Item<select value={orderItemId} onChange={(event) => setOrderItemId(Number(event.target.value))} className="soft-input mt-1 w-full"><option value={0}>Pilih item yang dijual</option>{items.filter((item) => item.sellable).map((item) => <option key={item.id} value={item.id}>{item.name} · {currency.format(item.sellingPrice)}</option>)}</select></label><label className="text-[11px] font-semibold text-[#63736b]">Jumlah<input type="number" min="1" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} className="soft-input mt-1 w-full" /></label></div><button type="button" onClick={submitOrder} disabled={orderMutation.isPending || confirmOrderMutation.isPending} className="primary-button mt-4"><ShoppingCart className="h-4 w-4" />{orderMutation.isPending || confirmOrderMutation.isPending ? "Memproses…" : "Simpan dan kurangi stok"}</button>{orders.length > 0 && <div className="mt-4 space-y-2">{orders.slice(0, 5).map((order) => <div key={order.id} className="flex items-center justify-between rounded-xl bg-[#f8fbf9] px-3 py-2.5 text-[11px]"><span className="font-bold text-[#34433e]">{order.orderNumber}</span><span className="text-[#7c8b84]">{currency.format(order.total)} · {order.status === "confirmed" ? "Stok berkurang" : order.status}</span></div>)}</div>}</section>
    <section className="mt-5 rounded-2xl border border-[#e0eee7] bg-white shadow-[0_8px_28px_rgba(56,98,78,0.05)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8f0eb] p-4"><div><h2 className="text-[14px] font-bold text-[#34433e]">Daftar produk</h2><p className="mt-1 text-[11px] text-[#8a9690]">Klik aksi untuk mencatat stok masuk atau keluar.</p></div><div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9aa59f]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk atau SKU" className="soft-input w-full pl-9" /></div></div>{isLoading ? <div className="p-8 text-center text-[12px] text-[#8a9690]">Memuat data inventory…</div> : !items.length ? <div className="p-4"><EmptyInventory onAdd={() => setAddOpen(true)} /></div> : !filteredItems.length ? <div className="p-10 text-center text-[12px] text-[#8a9690]">Produk yang dicari belum ditemukan.</div> : <div className="divide-y divide-[#edf3ef]">{filteredItems.map((item) => { const isLow = item.quantity <= item.minQuantity; return <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isLow ? "bg-[#fff3df] text-[#b77226]" : "bg-[#e7f6ee] text-[#2b836b]"}`}><Boxes className="h-5 w-5" /></div><div className="min-w-0"><p className="truncate text-[13px] font-bold text-[#34433e]">{item.name}</p><p className="mt-0.5 text-[10px] text-[#8a9690]">{item.sku} · {item.category} · {currency.format(item.costPrice)} / {item.unit}</p>{isLow && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#b77226]"><TriangleAlert className="h-3 w-3" /> Minimum {number.format(item.minQuantity)} {item.unit}</span>}</div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><div className={`mr-1 rounded-xl px-3 py-2 text-center ${isLow ? "bg-[#fff5e7]" : "bg-[#f1f8f4]"}`}><strong className={`block text-[16px] ${isLow ? "text-[#b77226]" : "text-[#2b836b]"}`}>{number.format(item.quantity)}</strong><span className="text-[10px] text-[#8a9690]">{item.unit} tersedia</span></div><button type="button" onClick={() => { setMovementItemId(item.id); setMovementType("in"); }} className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe8da] bg-[#f6fdf8] px-3 py-2 text-[11px] font-bold text-[#2b836b] hover:bg-[#e7f6ee]"><ArrowDownToLine className="h-3.5 w-3.5" /> Masuk</button><button type="button" onClick={() => { setMovementItemId(item.id); setMovementType("out"); }} className="inline-flex items-center gap-1.5 rounded-xl border border-[#f0d9d0] bg-[#fffaf8] px-3 py-2 text-[11px] font-bold text-[#af6857] hover:bg-[#fff0eb]"><ArrowUpFromLine className="h-3.5 w-3.5" /> Keluar</button></div></div>; })}</div>}</section>
    {selectedItem && <section className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><div className="rounded-2xl border border-[#d8ebe0] bg-white p-4 shadow-[0_8px_28px_rgba(56,98,78,0.05)]"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#2b836b]">Pergerakan stok</p><h2 className="mt-1 text-[16px] font-bold text-[#34433e]">{selectedItem.name}</h2><p className="mt-1 text-[11px] text-[#8a9690]">Saldo sekarang {number.format(selectedItem.quantity)} {selectedItem.unit}</p></div><button type="button" aria-label="Tutup pergerakan stok" onClick={() => setMovementItemId(null)} className="rounded-lg p-1.5 text-[#899690] hover:bg-[#f0f7f3]"><X className="h-4 w-4" /></button></div><div className="mt-4 flex rounded-xl bg-[#f1f8f4] p-1"><button type="button" onClick={() => setMovementType("in")} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold ${movementType === "in" ? "bg-white text-[#2b836b] shadow-sm" : "text-[#809088]"}`}>Stok masuk</button><button type="button" onClick={() => setMovementType("out")} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold ${movementType === "out" ? "bg-white text-[#af6857] shadow-sm" : "text-[#809088]"}`}>Stok keluar</button></div><label className="mt-4 block text-[11px] font-semibold text-[#63736b]">Jumlah<input type="number" min="0.01" step="0.01" value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} className="soft-input mt-1 w-full" /></label><label className="mt-3 block text-[11px] font-semibold text-[#63736b]">Catatan (opsional)<input value={movementNote} onChange={(event) => setMovementNote(event.target.value)} placeholder="Contoh: pembelian supplier / pesanan #123" className="soft-input mt-1 w-full" /></label><button type="button" onClick={submitMovement} disabled={moveMutation.isPending} className="primary-button mt-4 w-full justify-center">{moveMutation.isPending ? "Menyimpan…" : "Simpan pergerakan"}</button></div><div className="rounded-2xl border border-[#e0eee7] bg-white p-4 shadow-[0_8px_28px_rgba(56,98,78,0.05)]"><div className="flex items-center gap-2"><History className="h-4 w-4 text-[#2b836b]" /><div><h2 className="text-[14px] font-bold text-[#34433e]">Riwayat pergerakan</h2><p className="text-[11px] text-[#8a9690]">100 aktivitas terbaru untuk produk ini</p></div></div>{movements.length ? <div className="mt-4 space-y-2">{(movements as Array<{ id: number; movementType: MovementType; quantity: number; note: string | null; createdAt: Date }>).map((movement) => <div key={movement.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f8fbf9] px-3 py-2.5"><div><p className="text-[11px] font-bold text-[#34433e]">{movement.movementType === "in" ? "Stok masuk" : movement.movementType === "out" ? "Stok keluar" : "Penyesuaian"}</p><p className="mt-0.5 text-[10px] text-[#8a9690]">{movement.note || "Tanpa catatan"} · {new Date(movement.createdAt).toLocaleString("id-ID")}</p></div><strong className={movement.movementType === "out" ? "text-[#af6857]" : "text-[#2b836b]"}>{movement.movementType === "out" ? "−" : "+"}{number.format(movement.quantity)}</strong></div>)}</div> : <div className="mt-5 rounded-xl bg-[#f8fbf9] p-4 text-center text-[11px] text-[#8a9690]">Belum ada pergerakan untuk produk ini.</div>}</div></section>}
  </div></div>;
}

export { currency };
