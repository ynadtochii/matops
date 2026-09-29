import { Pressable, ScrollView, View } from "react-native";

import {
  RANK_SYSTEMS,
  SIGNUP_DISCIPLINE,
  SIGNUP_FOR_CHILD,
  SIGNUP_NEVER_TRAINED,
} from "@matops/domain";

import {
  Eyebrow,
  Muted,
  TextField,
  Txt,
  Stack as UIStack,
  useTheme,
} from "~/components/ui";

export interface SignupAnswerState {
  belt: string;
  stripes: number;
  health: string;
  emailUpdates: boolean;
  waiverId: string | null;
}

export const EMPTY_ANSWERS: SignupAnswerState = {
  belt: "",
  stripes: 0,
  health: "",
  emailUpdates: false,
  waiverId: null,
};

const system = RANK_SYSTEMS[SIGNUP_DISCIPLINE];
const BELTS: string[] = system?.belts ?? [];
const MAX_STRIPES: number = system?.maxStripes ?? 4;

const BELT_OPTIONS = [
  { value: SIGNUP_NEVER_TRAINED, label: "Never trained" },
  { value: SIGNUP_FOR_CHILD, label: "Enquiring for a child" },
  ...BELTS.map((b) => ({ value: b, label: `${b} belt` })),
];

function RadioRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onSelect}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 44,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: pressed ? t.hover : "transparent",
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: selected ? 6 : 1.5,
          borderColor: selected ? t.primary : t.borderStrong,
        }}
      />
      <Txt size={15}>{label}</Txt>
    </Pressable>
  );
}

function OptionGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTheme();
  return (
    <UIStack gap={6}>
      <Eyebrow>{label}</Eyebrow>
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.card,
          overflow: "hidden",
        }}
      >
        {options.map((opt, i) => (
          <View
            key={opt.value}
            style={
              i > 0
                ? { borderTopWidth: 1, borderTopColor: t.border }
                : undefined
            }
          >
            <RadioRow
              label={opt.label}
              selected={value === opt.value}
              onSelect={() => onChange(opt.value)}
            />
          </View>
        ))}
      </View>
    </UIStack>
  );
}

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 44,
        paddingVertical: 10,
        backgroundColor: pressed ? t.hover : "transparent",
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          borderWidth: checked ? 0 : 1.5,
          borderColor: t.borderStrong,
          backgroundColor: checked ? t.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <Txt size={14} weight={700} color={t.primaryForeground}>
            ✓
          </Txt>
        ) : null}
      </View>
      <Txt size={15} style={{ flex: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const isRealBelt = (belt: string) =>
  belt !== SIGNUP_NEVER_TRAINED && belt !== SIGNUP_FOR_CHILD && belt !== "";

const stripeOptions = Array.from({ length: MAX_STRIPES + 1 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "No stripes" : `${i} stripe${i === 1 ? "" : "s"}`,
}));

interface Props {
  academyName: string;
  signupHealthQuestion: boolean;
  waiver: { id: string; body: string } | null;
  state: SignupAnswerState;
  onChange: (patch: Partial<SignupAnswerState>) => void;
}

export function SignupQuestions({
  academyName,
  signupHealthQuestion,
  waiver,
  state,
  onChange,
}: Props) {
  const t = useTheme();
  return (
    <UIStack gap={20}>
      <OptionGroup
        label="Your belt"
        options={BELT_OPTIONS}
        value={state.belt}
        onChange={(belt) => onChange({ belt, stripes: 0 })}
      />

      {isRealBelt(state.belt) ? (
        <OptionGroup
          label="Stripes"
          options={stripeOptions}
          value={String(state.stripes)}
          onChange={(v) => onChange({ stripes: Number(v) })}
        />
      ) : null}

      {signupHealthQuestion ? (
        <TextField
          label="Any injuries or medical conditions? (optional)"
          value={state.health}
          onChangeText={(health) => onChange({ health })}
          autoCapitalize="sentences"
          maxLength={1000}
        />
      ) : null}

      <UIStack gap={4}>
        <CheckRow
          label={`Keep me updated on changes at ${academyName}`}
          checked={state.emailUpdates}
          onToggle={() => onChange({ emailUpdates: !state.emailUpdates })}
        />
        {signupHealthQuestion ? (
          <Muted>Only coaches at {academyName} can see your health note.</Muted>
        ) : null}
      </UIStack>

      {waiver ? (
        <UIStack gap={10}>
          <Eyebrow>Agreement</Eyebrow>
          <ScrollView
            style={{
              maxHeight: 180,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: t.border,
            }}
            contentContainerStyle={{ padding: 12 }}
          >
            <Txt size={13} lineHeight={19} tone="secondary">
              {waiver.body}
            </Txt>
          </ScrollView>
          <CheckRow
            label="I have read and agree"
            checked={state.waiverId === waiver.id}
            onToggle={() =>
              onChange({
                waiverId: state.waiverId === waiver.id ? null : waiver.id,
              })
            }
          />
        </UIStack>
      ) : null}
    </UIStack>
  );
}
