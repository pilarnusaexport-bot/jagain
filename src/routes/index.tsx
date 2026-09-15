import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  Download,
  Footprints,
  HeartPulse,
  Home,
  LogOut,
  MoonStar,
  Plus,
  Share2,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SehatKita | Health Tracker Keluarga" },
      { name: "description", content: "Pantau tidur, langkah, dan detak jantung bersama keluarga dalam satu aplikasi." },
      { property: "og:title", content: "SehatKita | Health Tracker Keluarga" },
      { property: "og:description", content: "Pantau dan bagikan rekam kesehatan keluarga dengan aman." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HealthTracker,
});

type Tab = "home" | "records" | "profile";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const metrics = [
  { label: "Tidur", value: "7j 20m", detail: "Target 8 jam", percent: 78, icon: MoonStar, tone: "bg-secondary/15 text-primary" },
  { label: "Langkah", value: "6.240", detail: "Target 10.000", percent: 62, icon: Footprints, tone: "bg-accent/20 text-accent-foreground" },
  { label: "Detak", value: "68 bpm", detail: "Rata-rata istirahat", percent: 54, icon: HeartPulse, tone: "bg-destructive/10 text-destructive" },
];

function HealthTracker() {
  const [tab, setTab] = useState<Tab>("home");
  const [signedIn, setSignedIn] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [modal, setModal] = useState<"group" | "invite" | null>(null);
  const [groupName, setGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [groupCreated, setGroupCreated] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    void supabase.auth.getUser().then(async ({ data }) => {
      setSignedIn(Boolean(data.user));
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          display_name: data.user.user_metadata?.["full_name"] ?? data.user.user_metadata?.["name"] ?? "Pengguna SehatKita",
          avatar_url: data.user.user_metadata?.["avatar_url"] ?? null,
        });
        const { data: groups } = await supabase.from("health_groups").select("id").limit(1);
        if (groups?.[0]) setGroupId(groups[0].id);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session?.user)));
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      data.subscription.unsubscribe();
    };
  }, []);

  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(new Date()),
    [],
  );

  async function signInWithGoogle() {
    setAuthBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { prompt: "select_account" },
    });
    if (result.error) setNotice("Masuk dengan Google belum berhasil. Silakan coba lagi.");
    setAuthBusy(false);
  }

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    setNotice("Buka menu browser, lalu pilih ‘Tambahkan ke layar utama’ atau ‘Install app’. ");
  }

  async function saveGroup() {
    if (!groupName.trim()) {
      setNotice("Nama group perlu diisi.");
      return;
    }
    if (signedIn) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data, error } = await supabase.from("health_groups").insert({ name: groupName.trim(), owner_id: userData.user.id }).select("id").single();
        if (error) { setNotice("Group belum berhasil dibuat. Silakan coba lagi."); return; }
        setGroupId(data.id);
      }
    }
    setGroupCreated(true);
    setNotice(`Group ${groupName} berhasil dibuat.`);
    setModal(null);
  }

  async function sendInvite() {
    if (!inviteEmail.includes("@")) {
      setNotice("Masukkan alamat email yang valid.");
      return;
    }
    if (signedIn && groupId) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { error } = await supabase.from("group_invites").insert({ group_id: groupId, invited_by: userData.user.id, email: inviteEmail.trim() });
        if (error) { setNotice("Undangan belum berhasil dibuat. Silakan coba lagi."); return; }
      }
    }
    setInviteSent(true);
  }

  if (!signedIn && !demoMode) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-background px-6 pb-7 pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 font-display text-xl font-bold text-primary">
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><HeartPulse className="size-5" /></span>
          SehatKita
        </div>
        <section className="flex flex-1 flex-col justify-center py-10">
          <div className="relative mx-auto mb-9 grid h-52 w-full max-w-xs place-items-center rounded-lg bg-secondary/15">
            <div className="absolute left-5 top-6 rounded-lg bg-card p-3 shadow-clay-sm"><MoonStar className="size-6 text-primary" /></div>
            <div className="absolute right-5 top-12 rounded-lg bg-card p-3 shadow-clay-sm"><Footprints className="size-6 text-accent-foreground" /></div>
            <div className="absolute bottom-6 right-14 rounded-lg bg-card p-3 shadow-clay-sm"><HeartPulse className="size-6 text-destructive" /></div>
            <div className="grid size-28 place-items-center rounded-full bg-primary text-primary-foreground shadow-clay">
              <Users className="size-12" />
            </div>
          </div>
          <p className="text-xs font-semibold uppercase text-primary/70">Sehat bersama, setiap hari</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-[1.08] text-foreground">Kesehatan keluarga dalam satu genggaman.</h1>
          <p className="mt-4 text-[15px] leading-6 text-muted-foreground">Pantau kebiasaan sehatmu dan bagikan Rekam Kesehatan kepada orang terdekat dengan izinmu.</p>
        </section>
        {notice && <p role="status" className="mb-3 rounded-md bg-accent/20 px-3 py-2 text-xs text-accent-foreground">{notice}</p>}
        <div className="space-y-3">
          <Button className="w-full" size="touch" variant="clay" onClick={signInWithGoogle} disabled={authBusy}>
            <span className="grid size-5 place-items-center rounded-full bg-card text-xs font-bold text-primary">G</span>
            {authBusy ? "Menghubungkan…" : "Masuk / Daftar dengan Google"}
          </Button>
          <Button className="w-full" size="touch" variant="install" onClick={installApp}><Download /> Install aplikasi</Button>
          <Button className="w-full text-muted-foreground" variant="ghost" onClick={() => setDemoMode(true)}>Lihat demo</Button>
        </div>
        <p className="mt-4 text-center text-[11px] leading-4 text-muted-foreground">Dengan melanjutkan, kamu menyetujui kebijakan privasi dan kendali berbagi data.</p>
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-background">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border/60 bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-secondary font-display font-bold text-primary-foreground shadow-clay-sm">S</div>
          <div className="leading-tight"><p className="text-[11px] font-medium text-primary/70">Selamat pagi</p><p className="font-display text-[15px] font-semibold">Selamat pagi, Sari</p></div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Notifikasi" className="rounded-full bg-card shadow-clay-sm"><Bell className="text-primary" /><span className="absolute mr-[-17px] mt-[-18px] size-2 rounded-full bg-accent" /></Button>
      </header>

      <main className="px-4 pb-28 pt-4">
        {notice && <div role="status" className="mb-3 flex items-start justify-between rounded-md bg-accent/20 px-3 py-2 text-xs text-accent-foreground"><span>{notice}</span><button aria-label="Tutup" onClick={() => setNotice("")}><X className="size-4" /></button></div>}
        {tab === "home" && <HomeView dateLabel={dateLabel} groupCreated={groupCreated} onCreate={() => setModal("group")} onInvite={() => setModal("invite")} />}
        {tab === "records" && <RecordsView onConnect={() => setNotice("Health Connect memerlukan aplikasi Android pendamping. Tampilan ini memakai data contoh untuk pratinjau.")} />}
        {tab === "profile" && <ProfileView onInstall={installApp} onLogout={async () => { if (!demoMode) await supabase.auth.signOut(); setDemoMode(false); setSignedIn(false); }} />}
      </main>

      <nav aria-label="Navigasi utama" className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <div className="grid grid-cols-3 rounded-lg bg-card p-1.5 shadow-clay">
          <NavButton active={tab === "home"} icon={Home} label="Home" onClick={() => setTab("home")} />
          <NavButton active={tab === "records"} icon={Activity} label="Rekam" onClick={() => setTab("records")} />
          <NavButton active={tab === "profile"} icon={UserRound} label="Profil" onClick={() => setTab("profile")} />
        </div>
      </nav>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25" onMouseDown={() => setModal(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="w-full max-w-[430px] rounded-t-lg bg-background p-5 shadow-clay" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 id="modal-title" className="font-display text-xl font-bold">{modal === "group" ? "Buat Group" : "Undang anggota"}</h2><Button variant="ghost" size="icon" onClick={() => setModal(null)} aria-label="Tutup"><X /></Button></div>
            <p className="mt-1 text-sm text-muted-foreground">{modal === "group" ? "Beri nama untuk lingkar kesehatan keluargamu." : "Undangan berlaku selama 7 hari."}</p>
            <Input className="mt-5 h-12 bg-card" type={modal === "invite" ? "email" : "text"} placeholder={modal === "invite" ? "nama@email.com" : "Contoh: Keluarga Sari"} value={modal === "invite" ? inviteEmail : groupName} onChange={(e) => modal === "invite" ? setInviteEmail(e.target.value) : setGroupName(e.target.value)} />
            {inviteSent && <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary"><Check className="size-4" /> Undangan siap dibagikan.</p>}
            <Button size="touch" variant="clay" className="mt-4 w-full" onClick={modal === "group" ? saveGroup : sendInvite}>{modal === "group" ? "Buat group" : "Kirim undangan"}</Button>
          </section>
        </div>
      )}
    </div>
  );
}

