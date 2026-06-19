const BASE_PROMPT = `Use the uploaded reference photo as the identity source.

The final image must show the same person from the reference photo.
Preserve the exact face, facial proportions, age, skin tone, hairline, recognizable features and body type.
Do not replace the person with a model. Do not create a lookalike. Do not over-beautify the face.

Client request:
{{context}}

Interpret the client request literally and visually. Build the photoshoot around the actual occasion, theme, place, profession, fantasy, color palette, age, object, mood or story requested by the client.

All images must remain clearly inside the client's requested concept. Do not drift into unrelated photoshoot styles, generic fashion portraits or generic luxury scenes that ignore the requested theme.

Most images should strongly express the request in an obvious, easy-to-understand way. A smaller portion can be a premium, editorial or luxury version of the same concept, but the main theme elements must still be visible.

Do not force every image to be luxury, glamorous or sophisticated. Use that aesthetic as an upgrade layer only when it still supports the request.

If the request is a birthday or anniversary photoshoot, include clear celebratory elements in several images: studio backdrop, metallic number balloons, balloon bouquets, confetti, cake, flowers, party props, warm happy expression and tasteful celebratory styling. Use the age or number from the request only if it is explicitly provided. Avoid random numbers.

If the request is professional, casual, sports, travel, fantasy, romantic, family, seasonal, cultural, religious, cinematic or humorous, adapt the styling, props, wardrobe, pose, lighting and environment to that specific direction.

Keep the person as the main subject. The face must stay clear, recognizable and unobstructed.

Change only clothing, styling, accessories, colors, pose, lighting and environment to match the requested theme.

Create a polished, realistic, commercially appealing AI photoshoot that feels intentional and desirable for the client.

{{variation}}

Ultra realistic photography of the same person.
Natural anatomy, realistic hands, realistic eyes, realistic skin texture.
Professional composition, beautiful lighting, clean details.`;

const SCENE_VARIATIONS = [
  "Hero portrait strongly tied to the client request, with the most obvious visual symbols of the theme included when appropriate.",
  "Clean studio portrait with a simple backdrop, flattering light and theme-specific props.",
  "Three-quarter portrait with a different pose, wardrobe and camera angle, keeping the face clearly visible.",
  "Warm close-up portrait focused on expression, identity and subtle thematic details.",
  "Full-body or seated portrait with the environment and props clearly communicating the requested concept.",
  "Editorial portrait with tasteful styling and a different color palette, while keeping the requested concept unmistakable.",
  "Candid joyful moment with natural expression and realistic movement, still matching the theme.",
  "Minimalist version of the requested concept, elegant but not necessarily luxurious.",
  "Detailed environmental portrait with foreground/background depth and theme-specific objects.",
  "Bright daylight portrait with a fresh, approachable mood and clear identity preservation.",
  "Cinematic portrait with controlled contrast and dramatic lighting adapted to the requested theme.",
  "Lifestyle portrait that feels natural, personal and believable for the requested scenario.",
  "Creative composition using props, set design or visual symbols from the client request.",
  "Classic portrait pose with refined lighting and a different outfit from previous images.",
  "Dynamic pose with gentle movement in clothing, hair or props, without distorting anatomy.",
  "Premium magazine-style portrait adapted to the same theme, polished and aspirational without becoming unrelated.",
  "Playful or expressive portrait if the theme allows it, with a natural smile and clear face.",
  "Elegant environmental portrait highlighting the requested theme without overcrowding the image.",
  "Distinct alternative scene from the same theme, changing background, pose and styling.",
  "Final signature portrait with strong visual appeal, clean composition, premium finish and memorable theme execution.",
];

export function buildGenerationPrompts(context: string) {
  const normalizedContext = context.trim();

  return SCENE_VARIATIONS.map((variation, index) => ({
    position: index + 1,
    prompt: BASE_PROMPT.replace("{{context}}", normalizedContext).replace(
      "{{variation}}",
      `Create a genuinely different scene, composition, pose, outfit, props and camera angle from every other image in this set. ${variation}`,
    ),
  }));
}
