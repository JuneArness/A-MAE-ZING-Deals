// Picture used when a product has no photo yet: the category color plus a matching icon.
// Owners replace these by uploading real photos in Admin → Products.
const RULES: [RegExp, string][] = [
  [/wreath|seasonal/i, "🎄"], [/clothespin|clip/i, "📎"], [/mail|key/i, "🔑"], [/wastebasket|trash/i, "🗑️"], [/shoe/i, "👟"], [/closet/i, "👚"], [/makeup|cosmetic/i, "💄"],
  [/sponge|scrub pad/i, "🧽"], [/glove/i, "🧤"], [/spray bottle|soap dispenser|dispenser/i, "🧴"],
  [/dustpan|duster|broom/i, "🧹"], [/caddy|bin\b|bin with|storage bin/i, "🗃️"], [/scrub brush|toilet brush/i, "🪥"],
  [/microfiber|cloth|towel/i, "🧻"], [/laundry bag|wash bag|mesh/i, "🧺"], [/basket/i, "🧺"],
  [/lint/i, "🪮"], [/dryer ball/i, "🧶"], [/hanger/i, "👕"], [/mat\b|door mat|bath mat/i, "🟫"],
  [/measuring cup/i, "🥛"], [/measuring spoon|utensil/i, "🥄"], [/container/i, "🥡"], [/pot holder/i, "🧤"],
  [/drawer|divider|organizer/i, "🗄️"], [/shower curtain|shower cap/i, "🚿"], [/toothbrush/i, "🪥"], [/cup/i, "🥤"],
  [/drain|strainer/i, "🕳️"], [/hook/i, "🪝"], [/cord|cable|tie/i, "🎀"],
  [/comb/i, "🪮"], [/hairbrush/i, "💇"], [/mirror/i, "🪞"], [/nail/i, "💅"],
  [/toiletry|travel/i, "👜"], [/pillow/i, "🛋️"], [/candle/i, "🕯️"], [/frame/i, "🖼️"], [/shopping bag|bag/i, "🛍️"],
  [/sign/i, "🪧"],  [/tape|measuring tape/i, "📏"],
  [/screwdriver/i, "🪛"], [/felt|pad/i, "🪑"], [/door stop|doorstop/i, "🚪"], [/hanging kit|nails/i, "🔨"],
];

const CATEGORY_ICON: Record<string, string> = {
  cleaning: "🧽", laundry: "🧺", kitchen: "🍽️", bathroom: "🛁", organization: "🗃️",
  "personal-care": "🪞", "home-comfort": "🏡", "home-tools": "🧰",
};

export function placeholderIcon(name: string, categorySlug?: string): string {
  for (const [re, icon] of RULES) if (re.test(name)) return icon;
  return (categorySlug && CATEGORY_ICON[categorySlug]) || "🏠";
}

export const categoryIcon = (slug: string) => CATEGORY_ICON[slug] ?? "🏠";
