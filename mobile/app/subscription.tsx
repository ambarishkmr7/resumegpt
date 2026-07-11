import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../src/api/client";
import { errorMessage } from "../src/api/errors";
import type { CouponInfo, Plan, RefillPack } from "../src/api/types";
import {
  Button,
  Card,
  Chip,
  SkeletonCard,
  TextField,
  toast,
  ToastHost,
} from "../src/components/ui";
import { purchaseOrder, purchaseSubscription } from "../src/payments/razorpay";
import { color, fontFamily, radius, space, text } from "../src/theme";

type Tab = "plans" | "refills";

export default function SubscriptionScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(params.tab === "refills" ? "refills" : "plans");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [couponInfo, setCouponInfo] = useState<CouponInfo | null>(null);
  const [couponErr, setCouponErr] = useState("");
  const [processing, setProcessing] = useState(false);

  const plansQ = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const refillsQ = useQuery({ queryKey: ["refill-packs"], queryFn: api.refillPacks });

  const plans = plansQ.data?.plans ?? [];
  const refills = refillsQ.data?.refill_packs ?? [];
  const items: (Plan | RefillPack)[] = tab === "plans" ? plans : refills;
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  // Default selection mirrors the web modal: default plan, else first item.
  useEffect(() => {
    if (!selectedId && plans.length && tab === "plans") {
      const def = plans.find((p) => p.is_default) || plans[0];
      setSelectedId(def.id);
    }
  }, [plans, selectedId, tab]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setCouponInfo(null);
    setCouponErr("");
    const list = t === "plans" ? plans : refills;
    setSelectedId(list[0]?.id ?? null);
  };

  const applyCoupon = async () => {
    if (!coupon.trim() || !selected) return;
    setCouponErr("");
    try {
      const info = await api.validateCoupon(
        coupon.trim().toUpperCase(),
        tab === "plans" ? "plan" : "refill",
        selected.id,
      );
      setCouponInfo(info);
    } catch (e) {
      setCouponInfo(null);
      setCouponErr(errorMessage(e));
    }
  };

  const basePrice = selected?.price_inr ?? 0;
  const finalPrice = couponInfo ? couponInfo.final_inr : basePrice;

  const purchase = async () => {
    if (!selected) return;
    setProcessing(true);
    try {
      const isRecurringPlan = tab === "plans" && (selected as Plan).recurring;
      const result = isRecurringPlan
        ? await purchaseSubscription(selected as Plan)
        : await purchaseOrder(
            tab === "plans" ? "plan" : "refill",
            selected,
            couponInfo?.code,
          );
      if (result.status === "success") {
        toast.success("🎉 Payment successful — you're all set!");
        void qc.invalidateQueries({ queryKey: ["subscription"] });
        void qc.invalidateQueries({ queryKey: ["usage"] });
        setTimeout(() => router.back(), 900);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProcessing(false);
    }
  };

  const loading = plansQ.isLoading || refillsQ.isLoading;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }} testID="subscription-screen">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.grabber} />
        <Text style={styles.title}>Get more interview minutes</Text>

        <View style={styles.tabs}>
          <TabButton
            label="📅 Monthly plans"
            active={tab === "plans"}
            onPress={() => switchTab("plans")}
            testID="sub-tab-plans"
          />
          <TabButton
            label="⚡ Refill packs"
            active={tab === "refills"}
            onPress={() => switchTab("refills")}
            testID="sub-tab-refills"
          />
        </View>

        {loading ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : items.length === 0 ? (
          <Card>
            <Text style={text.body}>Nothing available right now — try later.</Text>
          </Card>
        ) : (
          <View style={{ gap: space.md }}>
            {items.map((item, idx) => {
              const isSel = selected?.id === item.id;
              const minutes =
                tab === "plans"
                  ? (item as Plan).interview_minutes
                  : (item as RefillPack).total_minutes;
              const bonus = tab === "refills" ? (item as RefillPack).bonus_minutes : 0;
              return (
                <Pressable
                  key={item.id}
                  testID={`sub-item-${idx}`}
                  onPress={() => {
                    setSelectedId(item.id);
                    setCouponInfo(null);
                    setCouponErr("");
                  }}
                >
                  <View style={[styles.planCard, isSel && styles.planCardSel]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.planNameRow}>
                        <Text style={text.heading}>{item.name}</Text>
                        {item.badge ? (
                          <Chip label={item.badge} tint={color.ctaSoft} textColor={color.ctaDark} />
                        ) : null}
                      </View>
                      <Text style={text.caption}>
                        {minutes ?? 0} interview minutes
                        {tab === "plans" ? " / month" : ""}
                        {bonus ? ` (+${bonus} bonus)` : ""}
                      </Text>
                      {tab === "plans" && (item as Plan).features?.length ? (
                        <View style={{ marginTop: 4, gap: 2 }}>
                          {((item as Plan).features ?? []).slice(0, 4).map((f, i) => (
                            <Text key={i} style={text.caption}>
                              ✓ {f}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.price}>₹{item.price_inr}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {selected ? (
          <View style={{ gap: space.sm }}>
            <View style={styles.couponRow}>
              <View style={{ flex: 1 }}>
                <TextField
                  testID="coupon-input"
                  value={coupon}
                  onChangeText={(v) => setCoupon(v.toUpperCase())}
                  placeholder="Coupon code"
                  autoCapitalize="characters"
                />
              </View>
              <Button
                testID="coupon-apply"
                label="Apply"
                variant="ghost"
                size="sm"
                disabled={!coupon.trim()}
                onPress={() => void applyCoupon()}
                style={{ height: 50 }}
              />
            </View>
            {couponErr ? (
              <Text style={[text.caption, { color: color.crit }]}>{couponErr}</Text>
            ) : null}
            {couponInfo ? (
              <Text style={[text.caption, { color: color.good }]} testID="coupon-applied">
                ✓ {couponInfo.code} applied — you save ₹{couponInfo.discount_inr}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Button
          testID="sub-pay"
          label={
            processing
              ? "Processing…"
              : selected
                ? `Pay ₹${finalPrice}${couponInfo ? ` (was ₹${basePrice})` : ""} — ${tab === "plans" ? "Subscribe" : "Buy refill"}`
                : "Select an option"
          }
          variant="cta"
          size="lg"
          disabled={processing || !selected}
          onPress={() => void purchase()}
        />
        <Text style={[text.caption, { textAlign: "center" }]}>
          🔒 Secure payment via Razorpay
        </Text>
        <Button label="Maybe later" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
      <ToastHost />
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg, paddingBottom: 60 },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.line,
  },
  title: {
    fontFamily: fontFamily.displayBold,
    fontSize: 24,
    color: color.ink,
    textAlign: "center",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  tabBtnActive: { backgroundColor: color.surface },
  tabText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13.5,
    color: color.inkSoft,
  },
  tabTextActive: { color: color.ink, fontFamily: fontFamily.bodySemiBold },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.line,
    padding: space.lg,
  },
  planCardSel: {
    borderColor: color.cta,
    backgroundColor: color.ctaSoft,
  },
  planNameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  price: { fontFamily: fontFamily.displayBold, fontSize: 24, color: color.ink },
  couponRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
});
