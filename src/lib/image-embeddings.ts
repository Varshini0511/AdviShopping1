// src/lib/image-embeddings.ts
//
// Visual search embeddings using CLIP (clip-vit-base-patch32, 512-dim).
// CLIP maps images AND text into the SAME vector space, so an uploaded image
// (or a text phrase) can be matched against product-image vectors.
//
// Runs locally via @xenova/transformers — no external API key. Models load
// lazily and are cached for the process lifetime.

import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  CLIPTextModelWithProjection,
  AutoTokenizer,
  RawImage,
  type Processor,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from '@xenova/transformers';

const MODEL = 'Xenova/clip-vit-base-patch32';

let visionPromise: Promise<{ processor: Processor; model: PreTrainedModel }> | null = null;
let textPromise: Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> | null = null;

function getVision() {
  if (!visionPromise) {
    visionPromise = (async () => ({
      processor: await AutoProcessor.from_pretrained(MODEL),
      model: await CLIPVisionModelWithProjection.from_pretrained(MODEL),
    }))();
  }
  return visionPromise;
}

function getText() {
  if (!textPromise) {
    textPromise = (async () => ({
      tokenizer: await AutoTokenizer.from_pretrained(MODEL),
      model: await CLIPTextModelWithProjection.from_pretrained(MODEL),
    }))();
  }
  return textPromise;
}

function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const mag = Math.sqrt(sum) || 1;
  return v.map((x) => x / mag);
}

// Embed an uploaded image (a Blob/File from a request) into a 512-dim vector.
export async function embedImageBlob(blob: Blob): Promise<number[]> {
  const { processor, model } = await getVision();
  const image = await RawImage.fromBlob(blob);
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);
  return normalize(Array.from(image_embeds.data as Float32Array));
}

// Embed a local image file (used by the offline embedding script via a path).
export async function embedImagePath(path: string): Promise<number[]> {
  const { processor, model } = await getVision();
  const image = await RawImage.read(path);
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);
  return normalize(Array.from(image_embeds.data as Float32Array));
}

// Embed a text phrase into the SAME space (text -> image search).
export async function embedTextForImage(text: string): Promise<number[]> {
  const { tokenizer, model } = await getText();
  const inputs = tokenizer([text], { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  return normalize(Array.from(text_embeds.data as Float32Array));
}
