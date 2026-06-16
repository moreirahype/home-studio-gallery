const BASE_PROMPT = `Use the uploaded reference photo as the identity source.

The final image must show the same person from the reference photo.
Preserve the exact face, facial proportions, age, skin tone, hairline, recognizable features and body type.
Do not replace the person with a model. Do not create a lookalike. Do not over-beautify the face.

Theme:
{{context}}

Change only clothing, styling, accessories, colors, pose, lighting and environment to match the requested theme.

Create an ultra luxurious version of the requested photoshoot.

Beautiful high-end environment.

Sophisticated clothing.

Visually expensive aesthetic.

Exceptional photography quality.

{{variation}}

Ultra realistic photography of the same person.
Luxury atmosphere.
Premium styling.`;

const SCENE_VARIATIONS = [
  "Elegant editorial portrait in a grand architectural setting, keeping the face clearly visible.",
  "Refined close-up beauty portrait with soft cinematic lighting.",
  "Sophisticated seated pose in an exclusive designer interior.",
  "Confident walking portrait with a luxury campaign aesthetic.",
  "Three-quarter portrait with dramatic window light and premium decor, face unobstructed.",
  "Editorial portrait in a minimalist high-end studio with sculptural lighting.",
  "Natural candid moment in an elegant environment with subtle movement.",
  "Powerful symmetrical composition with a polished magazine-cover look.",
  "Warm golden-hour portrait in an upscale outdoor location.",
  "Moody evening portrait with tasteful ambient lights and rich textures.",
  "Fashion-forward side profile with refined styling and depth.",
  "Relaxed luxury lifestyle portrait with an authentic expression.",
  "Low-angle editorial composition conveying confidence and presence.",
  "Intimate portrait framed by premium architectural details.",
  "Dynamic pose with fabric movement and sophisticated directional lighting.",
  "Clean daylight portrait with an airy, expensive visual language.",
  "High-fashion composition with layered foreground and cinematic depth.",
  "Elegant environmental portrait highlighting the requested theme.",
  "Dramatic hero portrait with controlled contrast and premium color grading.",
  "Signature final portrait with a timeless luxury campaign aesthetic.",
];

export function buildGenerationPrompts(context: string) {
  const normalizedContext = context.trim();

  return SCENE_VARIATIONS.map((variation, index) => ({
    position: index + 1,
    prompt: BASE_PROMPT.replace("{{context}}", normalizedContext).replace(
      "{{variation}}",
      `Create a genuinely different scene, composition, pose and camera angle from every other image in this set. ${variation}`,
    ),
  }));
}
