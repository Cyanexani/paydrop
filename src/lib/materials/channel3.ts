/**
 * Channel3 product search for materials a milestone needs (props, lights, hosting, a domain…).
 * The freelancer picks items before funding; the server re-reads each item's price from
 * Channel3 by id, so a price can't be edited in the browser.
 */
import { Channel3 } from "@channel3/sdk";

export interface MaterialOption {
  productId: string;
  title: string;
  url: string;
  merchant: string | null;
  imageUrl: string | null;
  price: number;
  currency: string;
}

let client: Channel3 | null | undefined;
function channel3(): Channel3 | null {
  if (client !== undefined) return client;
  client = process.env.CHANNEL3_API_KEY ? new Channel3({ apiKey: process.env.CHANNEL3_API_KEY }) : null;
  return client;
}

type ProductLike = {
  id: string;
  title: string;
  images?: Array<{ url: string; is_main_image?: boolean }>;
  offers?: Array<{ url: string; domain: string; price: { price: number; currency: string }; availability?: string }>;
};

function toOption(p: ProductLike): MaterialOption | null {
  const offer = p.offers?.find((o) => o.availability !== "OutOfStock") ?? p.offers?.[0];
  if (!offer) return null;
  return {
    productId: p.id,
    title: p.title,
    url: offer.url,
    merchant: offer.domain ?? null,
    imageUrl: p.images?.find((i) => i.is_main_image)?.url ?? p.images?.[0]?.url ?? null,
    price: offer.price.price,
    currency: offer.price.currency,
  };
}

export async function searchMaterials(query: string): Promise<{ mode: "channel3" | "demo"; results: MaterialOption[] }> {
  const c = channel3();
  if (!c) return { mode: "demo", results: DEMO_CATALOG.filter((m) => matches(m.title, query)).slice(0, 6) };
  const pageable = await c.products.search({ query, limit: 6 });
  const results: MaterialOption[] = [];
  for await (const item of pageable as AsyncIterable<ProductLike>) {
    const option = toOption(item);
    if (option) results.push(option);
    if (results.length >= 6) break;
  }
  return { mode: "channel3", results };
}

export async function getMaterial(productId: string): Promise<MaterialOption | null> {
  const c = channel3();
  if (!c) return DEMO_CATALOG.find((m) => m.productId === productId) ?? null;
  const product = (await c.products.retrieve({ product_id: productId })) as unknown as ProductLike;
  return toOption(product);
}

function matches(title: string, query: string): boolean {
  const words = query.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const t = title.toLowerCase();
  return words.length === 0 || words.some((w) => t.includes(w));
}

/** Offline stand-in so the materials flow can be demoed without a Channel3 key. */
const DEMO_CATALOG: MaterialOption[] = [
  { productId: "demo-ring-light", title: "18-inch LED ring light with stand", url: "https://example.com/ring-light", merchant: "example.com", imageUrl: null, price: 2499, currency: "INR" },
  { productId: "demo-tripod", title: "Aluminium camera tripod, 165 cm", url: "https://example.com/tripod", merchant: "example.com", imageUrl: null, price: 1899, currency: "INR" },
  { productId: "demo-domain", title: ".in domain name, 1 year", url: "https://example.com/domain", merchant: "example.com", imageUrl: null, price: 699, currency: "INR" },
  { productId: "demo-stock-photos", title: "Stock photo pack: dance and fitness (25 images)", url: "https://example.com/photos", merchant: "example.com", imageUrl: null, price: 1500, currency: "INR" },
  { productId: "demo-mic", title: "Lavalier microphone for video", url: "https://example.com/mic", merchant: "example.com", imageUrl: null, price: 899, currency: "INR" },
];
