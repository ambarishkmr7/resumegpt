import { Text, View } from "react-native";
import { USER_GUIDE } from "../../src/data/userGuide";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Screen } from "../../src/components/ui";
import { SectionCard } from "../../src/components/resume/editors";
import { color, space, text } from "../../src/theme";

export default function UserGuide() {
  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="User Guide" />
      <Screen scroll padded>
        <Text style={[text.caption, { marginBottom: space.lg }]}>
          Updated {USER_GUIDE.updated} — {USER_GUIDE.intro}
        </Text>

        <View style={{ gap: space.md }}>
          {USER_GUIDE.sections.map((section) => (
            <SectionCard
              key={section.id}
              emoji={section.icon}
              title={section.title}
              initiallyOpen={section.id === "getting-started"}
            >
              {section.steps.map((step, i) => (
                <Text key={i} style={[text.body, { lineHeight: 22 }]}>
                  {i + 1}. {step}
                </Text>
              ))}
            </SectionCard>
          ))}
        </View>

        <Text style={[text.caption, { marginTop: space.xl, textAlign: "center", color: color.inkFaint }]}>
          {USER_GUIDE.closing}
        </Text>
      </Screen>
    </View>
  );
}
