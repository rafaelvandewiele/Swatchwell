export const APP_NAME = "Swatchwell";

export const APP_DESCRIPTION =
  "Your personal color styling assistant";

export type ClothingCategory =
  | "pants"
  | "shirt"
  | "sweater"
  | "tshirt"
  | "jacket"
  | "shoes"
  | "accessory";

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  color: string;
}