function HomeView({ dateLabel, groupCreated, onCreate, onInvite }: { dateLabel: string; groupCreated: boolean; onCreate: () => void; onInvite: () => void }) {
  return <div className="animate-pop">
    <section className="rounded-lg bg-card p-4 shadow-clay"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase text-primary/60">Skor harian</p><span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold text-primary">{dateLabel}</span></div><div className="mt-3 flex items-end justify-between"><div className="flex items-baseline gap-1.5"><span className="font-display text-[46px] font-extrabold leading-none text-primary">86</span><span className="mb-1 text-sm font-medium text-primary/50">/ 100</span></div><span className="rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold text-primary">Baik</span></div><p className="mt-2 text-[13px] leading-snug text-foreground/70">Kamu tidur cukup dan aktif sejak pagi. Lanjutkan langkahmu, Sari.</p></section>
    <div className="mt-4 grid grid-cols-3 gap-3">{metrics.map((item, index) => <div key={item.label} className="animate-breathe rounded-lg bg-card p-3 shadow-clay-sm" style={{ animationDelay: `${index * 300}ms` }}><item.icon className={`size-5 ${item.tone.split(" ")[1]}`} /><p className="mt-2 text-[11px] font-medium text-primary/70">{item.label}</p><p className="mt-1 font-display text-[clamp(1rem,5vw,1.35rem)] font-bold leading-none">{item.value}</p><div className="mt-2.5 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${item.label === "Langkah" ? "bg-accent" : "bg-secondary"}`} style={{ width: `${item.percent}%` }} /></div></div>)}</div>
    <section className="mt-4 animate-rise rounded-lg bg-card p-4 shadow-clay"><div className="flex items-center justify-between"><div><h2 className="font-display text-[17px] font-semibold">Group keluarga</h2><p className="mt-0.5 text-xs text-muted-foreground">Berbagi Rekam dengan izinmu.</p></div><Button size="sm" variant="clay" onClick={groupCreated ? onInvite : onCreate}>{groupCreated ? <Share2 /> : <Plus />}{groupCreated ? "Undang" : "Buat"}</Button></div>{groupCreated ? <div className="mt-4 flex items-center gap-3"><div className="flex -space-x-2.5"><Avatar letter="S" tone="bg-secondary" /><Avatar letter="B" tone="bg-accent" /><Avatar letter="D" tone="bg-primary" /></div><div><p className="text-xs font-semibold text-primary">Keluarga Sari</p><p className="text-[11px] text-muted-foreground">3 anggota · 2 Rekam dibagikan</p></div><ChevronRight className="ml-auto size-5 text-muted-foreground" /></div> : <p className="mt-4 text-xs text-muted-foreground">Belum ada group. Buat group untuk mulai berbagi.</p>}</section>
    <section className="mt-4 rounded-lg bg-secondary/10 p-3.5"><div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-primary" /><p className="text-xs leading-5 text-primary"><span className="font-semibold">Kamu memegang kendali.</span> Data hanya terlihat oleh anggota yang kamu izinkan.</p></div></section>
  </div>;
}

function RecordsView({ onConnect }: { onConnect: () => void }) {
  return <div className="animate-pop"><div className="mb-4"><p className="text-xs font-semibold text-primary/70">REKAM KESEHATAN</p><h1 className="font-display text-2xl font-bold">Aktivitas hari ini</h1></div><section className="rounded-lg bg-primary p-4 text-primary-foreground shadow-clay"><div className="flex items-center justify-between"><div><p className="text-xs text-primary-foreground/75">Sumber data</p><p className="mt-1 font-display text-lg font-semibold">Health Connect</p></div><Smartphone className="size-8" /></div><p className="mt-3 text-xs leading-5 text-primary-foreground/75">Sinkronisasi langsung tersedia melalui aplikasi Android pendamping.</p><Button className="mt-3 w-full" variant="secondary" onClick={onConnect}>Hubungkan perangkat</Button></section><div className="mt-4 space-y-3">{metrics.map((item) => <section key={item.label} className="rounded-lg bg-card p-4 shadow-clay-sm"><div className="flex items-start gap-3"><div className={`grid size-10 place-items-center rounded-lg ${item.tone}`}><item.icon className="size-5" /></div><div className="flex-1"><div className="flex items-center justify-between"><h2 className="font-display font-semibold">{item.label}</h2><span className="font-display text-lg font-bold">{item.value}</span></div><p className="text-xs text-muted-foreground">{item.detail}</p><div className="mt-3 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-secondary" style={{ width: `${item.percent}%` }} /></div></div></div></section>)}</div><p className="mt-4 text-center text-[11px] leading-4 text-muted-foreground">Data di layar ini adalah contoh sampai aplikasi Android terhubung.</p></div>;
}

function ProfileView({ onInstall, onLogout }: { onInstall: () => void; onLogout: () => void }) {
  const [sharing, setSharing] = useState(true);
  return <div className="animate-pop"><div className="mb-5 flex items-center gap-4"><div className="grid size-16 place-items-center rounded-full bg-secondary font-display text-2xl font-bold text-primary-foreground shadow-clay-sm">S</div><div><h1 className="font-display text-2xl font-bold">Sari Rahma</h1><p className="text-sm text-muted-foreground">sari@example.com</p></div></div><section className="rounded-lg bg-card p-4 shadow-clay-sm"><h2 className="font-display font-semibold">Data personal</h2><div className="mt-3 grid grid-cols-2 gap-3"><Info label="Usia" value="29 tahun" /><Info label="Jenis kelamin" value="Perempuan" /><Info label="Tinggi" value="162 cm" /><Info label="Berat" value="56 kg" /></div></section><section className="mt-4 rounded-lg bg-card p-4 shadow-clay-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display font-semibold">Bagikan ke group</h2><p className="mt-1 text-xs text-muted-foreground">Izinkan anggota melihat Rekam terbaru.</p></div><Button aria-pressed={sharing} variant={sharing ? "clay" : "outline"} size="sm" onClick={() => setSharing(!sharing)}>{sharing ? "Aktif" : "Nonaktif"}</Button></div></section><div className="mt-4 space-y-2"><Button className="w-full justify-between" size="touch" variant="install" onClick={onInstall}><span className="flex items-center gap-2"><Download /> Install aplikasi</span><ChevronRight /></Button><Button className="w-full justify-between text-destructive" size="touch" variant="ghost" onClick={onLogout}><span className="flex items-center gap-2"><LogOut /> Keluar</span><ChevronRight /></Button></div></div>;
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Home; label: string; onClick: () => void }) {
  return <Button variant="ghost" onClick={onClick} aria-current={active ? "page" : undefined} className={`h-14 flex-col gap-1 rounded-md ${active ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground"}`}><Icon className="size-5" /><span className="text-[11px] font-semibold">{label}</span></Button>;
}

function Avatar({ letter, tone }: { letter: string; tone: string }) { return <div className={`grid size-9 place-items-center rounded-full text-xs font-bold text-primary-foreground ring-2 ring-card ${tone}`}>{letter}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-muted p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }