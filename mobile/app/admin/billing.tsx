import { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import type { AdminCoupon, AdminPlan, AdminRefillPack } from "../../src/api/adminTypes";
import { ChipListEditor } from "../../src/components/resume/editors";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, Chip, EmptyState, Screen, SkeletonCard, TextField, toast } from "../../src/components/ui";
import { color, space, text } from "../../src/theme";

type Tab = "plans" | "refills" | "coupons";

export default function AdminBilling() {
  const [tab, setTab] = useState<Tab>("plans");
  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Billing" />
      <Screen scroll padded>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg }}
        >
          {(["plans", "refills", "coupons"] as Tab[]).map((t) => (
            <Chip key={t} label={t} selected={tab === t} onPress={() => setTab(t)} />
          ))}
        </ScrollView>
        {tab === "plans" ? <PlansTab /> : tab === "refills" ? <RefillsTab /> : <CouponsTab />}
      </Screen>
    </View>
  );
}

const emptyPlan: Omit<AdminPlan, "id" | "currency" | "billing_interval" | "created_at"> = {
  slug: "",
  name: "",
  description: "",
  price_inr: 500,
  interview_minutes: 60,
  features: [],
  badge: "",
  is_active: true,
  is_default: false,
  display_order: 100,
};

function PlansTab() {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => api.adminPlans() });
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [form, setForm] = useState(emptyPlan);
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setEditing({ id: "new" } as AdminPlan);
    setForm(emptyPlan);
  };
  const startEdit = (p: AdminPlan) => {
    setEditing(p);
    setForm({ ...p, badge: p.badge || "" });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing?.id && editing.id !== "new") {
        await api.adminUpdatePlan(editing.id, form);
      } else {
        await api.adminCreatePlan(form);
      }
      toast.success("Plan saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (p: AdminPlan) => {
    Alert.alert(`Delete "${p.name}"?`, "In-use plans are soft-deactivated instead of deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeletePlan(p.id);
            void qc.invalidateQueries({ queryKey: ["admin-plans"] });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      },
    ]);
  };

  if (editing) {
    return (
      <View style={{ gap: space.md }}>
        <TextField label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <TextField
          label="Description"
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          multiline
        />
        <TextField
          label="Price (INR)"
          value={String(form.price_inr)}
          keyboardType="numeric"
          onChangeText={(v) => setForm({ ...form, price_inr: parseInt(v, 10) || 0 })}
        />
        <TextField
          label="Interview minutes / month"
          value={String(form.interview_minutes)}
          keyboardType="numeric"
          onChangeText={(v) => setForm({ ...form, interview_minutes: parseInt(v, 10) || 0 })}
        />
        <Text style={text.label}>Features</Text>
        <ChipListEditor items={form.features} onChange={(v) => setForm({ ...form, features: v })} placeholder="Add feature…" />
        <TextField label="Badge" value={form.badge || ""} onChangeText={(v) => setForm({ ...form, badge: v })} />
        <ToggleRow label="Active" value={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
        <ToggleRow label="Default plan" value={form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1 }} />
          <Button label="Save" variant="cta" loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <Button label="+ New plan" variant="secondary" onPress={startNew} />
      {plans.isLoading ? (
        <SkeletonCard lines={3} />
      ) : !plans.data?.items.length ? (
        <EmptyState emoji="💳" title="No plans yet" message="Create your first plan." />
      ) : (
        plans.data.items.map((p) => (
          <Card key={p.id} onPress={() => startEdit(p)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={text.bodyMedium}>{p.name}</Text>
                <Text style={text.caption}>
                  ₹{p.price_inr} · {p.interview_minutes} min/mo
                </Text>
              </View>
              {!p.is_active ? <Chip label="Inactive" tint={color.surfaceSunken} /> : null}
              {p.is_default ? <Chip label="Default" tint={color.ctaSoft} textColor={color.ctaDark} /> : null}
              <Text style={{ color: color.crit, fontSize: 20, paddingHorizontal: 6 }} onPress={() => remove(p)}>
                ×
              </Text>
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

const emptyRefill: Omit<AdminRefillPack, "id"> = {
  slug: "",
  name: "",
  description: "",
  price_inr: 99,
  amount_minutes: 30,
  bonus_minutes: 0,
  is_active: true,
  display_order: 100,
};

function RefillsTab() {
  const qc = useQueryClient();
  const refills = useQuery({ queryKey: ["admin-refills"], queryFn: () => api.adminRefillPacks() });
  const [editing, setEditing] = useState<AdminRefillPack | null>(null);
  const [form, setForm] = useState(emptyRefill);
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setEditing({ id: "new" } as AdminRefillPack);
    setForm(emptyRefill);
  };
  const startEdit = (p: AdminRefillPack) => {
    setEditing(p);
    setForm(p);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing?.id && editing.id !== "new") await api.adminUpdateRefillPack(editing.id, form);
      else await api.adminCreateRefillPack(form);
      toast.success("Refill pack saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["admin-refills"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (p: AdminRefillPack) => {
    Alert.alert(`Delete "${p.name}"?`, "This is a hard delete and can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeleteRefillPack(p.id);
            void qc.invalidateQueries({ queryKey: ["admin-refills"] });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      },
    ]);
  };

  if (editing) {
    return (
      <View style={{ gap: space.md }}>
        <TextField label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <TextField
          label="Description"
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
        />
        <TextField
          label="Price (INR)"
          value={String(form.price_inr)}
          keyboardType="numeric"
          onChangeText={(v) => setForm({ ...form, price_inr: parseInt(v, 10) || 0 })}
        />
        <TextField
          label="Minutes"
          value={String(form.amount_minutes)}
          keyboardType="numeric"
          onChangeText={(v) => setForm({ ...form, amount_minutes: parseInt(v, 10) || 0 })}
        />
        <TextField
          label="Bonus minutes"
          value={String(form.bonus_minutes)}
          keyboardType="numeric"
          onChangeText={(v) => setForm({ ...form, bonus_minutes: parseInt(v, 10) || 0 })}
        />
        <ToggleRow label="Active" value={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1 }} />
          <Button label="Save" variant="cta" loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <Button label="+ New refill pack" variant="secondary" onPress={startNew} />
      {refills.isLoading ? (
        <SkeletonCard lines={3} />
      ) : !refills.data?.items.length ? (
        <EmptyState emoji="⚡" title="No refill packs yet" message="Create your first pack." />
      ) : (
        refills.data.items.map((p) => (
          <Card key={p.id} onPress={() => startEdit(p)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={text.bodyMedium}>{p.name}</Text>
                <Text style={text.caption}>
                  ₹{p.price_inr} · {p.amount_minutes}
                  {p.bonus_minutes ? `+${p.bonus_minutes}` : ""} min
                </Text>
              </View>
              {!p.is_active ? <Chip label="Inactive" tint={color.surfaceSunken} /> : null}
              <Text style={{ color: color.crit, fontSize: 20, paddingHorizontal: 6 }} onPress={() => remove(p)}>
                ×
              </Text>
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

const emptyCoupon: Omit<AdminCoupon, "id" | "redeemed_count"> = {
  code: "",
  description: "",
  discount_type: "percent",
  discount_value: 10,
  applies_to: "all",
  min_amount_inr: 0,
  max_redemptions: undefined,
  per_user_limit: 1,
  is_active: true,
  starts_at: undefined,
  expires_at: undefined,
};

function CouponsTab() {
  const qc = useQueryClient();
  const coupons = useQuery({ queryKey: ["admin-coupons"], queryFn: () => api.adminCoupons() });
  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [form, setForm] = useState(emptyCoupon);
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setEditing({ id: "new" } as AdminCoupon);
    setForm(emptyCoupon);
  };
  const startEdit = (c: AdminCoupon) => {
    setEditing(c);
    setForm({ ...c, description: c.description || "" });
  };

  const save = async () => {
    if (!form.code.trim()) {
      toast.error("Coupon code is required");
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, code: form.code.trim().toUpperCase() };
      if (editing?.id && editing.id !== "new") await api.adminUpdateCoupon(editing.id, body);
      else await api.adminCreateCoupon(body);
      toast.success("Coupon saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (c: AdminCoupon) => {
    Alert.alert(`Delete "${c.code}"?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.adminDeleteCoupon(c.id);
            void qc.invalidateQueries({ queryKey: ["admin-coupons"] });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      },
    ]);
  };

  if (editing) {
    return (
      <View style={{ gap: space.md }}>
        <TextField
          label="Code"
          value={form.code}
          autoCapitalize="characters"
          onChangeText={(v) => setForm({ ...form, code: v.toUpperCase() })}
        />
        <TextField
          label="Description"
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
        />
        <Text style={text.label}>Discount type</Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Chip
            label="percent"
            selected={form.discount_type === "percent"}
            onPress={() => setForm({ ...form, discount_type: "percent" })}
          />
          <Chip
            label="flat"
            selected={form.discount_type === "flat"}
            onPress={() => setForm({ ...form, discount_type: "flat" })}
          />
        </View>
        <TextField
          label={form.discount_type === "percent" ? "Discount %" : "Discount ₹"}
          value={String(form.discount_value)}
          keyboardType="numeric"
          onChangeText={(v) => setForm({ ...form, discount_value: parseInt(v, 10) || 0 })}
        />
        <Text style={text.label}>Applies to</Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {(["all", "plan", "refill"] as const).map((a) => (
            <Chip key={a} label={a} selected={form.applies_to === a} onPress={() => setForm({ ...form, applies_to: a })} />
          ))}
        </View>
        <TextField
          label="Per-user limit"
          value={String(form.per_user_limit)}
          keyboardType="numeric"
          onChangeText={(v) => setForm({ ...form, per_user_limit: parseInt(v, 10) || 1 })}
        />
        <ToggleRow label="Active" value={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1 }} />
          <Button label="Save" variant="cta" loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <Button label="+ New coupon" variant="secondary" onPress={startNew} />
      {coupons.isLoading ? (
        <SkeletonCard lines={3} />
      ) : !coupons.data?.items.length ? (
        <EmptyState emoji="🏷️" title="No coupons yet" message="Create your first coupon." />
      ) : (
        coupons.data.items.map((c) => (
          <Card key={c.id} onPress={() => startEdit(c)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={text.bodyMedium}>{c.code}</Text>
                <Text style={text.caption}>
                  {c.discount_type === "percent" ? `${c.discount_value}% off` : `₹${c.discount_value} off`} ·{" "}
                  {c.redeemed_count} redeemed
                </Text>
              </View>
              {!c.is_active ? <Chip label="Inactive" tint={color.surfaceSunken} /> : null}
              <Text style={{ color: color.crit, fontSize: 20, paddingHorizontal: 6 }} onPress={() => remove(c)}>
                ×
              </Text>
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={text.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: color.primary }} />
    </View>
  );
}
