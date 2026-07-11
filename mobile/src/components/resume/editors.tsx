import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, fontFamily, radius, space, text } from "../../theme";
import { Chip, TextField } from "../ui";

// ---- Bullet list editor (experience/projects) ----
export function BulletEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      {items.map((b, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <View style={{ flex: 1 }}>
            <TextField
              value={b}
              onChangeText={(v) => {
                const a = [...items];
                a[i] = v;
                onChange(a);
              }}
              placeholder="Achievement or responsibility…"
              multiline
            />
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Text style={styles.remove}>×</Text>
          </Pressable>
        </View>
      ))}
      <AddButton label="+ Add bullet" onPress={() => onChange([...items, ""])} />
    </View>
  );
}

// ---- Chip list editor (skills/certs/languages/…) ----
export function ChipListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: unknown[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const asLabel = (s: unknown): string =>
    typeof s === "string"
      ? s
      : ((s as { name?: string; title?: string })?.name ??
        (s as { title?: string })?.title ??
        JSON.stringify(s));
  const labels = items.map(asLabel);

  const add = () => {
    if (input.trim()) {
      onChange([...labels, input.trim()]);
      setInput("");
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.chipWrap}>
        {labels.map((label, i) => (
          <Chip
            key={`${label}-${i}`}
            label={label}
            onRemove={() => onChange(labels.filter((_, j) => j !== i))}
          />
        ))}
      </View>
      <View style={styles.chipInputRow}>
        <View style={{ flex: 1 }}>
          <TextField
            value={input}
            onChangeText={setInput}
            placeholder={placeholder || "Type and add…"}
            onSubmitEditing={add}
            returnKeyType="done"
          />
        </View>
        <Pressable onPress={add} style={styles.addChipBtn}>
          <Text style={styles.addChipText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---- 1-5 star rating ----
export function StarInput({
  rating,
  onChange,
}: {
  rating: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={4}>
          <Text style={{ fontSize: 20, color: n <= rating ? color.cta : color.line }}>
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---- Collapsible section card ----
export function SectionCard({
  emoji,
  title,
  count,
  children,
  initiallyOpen = false,
  testID,
}: {
  emoji: string;
  title: string;
  count?: number;
  children: React.ReactNode;
  initiallyOpen?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.section}>
      <Pressable
        testID={testID}
        onPress={() => setOpen((o) => !o)}
        style={styles.sectionHead}
      >
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
        <Text style={[text.heading, { flex: 1 }]}>{title}</Text>
        {typeof count === "number" && count > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        ) : null}
        <Text style={styles.chevron}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

export function AddButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.addBtn}>
      <Text style={styles.addBtnText}>{label}</Text>
    </Pressable>
  );
}

export function RemovableItem({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.item}>
      <View style={styles.itemHead}>
        <Text style={[text.label, { flex: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        <Pressable hitSlop={8} onPress={onRemove}>
          <Text style={styles.remove}>×</Text>
        </Pressable>
      </View>
      <View style={{ gap: space.md }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bulletRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  bulletDot: { color: color.primary, fontSize: 18 },
  remove: { fontSize: 22, color: color.inkFaint, paddingHorizontal: 6 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chipInputRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  addChipBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  addChipText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 14,
    color: color.primary,
  },
  section: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    overflow: "hidden",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
  },
  sectionBody: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  countBadge: {
    backgroundColor: color.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12,
    color: color.primaryDark,
  },
  chevron: { fontSize: 16, color: color.inkFaint },
  addBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  addBtnText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 14,
    color: color.primary,
  },
  item: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.md,
    backgroundColor: color.bg,
  },
  itemHead: { flexDirection: "row", alignItems: "center" },
});
