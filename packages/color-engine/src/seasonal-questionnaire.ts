import type { SeasonalProfile } from "./seasonal-analysis";

export const SEASONAL_QUESTIONS = [
  {
    key: "undertone",
    title: "Your undertone",
    description:
      "When you compare warm or cool colours near your face, which temperature seems more harmonious? For example, compare peach or coral with rose or berry in natural daylight. Focus on which group seems to work better with your overall colouring.",
    options: [
      {
        value: "warm",
        label: "Warm",
        detail: "Golden, peach or yellow-based colours seem more harmonious.",
      },
      {
        value: "cool",
        label: "Cool",
        detail: "Blue-based pink, rose or berry colours seem more harmonious.",
      },
      {
        value: "neutral",
        label: "Neutral",
        detail: "Warm and cool colours seem similarly harmonious.",
      },
      {
        value: "uncertain",
        label: "Not sure",
        detail: "I cannot confidently tell which temperature suits me better.",
      },
    ],
  },
  {
    key: "value",
    title: "Your natural colour depth",
    description:
      "Consider your natural hair, eyes and skin colouring together, not your skin tone alone. Does your overall natural colouring give a lighter or darker impression? Think of the difference between naturally light hair and eyes versus naturally dark hair and eyes.",
    options: [
      {
        value: "light",
        label: "Light",
        detail: "My overall natural colouring gives a relatively light impression.",
      },
      {
        value: "deep",
        label: "Dark",
        detail: "My overall natural colouring gives a relatively dark impression.",
      },
      {
        value: "balanced",
        label: "Balanced",
        detail: "My overall colouring is neither particularly light nor particularly dark.",
      },
      {
        value: "uncertain",
        label: "Not sure",
        detail: "I cannot confidently judge the overall depth of my natural colouring.",
      },
    ],
  },
  {
    key: "chroma",
    title: "Your colour clarity",
    description:
      "When you compare muted or vivid colours near your face, which generally seems more harmonious? For example, compare dusty rose, sage or slate blue with brighter pink, emerald or cobalt. Try to compare colours of a similar hue in natural daylight.",
    options: [
      {
        value: "soft",
        label: "Soft",
        detail: "Muted, understated colours such as dusty rose or sage seem more harmonious.",
      },
      {
        value: "clear",
        label: "Clear",
        detail: "Bright, vivid colours such as emerald or cobalt seem more harmonious.",
      },
      {
        value: "balanced",
        label: "Balanced",
        detail: "Both muted and vivid colours seem similarly suitable.",
      },
      {
        value: "uncertain",
        label: "Not sure",
        detail: "I cannot confidently tell whether muted or vivid colours suit me better.",
      },
    ],
  },
  {
    key: "contrast",
    title: "Your natural contrast",
    description:
      "Look at the differences in lightness and darkness between your natural hair, eyes and skin colouring. Are those differences subtle, moderate or strong? For example, very dark hair with much lighter eyes often creates stronger contrast.",
    options: [
      {
        value: "low",
        label: "Low",
        detail: "My natural features have relatively similar levels of lightness and darkness.",
      },
      {
        value: "medium",
        label: "Medium",
        detail: "There are some noticeable differences between my natural features.",
      },
      {
        value: "high",
        label: "High",
        detail: "There are strong differences between lighter and darker natural features.",
      },
      {
        value: "uncertain",
        label: "Not sure",
        detail: "I cannot confidently judge the contrast between my natural features.",
      },
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
