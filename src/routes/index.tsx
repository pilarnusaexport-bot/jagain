import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Download,
  Footprints,
  HeartPulse,
  Home,
  LogOut,
  MoonStar,
  Plus,
  RefreshCw,
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
type MetricKey = "sleep" | "steps" | "heart_rate";

type Profile = {
  display_name: string;
  avatar_url: string | null;
  birth_date: string | null;
  gender: string | null;
  share_health_by_default: boolean;
};

type DeviceLink = {
  id: string;
  device_name: string;
  pair_token: string;
  status: string;
  last_sync_at: string | null;
};

type Metric = {
  key: MetricKey;
  label: string;
  icon: typeof MoonStar;
  detail: string;
  tone: string;
  value: number | null;
  display: string;
  percent: number;
};

const metricMeta: Record<MetricKey, { label: string; icon: typeof MoonStar; detail: string; tone: string; target: number }> = {
  sleep: { label: "Tidur", icon: MoonStar, detail: "Target 8 jam", tone: "bg-secondary/15 text-primary", target: 480 },
  steps: { label: "Langkah", icon: Footprints, detail: "Target 10.000", tone: "bg-accent/20 text-accent-foreground", target: 10000 },
  heart_rate: { label: "Detak", icon: HeartPulse, detail: "Rata-rata istirahat", tone: "bg-destructive/10 text-destructive", target: 120 },
};

function formatMetric(key: MetricKey, value: number | null): string {
  if (value === null) return "–";
  if (key === "sleep") return `${Math.floor(value / 60)}j ${Math.round(value % 60)}m`;
  if (key === "steps") return new Intl.NumberFormat("id-ID").format(Math.round(value));
  return `${Math.round(value)} bpm`;
}

function HealthTracker() {
  const [tab, setTab] = useState<Tab>("home");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [modal, setModal] = useState<"group" | "invite" | null>(null);
  const [groupName, setGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSent, setInviteSent] = useState(false);
  const [notice, setNotice] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [group, setGroup] = useState<{ id: string; name: string; members: number; shared: number } | null>(null);
  const [values, setValues] = useState<Record<MetricKey, number | null>>({ sleep: null, steps: null, heart_rate: null });
  const [link, setLink] = useState<DeviceLink | null>(null);

  const loadData = useCallback(async (uid: string) => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [profileRes, recordsRes, linkRes, membershipRes] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url, birth_date, gender, share_health_by_default").eq("id", uid).maybeSingle(),
      supabase.from("health_records").select("metric_type, value, recorded_at").eq("user_id", uid).gte("recorded_at", dayStart.toISOString()).order("recorded_at", { ascending: false }),
      supabase.from("health_device_links").select("id, device_name, pair_token, status, last_sync_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("group_members").select("group_id").eq("user_id", uid).limit(1).maybeSingle(),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    setLink(linkRes.data ?? null);

    const next: Record<MetricKey, number | null> = { sleep: null, steps: null, heart_rate: null };
    for (const row of recordsRes.data ?? []) {
      const key = row.metric_type as MetricKey;
      if (key in next && next[key] === null) next[key] = Number(row.value);
    }
    setValues(next);

    const groupId = membershipRes.data?.group_id;
    if (groupId) {
      const [groupRes, membersRes] = await Promise.all([
        supabase.from("health_groups").select("id, name").eq("id", groupId).maybeSingle(),
        supabase.from("group_members").select("id, can_view_health").eq("group_id", groupId),
      ]);
      if (groupRes.data) {
        setGroup({
          id: groupRes.data.id,
          name: groupRes.data.name,
          members: membersRes.data?.length ?? 0,
          shared: (membersRes.data ?? []).filter((m) => m.can_view_health).length,
        });
      }
    } else {
      setGroup(null);
    }
  }, []);

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onInstall);

    void supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        setEmail(data.user.email ?? "");
        await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            display_name:
              (data.user.user_metadata?.["full_name"] as string | undefined) ??
              (data.user.user_metadata?.["name"] as string | undefined) ??
              "Pengguna SehatKita",
            avatar_url: (data.user.user_metadata?.["avatar_url"] as string | undefined) ?? null,
          },
          { onConflict: "id" },
        );
        await loadData(data.user.id);
      }
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? "");
    });
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      data.subscription.unsubscribe();
    };
  }, [loadData]);

  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(new Date()),
    [],
  );

  const metrics: Metric[] = useMemo(
    () =>
      (Object.keys(metricMeta) as MetricKey[]).map((key) => {
        const meta = metricMeta[key];
        const value = values[key];
        return {
          key,
          label: meta.label,
          icon: meta.icon,
          detail: meta.detail,
          tone: meta.tone,
          value,
          display: formatMetric(key, value),
          percent: value === null ? 0 : Math.min(100, Math.round((value / meta.target) * 100)),
        };
      }),
    [values],
  );

  const score = useMemo(() => {
    const parts = metrics.filter((m) => m.key !== "heart_rate" && m.value !== null).map((m) => m.percent);
    if (!parts.length) return null;
    return Math.round(parts.reduce((sum, part) => sum + part, 0) / parts.length);
  }, [metrics]);

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
    setNotice("Buka menu browser, lalu pilih ‘Tambahkan ke layar utama’ atau ‘Install app’.");
  }

  async function saveGroup() {
    if (!groupName.trim() || !userId) {
      setNotice("Nama group perlu diisi.");
      return;
    }
    const { error } = await supabase.from("health_groups").insert({ name: groupName.trim(), owner_id: userId });
    if (error) {
      setNotice("Group belum berhasil dibuat. Silakan coba lagi.");
      return;
    }
    setNotice(`Group ${groupName.trim()} berhasil dibuat.`);
    setGroupName("");
    setModal(null);
    await loadData(userId);
  }

  async function sendInvite() {
    if (!inviteEmail.includes("@") || !userId || !group) {
      setNotice("Masukkan alamat email yang valid.");
      return;
    }
    const { error } = await supabase.from("group_invites").insert({ group_id: group.id, invited_by: userId, email: inviteEmail.trim() });
    if (error) {
      setNotice("Undangan belum berhasil dibuat. Silakan coba lagi.");
      return;
    }
    setInviteSent(true);
  }

  async function connectHealthConnect() {
    if (!userId) return;
    if (link) {
      await loadData(userId);
      setNotice(link.last_sync_at ? "Data Health Connect diperbarui." : "Menunggu aplikasi pendamping mengirim data.");
      return;
    }
    const { data, error } = await supabase
      .from("health_device_links")
      .insert({ user_id: userId })
      .select("id, device_name, pair_token, status, last_sync_at")
      .single();
    if (error || !data) {
      setNotice("Koneksi belum bisa dibuat. Silakan coba lagi.");
      return;
    }
    setLink(data);
  }

  if (!ready) {
    return <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">Memuat…</main>;
  }

  if (!userId) {
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
        </div>
        <p className="mt-4 text-center text-[11px] leading-4 text-muted-foreground">Dengan melanjutkan, kamu menyetujui kebijakan privasi dan kendali berbagi data.</p>
      </main>
    );
  }

  const firstName = (profile?.display_name ?? "Pengguna").split(" ")[0] ?? "Pengguna";

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-background">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border/60 bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex items-center gap-3">
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt={profile.display_name} className="size-10 rounded-full object-cover shadow-clay-sm" />
            : <div className="grid size-10 place-items-center rounded-full bg-secondary font-display font-bold text-primary-foreground shadow-clay-sm">{firstName.charAt(0).toUpperCase()}</div>}
          <div className="leading-tight">
            <p className="text-[11px] font-medium text-primary/70">{dateLabel}</p>
            <p className="font-display text-[15px] font-semibold">Halo, {firstName}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Notifikasi" className="rounded-full bg-card shadow-clay-sm"><Bell className="text-primary" /></Button>
      </header>

      <main className="px-4 pb-28 pt-4">
        {notice && <div role="status" className="mb-3 flex items-start justify-between gap-3 rounded-md bg-accent/20 px-3 py-2 text-xs text-accent-foreground"><span>{notice}</span><button aria-label="Tutup" onClick={() => setNotice("")}><X className="size-4" /></button></div>}
        {tab === "home" && (
          <HomeView
            dateLabel={dateLabel}
            firstName={firstName}
            score={score}
            metrics={metrics}
            group={group}
            onCreate={() => setModal("group")}
            onInvite={() => { setInviteSent(false); setModal("invite"); }}
          />
        )}
        {tab === "records" && (
          <RecordsView metrics={metrics} link={link} onConnect={connectHealthConnect} onCopy={(text) => { void navigator.clipboard.writeText(text); setNotice("Disalin."); }} />
        )}
        {tab === "profile" && (
          <ProfileView
            profile={profile}
            email={email}
            onToggleSharing={async (value) => {
              if (!userId) return;
              await supabase.from("profiles").update({ share_health_by_default: value }).eq("id", userId);
              setProfile((prev) => (prev ? { ...prev, share_health_by_default: value } : prev));
            }}
            onInstall={installApp}
            onLogout={async () => { await supabase.auth.signOut(); setUserId(null); }}
          />
        )}
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
            <Input className="mt-5 h-12 bg-card" type={modal === "invite" ? "email" : "text"} placeholder={modal === "invite" ? "nama@email.com" : "Contoh: Keluarga Kita"} value={modal === "invite" ? inviteEmail : groupName} onChange={(e) => modal === "invite" ? setInviteEmail(e.target.value) : setGroupName(e.target.value)} />
            {inviteSent && <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary"><Check className="size-4" /> Undangan tersimpan.</p>}
            <Button size="touch" variant="clay" className="mt-4 w-full" onClick={modal === "group" ? saveGroup : sendInvite}>{modal === "group" ? "Buat group" : "Kirim undangan"}</Button>
          </section>
        </div>
      )}
    </div>
  );
}

function HomeView({ dateLabel, firstName, score, metrics, group, onCreate, onInvite }: {
  dateLabel: string;
  firstName: string;
  score: number | null;
  metrics: Metric[];
  group: { id: string; name: string; members: number; shared: number } | null;
  onCreate: () => void;
  onInvite: () => void;
}) {
  return <div className="animate-pop">
    <section className="rounded-lg bg-card p-4 shadow-clay">
      <div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase text-primary/60">Skor harian</p><span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold text-primary">{dateLabel}</span></div>
      <div className="mt-3 flex items-end justify-between">
        <div className="flex items-baseline gap-1.5"><span className="font-display text-[46px] font-extrabold leading-none text-primary">{score ?? "–"}</span><span className="mb-1 text-sm font-medium text-primary/50">/ 100</span></div>
        {score !== null && <span className="rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold text-primary">{score >= 80 ? "Baik" : score >= 50 ? "Cukup" : "Perlu naik"}</span>}
      </div>
      <p className="mt-2 text-[13px] leading-snug text-foreground/70">{score === null ? `Belum ada data hari ini, ${firstName}. Hubungkan Health Connect di menu Rekam.` : "Skor dihitung dari tidur dan langkahmu hari ini."}</p>
    </section>
    <div className="mt-4 grid grid-cols-3 gap-3">{metrics.map((item, index) => <div key={item.key} className="animate-breathe rounded-lg bg-card p-3 shadow-clay-sm" style={{ animationDelay: `${index * 300}ms` }}><item.icon className={`size-5 ${item.tone.split(" ")[1]}`} /><p className="mt-2 text-[11px] font-medium text-primary/70">{item.label}</p><p className="mt-1 font-display text-[clamp(1rem,5vw,1.35rem)] font-bold leading-none">{item.display}</p><div className="mt-2.5 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${item.key === "steps" ? "bg-accent" : "bg-secondary"}`} style={{ width: `${item.percent}%` }} /></div></div>)}</div>
    <section className="mt-4 animate-rise rounded-lg bg-card p-4 shadow-clay">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-[17px] font-semibold">Group keluarga</h2><p className="mt-0.5 text-xs text-muted-foreground">Berbagi Rekam dengan izinmu.</p></div>
        <Button size="sm" variant="clay" onClick={group ? onInvite : onCreate}>{group ? <Share2 /> : <Plus />}{group ? "Undang" : "Buat"}</Button>
      </div>
      {group
        ? <div className="mt-4 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-bold text-primary-foreground ring-2 ring-card">{group.name.charAt(0).toUpperCase()}</div><div><p className="text-xs font-semibold text-primary">{group.name}</p><p className="text-[11px] text-muted-foreground">{group.members} anggota · {group.shared} Rekam dibagikan</p></div><ChevronRight className="ml-auto size-5 text-muted-foreground" /></div>
        : <p className="mt-4 text-xs text-muted-foreground">Belum ada group. Buat group untuk mulai berbagi.</p>}
    </section>
    <section className="mt-4 rounded-lg bg-secondary/10 p-3.5"><div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-primary" /><p className="text-xs leading-5 text-primary"><span className="font-semibold">Kamu memegang kendali.</span> Data hanya terlihat oleh anggota yang kamu izinkan.</p></div></section>
  </div>;
}

function RecordsView({ metrics, link, onConnect, onCopy }: { metrics: Metric[]; link: DeviceLink | null; onConnect: () => void; onCopy: (text: string) => void }) {
  const endpoint = typeof window === "undefined" ? "" : `${window.location.origin}/api/public/health-connect/hcwebhook`;
  const hasData = metrics.some((item) => item.value !== null);
  return <div className="animate-pop">
    <div className="mb-4"><p className="text-xs font-semibold text-primary/70">REKAM KESEHATAN</p><h1 className="font-display text-2xl font-bold">Aktivitas hari ini</h1></div>
    <section className="rounded-lg bg-primary p-4 text-primary-foreground shadow-clay">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-primary-foreground/75">Sumber data</p>
          <p className="mt-1 font-display text-lg font-semibold">Health Connect</p>
          <p className="mt-1 text-[11px] text-primary-foreground/75">
            {link?.last_sync_at
              ? `Tersinkron ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(link.last_sync_at))}`
              : link ? "Menunggu data dari aplikasi pendamping" : "Belum terhubung"}
          </p>
        </div>
        <Smartphone className="size-8" />
      </div>
      <Button className="mt-3 w-full" variant="secondary" onClick={onConnect}>{link ? <><RefreshCw /> Segarkan data</> : "Hubungkan Health Connect"}</Button>
      {link && (
        <div className="mt-3 space-y-2 rounded-md bg-primary-foreground/10 p-3">
          <p className="text-[11px] leading-4 text-primary-foreground/80">Pasang aplikasi <span className="font-semibold">Health Connect to Webhook</span> di HP Android, lalu tempel alamat lengkap ini (kode sudah termasuk, tidak perlu header tambahan):</p>
          <button type="button" onClick={() => onCopy(`${endpoint}?token=${link.pair_token}`)} className="flex w-full items-center justify-between gap-2 rounded-sm bg-primary-foreground/15 px-2.5 py-2 text-left"><span className="break-all font-mono text-[11px]">{`${endpoint}?token=${link.pair_token}`}</span><Copy className="size-4 shrink-0" /></button>
          <p className="text-[11px] leading-4 text-primary-foreground/80">Lalu aktifkan Tidur, Langkah, dan Detak Jantung. Jika ingin memakai header, kodenya:</p>
          <button type="button" onClick={() => onCopy(link.pair_token)} className="flex w-full items-center justify-between gap-2 rounded-sm bg-primary-foreground/15 px-2.5 py-2 text-left"><span className="break-all font-mono text-[11px]">{link.pair_token}</span><Copy className="size-4 shrink-0" /></button>
        </div>
      )}
    </section>
    <div className="mt-4 space-y-3">{metrics.map((item) => <section key={item.key} className="rounded-lg bg-card p-4 shadow-clay-sm"><div className="flex items-start gap-3"><div className={`grid size-10 place-items-center rounded-lg ${item.tone}`}><item.icon className="size-5" /></div><div className="flex-1"><div className="flex items-center justify-between"><h2 className="font-display font-semibold">{item.label}</h2><span className="font-display text-lg font-bold">{item.display}</span></div><p className="text-xs text-muted-foreground">{item.value === null ? "Belum ada data" : item.detail}</p><div className="mt-3 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-secondary" style={{ width: `${item.percent}%` }} /></div></div></div></section>)}</div>
    {!hasData && <p className="mt-4 text-center text-[11px] leading-4 text-muted-foreground">Data akan muncul di sini setelah aplikasi pendamping mengirim rekam dari Health Connect.</p>}
  </div>;
}

function ProfileView({ profile, email, onToggleSharing, onInstall, onLogout }: {
  profile: Profile | null;
  email: string;
  onToggleSharing: (value: boolean) => Promise<void>;
  onInstall: () => void;
  onLogout: () => void;
}) {
  const sharing = profile?.share_health_by_default ?? false;
  const age = profile?.birth_date ? Math.floor((Date.now() - new Date(profile.birth_date).getTime()) / 31557600000) : null;
  return <div className="animate-pop">
    <div className="mb-5 flex items-center gap-4">
      {profile?.avatar_url
        ? <img src={profile.avatar_url} alt={profile.display_name} className="size-16 rounded-full object-cover shadow-clay-sm" />
        : <div className="grid size-16 place-items-center rounded-full bg-secondary font-display text-2xl font-bold text-primary-foreground shadow-clay-sm">{(profile?.display_name ?? "P").charAt(0).toUpperCase()}</div>}
      <div><h1 className="font-display text-2xl font-bold">{profile?.display_name ?? "Pengguna"}</h1><p className="text-sm text-muted-foreground">{email}</p></div>
    </div>
    <section className="rounded-lg bg-card p-4 shadow-clay-sm">
      <h2 className="font-display font-semibold">Data personal</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Info label="Usia" value={age === null ? "Belum diisi" : `${age} tahun`} />
        <Info label="Jenis kelamin" value={profile?.gender ?? "Belum diisi"} />
      </div>
    </section>
    <section className="mt-4 rounded-lg bg-card p-4 shadow-clay-sm">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-display font-semibold">Bagikan ke group</h2><p className="mt-1 text-xs text-muted-foreground">Izinkan anggota melihat Rekam terbaru.</p></div>
        <Button aria-pressed={sharing} variant={sharing ? "clay" : "outline"} size="sm" onClick={() => void onToggleSharing(!sharing)}>{sharing ? "Aktif" : "Nonaktif"}</Button>
      </div>
    </section>
    <div className="mt-4 space-y-2">
      <Button className="w-full justify-between" size="touch" variant="install" onClick={onInstall}><span className="flex items-center gap-2"><Download /> Install aplikasi</span><ChevronRight /></Button>
      <Button className="w-full justify-between text-destructive" size="touch" variant="ghost" onClick={onLogout}><span className="flex items-center gap-2"><LogOut /> Keluar</span><ChevronRight /></Button>
    </div>
  </div>;
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Home; label: string; onClick: () => void }) {
  return <Button variant="ghost" onClick={onClick} aria-current={active ? "page" : undefined} className={`h-14 flex-col gap-1 rounded-md ${active ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground"}`}><Icon className="size-5" /><span className="text-[11px] font-semibold">{label}</span></Button>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-muted p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
