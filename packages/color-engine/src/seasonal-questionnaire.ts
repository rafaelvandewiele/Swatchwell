import type { SeasonalProfile } from "./seasonal-analysis";

export const SEASONAL_QUESTIONS = [
  {
    key: "undertone",
    title: "Your undertone",
    description:
      "When comparing warm and cool colours near your face, which temperature seems more harmonious?",
    options: [
      { value: "warm", label: "Warm", detail: "Golden, peach or yellow tones seem more harmonious" },
      { value: "cool", label: "Cool", detail: "Pink, red or blue tones seem more harmonious" },
      { value: "neutral", label: "Neutral", detail: "Both warm and cool tones seem similarly harmonious" },
      { value: "uncertain", label: "Not sure", detail: "I cannot confidently determine this" },
    ],
  },
  {
    key: "value",
    title: "Your natural colour depth",
    description:
      "Considering your natural hair, skin and eye colouring together, which description is closest?",
    options: [
      { value: "light", label: "Light", detail: "The overall impression is relatively light" },
      { value: "deep", label: "Deep", detail: "The overall impression is relatively deep" },
      { value: "balanced", label: "Balanced", detail: "Neither particularly light nor particularly deep" },
      { value: "uncertain", label: "Not sure", detail: "I cannot confidently determine this" },
    ],
  },
  {
    key: "chroma",
    title: "Your colour clarity",
    description:
      "When comparing muted and vivid colours near your face, which generally looks more harmonious?",
    options: [
      { value: "soft", label: "Soft", detail: "Muted, understated colours seem more harmonious" },
      { value: "clear", label: "Clear", detail: "Clear, vivid colours seem more harmonious" },
      { value: "balanced", label: "Balanced", detail: "Both muted and vivid colours seem suitable" },
      { value: "uncertain", label: "Not sure", detail: "I cannot confidently determine this" },
    ],
  },
  {
    key: "contrast",
    title: "Your natural contrast",
    description:
      "How noticeable are the differences in lightness and darkness between your natural features?",
    options: [
      { value: "low", label: "Low", detail: "Your features have relatively similar lightness and darkness" },
      { value: "medium", label: "Medium", detail: "There are some noticeable differences" },
      { value: "high", label: "High", detail: "There are strong differences between lighter and darker features" },
      { value: "uncertain", label: "Not sure", detail: "I cannot confidently determine this" },
    ],
  },
] as const satisfies readonly {
  key: keyof SeasonalProfile;
  title: string;
  description: string;
  options: readonly {
    value: string;
    label: string;
    detail: string;
  }[];
}[];
